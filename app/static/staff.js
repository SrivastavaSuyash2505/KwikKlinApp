/* Kwik Klin — staff panel. Chhota, bina kisi library ke.
 *
 * Do usool poore file par lage hain:
 *
 * 1. UI kabhi khud tay nahi karta ki kaun kya kar sakta hai. Wo /me ke
 *    `features` aur `is_manager` se sirf DIKHATA hai; asli rok server par
 *    hai. Isliye panel aur API kabhi alag nahi kah sakte.
 *
 * 2. Ek screen, ek sawaal. "Kaam" screen ka sawaal hai "ab kya karun" —
 *    isliye usme pickup, dhulai, delivery aur assign kiye gaye task SAB
 *    ek hi list mein hain, chips se chhante hue. Pehle Route aur Work do
 *    alag tab the jinme aadhi cheezein dono jagah dikhti thin aur aadhi
 *    kahin nahi.
 */

const $ = (id) => document.getElementById(id);
let ME = null;
let NAV = "work";        // work | tasks | bills | new | exp | team | me
let FILTER = "all";      // chips ki chuni hui value (har screen ki apni)
let WORK = [];           // kaam ki poori list (server se milaya hua)
let UNREAD = 0;

/* ─── plumbing ──────────────────────────────────────────────────────── */

async function api(path, opts = {}) {
  // Atka socket button ko hamesha ghumta chhodta tha — 45 sec ki hadd.
  // (Timeout TypeError nahi hai: outbox use "offline" nahi samajhta.)
  const signal = opts.signal || ((typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(45000) : undefined);
  let res;
  try {
    res = await fetch(`/staff/api${path}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...opts,
      signal,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (e && e.name === "TimeoutError") throw new Error("The server is taking too long. Check if it saved before you try again.");
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* khali body */ }
  if (!res.ok) {
    // 422 par detail ek list hoti hai — "[object Object]" nahi, pehla sandesh
    let detail = data && data.detail;
    if (Array.isArray(detail)) detail = (detail[0] && detail[0].msg || "").replace(/^Value error, /, "");
    const err = new Error(detail || `Error ${res.status}`);
    err.status = res.status;
    // Temp password par server har kaam 403 se rokta hai — popup wahin khule
    if (res.status === 403 && /^Change your password first/.test(String(detail || "")) && ME) {
      ME.must_change_password = true;
      if (!modalOpen()) changePw(true);
    }
    throw err;
  }
  return data;
}

/* ─── bina signal ke kaam (outbox) ──────────────────────────────────── */
/* Gali mein signal nahi to "Delivered" dabana bekaar jaata tha — aadmi
   bhool jaata ki kaunsa dabaya tha. Ab sirf STATUS wale kaam (picked up,
   wash, ready, deliver, ghar par nahi) phone mein ruk jaate hain aur
   signal aate hi apne aap chale jaate hain. Do baar pahunche to server
   409 deta hai (order aage badh chuka) — wo bhi "ho gaya" hai.
   Paisa (collect) yahan JAAN-BOOJH KAR nahi: jawab kho jaye aur dobara
   bheja jaye to ek hi paisa do baar likh jaata. */
const OUTBOX_KEY = "kk_staff_outbox";
// Ek phone par do log login kar sakte hain — har aadmi ke kaam sirf usi ke
// naam se jaayein, isliye har item par uska number.
function allOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch (e) { return []; }
}
const outbox = () => (ME ? allOutbox().filter((x) => x.owner === ME.phone) : []);
function saveOutbox(mine) {
  const others = allOutbox().filter((x) => !ME || x.owner !== ME.phone);
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(others.concat(mine))); } catch (e) { /* private mode */ }
  paintOutbox();
}
const isOffline = (e) => !navigator.onLine || (e instanceof TypeError);   // fetch network par TypeError deta hai
/* Status ka kaam: signal ho to seedha, na ho to outbox. {queued:true} lautata hai. */
// Aadmi ne khud kuch kiya aur screen taaza ki — iske turant baad aane wali
// SSE goonj (wahi badlaav) par poora refresh dobara nahi
let LOCAL_REFRESH = 0;
async function sendOrQueue(path, body, label, number) {
  if (navigator.onLine) {
    try { const r = await api(path, { method: "POST", body }); LOCAL_REFRESH = Date.now(); return r; }
    catch (e) { if (!isOffline(e)) throw e; }
  }
  const list = outbox();
  list.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), owner: ME.phone, path, body: body || null, label, number, at: Date.now() });
  saveOutbox(list);
  toast(`No signal — "${label}" saved on the phone, it will go when the signal is back`, false, 4500);
  return { queued: true };
}
let FLUSHING = false;
async function flushOutbox() {
  if (FLUSHING || !navigator.onLine || !outbox().length) return;
  FLUSHING = true;
  let sent = 0;
  try {
    for (const item of outbox()) {
      try {
        await api(item.path, { method: "POST", body: item.body || undefined });
        sent++;
      } catch (e) {
        if (isOffline(e)) break;                   // signal phir gaya — baaki baad mein
        // 409 = pehle hi ho chuka; baaki 4xx = server ne mana kiya — dono mein dobara bhejna bekaar
        if (e.status !== 409) toast(`${item.number}: "${item.label}" could not be saved — ${e.message}`, true, 6000);
        else sent++;
      }
      saveOutbox(outbox().filter((x) => x.id !== item.id));
    }
  } finally { FLUSHING = false; }
  if (sent) { toast(`${sent} saved action${sent > 1 ? "s" : ""} sent ✅`); loadToday(); refreshCurrent({ quiet: true }); }
}
function paintOutbox() {
  let bar = $("outbar");
  const n = outbox().length;
  if (!bar) {
    if (!n) return;
    bar = document.createElement("button");
    bar.id = "outbar"; bar.type = "button"; bar.className = "latebar outbar";
    $("latebar").insertAdjacentElement("afterend", bar);
    bar.onclick = () => (navigator.onLine ? flushOutbox() : toast("Still no signal — it will send by itself", true));
  }
  bar.hidden = !n;
  bar.innerHTML = `<span>⏳ ${n} action${n > 1 ? "s" : ""} waiting for signal</span><b>Send now</b>`;
}
window.addEventListener("online", flushOutbox);
setInterval(flushOutbox, 30000);

function toast(msg, err = false, ms = 3200) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

/* Button dabate hi spinner, phir kaam, phir jawab.
   Bina iske dheeme network par aadmi ko lagta hai click laga hi nahi aur
   wo dobara dabata hai — wahi kaam do baar chal jaata hai. */
async function busy(btn, fn) {
  if (!btn) return fn();
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try { await fn(); }
  catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

/* Ek delegated listener — har button par alag handler jodna padta tha,
 * aur modal ka HTML badalte hi wo wiring dobara karni padti thi.
 *
 * Inline onclick="..." yahan chal hi nahi sakta: page ki CSP
 * `script-src 'self'` hai, aur browser inline handler ko chup-chaap gira
 * deta hai — button dikhta hai, dabta hai, aur kuch nahi hota. (Show more
 * isi wajah se mara pada tha; browser mein chala kar hi pata chala.) */
const ACTIONS = {
  close: () => closeModal(),
  share: (n) => { closeModal(); shareBill(n); },
  thread: (c) => { closeModal(); openThread(c); },
  detail: (n) => { closeModal(); orderDetailModal(n); },
  hold: (n) => { closeModal(); holdModal(n); },
  jobdone: (c) => { closeModal(); askDone(c); },
  decide: (c) => { closeModal(); decideCancel(c); },
  photo: (n) => { closeModal(); askPhoto(n); },
  damage: (n) => { closeModal(); askPhoto(n, "damage"); },
  nothome: (n) => { closeModal(); askNotHome(n); },
  message: (n) => { closeModal(); const w = WORK.find((x) => x.number === n); messageMenu(n, Number((w && w.due) || 0)); },
  cancel: (c) => { closeModal(); askCancel(c); },
  more: (fn) => (fn === "loadWork" ? loadWork({ more: true }) : loadBills({ more: true })),
  findloc: () => { closeModal(); findCustomerModal(); },
  saveloc: (n) => { const w = WORK.find((x) => x.number === n) || {}; closeModal(); askSaveLocation(w.customer_ref, w.who); },
  delloc: (n) => { const w = WORK.find((x) => x.number === n) || {}; closeModal(); removeLocation(w.customer_ref, w.who); },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset.arg);
});

/* ─── Android back button ────────────────────────────────────────────
 * Pehle back dabate hi PWA band ho jaata tha (history mein ek hi entry).
 * Ab: har screen (go) aur har popup (openModal) history mein ek entry
 * banata hai — back se popup band, phir pichhli screen, aur sabse pehli
 * screen par "Exit?" Yes/No. */
const modalOpen = () => $("modal-ov").classList.contains("open");
// Popup band hone par chalne wala kaam (bag sheet ko cart dobara banana hai).
// Har openModal ise saaf karta hai; jo popup chahe, khulne ke baad set kare.
let MODAL_ONCLOSE = null;
function openModal(html, cls = "") {
  if (!modalOpen() && !(history.state && history.state.kk === "modal")) history.pushState({ kk: "modal" }, "");
  MODAL_ONCLOSE = null;
  $("modal-ov").className = `modal-ov open${cls ? " " + cls : ""}`;
  $("modal-body").innerHTML = html;
}
function closeModal() {
  $("modal-ov").classList.remove("open");
  const after = MODAL_ONCLOSE;
  MODAL_ONCLOSE = null;
  if (after) after();
  // Explicit close must consume the modal history state, not leave a stale
  // entry that causes the next mobile back gesture to leave the work screen.
  if (history.state && history.state.kk === "modal") {
    history.replaceState({ kk: "nav", nav: NAV }, "");
  }
}
$("modal-ov").addEventListener("click", (e) => { if (e.target.id === "modal-ov") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
let EXITING = false;
function askExit() {
  history.pushState({ kk: "nav", nav: NAV }, "");        // root par ruko, app band na ho
  openModal(`<h3>Exit the app?</h3>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">No</button>
      <button class="btn go" id="m-exit">Yes, exit</button>
    </div>`);
  $("m-exit").onclick = () => { EXITING = true; history.go(-3); setTimeout(() => { try { window.close(); } catch (e) { /* browser mana kare to kuch nahi */ } }, 400); };
}
window.addEventListener("popstate", () => {
  const st = history.state || {};
  if (modalOpen()) { closeModal(); if (st.kk !== "root") return; }
  if (st.kk === "root") { if (EXITING) { history.back(); return; } askExit(); return; }
  if (st.kk === "nav" && st.nav && st.nav !== NAV) go(st.nav, false);
});

/* "2026-09-14" ko phone par padhna padta hai — "Aaj"/"Kal" ek nazar mein
   samajh aata hai. Beeti hui date laal, taaki late kaam chhupe nahi. */
function whenParts(iso) {
  if (!iso) return { top: "—", sub: "", late: false };
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d)) return { top: iso, sub: "", late: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 864e5);
  if (diff === 0) return { top: "Aaj", sub: "", late: false };
  if (diff === 1) return { top: "Kal", sub: "", late: false };
  if (diff === -1) return { top: "Kal", sub: "beet gaya", late: true };
  const top = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (diff < 0) return { top, sub: `${-diff} din late`, late: true };
  return { top, sub: d.toLocaleDateString("en-IN", { weekday: "short" }), late: false };
}

const ROLE = {
  ADMIN: "Owner",
  WASHER: "Washerman", IRONER: "Ironing / Press", DELIVERY: "Delivery",
  // Senior aadmi — kaam bhi karta hai aur dekh-rekh bhi. Use sirf "Washerman"
  // likhna uske kaam ko chhota dikhata hai.
  SUPERVISOR: "Washerman / Manager", MANAGER: "Manager", ADMIN: "Owner",
};
const roleLabel = (r) => ROLE[r] || r;

/* ─── login ─────────────────────────────────────────────────────────── */

$("lg-eye").onclick = () => {
  const i = $("lg-pass");
  i.type = i.type === "password" ? "text" : "password";
  $("lg-eye").textContent = i.type === "password" ? "👁" : "🙈";
};
$("lg-go").onclick = async () => {
  const phone = $("lg-phone").value.trim();
  const password = $("lg-pass").value;
  $("lg-err").textContent = "";
  if (phone.replace(/\D/g, "").length < 10) { $("lg-err").textContent = "Enter the full mobile number."; return; }
  if (!password) { $("lg-err").textContent = "Enter your password."; return; }
  $("lg-go").disabled = true;
  try {
    await api("/login", { method: "POST", body: { phone, password } });
    // Ho sakta hai pichhli dukaan ka data memory mein ho (session khatam hone
    // par form yahin khulta hai): naya login, saaf shuruaat
    location.reload();
  } catch (e) {
    $("lg-err").textContent = e.message;
  } finally {
    $("lg-go").disabled = false;
  }
};
$("lg-phone").addEventListener("keydown", (e) => { if (e.key === "Enter") $("lg-pass").focus(); });
$("lg-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("lg-go").click(); });

/* ─── boot ──────────────────────────────────────────────────────────── */

let BOOT = null;          // /boot ka jawab — pehla loadWork/loadToday/loadBell isi se, bina naye request ke
// "online" event, 20s ka timer aur Retry button — teeno yahin aate hain;
// jo pehle aaye wahi chale, baaki chup (boot-off chhupa = koshish chal rahi)
function retryBoot() {
  if ($("boot-off").hidden) return;
  $("boot-off").hidden = true; $("boot-spin").hidden = false;
  start();
}

// Google se bani Solo dukaan ka abhi number nahi: ek baar lo, phir seedha app
function askOwnerPhone() {
  $("boot").hidden = true; $("login").hidden = true; $("app").hidden = true;
  $("ownerphone").hidden = false;
  $("op-phone").focus();
}
// Do qadam: number -> WhatsApp par code -> code daalo. Number usi ka ho jo daal raha hai.
async function ownerPhoneCall(path, payload) {
  const r = await fetch(path, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = d.detail;
    if (Array.isArray(msg)) msg = (msg[0] && msg[0].msg) || "";
    throw new Error(msg || "Something went wrong — try again");
  }
  return d;
}
function ownerPhoneStep(codeStep) {
  $("op-codebox").hidden = !codeStep;
  $("op-again").hidden = !codeStep;
  $("op-phone").disabled = codeStep;
  $("op-go").textContent = codeStep ? "Verify · पुष्टि करें" : "Send code · कोड भेजें";
  (codeStep ? $("op-code") : $("op-phone")).focus();
}
$("op-go").onclick = async () => {
  const phone = $("op-phone").value.trim();
  const codeStep = !$("op-codebox").hidden;
  if (phone.replace(/\D/g, "").length < 10) { $("op-err").textContent = "Enter your 10-digit mobile number"; return; }
  const code = $("op-code").value.replace(/\D/g, "");
  if (codeStep && code.length !== 6) { $("op-err").textContent = "Enter the 6-digit code from WhatsApp"; return; }
  $("op-go").disabled = true; $("op-err").textContent = "";
  try {
    if (!codeStep) {
      const d = await ownerPhoneCall("/api/me/owner-phone/code", { phone });
      $("op-sent").textContent = `Code sent on WhatsApp to ${d.sent_to || "your number"}. It is valid for 10 minutes.`;
      $("op-code").value = "";
      ownerPhoneStep(true);
    } else {
      await ownerPhoneCall("/api/me/owner-phone", { phone, code });
      $("ownerphone").hidden = true; $("boot").hidden = false;
      triedDashboardLogin = false;
      start();
    }
  } catch (e) {
    $("op-err").textContent = e.message || "Network problem — try again";
  } finally {
    $("op-go").disabled = false;
  }
};
$("op-again").onclick = () => { $("op-err").textContent = ""; ownerPhoneStep(false); };
$("op-code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("op-go").click(); });
$("op-phone").addEventListener("keydown", (e) => { if (e.key === "Enter") $("op-go").click(); });

let triedDashboardLogin = false;
async function start() {
  try {
    BOOT = await api("/boot");
    ME = BOOT.me;
  } catch (e) {
    // Server ne SAAF mana kiya (401/402) tabhi login. Network hichki par
    // aadmi ko bahar nahi phenkte — wo bas dobara koshish kar sake.
    // Installed app bina signal ke khule to login form nahi: wo login
    // bhi nahi ho payega. "Offline" dikhao, signal aate hi khud dobara.
    const netFail = !e.status || e.status >= 500;
    // Login form pehle se khula hai (abhi login kiya) — wahin bata do
    if (netFail && !$("login").hidden) {
      $("lg-err").textContent = "Network problem — check your signal, then try again.";
      return;
    }
    if (netFail) {
      $("boot-spin").hidden = true; $("boot-off").hidden = false;
      window.addEventListener("online", retryBoot, { once: true });
      setTimeout(retryBoot, 20000);
      return;
    }
    // Solo: app ka session gaya par dashboard login zinda hai to password nahi maangte
    if (e.status === 401 && location.pathname === "/solo" && !triedDashboardLogin) {
      triedDashboardLogin = true;
      try {
        const r = await fetch("/api/solo/app-session", { method: "POST", credentials: "same-origin" });
        if (r.status === 403) { location.replace("/welcome"); return; }    // band dukaan: renew wahan hai
        const d = r.ok ? await r.json() : {};
        if (d.ok) return start();
        if (d.need_phone) { askOwnerPhone(); return; }
        if (d.next_url) { location.replace(d.next_url); return; }
      } catch (_) { /* neeche login form */ }
    }
    $("boot").hidden = true;
    $("login").hidden = false; $("app").hidden = true;
    if (e.status === 402) $("lg-err").textContent = e.message;
    return;
  }
  // Solo dukaan ka apna pata /solo, staff wali dukaan ka /staff (main.py) —
  // galat pate par login hua to sahi par bhej do (cookie dono par chalti hai)
  const home = ME.solo && ME.is_owner ? "/solo" : "/staff";
  if ((location.pathname === "/solo" || location.pathname === "/staff") && location.pathname !== home) {
    location.replace(home + location.search + location.hash);
    return;
  }
  $("boot").hidden = true;
  $("login").hidden = true; $("app").hidden = false;
  // History ki jad: root -> pehli screen. Back yahan tak aaye to Exit poochho.
  if (!(history.state && history.state.kk)) { history.replaceState({ kk: "root" }, ""); history.pushState({ kk: "nav", nav: "work" }, ""); }
  $("who").textContent = ME.name;
  $("whoRole").textContent = `${roleLabel(ME.role)} · ${ME.shop || ""}`;
  $("pwbanner").hidden = !ME.must_change_password;
  // Owner "Login as" se: saaf dikhe ki ye staff ka app hai, aur yahan ka kaam uske naam jayega
  $("asbanner").hidden = !ME.viewing_as;
  if (ME.viewing_as) {
    const support = ME.viewing_as === "Kwik Klin support";     // control panel se
    $("as-text").textContent = `👁 ${support ? "Support" : "Owner"} view: you are in ${ME.name}'s app. Anything you do counts as ${ME.name}.`;
    $("as-exit").onclick = async () => {
      try { await api("/logout", { method: "POST" }); } catch (e) { /* cookie 30 min mein khatam */ }
      window.close();
      location.replace(support ? "/control" : "/staff");
    };
  }
  // Garment tag scan: plan + owner ka Settings switch (server ka garment_tags)
  // dono ho to hi header mein — tab bar 5 par hi rehta hai
  $("btn-scan").hidden = !ME.garment_tags;
  renderNav();
  if (ME.must_change_password) {
    // Owner ka diya temp password: server kaam ka data/action nahi deta jab
    // tak apna password na rakh lo. Yahan list/live/push shuru hi nahi karte
    // — sab 403 hote; password badalte hi start() dobara chalta hai.
    $("list").innerHTML = `<div class="empty"><b>Set your own password first</b>
      The owner gave you a temporary one. Your work shows up right after.
      <button type="button" class="btn go empty-cta" id="pw-now">Change password</button></div>`;
    $("pw-now").onclick = () => changePw(true);
    changePw(true);
    return;
  }
  setTasksBadge((BOOT.tasks && BOOT.tasks.total) || 0);   // /boot mein pehle se — alag request nahi
  if (ME.is_owner && window.Solo) {
    $("whoRole").textContent = `${Solo.T("owner")} · ${ME.shop || ""}`;
    go("home");
    if (ME.solo && !ME.onboarding_done) Solo.onboarding();   // pehli baar: 3 kadam
  } else go("work");
  loadToday();
  loadBell();
  startLive();
  paintOutbox();
  flushOutbox();
  if (!ME.viewing_as) pushSync();      // owner ke phone par staff ki notification nahi
  paintPushNudge();
}

/* ─── role ke hisaab se nav ─────────────────────────────────────────── */
/* Har role ka pehla sawaal alag hai, isliye pehla tab bhi alag ho sakta
   hai — par sabke liye "Kaam" hi ghar hai. Bill alag jagah hai (pehle wo
   New-bill screen ke neeche chipka tha aur kisi ko milta hi nahi tha). */
/* Plan `billing` kehta hai ki DUKAAN bill bana sakti hai; `can_bill` kehta
   hai ki YE aadmi bana sakta hai (washerman nahi). Dono server se aate hain
   aur dono ek hi jagah se padhe jaate hain — isliye tab dikhna aur API ka
   maanna kabhi alag nahi ho sakte. */
const canBill = () => ME.can_bill && ME.features.includes("billing");

function navItems() {
  // Badge sirf dikhane ke liye: Solo Pro owner, Premium/Business ke admin aur manager
  const feats = ME.features || [];
  const badge = (ME.is_owner && feats.includes("solo_reports_detailed"))
    || (feats.includes("reports") && ["ADMIN", "MANAGER"].includes(ME.role));
  document.body.classList.toggle("so-pro", !!badge);
  $("whoRole").dataset.tier = ME.solo ? "PRO" : String(ME.plan || "").toUpperCase();
  // Owner mode (solo.js): आज · ऑर्डर · बिल · उधार · आप
  if (ME.is_owner && window.Solo) return Solo.navItems();
  // Tasks har kisi ke liye — owner ka diya kaam ek jagah, kaam ki list mein nahi dabta
  // 5 se zyada tab phone par patle ho jaate the (delivery ke 6, manager ke 7).
  // Ab: Work · Tasks · ➕New (beech mein, angoothe ke neeche) · Bills · You.
  // Expense aur Team kam baar khulte hain — "You" ke andar bade buttons.
  const out = [["work", "i-basket", "Work"], ["tasks", "i-task", "Tasks"]];
  if (canBill()) out.push(["new", "i-plus", "New"], ["bills", "i-receipt", "Bills"]);
  out.push(["me", "i-user", "You"]);
  return out;
}

/* Icons come from the dashboard's SVG sprite (one cached file): emoji
   render differently on every phone and never line up with the label. */
const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="/admin/static/icons.svg?v=ui2#${id}"/></svg>`;

function renderNav() {
  $("nav").innerHTML = navItems().map(([k, ic, label]) =>
    `<button data-nav="${k}" class="${NAV === k ? "on" : ""}${k === "new" ? " fab" : ""}"><i>${icon(ic)}${k === "tasks" ? `<span class="nav-n" id="tasksN" hidden>0</span>` : ""}</i>${label}</button>`).join("");
  $("nav").querySelectorAll("[data-nav]").forEach((b) => { b.onclick = () => go(b.dataset.nav); });
}

async function openPickupBill(code) {
  try {
    const ctx = await api(`/tasks/${encodeURIComponent(code)}/bill-context`);
    PICKUP_BILL_CONTEXT = ctx;
    go("new");
  } catch (e) {
    toast(e.message, true);
  }
}

const SUB_OF_ME = ["exp", "team", "rates", "shop", "plan"];
const canTeam = () => ME.is_manager && ME.features.includes("staff_reports");
// Expense/Team ke upar "‹ You" — wapas aane ka saaf rasta
function backToMe() {
  if (!SUB_OF_ME.includes(NAV)) return;
  $("chips").innerHTML = `<button type="button" data-back="me">‹ You</button>`;
  $("chips").querySelector("[data-back]").onclick = () => go("me");
}

function go(nav, push = true) {
  if (push && NAV !== nav) history.pushState({ kk: "nav", nav }, "");
  NAV = nav;
  FILTER = nav === "bills" ? "all" : "all";
  $("q").value = "";
  $("searchrow").hidden = nav !== "bills";
  document.body.classList.toggle("you-open", nav === "me");   // You ka apna header hai
  // Hisaab kaam ke baare mein hai — form aur profile par sirf jagah khata hai
  $("today").hidden = !(nav === "work" || nav === "bills");
  $("latebar").hidden = true;        // paintLate() isse wapas laayega
  if ($("pushbar")) paintPushNudge();
  // Expense/Team "You" ke andar hain — nav mein "You" hi chamke
  const navOn = SUB_OF_ME.includes(nav) ? "me" : nav;
  $("nav").querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === navOn));
  $("btn-scan").classList.toggle("on", nav === "scan");
  // New Bill tablet/desktop par chauda (grahak | kapde | bill) — baaki screens 780px
  $("app").classList.toggle("kb-wide", nav === "new");
  if (nav !== "scan" && window.stopStaffScan) stopStaffScan();   // camera band — battery aur privacy
  if (nav === "work") loadWork();
  else if (nav === "scan") showStaffScan();
  else if (nav === "tasks") showTasks();
  else if (nav === "bills") loadBills();
  else if (nav === "new") showNewBill();
  else if (nav === "exp") showExpenses();
  else if (nav === "team") showTeam();
  else if (window.Solo && Solo.handles(nav)) Solo.route(nav);
  else if (ME.is_owner && window.Solo) Solo.me();
  else showMe();
}

$("btn-refresh").onclick = (e) => {
  const b = e.currentTarget;
  b.classList.add("turn"); setTimeout(() => b.classList.remove("turn"), 650);
  refreshCurrent({ quiet: false });
  loadToday(); loadBell();
  if (NAV !== "work" && NAV !== "tasks") countTasks();   // in dono par list khud badge bharti hai
};
$("pw-open").onclick = changePw;
$("btn-bell").onclick = showBell;
$("btn-scan").onclick = () => go("scan");

function refreshCurrent(opts = {}) {
  if (window.Solo && Solo.handles(NAV)) return Solo.route(NAV, opts);
  if (NAV === "work") loadWork(opts);
  else if (NAV === "tasks") showTasks(opts);
  else if (NAV === "bills") loadBills(opts);
  else if (NAV === "team") showTeam(opts);
}

/* ─── aaj ka hisaab ─────────────────────────────────────────────────── */

async function loadToday() {
  try {
    const t = (BOOT && BOOT.today) || await api("/today");
    if (BOOT) BOOT.today = null;
    const cell = (label, value, cls = "", tap = "") => tap
      ? `<button type="button" class="${cls} tap" data-today="${tap}"><b>${value}</b>${label}</button>`
      : `<div class="${cls}"><b>${value}</b>${label}</div>`;
    $("today").innerHTML =
      cell("to do", t.pending, "left") +
      cell("done today", t.done_today) +
      (t.due_today ? cell("due today", t.due_today) : "") +
      (t.can_collect ? cell("collected ›", money(t.collected_today), "cash", "cash") : "") +
      (t.cash_to_confirm ? cell("to count ›", `💵 ${t.cash_to_confirm}`, "cash alert", "count") : "") +
      (t.shop_pending !== undefined ? cell("shop total", t.shop_pending) : "");
    $("today").hidden = !(NAV === "work" || NAV === "bills");
    LATE_N = t.late || 0;
    paintLate();
  } catch (e) {
    $("today").hidden = true;   // hisaab na mile to chup — kaam chalta rahe
    $("latebar").hidden = true;
  }
}

$("today").addEventListener("click", (e) => {
  const b = e.target.closest("[data-today]");
  if (!b) return;
  if (b.dataset.today === "cash") cashSheet();
  else if (b.dataset.today === "count") countCash();
});

/* ─── shaam ka cash hisaab ──────────────────────────────────────────── */
/* Delivery wala din bhar paisa leta hai; shaam ko "itna cash de raha
   hoon". Rakam server ledger se ginta hai — aadmi sirf ye likhta hai ki
   haath mein kitna de raha hai (kam ho to wajah). Manager gin kar pakka
   karta hai; farak ho to dono rakam rehti hain aur owner ko khabar. */
const HO_STATUS = (h) => h.status === "PENDING" ? `<span class="tag late">waiting for count</span>`
  : h.short ? `<span class="tag late">${h.short > 0 ? "short" : "extra"} ${money(Math.abs(h.short))}</span>`
  : `<span class="tag ready">✓ counted</span>`;
async function cashSheet() {
  let c;
  try { c = await api("/cash"); } catch (e) { toast(e.message, true); return; }
  const list = c.payments.map((p) => `<div class="od-sub"><span>${esc(p.order)} · ${esc(p.at)}</span>
    <span>${p.method === "cash" ? "💵" : "📱"} ${money(p.amount)}</span></div>`).join("");
  const recent = c.recent.map((h) => `<div class="od-sub"><span>${esc(h.to)} · ${money(h.handed_cash)}</span>${HO_STATUS(h)}</div>`).join("");
  openModal(`<h3>💵 My cash</h3>
    <p class="said">Since ${esc(c.since)} · ${c.count} payment${c.count === 1 ? "" : "s"}</p>
    <div class="od-block">
      <div class="kv"><span>Cash in hand</span><b>${money(c.cash)}</b></div>
      <div class="kv"><span>UPI (already with the shop)</span><b>${money(c.upi)}</b></div>
    </div>
    ${list ? `<details class="od-block"><summary><b>Payments</b></summary>${list}</details>` : ""}
    ${c.count ? `<label for="ho-amt">Cash you are handing over</label>
    <input id="ho-amt" type="number" inputmode="decimal" min="0" step="1" value="${c.cash}">
    <label for="ho-note">Note — needed if you give less</label>
    <input id="ho-note" type="text" maxlength="150" placeholder="e.g. ₹50 petrol">
    <div class="err" id="ho-err"></div>` : `<p class="said">Nothing collected since your last handover.</p>`}
    ${recent ? `<div class="od-block"><div class="od-head"><b>Recent handovers</b></div>${recent}</div>` : ""}
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Close</button>
      ${c.count ? `<button class="btn go" id="ho-go">Hand over</button>` : ""}
    </div>`);
  if (!c.count) return;
  const paint = () => {
    const v = parseFloat($("ho-amt").value);
    $("ho-go").textContent = v >= 0 ? `Hand over ${money(v)}` : "Hand over";
  };
  $("ho-amt").oninput = paint; paint();
  $("ho-go").onclick = (e) => {
    const handed = parseFloat($("ho-amt").value);
    const note = $("ho-note").value.trim();
    if (!(handed >= 0)) { $("ho-err").textContent = "Enter the cash amount."; return; }
    if (handed > c.cash + 0.01) { $("ho-err").textContent = `You collected only ${money(c.cash)} in cash.`; return; }
    if (handed < c.cash - 0.01 && note.length < 3) { $("ho-err").textContent = "Giving less — write the reason in the note."; return; }
    return busy(e.currentTarget, async () => {
      await api("/cash/handover", { method: "POST", body: { handed_cash: handed, note } });
      closeModal();
      toast("Handed over — your manager will count it");
      loadToday();
    });
  };
}

/* Manager: kiska paisa ginna baaki hai. Jo gina wahi likho. */
async function countCash() {
  let d;
  try { d = await api("/cash/handovers"); } catch (e) { toast(e.message, true); return; }
  const rows = d.pending.map((h) => `<div class="od-block" data-ho="${esc(h.id)}">
      <div class="od-head"><b>${esc(h.staff)}</b><span>${esc(h.to)}</span></div>
      <div class="kv"><span>Says cash</span><b>${money(h.handed_cash)}</b></div>
      <div class="kv"><span>Collected (ledger)</span><b>${money(h.cash_collected)} cash · ${money(h.upi_collected)} UPI</b></div>
      ${h.note ? `<p class="note">${esc(h.note)}</p>` : ""}
      <label for="cc-${esc(h.id)}">You counted</label>
      <input id="cc-${esc(h.id)}" type="number" inputmode="decimal" min="0" step="1" value="${h.handed_cash}">
      <button class="btn go wide" data-confirm="${esc(h.id)}">Confirm count</button>
    </div>`).join("");
  openModal(`<h3>💵 Cash to count</h3>
    ${rows || `<p class="said">Nothing waiting — all handovers are counted.</p>`}
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
  $("modal-body").querySelectorAll("[data-confirm]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.confirm;
      const v = parseFloat($(`cc-${id}`).value);
      if (!(v >= 0)) { toast("Enter what you counted", true); return; }
      return busy(b, async () => {
        const r = await api(`/cash/handovers/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { received_cash: v } });
        toast(r.short ? `Counted — ${r.short > 0 ? "short" : "extra"} ${money(Math.abs(r.short))}, owner told` : "Counted ✅");
        closeModal(); loadToday();
        if (NAV === "team") showTeam({ quiet: true });
      });
    };
  });
}

/* Beeta hua kaam khud bolna chahiye.
 *
 * Late order list mein pehle se upar aata hai aur uski date laal hoti hai,
 * par wo tabhi dikhta hai jab aadmi app KHOLE aur neeche padhe. Aur "Late"
 * chip baaki chips jaisa hi lagta hai — usme chubhan nahi hai.
 *
 * Ginti server se aati hai, WORK se nahi: panel ke paas sirf pehla page
 * hota hai, to bees late par bhi banner "2" kehta.
 */
let LATE_N = 0;

function paintLate() {
  const bar = $("latebar");
  // Sirf Kaam wale screen par. Bill banate waqt ye dhyan todta hai, aur
  // filter bhi usi screen ka hai jispar ye le jaata hai.
  if (NAV !== "work" || LATE_N < 1) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.classList.toggle("on", FILTER === "late");
  bar.innerHTML = FILTER === "late"
    ? `<span>⏰ ${LATE_N} late — sab dikha rahe hain</span><b>Wapas</b>`
    : `<span>⏰ ${LATE_N} kaam late ${LATE_N === 1 ? "hai" : "hain"}</span><b>Dekhein</b>`;
}

$("latebar").onclick = () => {
  FILTER = FILTER === "late" ? "all" : "late";
  $("chips").innerHTML = workChips();
  paintLate();
  renderWork();
};

/* ─── notifications ─────────────────────────────────────────────────── */
/* Sirf ek cheez abhi: owner ke wo jawab jo maine nahi padhe. Badge tabhi
   kaam ka hai jab wo sach mein kuch naya bole; har cheez ka badge banate
   hi log dekhna band kar dete hain. */

async function loadBell() {
  try {
    const n = (BOOT && BOOT.notifications) || await api("/notifications");
    if (BOOT) BOOT.notifications = null;
    UNREAD = n.unread || 0;
  } catch (e) { UNREAD = 0; }
  $("bellN").hidden = UNREAD === 0;
  $("bellN").textContent = UNREAD > 9 ? "9+" : String(UNREAD);
}

async function showBell() {
  let n;
  try { n = await api("/notifications"); }
  catch (e) { toast(e.message, true); return; }
  if (!n.items.length) {
    openModal(`<h3>Nothing new</h3>
      <p class="said">Replies from the owner show up here.</p>
      <div class="btnrow"><button class="btn ghost" data-act="close">Got it</button></div>`);
    return;
  }
  openModal(`<h3>Replies</h3>
    <p class="said">${n.items.length} new</p>
    ${n.items.map((i) => `
      <div class="card inset">
        <div class="line1"><b>${esc(i.title)}</b><span class="sub">${esc(i.at)}</span></div>
        <div class="sub">${esc(i.text)}</div>
        <button class="btn ghost sm" data-act="thread" data-arg="${esc(i.code)}">Open</button>
      </div>`).join("")}
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
}

/* ─── Kaam: ek list, chips se chhanti ───────────────────────────────── */
/*
 * Pehle "Work" (tasks) aur "Route" (stops) do alag tab the. Dikkat: ek hi
 * order dono jagah dikh sakta tha, aur jis order par koi task nahi bana
 * wo sirf Route mein tha — to aadmi ek tab dekh kar samajhta tha ki uska
 * kaam khatam hai. Ab dono ek hi list mein aate hain, ek kram se, aur
 * chips se chhante jaate hain.
 *
 * Kram: pehle late, phir aaj, phir baaki. Wahi kram jisme aadmi kaam
 * karega — sabse upar wahi jo sabse pehle nipatna chahiye.
 */

const KIND = {
  Pickup:   { chip: "pickup",  spine: "pickup",  label: "Collect" },
  Delivery: { chip: "deliver", spine: "deliver", label: "Deliver" },
  Dhulai:   { chip: "wash",    spine: "wash",    label: "Washing" },
  Hold:     { chip: "wash",    spine: "late",    label: "On hold" },
  Done:     { chip: "done",    spine: "",        label: "Done" },
};
const inDone = () => FILTER === "done";

function workChips() {
  const n = (f) => WORK.filter((w) => f === "all" || w.chip === f).length;
  const out = [["all", "All"]];
  const kinds = [...new Set(WORK.map((w) => w.chip))];
  if (kinds.includes("pickup")) out.push(["pickup", "Collect"]);
  if (kinds.includes("wash")) out.push(["wash", "Washing"]);
  if (kinds.includes("deliver")) out.push(["deliver", "Deliver"]);
  if (kinds.includes("task")) out.push(["task", "Work"]);
  if (WORK.some((w) => w.late)) out.push(["late", "Late"]);
  // "Done" hamesha: nipta hua kaam (7 din) yahan milta hai, gayab nahi hota
  out.push(["done", "Done"]);
  return out.map(([v, label]) => {
    const c = inDone() ? (v === "done" ? WORK.length : null)
      : v === "done" ? null : v === "late" ? WORK.filter((w) => w.late).length : n(v);
    return `<button data-chip="${v}" class="${FILTER === v ? "on" : ""}">${label}${c === null ? "" : `<span class="n">${c}</span>`}</button>`;
  }).join("");
}

let WORK_SEQ = 0, MORE_LEFT = false;
/* ─── Tasks — har staff ka alag section ────────────────────────────────
   Owner/agent ka diya har kaam yahan, ek card par: kya karna hai, kis order
   ka, kab se pada hai, aur Done / owner se poochho. Work tab order ki
   haalat dikhata hai; ye tab sirf "mujhe kya kaam diya gaya". */
let TASK_TAB = "open";
const TASK_KIND = {
  wash: "Washing", dry: "Drying", iron: "Ironing", pickup: "Pickup", delivery: "Delivery",
};
function setTasksBadge(n) {
  const b = $("tasksN");
  if (!b) return;
  b.textContent = n > 99 ? "99+" : String(n);
  b.hidden = !n;
}
async function countTasks() {
  try { setTasksBadge((await api("/tasks?tab=mine&limit=1")).total || 0); } catch (e) { /* badge hi hai */ }
}
async function showTasks(opts = {}) {
  $("chips").innerHTML = [["open", "Open"], ["done", "Done"]].map(([v, label]) =>
    `<button data-tchip="${v}" class="${TASK_TAB === v ? "on" : ""}">${label}</button>`).join("");
  $("chips").querySelectorAll("[data-tchip]").forEach((b) => {
    b.onclick = () => { TASK_TAB = b.dataset.tchip; showTasks(); };
  });
  if (!opts.quiet) $("list").innerHTML = `<div class="empty">Loading…</div>`;
  let r;
  try { r = await api(`/tasks?tab=${TASK_TAB === "done" ? "done" : "mine"}&limit=100`); }
  catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (NAV !== "tasks") return;
  const open = TASK_TAB === "open";
  if (open) setTasksBadge(r.total || 0);
  const rows = (r.tasks || []).slice().sort((a, b) => open ? (b.urgent - a.urgent) || (b.age_hours - a.age_hours) : 0);
  if (!rows.length) {
    $("list").innerHTML = `<div class="empty"><b>${open ? "No tasks right now" : "Nothing done yet"}</b>${open ? "When the owner gives you a task, it shows up here." : "Tasks you close show up here."}</div>`;
    return;
  }
  $("list").innerHTML = rows.map(taskCard).join("");
  $("list").querySelectorAll("[data-tdo]").forEach((b) => {
    b.onclick = () => {
      const code = b.dataset.code;
      if (b.dataset.tdo === "bill") return openPickupBill(code);
      if (b.dataset.tdo === "picked") return confirmStep(b.dataset.num, "picked-up", "Picked up the clothes?", "Yes, picked up");
      if (b.dataset.tdo === "done") return askDone(code);
      if (b.dataset.tdo === "ask") return openThread(code);
      if (b.dataset.tdo === "order") return orderDetailModal(b.dataset.num);
    };
  });
}
/* Pickup kaam par seedha bill — par sirf tab jab abhi kapde lene baaki hon
   (order bana hi nahi, ya order abhi pickup ke intezaar mein hai) */
function canPickupBill(t) {
  if (t.kind !== "pickup" || t.status !== "OPEN" || !canBill() || !DELIVERY_ROLES.includes(ME.role)) return false;
  return !t.order ? !!t.customer : t.order.status === "PICKUP_ASSIGNED" && !(t.order.total > 0);
}
/* Order ki row par chhota "Bill": kapde ginte hi wahin bill banana ho to */
function pickupBillBtn(w) {
  const t = (w.tasks || []).find((x) => x.kind === "pickup" && x.status === "OPEN");
  return t && canPickupBill(t) ? `<button class="btn ghost sm" data-do="pickup_bill" data-code="${esc(t.code)}">🧾 Bill</button>` : "";
}
function taskCard(t) {
  const o = t.order;
  const open = t.status === "OPEN";
  const age = t.age_hours < 1 ? "just now" : t.age_hours < 24 ? `${t.age_hours}h ago` : `${Math.floor(t.age_hours / 24)}d ago`;
  return `<article class="row tcard${t.urgent && open ? " urgent" : ""}">
    <div class="spine ${t.urgent && open ? "late" : ""}"></div>
    <div class="body">
      <div class="line1"><b>${t.urgent && open ? "🔴 " : ""}${esc(t.title)}</b></div>
      <div class="sub"><span class="tag task">${esc(TASK_KIND[t.kind] || "Job")}</span>${esc(t.code)} · ${esc(age)}${t.eta_text ? ` · ⏰ ${esc(t.eta_text)}` : ""}</div>
      ${o ? `<div class="sub mt-xs">🧺 ${esc(o.number)} · ${esc(o.customer)}${o.items ? " · " + esc(o.items) : ""}</div>`
        : t.customer ? `<div class="sub mt-xs">👤 ${esc(t.customer.name)}</div>` : ""}
      ${t.cancel_requested ? `<div class="sub mt-xs"><span class="tag late">Cancel requested</span>${esc(t.cancel_reason || "")}</div>` : ""}
      ${t.reply && !open ? `<div class="sub note">✓ ${esc(t.reply)}</div>` : ""}
      ${open ? `<div class="acts">
        ${canPickupBill(t) && o
          ? `<button class="btn go sm" data-tdo="picked" data-num="${esc(o.number)}">✅ Picked up</button>
             <button class="btn ghost sm" data-tdo="bill" data-code="${esc(t.code)}">🧾 Create bill</button>`
          : canPickupBill(t)
            ? `<button class="btn go sm" data-tdo="bill" data-code="${esc(t.code)}">🧾 Create bill &amp; pick up</button>
               <button class="btn ghost sm" data-tdo="done" data-code="${esc(t.code)}">✓ Done</button>`
            : `<button class="btn go sm" data-tdo="done" data-code="${esc(t.code)}">✓ Done</button>`}
        ${ME.can_ask ? `<button class="btn ghost sm" data-tdo="ask" data-code="${esc(t.code)}">❓ Ask owner</button>` : ""}
        ${o ? `<button class="btn ghost sm" data-tdo="order" data-num="${esc(o.number)}">👁 Order</button>` : ""}
        ${(o && o.nav_url) || (t.customer && t.customer.nav_url)
          ? `<a class="btn ghost sm" href="${esc((o && o.nav_url) || t.customer.nav_url)}" target="_blank" rel="noopener">🧭 Navigate</a>` : ""}
      </div>` : ""}
    </div>
  </article>`;
}

async function loadWork(opts = {}) {
  if (!opts.quiet) $("list").innerHTML = `<div class="empty">Loading…</div>`;
  const mine = ++WORK_SEQ;
  const skip = opts.more ? WORK.length : 0;
  let route = { stops: [], total: 0 }, tasks = { tasks: [], total: 0 };
  const pre = BOOT && BOOT.route && !opts.more && !inDone() ? BOOT : null;
  if (pre) { route = pre.route || route; tasks = pre.tasks || tasks; BOOT.route = BOOT.tasks = null; }
  else try {
    [route, tasks] = await Promise.all([
      api(`/route?tab=${inDone() ? "done" : "todo"}&limit=${PAGE}&offset=${skip}`).catch(() => ({ stops: [], total: 0 })),
      inDone() ? { tasks: [], total: 0 }
        : api(`/tasks?tab=mine&limit=${PAGE}&offset=${skip}`).catch(() => ({ tasks: [], total: 0 })),
    ]);
  } catch (e) {
    if (mine !== WORK_SEQ || opts.quiet) return;
    $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (mine !== WORK_SEQ || NAV !== "work") return;
  // /tasks?tab=mine ka total hi Tasks tab ka badge hai — alag request kyon
  if (!inDone() && !opts.more) setTasksBadge(tasks.total || 0);

  // Ek order do jagah se aa sakta hai (uska stop bhi hai, uspar task bhi).
  // Stop zyada kaam ka hai (usme address, due, phone sab hai), isliye task
  // usi row par nishaan ban kar chipak jaata hai — do rows nahi banti.
  // Is page ke rows alag banao, phir purane ke saath jodo. Pehle maine
  // ise ek hi array par likhne ki koshish ki thi aur logic samajh se
  // bahar chala gaya — do saaf hisse behtar hain.
  const page = [];
  const byOrder = new Map();
  for (const s of route.stops) {
    const k = KIND[s.kind] || { chip: "task", spine: "", label: s.kind };
    const w = s.done_at
      ? { top: new Date(s.done_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), sub: STATUS_WORD[s.status] || "done", late: false }
      : whenParts(s.delivery);
    const item = {
      type: "stop", chip: k.chip, spine: w.late ? "late" : k.spine, kindLabel: k.label,
      number: s.number, who: s.customer, items: s.items, due: s.due,
      address: s.address, urgent: s.urgent, when: w, late: w.late, tasks: [],
      hasOrder: true, status: s.status, next: s.next, clothes: s.clothes,
      // 📍 Google Maps pin (services/geo.py) — Navigate button aur route bar
      nav_url: s.nav_url || "", pin_saved: !!s.pin_saved, waypoint: s.waypoint || "", customer_ref: s.customer_ref || "",
    };
    byOrder.set(s.number, item);
    page.push(item);
  }
  for (const t of tasks.tasks) {
    if (t.status !== "OPEN") continue;
    const onOrder = t.order && byOrder.get(t.order.number);
    if (onOrder) { onOrder.tasks.push(t); continue; }
    const w = t.order ? whenParts(t.order.delivery)
      : t.age_hours < 1 ? { top: "Now", sub: "", late: false }
      : { top: `${t.age_hours}h`, sub: "waiting", late: t.age_hours > 24 };
    page.push({
      type: "task", chip: "task", spine: t.urgent || w.late ? "late" : "", kindLabel: "Job",
      number: t.order ? t.order.number : t.code,
      who: t.order ? t.order.customer : t.customer ? `${t.customer.name} — ${t.title}` : t.title,
      items: t.order ? t.order.items : "", due: t.order ? t.order.due : 0,
      // Bina order wale kaam par paisa hota hi nahi — na rakam dikhani hai
      // na "chukta" ka ✓, warna aadmi samajhta hai ki paisa aa gaya.
      noMoney: !t.order,
      hasOrder: !!t.order, status: t.order ? t.order.status : null, next: t.order ? t.order.next : null,
      clothes: t.order ? t.order.clothes : null,
      // Title upar bold mein aa chuka hai; dobara neeche likhna sirf
      // shor hai. Neeche wahi jab order ka naam upar ho.
      urgent: t.urgent, when: w, late: !!w.late, tasks: [t],
      title: t.order ? t.title : "",
      nav_url: (t.order && t.order.nav_url) || (t.customer && t.customer.nav_url) || "",
      customer_ref: (t.order && t.order.customer_ref) || (t.customer && t.customer.customer_ref) || "",
      waypoint: "",
    });
  }
  // "Show more" jodta hai, badalta nahi. Ek hi number do baar na aaye —
  // page ke kinare par wahi order dono taraf ho sakta hai.
  const merged = opts.more ? WORK.concat(page) : page;
  const seen = new Set();
  WORK = merged.filter((w) => (seen.has(w.number) ? false : seen.add(w.number)));
  // Kaam ki list do jagah se banti hai (stops + tasks) aur ek hi order
  // dono mein ho sakta hai — isliye dono ke total jodna jhooth hai
  // ("60 of 539" jabki asli rows 300 hain). Yahan sirf itna jaanna hai ki
  // aur bacha hai ya nahi: dono mein se koi bhi poora nahi aaya to haan.
  MORE_LEFT = (route.stops.length >= PAGE) || (tasks.tasks.length >= PAGE);
  if (!inDone()) WORK.sort((a, b) => (b.late - a.late) || (b.urgent - a.urgent));   // done: naya sabse upar
  $("chips").innerHTML = workChips();
  paintLate();
  renderWork();
}

/* Chips ka ek hi listener, container par — har chip par apna handler
 * nahi. Pehle yahan wo handler dobara chipkaya jaata tha jo abhi dabaya
 * gaya tha (`x.onclick = b.onclick`), aur wo closure PURANE `b` par band
 * tha. Yani "Washing" dabate hi har chip ka matlab "Washing" ho jaata
 * tha — doosra filter chunna namumkin, jab tak list dobara load na ho.
 *
 * Container kabhi dobara nahi banta, sirf uska andar ka HTML badalta hai,
 * isliye ye listener ek hi baar lagta hai aur hamesha us chip ko padhta
 * hai jispar sach mein tap hua.
 */
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-chip]");
  if (!b) return;
  const wasDone = inDone();
  FILTER = b.dataset.chip;
  if (NAV === "bills") { loadBills(); return; }
  if (window.Solo && Solo.handles(NAV)) { Solo.route(NAV); return; }
  // Done alag list hai (server se), baaki chips usi list ko chhaantte hain
  if (inDone() || wasDone) { loadWork(); return; }
  $("chips").innerHTML = workChips();
  paintLate();
  renderWork();
});

/* Aaj ke saare stop ek Google Maps route mein — har row ka alag "Route"
   kholna aur wapas aana sadak par mushkil tha. Maps ek link mein 9 beech
   ke padav leta hai, isliye pehle 10 (list pehle se urgent/late ke kram mein). */
const ROUTE_MAX = 10;
/* Naya ladka: grahak ka naam likho, ghar ka pin milega. Kaam ki list ke
   upar hi — kisi menu mein chhupa nahi. */
function locateBar() {
  if (!canLocate() || !ME.show_route || inDone() || !DELIVERY_ROLES.includes(ME.role)) return "";
  return `<div class="routebar">
    <span>📍 <b>Customer's house?</b> Search by name</span>
    <button type="button" class="btn ghost sm" data-act="findloc">Find</button>
  </div>`;
}
function routeBar(rows) {
  if (!ME.show_route || inDone() || !DELIVERY_ROLES.includes(ME.role)) return "";
  const seen = new Set();
  const addrs = rows.filter((w) => ["pickup", "deliver"].includes(w.chip) && (w.waypoint || w.address))
    .map((w) => (w.waypoint || w.address).trim())
    .filter((a) => (seen.has(a.toLowerCase()) ? false : seen.add(a.toLowerCase())));
  if (!addrs.length) return "";
  const stops = addrs.slice(0, ROUTE_MAX);
  const dest = stops[stops.length - 1];
  const mid = stops.slice(0, -1);
  const url = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(dest)
    + (mid.length ? "&waypoints=" + encodeURIComponent(mid.join("|")) : "");
  return `<div class="routebar">
    <span>🗺 <b>${stops.length} stop${stops.length > 1 ? "s" : ""}</b>${addrs.length > ROUTE_MAX ? ` (first ${ROUTE_MAX} of ${addrs.length})` : ""} in one route</span>
    <span class="rb-acts">
      ${canLocate() ? `<button type="button" class="btn ghost sm" data-act="findloc" aria-label="Find a customer's house">📍 Find</button>` : ""}
      <a class="btn go sm" href="${esc(url)}" target="_blank" rel="noopener">Open route</a>
    </span>
  </div>`;
}

function renderWork() {
  const rows = WORK.filter((w) =>
    FILTER === "all" || inDone() ? true : FILTER === "late" ? w.late : w.chip === FILTER);
  if (!rows.length) {
    $("list").innerHTML = inDone()
      ? `<div class="empty"><b>Nothing finished yet</b>Work you complete stays here for 7 days.</div>`
      : WORK.length
      ? `<div class="empty"><b>Nothing in this filter</b>Try another one.</div>`
      : `<div class="empty"><b>All clear 👏</b>New work shows up here.</div>`;
    return;
  }
  // "Show more" sirf tab jab chhaant lagi hi na ho — chip ke andar aadhi
  // list dikhana aur "aur hai" kehna jhooth hai.
  const bar = routeBar(rows) || locateBar();   // ek hi patti — phone par jagah keemti hai
  $("list").innerHTML = bar + `<div class="reg">${rows.map(workRow).join("")}</div>`
    + ((FILTER === "all" || inDone()) && MORE_LEFT
        ? `<div class="morebar"><span>${WORK.length} shown</span>
             <button class="btn ghost sm" data-act="more" data-arg="loadWork">Show more</button></div>`
        : "");
  wireRows();
}

/* Bill list ka "Show more". Ginti hamesha dikhti hai (30 of 108), taaki
   aadmi jaane ki aur kitna baaki hai — aur scroll karne ke bajaye search
   karna behtar hai ya nahi. */
function moreBar(shown, total, fn) {
  if (!total || shown >= total) {
    return total > PAGE
      ? `<div class="morebar"><span>All ${total} shown</span></div>` : "";
  }
  return `<div class="morebar">
    <span>${shown} of ${total}</span>
    <button class="btn ghost sm" data-act="more" data-arg="${fn}">Show more</button>
  </div>`;
}

/* Har row ka ek hi mukhya kaam — order ki haalat aur aadmi ke role se.
   Pehle "Done" sirf un rows par tha jin par task bana tha: kisi par Call,
   kisi par Done, kisi par sirf collect — delivery boy samajh nahi paata tha
   ki kis row par kya dabana hai. Ab kram hamesha: Call · kaam · ₹ · ⋯ */
const DELIVERY_ROLES = ["DELIVERY", "MANAGER", "SUPERVISOR", "ADMIN"];
const WASH_ROLES = ["WASHER", "IRONER", "MANAGER", "SUPERVISOR", "ADMIN"];
const WASH_STAGES = ["RECEIVED", "PICKED_UP", "IN_WASH", "IN_DRY", "IN_IRON"];
const STEP_START = { IN_DRY: "Start drying", IN_IRON: "Start iron", READY: "Ready" };
const STEP_SEND = { IN_DRY: "Send to dry", IN_IRON: "Send to iron", READY: "Ready" };
const STEP_ASK = {
  IN_DRY: ["Move clothes to drying?", "Yes, drying"],
  IN_IRON: ["Send clothes for ironing?", "Yes, send to iron"],
  READY: ["Clothes done and ready?", "Yes, ready"],
};
function primaryAction(w) {
  const t = w.tasks && w.tasks[0];
  const s = w.status;
  const pend = w.clothes && w.clothes.delivered > 0 ? w.clothes.pending : 0;
  // Washerman ki list mein Ready order sirf roke hue kapdon ke liye aata hai
  if (s && ["READY", "OUT_FOR_DELIVERY"].includes(s) && ["WASHER", "IRONER"].includes(ME.role)
      && w.clothes && w.clothes.held) {
    return { act: "release", label: `▶ Hold done (${w.clothes.held})` };
  }
  if (s && ["READY", "OUT_FOR_DELIVERY"].includes(s) && DELIVERY_ROLES.includes(ME.role)) {
    return { act: "deliver", label: pend ? `Deliver rest (${pend})` : "Deliver" };
  }
  if (s && ["PICKUP_ASSIGNED"].includes(s) && DELIVERY_ROLES.includes(ME.role)) {
    // Pickup ek kaam hai: kapde liye, task poora. Bill chahe to alag chhota button (pickupBillBtn)
    return { act: "pickup", label: "Picked up" };
  }
  // Agla stage server batata hai — service ke stages se. Sirf-press wala
  // kapda "Start wash" nahi dikhata, seedha "Start iron".
  if (s && WASH_STAGES.includes(s) && WASH_ROLES.includes(ME.role) && w.next) {
    if (w.next === "IN_WASH") return { act: "washing", label: "Start wash" };
    const before = ["RECEIVED", "PICKED_UP"].includes(s);
    return { act: "advance", to: w.next, label: (before ? STEP_START : STEP_SEND)[w.next] };
  }
  // Owner ka pickup kaam (bina order) — seedha bill, grahak bhara hua
  if (t && t.kind === "pickup" && canBill() && DELIVERY_ROLES.includes(ME.role)) {
    return { act: "pickup_bill", label: "Create bill & pick up", code: t.code };
  }
  if (t) return { act: "done", label: "Done", code: t.code };
  return null;
}

/* Owner ka diya alag kaam jo kisi order par hai. Order ki row ka bada
   button status ka hota hai ("Start wash"), isliye ye kaam pehle row mein
   chhup jaata tha — sirf ⋯ menu mein milta tha. Dhulai/pickup ke apne kaam
   status hi hain, unhe dobara nahi dikhate. */
const STAGE_TASK_KINDS = ["wash", "dry", "iron", "pickup", "delivery"];
function ownerJobs(w) {
  if (w.type !== "stop") return [];
  return (w.tasks || []).filter((t) => t.status === "OPEN" && !STAGE_TASK_KINDS.includes(t.kind));
}

function workRow(w) {
  const t = w.tasks[0];
  const asked = t && t.cancel_requested;
  // Paisa sirf billing roles ko — server washerman ko due bhejta hi nahi
  const due = (w.noMoney || !ME.can_money || w.due === undefined) ? ""
    : w.due > 0 ? `<span class="amt due">${money(w.due)}</span>`
    : `<span class="amt paid-tick">✓</span>`;
  const main = primaryAction(w);
  const partial = w.clothes && w.clothes.delivered > 0 && w.clothes.pending > 0;
  const queued = outbox().filter((x) => x.number === w.number).map((x) => x.label);
  return `<article class="row tappable" data-num="${esc(w.number)}" data-open="1">
    <div class="spine ${w.spine}"></div>
    <div class="when ${w.late ? "late" : ""}">
      <b>${esc(w.when.top)}</b>${w.when.sub ? `<span>${esc(w.when.sub)}</span>` : ""}
    </div>
    <div class="body">
      <div class="line1"><b>${w.urgent ? "🔴 " : ""}${esc(w.who)}</b>${due}</div>
      <div class="sub">
        <span class="tag ${w.chip === "task" ? "task" : w.spine || "wash"}">${esc(w.kindLabel)}</span>${esc(w.number)}${w.items ? " · " + esc(w.items) : ""}
      </div>
      ${queued.length ? `<div class="sub mt-xs"><span class="tag deliver">⏳ ${esc(queued.join(", "))} — waiting for signal</span></div>` : ""}
      ${partial ? `<div class="sub mt-xs"><span class="tag late">${w.clothes.pending} pending</span>${w.clothes.delivered} of ${w.clothes.total} delivered</div>` : ""}
      ${w.clothes && w.clothes.held ? `<div class="sub mt-xs"><span class="tag hold">⏸ ${w.clothes.held} on hold</span></div>` : ""}
      ${w.title && w.type === "task" ? `<div class="sub note">${esc(w.title)}</div>` : ""}
      ${ownerJobs(w).map((j) => `<div class="job">
        <span>📌 ${esc(j.title)}</span>
        <button class="btn ghost sm" data-do="done" data-code="${esc(j.code)}">✓ Done</button>
      </div>`).join("")}
      ${asked ? `<div class="sub mt-xs"><span class="tag late">Cancel maanga</span>${esc(t.cancel_reason || "")}</div>` : ""}
      ${ME.show_route && w.address ? `<div class="sub mt-xs">📍 ${esc(w.address)}</div>` : ""}
      ${isDeliveryBoy() ? `<div class="acts compact">
        ${main ? `<button class="btn go sm" data-do="${main.act}"${main.code ? ` data-code="${esc(main.code)}"` : ""}${main.to ? ` data-to="${esc(main.to)}"` : ""}>${esc(main.label)}</button>` : ""}
        ${pickupBillBtn(w)}
        ${ME.show_route && w.nav_url ? `<button class="btn ghost sm navb" data-do="map" data-url="${esc(w.nav_url)}" aria-label="Navigate to customer">🧭</button>` : ""}
        <button class="btn ghost sm more" data-do="more" aria-label="More options">⋯</button>
      </div>` : `<div class="acts">
        ${w.hasOrder && ME.can_contact ? `<button class="btn ghost sm" data-do="call">Call</button>` : ""}
        ${main ? `<button class="btn go sm" data-do="${main.act}"${main.code ? ` data-code="${esc(main.code)}"` : ""}${main.to ? ` data-to="${esc(main.to)}"` : ""}>${esc(main.label)}</button>` : ""}
        ${pickupBillBtn(w)}
        ${ME.show_route && (w.nav_url || w.address) ? `<button class="btn ghost sm" data-do="map" data-addr="${esc(w.address || "")}" data-url="${esc(w.nav_url || "")}">${w.nav_url ? "🧭 Navigate" : "Route"}</button>` : ""}
        ${ME.can_money && ME.features.includes("cod_collection") && w.due > 0
          ? `<button class="btn money sm" data-do="pay" data-due="${w.due}">${money(w.due)} collect</button>` : ""}
        <button class="btn ghost sm" data-do="more" aria-label="More">⋯</button>
      </div>`}
    </div>
  </article>`;
}

function runAction(act, num, d = {}) {
  if (act === "call") return callCustomer(num);
  // Pin saved ho to seedha directions; warna pate ki search
  if (act === "map") return window.open(
    d.url || ("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(d.addr)),
    "_blank", "noopener");
  if (act === "done") return askDone(d.code);
  if (act === "ask") return openThread(d.code);
  if (act === "pay") return askCollect(num, parseFloat(d.due));
  if (act === "more") return moreMenu(num);
  if (act === "deliver") return deliverModal(num);
  if (act === "pickup_bill") return openPickupBill(d.code);
  if (act === "pickup") return confirmStep(num, "picked-up", "Picked up the clothes?", "Yes, picked up");
  if (act === "washing") return washStartModal(num);
  if (act === "advance" && STEP_ASK[d.to]) return confirmStep(num, "advance", STEP_ASK[d.to][0], STEP_ASK[d.to][1], { to: d.to });
  if (act === "ready") return confirmStep(num, "ready", "Clothes done and ready?", "Yes, ready");
  if (act === "hold") return holdModal(num);
  if (act === "release") return releaseModal(num);
  if (act === "readysome") return readySomeModal(num);
}

function wireRows() {
  $("list").querySelectorAll("[data-do]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      runAction(b.dataset.do, b.closest("[data-num]").dataset.num, b.dataset);
    };
  });
  // Row par kahin bhi tap = poori detail. Delivery boy ko pata hona chahiye
  // ki is order mein kya-kya kapde hain, kitne dene hain, kitna paisa.
  $("list").querySelectorAll("[data-open]").forEach((row) => {
    row.onclick = () => {
      const w = WORK.find((x) => x.number === row.dataset.num);
      if (w && w.hasOrder) return orderDetailModal(w.number);
      if (w && w.tasks[0]) return askDone(w.tasks[0].code);
    };
  });
}

/* ─── order ki poori detail ─────────────────────────────────────────── */
const STATUS_WORD = {
  RECEIVED: "Received", PICKUP_ASSIGNED: "To pick up", PICKED_UP: "Picked up", IN_WASH: "Washing",
  IN_DRY: "Drying", IN_IRON: "Ironing", READY: "Ready", OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered", ON_HOLD: "On hold", CANCELLED: "Cancelled",
};
/* IMP_006: "Washing for 30h (limit 24h)" — deri ho to laal patti, warna
   halki line. Milestones sirf un plans mein jahan timeline khuli hai. */
const hrs = (h) => h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
function stageLine(t) {
  if (!t) return "";
  const head = t.delayed
    ? `<div class="delay-bar">⏱ Delayed — ${esc(t.delay_reason)}</div>`
    : `<p class="said">⏱ ${esc(t.stage_label)} for ${hrs(t.stage_hours)}${t.stage_limit ? ` · limit ${t.stage_limit}h` : ""}</p>`;
  const ms = (t.milestones || []).map((m) => `<div class="od-sub"><span>${esc(m.label)}</span>
      <span class="${m.late ? "late-t" : ""}">${m.hours != null ? hrs(m.hours) : ""}</span></div>`).join("");
  return head + (ms ? `<div class="od-block"><div class="od-head"><b>Progress</b></div>${ms}</div>` : "");
}

/* Notes ek ke neeche ek — pehle sab ek paragraph mein bah jaate the aur
   photo ka rasta (/admin/media/…) text ki tarah dikhta tha. */
function notesHtml(notes) {
  return `<div class="od-notes">${String(notes).split("\n").filter((x) => x.trim()).map((ln) => {
    const m = ln.match(/(\/admin\/media\/[\w.\-]+)/);
    const text = esc(m ? ln.replace(m[1], "").replace(/\s{2,}/g, " ") : ln);
    const cls = /damage|⚠️|mismatch|on hold|⏸/i.test(ln) ? " warn" : "";
    // Notes store the dashboard URL; the phone's cookie only travels under
    // /staff, so the link is served by the panel's own media route.
    const href = m ? m[1].replace("/admin/media/", "/staff/api/media/") : "";
    return `<div class="od-note${cls}">${text}${m ? ` <a href="${esc(href)}" target="_blank" rel="noopener">📷 photo</a>` : ""}</div>`;
  }).join("")}</div>`;
}

/* ─── kapda rokna: "ye abhi nahi hua" ─────────────────────────────────
   Delivery ke partial jaisa — washerman kuch kapde rok kar baaki order
   aage badhata hai. Roke hue delivery mein nahi jaate, owner ko khabar. */
const HOLD_STAGES = ["RECEIVED", "PICKED_UP", "IN_WASH", "IN_DRY", "IN_IRON", "READY", "OUT_FOR_DELIVERY"];
const HOLD_REASONS = ["Stain not gone", "Not dry yet", "Needs repair", "Ironing left", "Colour issue"];
// Bina dhule wapas (return) — kaaran ke chip; daam bill se apne aap hatta hai
const RETURN_REASONS = ["Stain won't go", "Fabric too weak", "Customer took it back", "Damaged / torn", "Colour may run"];
// "Some ready" — Ready se pehle ke kadam (server: delivery.WASHABLE)
const READY_SOME_STAGES = ["RECEIVED", "PICKED_UP", "IN_WASH", "IN_DRY", "IN_IRON"];
// jin kapdon par abhi kaam hai (return hue nahi) — purana server ho to deliverable
const wk = (x) => (x.workable !== undefined ? x.workable : x.deliverable);
// jo abhi wapas kiye ja sakte hain: diye nahi gaye, pehle se return nahi (hold wale bhi)
const rtn = (x) => Math.max(0, (x.pending || 0) - (x.returned_pending || 0));
async function holdModal(number, o) {
  if (!o) {
    try { o = await api(`/orders/${encodeURIComponent(number)}`); }
    catch (e) { toast(e.message, true); return; }
  }
  const slots = [];
  (o.lines || []).forEach((l) => {
    if (l.pieces) {
      l.pieces.forEach((p) => { if (wk(p) > 0) slots.push({ line: l.line, piece: p.piece, max: wk(p), name: p.type, group: `${l.name} · ${l.weight} kg` }); });
    } else if (wk(l) > 0) {
      slots.push({ line: l.line, max: wk(l), name: l.name, sub: l.service !== l.name ? l.service : "", bag: !!l.bag, weight: l.weight });
    }
  });
  if (!slots.length) { toast("No clothes left to hold on this bill", true); return; }
  const pick = slots.map(() => 0);   // default: kuch nahi — jo roka wahi chuno
  let lastGroup = "";
  openModal(`<h3>⏸ Hold clothes — ${esc(o.number)}</h3>
    <p class="said">Pick the clothes that are <b>not done</b>. The rest of the order can move on; these stay at the shop.</p>
    <div class="dl-list">${slots.map((s, i) => {
      const head = s.group && s.group !== lastGroup ? `<div class="dl-group">${esc(s.group)}</div>` : "";
      lastGroup = s.group || "";
      return head + (s.bag
        ? `<label class="dl-row"><span class="dl-name">${esc(s.name)} <small>${esc(String(s.weight))} kg bag</small></span>
             <input type="checkbox" data-hbag="${i}" aria-label="Hold the whole bag"></label>`
        : `<div class="dl-row"><span class="dl-name">${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ""}</span>
             <div class="stepper sm">
               <button type="button" class="step" data-hl="${i}" data-by="-1" aria-label="One less">−</button>
               <input type="number" inputmode="numeric" min="0" max="${s.max}" value="0" data-hlq="${i}" aria-label="How many">
               <button type="button" class="step" data-hl="${i}" data-by="1" aria-label="One more">+</button>
             </div>
             <small class="dl-of">of ${s.max}</small></div>`);
    }).join("")}</div>
    <label for="h-why">Why?</label>
    <div class="why-chips">${HOLD_REASONS.map((r) => `<button type="button" class="chip" data-why="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <input id="h-why" type="text" maxlength="120" placeholder="e.g. stain not gone, button broken">
    <p class="dl-sum" id="h-sum"></p>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn go" id="h-go" disabled>⏸ Hold</button>
    </div>`);
  const body = $("modal-body");
  const paint = () => {
    const n = pick.reduce((a, v) => a + v, 0);
    const why = $("h-why").value.trim();
    $("h-sum").innerHTML = n === 0 ? "Pick at least one cloth." : why.length < 2 ? "Write why (or tap a reason)." : `<b>${n}</b> will stay at the shop.`;
    $("h-go").textContent = n ? `⏸ Hold ${n}` : "⏸ Hold";
    $("h-go").disabled = n === 0 || why.length < 2;
    slots.forEach((s, i) => {
      const q = body.querySelector(`[data-hlq="${i}"]`);
      if (q && document.activeElement !== q) q.value = String(pick[i]);
    });
  };
  body.querySelectorAll("[data-hl]").forEach((b) => {
    b.onclick = () => { const i = +b.dataset.hl; pick[i] = Math.max(0, Math.min(slots[i].max, pick[i] + parseInt(b.dataset.by, 10))); paint(); };
  });
  body.querySelectorAll("[data-hlq]").forEach((inp) => {
    inp.oninput = () => { const i = +inp.dataset.hlq; pick[i] = Math.max(0, Math.min(slots[i].max, parseInt(inp.value, 10) || 0)); paint(); };
  });
  body.querySelectorAll("[data-hbag]").forEach((cb) => { cb.onchange = () => { pick[+cb.dataset.hbag] = cb.checked ? 1 : 0; paint(); }; });
  body.querySelectorAll("[data-why]").forEach((b) => { b.onclick = () => { $("h-why").value = b.dataset.why; paint(); }; });
  $("h-why").oninput = paint;
  $("h-go").onclick = (e) => busy(e.currentTarget, async () => {
    const picks = slots.map((s, i) => pick[i] > 0 ? { line: s.line, ...(s.piece !== undefined ? { piece: s.piece } : {}), qty: pick[i] } : null).filter(Boolean);
    try {
      await api(`/orders/${encodeURIComponent(o.number)}/hold`, { method: "POST", body: { picks, reason: $("h-why").value.trim() } });
    } catch (err) { toast(err.message, true); return; }
    LOCAL_REFRESH = Date.now();
    closeModal();
    toast(`${o.number} — ${picks.reduce((a, p) => a + p.qty, 0)} on hold. Owner told ⏸`);
    refreshCurrent({ quiet: true }); loadToday();
  });
  paint();
}
async function releaseModal(number, o) {
  if (!o) {
    try { o = await api(`/orders/${encodeURIComponent(number)}`); }
    catch (e) { toast(e.message, true); return; }
  }
  const held = (o.lines || []).flatMap((l) => l.pieces
    ? l.pieces.filter((p) => p.held).map((p) => `${p.type} ×${p.held}`)
    : l.held ? [`${l.name}${l.bag ? " (bag)" : ` ×${l.held}`}`] : []);
  if (!held.length) { toast("Nothing is on hold", true); return; }
  openModal(`<h3>▶ Hold done — ${esc(o.number)}</h3>
    <p class="said">These clothes are finished now and go back for delivery:</p>
    <div class="od-block">${held.map((h) => `<div class="od-sub"><span>${esc(h)}</span></div>`).join("")}</div>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn go" id="r-go">✅ Yes, done</button>
    </div>`);
  $("r-go").onclick = (e) => busy(e.currentTarget, async () => {
    let r;
    try { r = await api(`/orders/${encodeURIComponent(o.number)}/release`, { method: "POST", body: {} }); }
    catch (err) { toast(err.message, true); return; }
    LOCAL_REFRESH = Date.now();
    closeModal(); toast(`${o.number} — held clothes done ✅${r && r.customer_told ? " · customer told" : ""}`);
    refreshCurrent({ quiet: true }); loadToday();
  });
}

/* ✅ Kuch kapde taiyar — jo TAIYAR hain wo chuno (shuru mein sab chune hue,
   jo nahi hue unhe ghatao). Baaki apne aap hold par, order Ready; grahak ko
   "8 taiyar, 2 par kaam chal raha hai" (server: delivery.partial_ready).
   Baad mein "▶ Hold done" se baaki bhi Ready — grahak ko phir message. */
async function readySomeModal(number, o) {
  if (!o) {
    try { o = await api(`/orders/${encodeURIComponent(number)}`); }
    catch (e) { toast(e.message, true); return; }
  }
  const slots = [];
  (o.lines || []).forEach((l) => {
    if (l.pieces) {
      l.pieces.forEach((p) => { if (wk(p) > 0) slots.push({ line: l.line, piece: p.piece, max: wk(p), name: p.type, group: `${l.name} · ${l.weight} kg` }); });
    } else if (wk(l) > 0) {
      slots.push({ line: l.line, max: wk(l), name: l.name, sub: l.service !== l.name ? l.service : "", bag: !!l.bag, weight: l.weight });
    }
  });
  if (!slots.length) { toast("No clothes left on this bill", true); return; }
  const total = slots.reduce((a, s) => a + s.max, 0);
  const pick = slots.map((s) => s.max);   // default: sab taiyar
  let lastGroup = "";
  openModal(`<h3>✅ Some clothes ready — ${esc(o.number)}</h3>
    <p class="said">Keep the clothes that are <b>ready</b>. The rest stay at the shop on hold, and the customer is told how many are ready.</p>
    <div class="dl-list">${slots.map((s, i) => {
      const head = s.group && s.group !== lastGroup ? `<div class="dl-group">${esc(s.group)}</div>` : "";
      lastGroup = s.group || "";
      return head + (s.bag
        ? `<label class="dl-row"><span class="dl-name">${esc(s.name)} <small>${esc(String(s.weight))} kg bag</small></span>
             <input type="checkbox" data-rbag="${i}" checked aria-label="Whole bag ready"></label>`
        : `<div class="dl-row"><span class="dl-name">${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ""}</span>
             <div class="stepper sm">
               <button type="button" class="step" data-rl="${i}" data-by="-1" aria-label="One less">−</button>
               <input type="number" inputmode="numeric" min="0" max="${s.max}" value="${s.max}" data-rlq="${i}" aria-label="How many ready">
               <button type="button" class="step" data-rl="${i}" data-by="1" aria-label="One more">+</button>
             </div>
             <small class="dl-of">of ${s.max}</small></div>`);
    }).join("")}</div>
    <div id="rs-whybox" hidden>
      <label for="rs-why">Why are the others not ready? <small>(optional)</small></label>
      <div class="why-chips">${HOLD_REASONS.map((r) => `<button type="button" class="chip" data-why="${esc(r)}">${esc(r)}</button>`).join("")}</div>
      <input id="rs-why" type="text" maxlength="120" placeholder="e.g. stain not gone, not dry yet">
    </div>
    <p class="dl-sum" id="rs-sum"></p>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn go" id="rs-go">✅ Ready</button>
    </div>`);
  const body = $("modal-body");
  const paint = () => {
    const n = pick.reduce((a, v) => a + v, 0), left = total - n;
    $("rs-whybox").hidden = left === 0;
    $("rs-sum").innerHTML = n === 0 ? "Pick at least one ready cloth."
      : left === 0 ? `<b>All ${n}</b> ready — same as marking the order ready.`
      : `<b>${n}</b> ready · <b>${left}</b> stay at the shop on hold`;
    $("rs-go").textContent = n === 0 ? "✅ Ready" : left === 0 ? `✅ All ${n} ready` : `✅ ${n} ready, hold ${left}`;
    $("rs-go").disabled = n === 0;
    slots.forEach((s, i) => {
      const q = body.querySelector(`[data-rlq="${i}"]`);
      if (q && document.activeElement !== q) q.value = String(pick[i]);
    });
  };
  body.querySelectorAll("[data-rl]").forEach((b) => {
    b.onclick = () => { const i = +b.dataset.rl; pick[i] = Math.max(0, Math.min(slots[i].max, pick[i] + parseInt(b.dataset.by, 10))); paint(); };
  });
  body.querySelectorAll("[data-rlq]").forEach((inp) => {
    inp.oninput = () => { const i = +inp.dataset.rlq; pick[i] = Math.max(0, Math.min(slots[i].max, parseInt(inp.value, 10) || 0)); paint(); };
  });
  body.querySelectorAll("[data-rbag]").forEach((cb) => { cb.onchange = () => { pick[+cb.dataset.rbag] = cb.checked ? 1 : 0; paint(); }; });
  body.querySelectorAll("[data-why]").forEach((b) => { b.onclick = () => { $("rs-why").value = b.dataset.why; }; });
  $("rs-go").onclick = (e) => busy(e.currentTarget, async () => {
    const picks = slots.map((s, i) => pick[i] > 0 ? { line: s.line, ...(s.piece !== undefined ? { piece: s.piece } : {}), qty: pick[i] } : null).filter(Boolean);
    let r;
    try {
      r = await api(`/orders/${encodeURIComponent(o.number)}/partial-ready`, { method: "POST", body: { picks, reason: $("rs-why").value.trim() } });
    } catch (err) { toast(err.message, true); return; }
    LOCAL_REFRESH = Date.now();
    closeModal();
    const held = (r.clothes && r.clothes.held) || 0;
    toast(held ? `${o.number} — ${r.ready} ready, ${held} on hold ⏸` : `${o.number} — ready ✅`);
    refreshCurrent({ quiet: true }); loadToday();
  });
  paint();
}

/* ↩ Bina dhule wapas — kapde chuno (shuru mein koi nahi) aur kaaran. Unka daam
   (aur GST) bill se apne aap hatta hai; grahak pehle hi de chuka ho to "₹X
   wapas dena". Kapde delivery ke saath "returned" likh kar jaate hain. */
async function returnModal(number, o) {
  if (!o) {
    try { o = await api(`/orders/${encodeURIComponent(number)}`); }
    catch (e) { toast(e.message, true); return; }
  }
  const slots = [];
  (o.lines || []).forEach((l) => {
    if (l.pieces) {
      l.pieces.forEach((p) => { if (rtn(p) > 0) slots.push({ line: l.line, piece: p.piece, max: rtn(p), name: p.type, group: `${l.name} · ${l.weight} kg` }); });
    } else if (rtn(l) > 0) {
      slots.push({ line: l.line, max: rtn(l), name: l.name, sub: l.service !== l.name ? l.service : "", bag: !!l.bag, weight: l.weight });
    }
  });
  if (!slots.length) { toast("No clothes left to return on this bill", true); return; }
  const pick = slots.map(() => 0);
  let lastGroup = "";
  openModal(`<h3>↩ Return clothes — ${esc(o.number)}</h3>
    <p class="said">Pick the clothes going back to the customer <b>without cleaning</b>.${ME.can_money ? " Their price comes off the bill." : ""}</p>
    <div class="dl-list">${slots.map((s, i) => {
      const head = s.group && s.group !== lastGroup ? `<div class="dl-group">${esc(s.group)}</div>` : "";
      lastGroup = s.group || "";
      return head + (s.bag
        ? `<label class="dl-row"><span class="dl-name">${esc(s.name)} <small>${esc(String(s.weight))} kg bag</small></span>
             <input type="checkbox" data-tbag="${i}" aria-label="Return the whole bag"></label>`
        : `<div class="dl-row"><span class="dl-name">${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ""}</span>
             <div class="stepper sm">
               <button type="button" class="step" data-tl="${i}" data-by="-1" aria-label="One less">−</button>
               <input type="number" inputmode="numeric" min="0" max="${s.max}" value="0" data-tlq="${i}" aria-label="How many">
               <button type="button" class="step" data-tl="${i}" data-by="1" aria-label="One more">+</button>
             </div>
             <small class="dl-of">of ${s.max}</small></div>`);
    }).join("")}</div>
    <label for="t-why">Why?</label>
    <div class="why-chips">${RETURN_REASONS.map((r) => `<button type="button" class="chip" data-why="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <input id="t-why" type="text" maxlength="120" placeholder="e.g. stain won't go, customer took it back">
    <p class="dl-sum" id="t-sum"></p>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn go" id="t-go" disabled>↩ Return</button>
    </div>`);
  const body = $("modal-body");
  const paint = () => {
    const n = pick.reduce((a, v) => a + v, 0);
    const why = $("t-why").value.trim();
    $("t-sum").innerHTML = n === 0 ? "Pick at least one cloth." : why.length < 2 ? "Write why (or tap a reason)." : `<b>${n}</b> go back to the customer uncleaned.`;
    $("t-go").textContent = n ? `↩ Return ${n}` : "↩ Return";
    $("t-go").disabled = n === 0 || why.length < 2;
    slots.forEach((s, i) => {
      const q = body.querySelector(`[data-tlq="${i}"]`);
      if (q && document.activeElement !== q) q.value = String(pick[i]);
    });
  };
  body.querySelectorAll("[data-tl]").forEach((b) => {
    b.onclick = () => { const i = +b.dataset.tl; pick[i] = Math.max(0, Math.min(slots[i].max, pick[i] + parseInt(b.dataset.by, 10))); paint(); };
  });
  body.querySelectorAll("[data-tlq]").forEach((inp) => {
    inp.oninput = () => { const i = +inp.dataset.tlq; pick[i] = Math.max(0, Math.min(slots[i].max, parseInt(inp.value, 10) || 0)); paint(); };
  });
  body.querySelectorAll("[data-tbag]").forEach((cb) => { cb.onchange = () => { pick[+cb.dataset.tbag] = cb.checked ? 1 : 0; paint(); }; });
  body.querySelectorAll("[data-why]").forEach((b) => { b.onclick = () => { $("t-why").value = b.dataset.why; paint(); }; });
  $("t-why").oninput = paint;
  $("t-go").onclick = (e) => busy(e.currentTarget, async () => {
    const picks = slots.map((s, i) => pick[i] > 0 ? { line: s.line, ...(s.piece !== undefined ? { piece: s.piece } : {}), qty: pick[i] } : null).filter(Boolean);
    let r;
    try {
      r = await api(`/orders/${encodeURIComponent(o.number)}/return`, { method: "POST", body: { picks, reason: $("t-why").value.trim() } });
    } catch (err) { toast(err.message, true); return; }
    LOCAL_REFRESH = Date.now();
    closeModal();
    const n = picks.reduce((a, p) => a + p.qty, 0);
    if (r.refund_due > 0) {
      // Paisa wapas dena hai — toast mein chhoot na jaaye
      openModal(`<h3>↩ ${n} returned — ${esc(o.number)}</h3>
        <p class="said">${money(r.amount_off)} came off the bill. The customer had already paid more than the new total.</p>
        <p class="hold-note"><b>Give back ${money(r.refund_due)}</b> to the customer.</p>
        <div class="btnrow"><button class="btn go" data-act="close">OK</button></div>`);
    } else {
      toast(`${o.number} — ${n} returned ↩${r.amount_off ? ` · ${money(r.amount_off)} off the bill` : ""}`);
    }
    refreshCurrent({ quiet: true }); loadToday();
  });
  paint();
}

/* Bill galat nahi, order hi nahi hua: bill record mein "Cancelled" rehta hai, bikri aur
   udhaar se hat jaata hai. Liya hua paisa apne aap wapas nahi hota, isliye saaf batate hain. */
function cancelOrderModal(number, o) {
  const hi = ME.ui_lang === "hi", paid = Number(o.paid || 0);
  openModal(`<h3>🚫 ${esc(number)} ${hi ? "कैंसिल करें?" : "cancel?"}</h3>
    <p class="said">${hi ? "बिल रिकॉर्ड में रहेगा, पर बिक्री और उधार से हट जाएगा। यह वापस नहीं होगा।" : "The bill stays on record but leaves sales and dues. This cannot be undone."}</p>
    ${paid > 0 ? `<p class="said"><b>${money(paid)} ${hi ? "मिल चुके हैं। ग्राहक को लौटाना आपको खुद करना है।" : "was already collected. Returning it to the customer is up to you."}</b></p>` : ""}
    <div class="btnrow"><button class="btn ghost" data-act="close">${hi ? "रहने दो" : "Keep order"}</button>
      <button class="btn danger" id="co-yes">${hi ? "हाँ, कैंसिल करें" : "Yes, cancel"}</button></div>`);
  $("co-yes").onclick = (e) => busy(e.target, async () => {
    await api(`/orders/${encodeURIComponent(number)}/status`, { method: "POST", body: { status: "CANCELLED" } });
    closeModal(); toast(hi ? `${number} कैंसिल हो गया` : `${number} cancelled`); refreshCurrent({ quiet: true });
  });
}

async function orderDetailModal(number) {
  let o;
  try { o = await api(`/orders/${encodeURIComponent(number)}`); }
  catch (e) { toast(e.message, true); return; }
  const w = WORK.find((x) => x.number === number) || { tasks: [], hasOrder: true };
  const main = primaryAction({ ...w, status: o.status, next: o.next, clothes: o.clothes });
  const c = o.clothes || { total: 0, delivered: 0, pending: 0, held: 0 };
  const lines = o.lines || [];
  const tag = (d, q, h, r) => (r ? `<span class="dl-tag hold">↩ ${r} returned</span>` : "")
    + (h ? `<span class="dl-tag hold">⏸ ${h} on hold</span>` : "")
    + (d >= q ? `<span class="dl-tag ok">✓ delivered</span>`
      : d > 0 ? `<span class="dl-tag part">${q - d} pending</span>` : "");
  const svc = (l) => l.service && l.service !== l.name ? ` <small>${esc(l.service)}</small>` : "";
  const why = (l) => (l.held && l.hold_reason ? `<div class="od-why">⏸ ${esc(l.hold_reason)}</div>` : "")
    + (l.returned && l.return_reason ? `<div class="od-why">↩ ${esc(l.return_reason)}</div>` : "");
  const lineHtml = lines.map((l) => {
    if (l.pieces) {
      // KG bora: service ka naam aur andar ke kapdon ki ginti bhi
      return `<div class="od-line"><div class="od-top"><b>${esc(l.name)}${svc(l)}</b><span>${esc(String(l.weight))} kg · ${l.qty} pcs</span></div>
        ${l.pieces.map((p) => `<div class="od-sub"><span>${esc(p.type)}</span><span>× ${p.qty} ${tag(p.delivered, p.qty, p.held, p.returned)}</span></div>`).join("")}
        ${why(l)}
      </div>`;
    }
    return `<div class="od-line"><div class="od-top"><b>${esc(l.name)}${svc(l)}</b>
      <span>${l.bag ? `${esc(String(l.weight))} kg bag` : `× ${l.qty}`} ${tag(l.delivered, l.qty, l.held, l.returned)}</span></div>${why(l)}</div>`;
  }).join("") || `<p class="said">No items on this bill.</p>`;
  // "5 total" jab 4 shirt + 1 bora ho — galat; kapde aur bore alag gino
  const pcs = lines.filter((l) => !l.bag).reduce((a, l) => a + l.qty, 0);
  const bags = lines.filter((l) => l.bag).length;
  const totalTxt = [pcs ? `${pcs} pcs` : "", bags ? `${bags} bag${bags > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ") || "0";
  const washer = WASH_ROLES.includes(ME.role);
  const canHold = washer && HOLD_STAGES.includes(o.status) && lines.some((l) => wk(l) > 0);
  // Bina dhule wapas — washerman (saaf nahi hoga) ya delivery (grahak ne maang liya)
  const canReturn = (washer || DELIVERY_ROLES.includes(ME.role)) && HOLD_STAGES.includes(o.status)
    && lines.some((l) => (l.pieces ? l.pieces.some((p) => rtn(p) > 0) : rtn(l) > 0));
  // Kuch taiyar, kuch nahi — Ready se pehle ke kisi bhi kadam par (ek se zyada kapda ho to)
  const canReadySome = washer && READY_SOME_STAGES.includes(o.status)
    && lines.reduce((a, l) => a + (wk(l) || 0), 0) > 1;
  openModal(`<h3>${o.urgent ? "🔴 " : ""}${esc(o.customer)}</h3>
    <p class="said">${esc(o.number)} · ${esc(STATUS_WORD[o.status] || o.status)}${o.delivery ? ` · delivery ${esc(whenParts(o.delivery).top)}` : ""}${o.urgent ? " · ⚡ URGENT" : ""}</p>
    ${stageLine(o.tracking)}
    ${o.nav_url ? `<a class="btn ghost mt-s" href="${esc(o.nav_url)}" target="_blank" rel="noopener">🧭 Navigate to customer</a>` : ""}
    <div class="od-block">
      <div class="od-head"><b>Clothes</b><span>${totalTxt}${c.delivered ? ` · ${c.delivered} delivered · <b class="late-t">${c.pending} pending</b>` : ""}${c.held ? ` · <b class="hold-t">${c.held} on hold</b>` : ""}</span></div>
      ${lineHtml}
    </div>
    ${ME.can_money && o.total !== undefined ? `<div class="od-block">
      <div class="kv"><span>Bill</span><b>${money(o.total)}</b></div>
      ${o.urgent_charge ? `<div class="kv"><span>incl. urgent charge</span><b>${money(o.urgent_charge)}</b></div>` : ""}
      <div class="kv"><span>Paid</span><b>${money(o.paid)}</b></div>
      <div class="kv"><span>Due</span><b class="${o.due > 0 ? "late-t" : ""}">${money(Math.max(0, o.due))}</b></div>
    </div>` : ""}
    ${o.notes ? `<div class="od-block"><b>Notes</b>${notesHtml(o.notes)}</div>` : ""}
    ${(washer && (canHold || c.held || canReadySome)) || canReturn ? `<div class="btnrow">
      ${canReadySome ? `<button class="btn ghost" data-od="readysome">✅ Some ready</button>` : ""}
      ${canReturn ? `<button class="btn ghost" data-od="return">↩ Return clothes</button>` : ""}
      ${canHold ? `<button class="btn ghost" data-od="hold">⏸ Hold clothes (not done)</button>` : ""}
      ${washer && c.held ? `<button class="btn ghost" data-od="release">▶ Hold done (${c.held})</button>` : ""}
    </div>` : ""}
    <div class="btnrow">
      ${ME.can_contact ? `<button class="btn ghost" data-od="call">📞 Call</button>` : ""}
      ${main ? `<button class="btn go" data-od="${main.act}"${main.code ? ` data-code="${esc(main.code)}"` : ""}${main.to ? ` data-to="${esc(main.to)}"` : ""}>${esc(main.label)}</button>` : ""}
      ${o.can_collect && o.due > 0 ? `<button class="btn money" data-od="pay" data-due="${o.due}">${money(o.due)} collect</button>` : ""}
    </div>
    <div class="btnrow">
      ${ME.can_money ? `<button class="btn ghost" data-od="share">🧾 Send bill</button>` : ""}
      ${ME.can_money ? `<button class="btn ghost" data-od="message">💬 Message</button>` : ""}
      ${ME.is_owner && !["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn ghost" data-od="cancelorder">🚫 ${ME.ui_lang === "hi" ? "ऑर्डर कैंसिल करें" : "Cancel order"}</button>` : ""}
      <button class="btn ghost" data-act="close">Close</button>
    </div>`);
  $("modal-body").querySelectorAll("[data-od]").forEach((b) => {
    b.onclick = () => {
      closeModal();
      if (b.dataset.od === "cancelorder") return cancelOrderModal(number, o);
      if (b.dataset.od === "share") return shareBill(number);
      if (b.dataset.od === "message") return messageMenu(number, Number(o.due || 0));
      if (b.dataset.od === "hold") return holdModal(number, o);
      if (b.dataset.od === "release") return releaseModal(number, o);
      if (b.dataset.od === "readysome") return readySomeModal(number, o);
      if (b.dataset.od === "return") return returnModal(number, o);
      return runAction(b.dataset.od, number, b.dataset);
    };
  });
}

/* ─── delivery: sab ya kuch kapde (BUG_008) ─────────────────────────── */
/* 12 mein se 8 shirt diye — baaki 4 pending rehte hain aur agli baar
   "Deliver rest (4)" dikhta hai. Default: sab chune hue (aam haalat). */
async function statusMenu(number) {
  let o;
  try { o = await api(`/orders/${encodeURIComponent(number)}`); }
  catch (e) { toast(e.message, true); return; }

  const stages = [
    ["RECEIVED", "Received", "Order received"],
    ["PICKUP_ASSIGNED", "Pickup scheduled", "Pickup assigned"],
    ["PICKED_UP", "Picked up", "Clothes picked up"],
    ["IN_WASH", "Wash", "Internal update — no customer message"],
    ["IN_DRY", "Drying", "Internal update — no customer message"],
    ["IN_IRON", "Iron", "Internal update — no customer message"],
    ["READY", "Ready", "Customer will be notified"],
    ["OUT_FOR_DELIVERY", "Out for delivery", "Customer will be notified"],
    ["DELIVERED", "Delivered", "Thank-you + feedback message"],
  ];
  const current = stages.findIndex(([s]) => s === o.status);
  const options = stages.slice(Math.max(0, current + 1));

  if (!options.length) {
    openModal(`<div class="status-head"><span class="status-icon">↻</span><div><h3>Status</h3><p class="said">${esc(o.number)} · ${esc(STATUS_WORD[o.status] || o.status)}</p></div></div>
      <p class="comm-note">This order is already at its latest stage.</p>
      <div class="btnrow"><button class="btn ghost wide" data-act="close">Close</button></div>`);
    return;
  }

  openModal(`<div class="status-head"><span class="status-icon">↻</span><div><h3>Update status</h3><p class="said">${esc(o.number)} · ${esc(o.customer)}</p></div></div>
    <div class="status-list">
      ${options.map(([s,label,desc]) => `<button class="status-option" data-status="${s}"><span class="status-dot"></span><span><b>${label}</b><small>${desc}</small></span></button>`).join("")}
    </div>
    <div class="btnrow"><button class="btn ghost wide" data-act="close">Cancel</button></div>`);

  $("modal-body").querySelectorAll("[data-status]").forEach((b) => {
    b.onclick = () => busy(b, async () => {
      const r = await api(`/orders/${encodeURIComponent(number)}/status`, {
        method: "POST", body: { status: b.dataset.status }
      });
      closeModal();
      toast(`${number} → ${STATUS_WORD[r.status] || r.status}`);
      refreshCurrent({ quiet: true });
      loadToday();
    });
  });
}

async function deliverModal(number) {
  let o;
  try { o = await api(`/orders/${encodeURIComponent(number)}`); }
  catch (e) {
    // Bina signal ke kapde chun-ne ki list nahi aati — par "sab de diye" phone mein ruk sakta hai
    if (isOffline(e)) return confirmStep(number, "deliver", "No signal — deliver all the clothes?", "Yes, delivered all", { items: null });
    toast(e.message, true); return;
  }
  // har chunne layak cheez ek "slot": {line, piece?, max, name, bag?}
  const slots = [];
  (o.lines || []).forEach((l) => {
    if (l.pieces) {
      // Roke hue kapde (washerman ne "abhi nahi hua" kiya) dene ki list mein nahi
      const max = (p) => (p.deliverable !== undefined ? p.deliverable : p.pending);
      l.pieces.forEach((p) => { if (max(p) > 0) slots.push({ line: l.line, piece: p.piece, max: max(p), name: p.type, group: `${l.name} · ${l.weight} kg` }); });
    } else if ((l.deliverable !== undefined ? l.deliverable : l.pending) > 0) {
      const max = l.deliverable !== undefined ? l.deliverable : l.pending;
      slots.push({ line: l.line, max, name: l.name, sub: l.service !== l.name ? l.service : "", bag: !!l.bag, weight: l.weight });
    }
  });
  const heldN = (o.clothes && o.clothes.held) || 0;
  if (!slots.length) { toast(heldN ? `Everything left (${heldN}) is on hold at the shop` : "Nothing left to deliver on this bill", true); return; }
  const pick = slots.map((s) => s.max);   // default: sab
  const totalPending = slots.reduce((a, s) => a + s.max, 0);
  let lastGroup = "";
  openModal(`<h3>Deliver — ${esc(o.number)}</h3>
    <p class="said">${esc(o.customer)} · ${totalPending} to deliver${o.clothes.delivered ? ` (${o.clothes.delivered} already delivered)` : ""}</p>
    ${heldN ? `<p class="hold-note">⏸ ${heldN} on hold at the shop — they stay pending</p>` : ""}
    ${o.clothes.returned_pending ? `<p class="hold-note">↩ ${o.clothes.returned_pending} returned (not cleaned) — hand them back with the rest</p>` : ""}
    <div class="btnrow mt0">
      <button type="button" class="btn ghost sm" id="dl-all">Select all</button>
      <button type="button" class="btn ghost sm" id="dl-none">Clear</button>
    </div>
    <div class="dl-list">${slots.map((s, i) => {
      const head = s.group && s.group !== lastGroup ? `<div class="dl-group">${esc(s.group)}</div>` : "";
      lastGroup = s.group || "";
      return head + (s.bag
        ? `<label class="dl-row"><span class="dl-name">${esc(s.name)} <small>${esc(String(s.weight))} kg bag</small></span>
             <input type="checkbox" data-bag="${i}" checked aria-label="Deliver the whole bag"></label>`
        : `<div class="dl-row"><span class="dl-name">${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ""}</span>
             <div class="stepper sm">
               <button type="button" class="step" data-dl="${i}" data-by="-1" aria-label="One less">−</button>
               <input type="number" inputmode="numeric" min="0" max="${s.max}" value="${s.max}" data-dlq="${i}" aria-label="How many">
               <button type="button" class="step" data-dl="${i}" data-by="1" aria-label="One more">+</button>
             </div>
             <small class="dl-of">of ${s.max}</small></div>`);
    }).join("")}</div>
    <p class="dl-sum" id="dl-sum"></p>
    <label class="check-row"><input type="checkbox" id="dl-proof"> 📷 Take a delivery photo after this</label>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn go" id="dl-go">Deliver</button>
    </div>`);
  const body = $("modal-body");
  const paint = () => {
    const n = pick.reduce((a, v) => a + v, 0);
    const left = totalPending - n;
    $("dl-sum").innerHTML = n === 0 ? "Pick the clothes you are handing over."
      : left === 0 ? `<b>All ${n}</b> — the order will be marked <b>delivered</b>.`
      : `Delivering <b>${n}</b> · <b class="late-t">${left} will stay pending</b>`;
    $("dl-go").textContent = n === 0 ? "Deliver" : left === 0 ? `✅ Deliver all ${n}` : `✅ Deliver ${n}`;
    $("dl-go").disabled = n === 0;
    slots.forEach((s, i) => {
      const q = body.querySelector(`[data-dlq="${i}"]`);
      if (q && document.activeElement !== q) q.value = String(pick[i]);
      const cb = body.querySelector(`[data-bag="${i}"]`);
      if (cb) cb.checked = pick[i] > 0;
    });
  };
  body.querySelectorAll("[data-dl]").forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.dl;
      pick[i] = Math.max(0, Math.min(slots[i].max, pick[i] + parseInt(b.dataset.by, 10)));
      paint();
    };
  });
  body.querySelectorAll("[data-dlq]").forEach((inp) => {
    inp.oninput = () => {
      const i = +inp.dataset.dlq;
      pick[i] = Math.max(0, Math.min(slots[i].max, parseInt(inp.value, 10) || 0));
      paint();
    };
    inp.onblur = () => { inp.value = String(pick[+inp.dataset.dlq]); };
  });
  body.querySelectorAll("[data-bag]").forEach((cb) => {
    cb.onchange = () => { pick[+cb.dataset.bag] = cb.checked ? 1 : 0; paint(); };
  });
  $("dl-all").onclick = () => { slots.forEach((s, i) => { pick[i] = s.max; }); paint(); };
  $("dl-none").onclick = () => { pick.fill(0); paint(); };
  $("dl-go").onclick = (e) => busy(e.currentTarget, async () => {
    const n = pick.reduce((a, v) => a + v, 0);
    const all = n === totalPending;
    const items = all ? null : slots.map((s, i) => ({ line: s.line, ...(s.piece != null ? { piece: s.piece } : {}), qty: pick[i] }))
      .filter((x) => x.qty > 0);
    const r = await sendOrQueue(`/orders/${encodeURIComponent(number)}/deliver`, { items }, all ? "Deliver" : `Deliver ${n}`, number);
    closeModal();
    // signal nahi — paisa bhi baad mein (collect bina signal ke nahi hota)
    if (r.queued) { if (o.can_collect && o.due > 0) toast(`Collect ${money(o.due)} and record it when the signal is back`, true, 6000); return; }
    toast(r.pending ? `${r.delivered_now} delivered — ${r.pending} still pending` : `${number} delivered ✅`, false, 3500);
    loadToday(); refreshCurrent({ quiet: true });
    // paisa baaki ho to seedha collect — darwaze par wahi agla kaam hai
    if (o.can_collect && o.due > 0) askCollect(number, o.due);
    else if ($("dl-proof") && $("dl-proof").checked) askPhoto(number, "proof");
  });
  paint();
}

/* Dhulai shuru karte waqt bill se ginti. Default = bill jitne (aam
   haalat), farak ho tabhi aadmi kuch badalta hai. Kam/zyada kapde yahin
   pakde jaate hain — delivery ke din grahak ka "ek kurta kam hai" tab
   kisi ki galti sabit nahi kar sakta. KG bora bina ginti ho to chhoot. */
async function washStartModal(number) {
  let o;
  try { o = await api(`/orders/${encodeURIComponent(number)}`); }
  catch (e) {
    if (isOffline(e)) return confirmStep(number, "washing", "No signal — start washing without the count?", "Yes, washing");
    toast(e.message, true); return;
  }
  const slots = [];
  (o.lines || []).forEach((l) => {
    if (l.bag) return;
    if (l.pieces) l.pieces.forEach((p) => slots.push({ line: l.line, piece: p.piece, name: p.type, bill: p.qty, group: `${l.name} · ${l.weight} kg` }));
    else slots.push({ line: l.line, name: l.name, sub: l.service !== l.name ? l.service : "", bill: l.qty });
  });
  if (!slots.length) return confirmStep(number, "washing", "Started washing these clothes?", "Yes, washing");
  const got = slots.map((x) => x.bill);
  let lastGroup = "";
  openModal(`<h3>🧼 Count & start — ${esc(o.number)}</h3>
    <p class="said">${esc(o.customer)} · count the clothes before they go in. Change a number only if it does not match.</p>
    <div class="dl-list">${slots.map((x, i) => {
      const head = x.group && x.group !== lastGroup ? `<div class="dl-group">${esc(x.group)}</div>` : "";
      lastGroup = x.group || "";
      return head + `<div class="dl-row" data-wrow="${i}"><span class="dl-name">${esc(x.name)}${x.sub ? ` <small>${esc(x.sub)}</small>` : ""}</span>
        <div class="stepper sm">
          <button type="button" class="step" data-wc="${i}" data-by="-1" aria-label="One less">−</button>
          <input type="number" inputmode="numeric" min="0" value="${x.bill}" data-wcq="${i}" aria-label="How many you found">
          <button type="button" class="step" data-wc="${i}" data-by="1" aria-label="One more">+</button>
        </div>
        <small class="dl-of">bill ${x.bill}</small></div>`;
    }).join("")}</div>
    <p class="dl-sum" id="wc-sum"></p>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn go" id="wc-go">Start wash</button>
    </div>`);
  const body = $("modal-body");
  const paint = () => {
    const bill = slots.reduce((a, x) => a + x.bill, 0), n = got.reduce((a, v) => a + v, 0);
    const off = slots.filter((x, i) => got[i] !== x.bill).length;
    $("wc-sum").innerHTML = off
      ? `<b class="late-t">${n} found, bill says ${bill}</b> — the owner will be told`
      : `<b>All ${n}</b> match the bill ✓`;
    slots.forEach((x, i) => {
      body.querySelector(`[data-wrow="${i}"]`).classList.toggle("off", got[i] !== x.bill);
      const q = body.querySelector(`[data-wcq="${i}"]`);
      if (document.activeElement !== q) q.value = String(got[i]);
    });
  };
  body.querySelectorAll("[data-wc]").forEach((b) => {
    b.onclick = () => { const i = +b.dataset.wc; got[i] = Math.max(0, got[i] + parseInt(b.dataset.by, 10)); paint(); };
  });
  body.querySelectorAll("[data-wcq]").forEach((inp) => {
    inp.oninput = () => { got[+inp.dataset.wcq] = Math.max(0, parseInt(inp.value, 10) || 0); paint(); };
    inp.onblur = () => { inp.value = String(got[+inp.dataset.wcq]); };
  });
  $("wc-go").onclick = (e) => busy(e.currentTarget, async () => {
    const counts = slots.map((x, i) => ({ line: x.line, ...(x.piece != null ? { piece: x.piece } : {}), got: got[i] }));
    const r = await sendOrQueue(`/orders/${encodeURIComponent(number)}/washing`, { counts }, "Start wash", number);
    closeModal();
    if (r.queued) return;
    toast(r.check && !r.check.ok ? `${number} — washing. Count mismatch sent to the owner` : `${number} — washing ✅`, !!(r.check && !r.check.ok));
    loadToday(); refreshCurrent({ quiet: true });
  });
  paint();
}

function confirmStep(number, path, question, yes, body = null) {
  const w = WORK.find((x) => x.number === number) || {};
  // Ready ka sawaal: sab taiyar nahi? Wahin se "kuch taiyar" (baaki hold par)
  const toReady = path === "ready" || (path === "advance" && body && body.to === "READY");
  openModal(`<h3>${esc(question)}</h3>
    <p class="said">${esc(w.who || "")} · ${esc(number)}${w.items ? ` · ${esc(w.items)}` : ""}</p>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn go" id="m-step">${esc(yes)}</button>
    </div>
    ${toReady && WASH_ROLES.includes(ME.role) ? `<div class="btnrow"><button class="btn ghost" id="m-some">Only some are ready…</button></div>` : ""}`);
  if ($("m-some")) $("m-some").onclick = () => { closeModal(); readySomeModal(number); };
  $("m-step").onclick = (e) => busy(e.currentTarget, async () => {
    const what = yes.replace(/^Yes, /, "");
    const r = await sendOrQueue(`/orders/${encodeURIComponent(number)}/${path}`, body, what, number);
    closeModal();
    if (r.queued) return;
    toast(`${number} — ${what} ✅`);
    loadToday(); refreshCurrent({ quiet: true });
    // Pickup par darwaze par khade hain: pin nahi hai to abhi le lo
    if (path === "picked-up" && r.customer_ref && r.customer_has_location === false
        && canLocate() && ME.can_contact && navigator.geolocation) await askSaveLocation(r.customer_ref, r.customer_name);
  });
}

/* Darwaze par koi nahi — owner ko khabar, order wahi rehta hai. Phir
   grahak ko apne WhatsApp se "kab aayein?" (text server banata hai). */
function askNotHome(number) {
  const w = WORK.find((x) => x.number === number) || {};
  openModal(`<h3>🚪 Customer not home?</h3>
    <p class="said">${esc(w.who || "")} · ${esc(number)}. The order stays on your list and the owner is told.</p>
    <label for="nh-note">Note (optional)</label>
    <input id="nh-note" type="text" maxlength="150" placeholder="e.g. door locked, phone not answered">
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn go" id="nh-ok">Yes, not home</button>
    </div>`);
  $("nh-ok").onclick = (e) => busy(e.currentTarget, async () => {
    const r = await sendOrQueue(`/orders/${encodeURIComponent(number)}/not-home`, { note: $("nh-note").value.trim() }, "Customer not home", number);
    closeModal();
    if (r.queued) return;
    toast("Noted — the owner has been told");
    refreshCurrent({ quiet: true });
    if (r.can_message) composeMessage(number, "not_home");
  });
}

/* Delivery boy ki row saaf: ek kaam ka button (Deliver / Pickup) + ⋯.
   Pehle Call · Deliver · Route · ₹ collect · ⋯ ek line mein the aur bada
   Deliver button baaki sabko daba deta tha. Call/Route "Full details" mein. */
const isDeliveryBoy = () => ME.role === "DELIVERY";

/* Delivery ka ⋯: sirf Full details, Payment (kitna mila / kitna baaki), Close */
async function deliveryMenu(number) {
  const w = WORK.find((x) => x.number === number) || {};
  if (!w.hasOrder) return moreMenuFull(number);
  openModal(`<h3>${esc(number)}</h3><p class="said">${esc(w.who || "")}</p>
    <div class="paysum" id="dm-pay"><span class="muted">Loading payment…</span></div>
    <div class="btnrow stack">
      <button class="btn ghost" data-act="detail" data-arg="${esc(number)}">👁 Full details</button>
      ${locationButtons(w)}
      <span id="dm-collect"></span>
    </div>
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
  let o;
  try { o = await api(`/orders/${encodeURIComponent(number)}`); }
  catch (e) { if ($("dm-pay")) $("dm-pay").innerHTML = `<span class="muted">${esc(e.message)}</span>`; return; }
  if (!$("dm-pay")) return;   // menu band ho chuka
  const total = Number(o.total || 0), paid = Number(o.paid || 0), due = Math.max(0, Number(o.due || 0));
  $("dm-pay").innerHTML = `
    <div><span>Bill</span><b>${money(total)}</b></div>
    <div><span>Collected</span><b class="ok">${money(paid)}</b></div>
    <div><span>Still to collect</span><b class="${due > 0 ? "due" : "ok"}">${due > 0 ? money(due) : "Fully paid ✓"}</b></div>`;
  if (o.can_collect && due > 0) {
    $("dm-collect").outerHTML = `<button class="btn money" id="dm-go">💵 Collect payment · ${money(due)}</button>`;
    $("dm-go").onclick = () => { closeModal(); askCollect(number, due); };
  }
}

function moreMenu(number) {
  if (isDeliveryBoy()) return deliveryMenu(number);
  return moreMenuFull(number);
}

/* 📍 Grahak ka pin — ⋯ menu mein: Navigate (pin ho to), aur "Save pin"
   jab ladka darwaze par khada ho. Washerman ko ye dikhta hi nahi. */
const canLocate = () => ME.features.includes("customer_location");   // plan ka hissa (Solo Starter mein nahi)
function locationButtons(w) {
  if (!canLocate() || !ME.can_contact || !DELIVERY_ROLES.includes(ME.role) || !w.customer_ref) return "";
  return (ME.show_route && w.nav_url
    ? `<a class="btn ghost" href="${esc(w.nav_url)}" target="_blank" rel="noopener">🧭 Navigate to customer</a>` : "")
    + `<button class="btn ghost" data-act="saveloc" data-arg="${esc(w.number)}">📍 ${w.nav_url || w.pin_saved ? "Update" : "Save"} location (I'm at their door)</button>`
    + (w.nav_url || w.pin_saved ? `<button class="btn ghost" data-act="delloc" data-arg="${esc(w.number)}">🗑 Remove location</button>` : "");
}

/* Phone ka pehla GPS reading aksar 100-500 m bhatka hota hai (ghar ke
   andar, purana fix). Isliye kuch second tak readings dekho aur sabse
   sateek rakho: 25 m se achha milte hi ruk jao, warna 12 s mein jo best
   mila. onUpdate se modal par "48 m" jaisa live dikhta hai. */
const GPS_GOOD_M = 20, GPS_WAIT_MS = 15000, GPS_MAX_MS = 25000, GPS_WEAK_M = 50, GPS_MAX_SAVE_M = 300;
function bestPosition(onUpdate) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("GPS is not available on this phone"));
    let best = null, watch = null, settle = null, giveUp = null;
    const stop = () => { if (watch !== null) navigator.geolocation.clearWatch(watch); clearTimeout(settle); clearTimeout(giveUp); };
    const finish = () => { stop(); best ? res(best) : rej(new Error("Could not get GPS — step outside and try again")); };
    watch = navigator.geolocation.watchPosition((pos) => {
      if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
      if (onUpdate) onUpdate(best);
      if (best.coords.accuracy <= GPS_GOOD_M) finish();
      else if (settle === null) settle = setTimeout(finish, GPS_WAIT_MS);
    }, (e) => {
      if (e.code === 1) { stop(); rej(new Error("Allow location access for this app, then try again")); }
      // timeout/unavailable: reading aate rahenge ya giveUp pakad lega
    }, { enableHighAccuracy: true, timeout: GPS_MAX_MS, maximumAge: 0 });
    giveUp = setTimeout(finish, GPS_MAX_MS);
  });
}

/* Galat pin hatana. Grahak ka baaki record aur pata waise hi rehte hain. */
function removeLocation(ref, name) {
  const hi = ME.ui_lang === "hi";
  openModal(`<h3>🗑 ${esc(name || (hi ? "ग्राहक" : "Customer"))}${hi ? " की लोकेशन हटाएँ?" : ": remove location?"}</h3>
    <p class="said">${hi ? "मैप का पिन हट जाएगा। लिखा हुआ पता रहेगा। बाद में फिर सेव कर सकते हैं।" : "The map pin goes. The written address stays, and you can save a new pin later."}</p>
    <div class="btnrow"><button class="btn ghost" data-act="close">${hi ? "रहने दो" : "Keep it"}</button>
      <button class="btn danger" id="dl-yes">${hi ? "हाँ, हटाएँ" : "Yes, remove"}</button></div>`);
  $("dl-yes").onclick = (e) => busy(e.target, async () => {
    await api(`/customers/${encodeURIComponent(ref)}/location`, { method: "DELETE" });
    closeModal(); toast(hi ? "लोकेशन हट गई" : "Location removed"); refreshCurrent({ quiet: true });
  });
}

/* Pickup/delivery par darwaze par: ek tap, phone ka GPS, grahak par pin.
   Promise — bill ke baad share se pehle isi ka intezaar hota hai. */
function askSaveLocation(ref, name) {
  return new Promise((resolve) => {
    openModal(`<h3>📍 Save ${esc(name || "customer")}'s location?</h3>
      <p class="said">You're at their door now. Save the map pin so the next pickup or delivery finds this house in one tap — even a new delivery boy.</p>
      <div class="loc-status" id="loc-status" hidden></div>
      <div id="loc-linkwrap" hidden>
        <label for="loc-link">Google Maps link</label>
        <input id="loc-link" type="url" inputmode="url" placeholder="Paste a Google Maps share link" autocomplete="off">
      </div>
      <div class="err" id="loc-err"></div>
      <p class="said loc-tip">Best result: stand at the gate / outside the door, phone in hand, sky visible.</p>
      <div class="btnrow">
        <button class="btn ghost" id="loc-no">Cancel</button>
        <button class="btn go" id="loc-yes">Yes, save location</button>
      </div>
      <button type="button" class="linkbtn loc-alt" id="loc-alt">No GPS? Paste a Google Maps link instead</button>`);
    const done = () => { closeModal(); resolve(); };
    const useLink = () => { $("loc-linkwrap").hidden = false; $("loc-alt").hidden = true; $("loc-yes").textContent = "Save link"; $("loc-link").focus(); };
    $("loc-no").onclick = done;
    $("loc-alt").onclick = useLink;
    let weak = null;   // kamzor GPS ka reading — "Save anyway" isi ko bhejta hai
    const save = async (body) => {
      const r = await api(`/customers/${encodeURIComponent(ref)}/location`, { method: "POST", body });
      refreshCurrent({ quiet: true });
      const said = body.accuracy_m ? `GPS ±${Math.round(body.accuracy_m)} m` : "Navigate will work from now on";
      // Sahi jagah bani ya nahi, wahin dekh lo. Pata band ho to staff ko map nahi dikhate.
      if (!r.nav_url || !(ME.show_route || ME.is_owner)) { toast(`Location saved 📍 (${said})`); return done(); }
      openModal(`<h3>✅ Location saved</h3><p class="said">${esc(name || "Customer")} · ${esc(said)}</p>
        <div class="btnrow stack"><a class="btn ghost" href="${esc(r.nav_url)}" target="_blank" rel="noopener">🧭 Check on map</a>
          <button class="btn go" id="loc-next">Continue</button></div>`);
      $("loc-next").onclick = done;
    };
    $("loc-yes").onclick = async (e) => {
      const btn = e.currentTarget, label = btn.innerHTML;
      const link = $("loc-linkwrap").hidden ? "" : $("loc-link").value.trim();
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
      $("loc-err").textContent = "";
      try {
        if (link) return await save({ map_url: link });
        if (weak && btn.dataset.anyway) return await save(weak);
        const st = $("loc-status"); st.hidden = false; st.textContent = "📡 Getting GPS… hold the phone still";
        const pos = await bestPosition((p) => { st.textContent = `📡 GPS accuracy ${Math.round(p.coords.accuracy)} m — improving…`; });
        const body = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy };
        const acc = Math.round(pos.coords.accuracy);
        if (acc > GPS_WEAK_M) {
          // Ghar ke andar / "approximate location" permission: pin galat gali
          // mein ja sakta hai. Bahar jaakar dobara, ya jaan-boojh kar save.
          weak = body;
          st.textContent = `⚠️ GPS weak: ±${acc} m. Step outside near the gate and retry.`
            + (acc > 150 ? " On Android also check: phone Settings → Apps → Chrome → Location → Precise location ON." : "");
          btn.disabled = false; btn.innerHTML = "🔄 Retry GPS";
          // Server 300 m se moti reading nahi leta: "Save anyway" yahan jhootha raasta
          // hota. Maps link hi bachta hai (laptop par aksar yahi haal hota hai).
          if (acc > GPS_MAX_SAVE_M) {
            if ($("loc-anyway")) $("loc-anyway").remove();
            weak = null;
            st.textContent = `⚠️ GPS too weak to save: ±${acc} m. Retry outside on your phone, or paste a Google Maps link below.`;
            $("loc-linkwrap").hidden = false; $("loc-alt").hidden = true;
            return;
          }
          let anyway = $("loc-anyway");
          if (!anyway) {
            anyway = document.createElement("button");
            anyway.type = "button"; anyway.id = "loc-anyway"; anyway.className = "linkbtn loc-alt";
            btn.parentNode.insertAdjacentElement("afterend", anyway);
            anyway.onclick = () => { btn.dataset.anyway = "1"; btn.click(); };
          }
          anyway.textContent = `Save anyway (±${acc} m)`;
          return;
        }
        st.textContent = `📡 GPS accuracy ${acc} m`;
        await save(body);
      } catch (err) {
        $("loc-err").textContent = err.message;
        $("loc-status").hidden = true;
        btn.disabled = false; btn.innerHTML = label;
        if (!link) useLink();   // GPS fail: link ka raasta turant saamne
      }
    };
  });
}

/* Naya ladka: naam likho, ghar ka pin — ya darwaze par khade ho kar save */
function findCustomerModal() {
  openModal(`<h3>📍 Find a customer</h3>
    <input id="fl-q" type="search" placeholder="Customer name or number" autocomplete="off">
    <div id="fl-res"></div>
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
  const q = $("fl-q"), res = $("fl-res");
  q.focus();
  let seq = 0, timer = null;
  q.oninput = () => {
    clearTimeout(timer);
    const term = q.value.trim();
    if (term.length < 2) { res.innerHTML = ""; return; }
    const mine = ++seq;
    timer = setTimeout(async () => {
      let hits = [];
      try { hits = await api(`/customers/locate?q=${encodeURIComponent(term)}`); }
      catch (e) { res.innerHTML = `<p class="said">${esc(e.message)}</p>`; return; }
      if (mine !== seq) return;
      res.innerHTML = hits.length ? hits.map((c) => `<div class="od-block">
          <b>${esc(c.name)}</b> <span class="said inl">${esc(c.phone_masked)}</span>
          ${c.address ? `<div class="sub mt-xs">📍 ${esc(c.address)}</div>` : ""}
          <div class="acts">
            ${c.nav_url ? `<a class="btn go sm" href="${esc(c.nav_url)}" target="_blank" rel="noopener">🧭 Navigate</a>${c.accuracy_m ? `<span class="sub">±${c.accuracy_m} m${c.accuracy_m > GPS_WEAK_M ? " ⚠️ weak" : ""}</span>` : ""}`
              : `<span class="sub">No map pin yet</span>`}
            <button type="button" class="btn ghost sm" data-saveloc="${esc(c.ref)}" data-name="${esc(c.name)}">📍 ${c.nav_url ? "Update" : "Save"} pin</button>
            ${c.nav_url ? `<button type="button" class="btn ghost sm" data-delloc="${esc(c.ref)}" data-name="${esc(c.name)}">🗑 Remove</button>` : ""}
          </div>
        </div>`).join("") : `<p class="said">No customer found with that name.</p>`;
      res.querySelectorAll("[data-saveloc]").forEach((b) => {
        b.onclick = () => { closeModal(); askSaveLocation(b.dataset.saveloc, b.dataset.name); };
      });
      res.querySelectorAll("[data-delloc]").forEach((b) => {
        b.onclick = () => { closeModal(); removeLocation(b.dataset.delloc, b.dataset.name); };
      });
    }, 250);
  };
}
function moreMenuFull(number) {
  const w = WORK.find((x) => x.number === number) || {};
  const t = (w.tasks || [])[0];
  openModal(`<h3>${esc(number)}</h3>
    <p class="said">${esc(w.who || "")}</p>
    <div class="btnrow stack">
      ${w.hasOrder ? `<button class="btn ghost" data-act="detail" data-arg="${esc(number)}">👁 Full details</button>` : ""}
      ${locationButtons(w)}
      ${t ? `<button class="btn ghost" data-act="jobdone" data-arg="${esc(t.code)}">✅ Mark job ${esc(t.code)} done</button>` : ""}
      ${t && ME.can_ask ? `<button class="btn ghost" data-act="thread" data-arg="${esc(t.code)}">❓ Ask the owner</button>` : ""}
      ${ME.can_money ? `<button class="btn ghost" data-act="share" data-arg="${esc(number)}">🧾 Send bill on WhatsApp</button>` : ""}
      ${ME.can_money && w.hasOrder ? `<button class="btn ghost" data-act="message" data-arg="${esc(number)}">💬 Send a message</button>` : ""}
      ${w.hasOrder && WASH_ROLES.includes(ME.role) && HOLD_STAGES.includes(w.status)
        ? `<button class="btn ghost" data-act="hold" data-arg="${esc(number)}">⏸ Hold clothes (not done)</button>` : ""}
      <button class="btn ghost" data-act="photo" data-arg="${esc(number)}">📷 Add a photo</button>
      ${w.hasOrder ? `<button class="btn ghost" data-act="damage" data-arg="${esc(number)}">⚠️ Mark damage / stain</button>` : ""}
      ${w.hasOrder && DELIVERY_ROLES.includes(ME.role) && ["PICKUP_ASSIGNED", "READY", "OUT_FOR_DELIVERY"].includes(w.status)
        ? `<button class="btn ghost" data-act="nothome" data-arg="${esc(number)}">🚪 Customer not home</button>` : ""}
      ${t && ME.features.includes("cancel_approval") && !t.cancel_requested
        ? `<button class="btn ghost" data-act="cancel" data-arg="${esc(t.code)}">🛑 Request cancel</button>` : ""}
      ${t && ME.is_manager && t.cancel_requested
        ? `<button class="btn danger" data-act="decide" data-arg="${esc(t.code)}">Decide on cancel</button>` : ""}
    </div>
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
}

/* ─── kaam par actions ──────────────────────────────────────────────── */

function askDone(code) {
  openModal(`<h3>${esc(code)} — done?</h3>
    <p class="said">Add a note if you need to, otherwise just confirm.</p>
    <textarea id="m-note" placeholder="Note (optional)"></textarea>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn go" id="m-ok">Yes, done</button>
    </div>`);
  $("m-ok").onclick = (e) => busy(e.currentTarget, async () => {
    await api(`/tasks/${encodeURIComponent(code)}/done`, { method: "POST", body: { note: $("m-note").value.trim() } });
    LOCAL_REFRESH = Date.now();
    closeModal(); toast(`${code} closed ✅`); refreshCurrent({ quiet: true }); loadToday();
    if (NAV !== "work" && NAV !== "tasks") countTasks();
  });
}

/* Sawaal-jawab ek thread mein — pehle sawaal owner ke WhatsApp par chala
   jaata tha aur staff ko na apna sawaal dikhta tha na jawab. */
async function openThread(code) {
  let th;
  try { th = await api(`/tasks/${encodeURIComponent(code)}/messages`); }
  catch (e) { toast(e.message, true); return; }
  loadBell();
  const msgs = th.messages.length
    ? `<div class="thread">${th.messages.map((m) => `
        <div class="msg ${m.who}">${esc(m.text)}<span class="at">${esc(m.who === "staff" ? "Aapne" : m.name)} · ${esc(m.at)}</span></div>`).join("")}</div>`
    : `<p class="said">No messages yet.</p>`;
  openModal(`<h3>${esc(th.title)}</h3>
    <p class="said">${esc(code)}</p>
    ${msgs}
    ${ME.can_ask ? `<label for="m-q">Ask the owner</label>
    <textarea id="m-q" placeholder="e.g. how many items? when to deliver?"></textarea>` : ""}
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Close</button>
      ${ME.can_ask ? `<button class="btn go" id="m-send">Send</button>` : ""}
    </div>`);
  // WhatsApp juda nahi — sawaal owner tak jaata hi nahi, to poochhne ka rasta bhi nahi
  if (!ME.can_ask) return;
  $("m-send").onclick = (e) => {
    const text = $("m-q").value.trim();
    if (text.length < 2) { toast("Write your question first", true); return; }
    return busy(e.currentTarget, async () => {
      await api(`/tasks/${encodeURIComponent(code)}/ask`, { method: "POST", body: { text } });
      toast("Sent to the owner 🙏");
      openThread(code);
    });
  };
}

function askCancel(code) {
  openModal(`<h3>${esc(code)} — request a cancel?</h3>
    <p class="said">You cannot cancel this yourself. Write the reason and your manager will decide.</p>
    <textarea id="m-r" placeholder="e.g. customer refused"></textarea>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn danger" id="m-ok">Send</button>
    </div>`);
  $("m-ok").onclick = (e) => {
    const reason = $("m-r").value.trim();
    if (reason.length < 3) { toast("Write the reason first", true); return; }
    return busy(e.currentTarget, async () => {
      await api(`/tasks/${encodeURIComponent(code)}/cancel-request`, { method: "POST", body: { reason } });
      closeModal(); toast("Sent to your manager"); loadWork();
    });
  };
}

function decideCancel(code) {
  const w = WORK.find((x) => (x.tasks || []).some((t) => t.code === code));
  const t = w && w.tasks.find((x) => x.code === code);
  openModal(`<h3>${esc(code)} — cancel request</h3>
    <p class="said">${esc((t && t.cancel_reason) || "")}</p>
    <div class="btnrow">
      <button class="btn ghost" id="m-no">No, keep it</button>
      <button class="btn danger" id="m-yes">Yes, cancel</button>
    </div>`);
  const send = (e, approve) => busy(e.currentTarget, async () => {
    await api(`/tasks/${encodeURIComponent(code)}/cancel-decide`, { method: "POST", body: { approve } });
    closeModal(); toast(approve ? "Cancelled" : "Cancel refused"); loadWork();
  });
  $("m-yes").onclick = (e) => send(e, true);
  $("m-no").onclick = (e) => send(e, false);
}

async function askCollect(order, due) {
  // ₹250.50 due par "251" bharna server se "Only ₹250 is due" laata tha
  const dueStr = Number.isInteger(due) ? String(due) : due.toFixed(2);
  // Purana udhaar bhi saamne rakhte hain. Delivery wala darwaze par ek hi
  // baar khada hota hai — wahi ek mauka hai poora paisa maangne ka.
  let prev = 0, prevBills = 0;
  try {
    const d = await api(`/orders/${encodeURIComponent(order)}/dues`);
    prev = d.previous_due || 0; prevBills = d.previous_bills || 0;
  } catch (e) { /* na mile to sirf is bill ka paisa — kaam rukta nahi */ }
  const grand = Math.round((due + prev) * 100) / 100;

  openModal(`<h3>${esc(order)} — payment received</h3>
    <p class="said">${money(due)} is bill ka${prev > 0 ? ` · ${money(prev)} pichhla (${prevBills} bill)` : ""}</p>
    ${prev > 0 ? `<div class="pick sm mb">
      <button type="button" class="pickbtn on" data-only="1">Sirf ye bill<br><b>${money(due)}</b></button>
      <button type="button" class="pickbtn" data-only="0">Kul dena hai<br><b>${money(grand)}</b></button>
    </div>` : ""}
    <label for="m-amt">Amount</label>
    <input id="m-amt" type="number" inputmode="decimal" value="${dueStr}" min="1" step="0.01">
    ${prev > 0 ? `<p class="hint" id="m-note2">Purana chukane par paisa sabse purane bill se lagega.</p>` : ""}
    <div class="btnrow">
      <button class="btn ghost" id="m-cash">💵 Cash</button>
      <button class="btn go" id="m-upi">📱 UPI</button>
    </div>
    <div class="btnrow"><button class="btn ghost" data-act="close">Not now</button></div>`);

  let settlePrev = false;
  document.querySelectorAll("[data-only]").forEach((b) => {
    b.onclick = () => {
      settlePrev = b.dataset.only === "0";
      document.querySelectorAll("[data-only]").forEach((x) => x.classList.toggle("on", x === b));
      $("m-amt").value = settlePrev ? String(grand) : dueStr;
    };
  });

  // Is sheet ki ek pehchan — dohra tap / signal lautne par dobara bheja
  // gaya request doosra paisa nahi jodta
  const clientRef = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const send = (e, method) => {
    const amount = parseFloat($("m-amt").value);
    const ceiling = settlePrev ? grand : due;
    if (!(amount > 0)) { toast("Enter the amount", true); return; }
    if (amount > ceiling + 0.01) { toast(`Only ${money(ceiling)} is due`, true); return; }
    return busy(e.currentTarget, async () => {
      const r = await api(`/orders/${encodeURIComponent(order)}/collect`, {
        method: "POST", body: { amount, method, settle_previous: settlePrev, client_ref: clientRef },
      });
      closeModal();
      const older = (r.settled_older || []).length;
      toast(
        `${money(amount)} received ✅ — ${money(r.due)} left`
        + (older ? ` · ${older} purana bill chukta` : ""),
      );
      loadToday(); refreshCurrent({ quiet: true });
      // Dukaan ka WhatsApp API juda ho (can_ask) to server khud grahak ko
      // "payment mila" bhejta hai. Nahi to preview — apne WhatsApp se bhejo.
      if (!ME.can_ask && canBill()) composeMessage(order, "payment_thanks");
    });
  };
  $("m-cash").onclick = (e) => send(e, "cash");
  $("m-upi").onclick = (e) => send(e, "upi");
}

/* Poora number maangne par hi milta hai, aur server uska record rakhta
   hai — list mein hamesha masked rehta hai. */
async function callCustomer(number) {
  try {
    const r = await api(`/orders/${encodeURIComponent(number)}/call`);
    location.href = `tel:${r.phone}`;
  } catch (e) { toast(e.message, true); }
}

/* ─── Bill: apni jagah, apni chhaant ────────────────────────────────── */
/* Pehle bill ki list "Naya bill" screen ke neeche chipki thi — jo bill
   banane aaya wahi use dekh paata tha, aur dhoondhne ka koi rasta nahi
   tha. Ab alag tab: search + due/paid chips. */

let BILLS = [], BILLS_TOTAL = 0, BILL_SEQ = 0, Q_TIMER = null;
let PICKUP_BILL_CONTEXT = null;
// Ek page mein kitne. Chhota isliye ki 3G par pehli screen jaldi aaye;
// baaki "Show more" par. 800 order wali dukaan par poori list bhejna
// 79 KB ka payload tha jo har 30 second par dobara utarta tha.
const PAGE = 30;

$("q").addEventListener("input", () => {
  clearTimeout(Q_TIMER);
  // Har akshar par server nahi jaate — 300ms chuppi = ek request.
  Q_TIMER = setTimeout(() => { if (NAV === "bills") loadBills(); else if ((NAV === "orders" || NAV === "customers") && window.Solo) Solo.route(NAV); }, 300);
});

async function loadBills(opts = {}) {
  if (!opts.quiet) $("list").innerHTML = `<div class="empty">Loading…</div>`;
  const mine = ++BILL_SEQ;
  const p = new URLSearchParams();
  const q = $("q").value.trim();
  if (q) p.set("q", q);
  if (FILTER === "due" || FILTER === "paid") p.set("pay", FILTER);
  if (FILTER === "mine") p.set("mine", "1");
  p.set("limit", String(PAGE));
  p.set("offset", String(opts.more ? BILLS.length : 0));
  try {
    const r = await api("/bills?" + p.toString());
    // "aur dikhayein" purani list ke aage jodta hai, badalta nahi
    BILLS = opts.more ? BILLS.concat(r.bills) : r.bills;
    BILLS_TOTAL = r.total;
  } catch (e) {
    if (mine !== BILL_SEQ || opts.quiet) return;
    $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (mine !== BILL_SEQ || NAV !== "bills") return;

  const chips = [["all", "All"], ["due", "Unpaid"], ["paid", "Paid"]];
  if (ME.is_manager) chips.push(["mine", "Mine"]);
  $("chips").innerHTML = chips.map(([v, l]) =>
    `<button data-chip="${v}" class="${FILTER === v ? "on" : ""}">${l}</button>`).join("");
  // Wiring upar wale delegated listener se — yahan dobara nahi.

  if (!BILLS.length) {
    $("list").innerHTML = q
      ? `<div class="empty"><b>No match</b>Nothing found for “${esc(q)}”. Try a bill number or a name.</div>`
      : `<div class="empty"><b>No bills yet</b>${ME.is_manager
          ? "No bills in the shop in the last 14 days."
          : "Bills you make show up here."}</div>`;
    return;
  }
  $("list").innerHTML = `<div class="reg">${BILLS.map(billRow).join("")}</div>`
    + moreBar(BILLS.length, BILLS_TOTAL, "loadBills");
  $("list").querySelectorAll("[data-bill]").forEach((b) => {
    b.onclick = () => {
      const row = b.closest("[data-num]");
      const num = row.dataset.num;
      if (b.dataset.bill === "msg") return messageMenu(num, parseFloat(row.dataset.due || "0"));
      if (b.dataset.bill === "status") return statusMenu(num);
      if (b.dataset.bill === "pay") return askCollect(num, parseFloat(b.dataset.due));
    };
  });
}

/* Bill card par chhota safar: Received → Washing → Ready → Delivered.
   (e80a815 mein call aur CSS aaye, function chhoot gaya tha — Bills tab
   har bill par ReferenceError dekar khali reh jaata tha.) Hold/cancel
   safar ka hissa nahi, unpar seedha shabd. */
const BILL_STAGES = [
  ["Received", ["RECEIVED", "PICKUP_ASSIGNED", "PICKED_UP"]],
  ["Washing", ["IN_WASH", "IN_DRY", "IN_IRON"]],
  ["Ready", ["READY", "OUT_FOR_DELIVERY"]],
  ["Delivered", ["DELIVERED"]],
];
function billProgress(status) {
  const at = BILL_STAGES.findIndex(([, ss]) => ss.includes(status));
  if (at < 0) return `<span class="bill-stage current">${esc(STATUS_WORD[status] || status || "—")}</span>`;
  return BILL_STAGES.map(([word], i) => {
    const cls = i < at || status === "DELIVERED" ? "done" : i === at ? "current" : "";
    return `<span class="bill-stage ${cls}">${word}</span>`;
  }).join("");
}

function billRow(b) {
  const w = whenParts(b.delivery);
  const paid = !(b.due > 0);
  return `<article class="bill-card" data-num="${esc(b.number)}" data-due="${Number(b.due) || 0}">
    <div class="bill-accent ${paid ? "paid" : w.late ? "late" : "active"}"></div>
    <div class="bill-main">
      <div class="bill-topline">
        <div><span class="bill-no">${esc(b.number)}</span><span class="bill-date">${esc(b.created)}</span></div>
        <span class="bill-due ${paid ? "paid" : ""}">${paid ? "Paid" : money(b.due) + " due"}</span>
      </div>
      <div class="bill-customer"><b>${esc(b.customer)}</b></div>
      <div class="bill-items">${b.items ? esc(b.items) : "Laundry order"}</div>
      <div class="bill-progress">${billProgress(b.status)}</div>
      <div class="bill-actions">
        <button class="btn ghost sm bill-comm" data-bill="msg">💬 Message</button>
        ${ME.is_manager ? `<button class="btn ghost sm bill-status" data-bill="status">↻ Status</button>` : ""}
        ${ME.features.includes("cod_collection") && b.due > 0 ? `<button class="btn money sm" data-bill="pay" data-due="${b.due}">${money(b.due)} collect</button>` : ""}
      </div>
    </div>
  </article>`;
}
/* ─── bill WhatsApp par ─────────────────────────────────────────────── */
/* Dukaan ka WhatsApp API juda ho ya na ho, staff ke apne phone ka WhatsApp
   to hai. wa.me link mein number aur bill dono bhare hote hain.
   Link asli <a> hai, window.open nahi: await ke baad window.open ko popup
   blocker rok deta hai; <a> par tap khud user ka gesture hai. */

function waUrl(phone, text) {
  let d = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10) d = "91" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
let SHARE_TEXT = "";

async function shareBill(number, knownBillUrl = "") {
  let r;
  try {
    r = await api(`/orders/${encodeURIComponent(number)}/receipt`);
  } catch (e) {
    // Bill creation already returns the signed payment URL. Even if the
    // receipt/share endpoint is temporarily unavailable, never hide that
    // important link from the counter operator.
    if (!knownBillUrl) { toast(e.message, true); return; }
    const text = `🧾 ${number} ka bill online dekhein aur payment karein:\n${knownBillUrl}`;
    SHARE_TEXT = text;
    openModal(`<h3>Bill created ✅</h3>
      <p class="said">Payment link ready hai. Customer ko ye link bhej sakte hain.</p>
      <div class="card break-all"><a href="${esc(knownBillUrl)}" target="_blank" rel="noopener">${esc(knownBillUrl)}</a></div>
      <pre class="sharetext">${esc(text)}</pre>
      <div class="btnrow">
        <a class="btn go" href="${esc(knownBillUrl)}" target="_blank" rel="noopener">Open payment page</a>
        <button class="btn ghost" id="m-copy">Copy link</button>
      </div>
      <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
    $("m-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast("Payment link copied"); }
      catch (err) { toast("Copy nahi hua — link select karke copy karein", true); }
    };
    return;
  }
  if (knownBillUrl) r.bill_url = knownBillUrl || r.bill_url;
  SHARE_TEXT = r.text;
  const directUrl = r.bill_url || knownBillUrl || "";
  // Link ka token har baar naya banta hai — "/b/" se pehchano, warna wahi bill do baar jud jaata tha
  if (directUrl && !/\/b\//.test(String(r.text || ""))) {
    r.text = String(r.text || "") + `\n\n🧾 View bill & pay online:\n${directUrl}`;
    SHARE_TEXT = r.text;
  }
  openModal(`<h3>Send the bill</h3>
    <p class="said">WhatsApp opens with the bill already written — just press send. To ${esc(r.name)}.</p>
    <pre class="sharetext">${esc(r.text)}</pre>
    <div class="btnrow">
      <a class="btn go" href="${esc(waUrl(r.phone, r.text))}" target="_blank" rel="noopener" data-act="close">📲 Open WhatsApp</a>
      <button class="btn ghost" id="m-copy">Copy</button>
    </div>
    <div class="btnrow">
      <a class="btn ghost" href="${esc(window.KKBill ? KKBill.rawbt(r) : rawbtUrl(r.print_text))}" data-act="close">🖨 Bluetooth printer</a>
      <button class="btn ghost" id="m-print">🖨 Print</button>
    </div>
    <p class="hint">Bluetooth printer: install the free <b>RawBT</b> app on this Android phone once and pair the printer in it.</p>
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
  $("m-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(SHARE_TEXT); toast("Copied"); }
    catch (e) { toast("Could not copy — select the text above", true); }
  };
  $("m-print").onclick = () => {
    closeModal();
    const el = $("receipt");
    // Dukaan ka logo receipt ke upar — staff apne hi media-door se leta hai.
    const logo = r.logo_file ? "/staff/api/media/" + encodeURIComponent(r.logo_file) : "";
    // naya design (logo, bold total, QR) — kk-bill.js; na ho to purana text
    if (window.KKBill && r.print_lines) { KKBill.printReceipt(el, r, logo); return; }
    el.innerHTML = (logo ? `<img class="rcpt-logo" src="${logo}" alt="">` : "") +
      `<span>${esc(r.print_text)}</span>`;
    el.className = r.paper_mm === 80 ? "paper-80" : "paper-58";
    const img = el.querySelector("img");
    if (img && !img.complete) { img.onload = img.onerror = () => window.print(); }
    else window.print();
  };
}

/* Chhota Bluetooth thermal printer. Saste 58/80mm printer "classic
   Bluetooth" hote hain — browser unse seedha baat nahi kar sakta (Web
   Bluetooth sirf BLE aur HTTPS). Dukaanein Android par RawBT app chalati
   hain: ye link bill ke ESC/POS bytes seedha usko deta hai. Text server se
   ASCII aur 32/48 akshar par kata hua aata hai (₹ ki jagah Rs.). */
function rawbtUrl(text) {
  // ESC @ (reset) + bill + khaali lines + GS V 66 0 (cutter ho to kaat do)
  const body = "\x1b@" + String(text || "").replace(/[^\x0a\x20-\x7e]/g, "") + "\n\n\n\n" + "\x1dVB\x00";
  return `intent:base64,${btoa(body)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

/* ─── grahak ko message: thank you, payment mila, review ────────────── */
/* Text server banata hai (owner ka apna format bhi). Staff pehle padhta
   hai, phir apne phone ka WhatsApp — wa.me link, number aur text bhara hua.
   Paise ki yaad sirf manager (neeche remindBill), isliye wo yahan tabhi
   jab manager ho aur paisa baaki ho. */
const MSG_KINDS = [
  ["bill", "🧾", "Share bill"],
  ["remind", "💰", "Payment reminder"],
  ["delivery_update", "🚚", "Delivery update"],
  ["review_request", "⭐", "Feedback request"],
];
function messageMenu(number, due) {
  const kinds = MSG_KINDS.filter(([k]) => k !== "remind" || (ME.is_manager && due > 0));
  openModal(`<div class="comm-head"><span class="comm-icon">💬</span><div><h3>Customer communication</h3><p class="said">${esc(number)}</p></div></div>
    <p class="comm-note">Choose a ready-to-send professional message.</p>
    <div class="comm-menu">
      ${kinds.map(([k, ico, label]) => `<button class="comm-option" data-msg="${k}"><span class="comm-option-icon">${ico}</span><span><b>${label}</b><small>${k === "bill" ? "Bill + secure payment link" : k === "remind" ? "Polite reminder for pending payment" : k === "delivery_update" ? "Share the current delivery status" : "Ask for customer feedback"}</small></span><span class="comm-arrow">›</span></button>`).join("")}
    </div>
    <div class="btnrow"><button class="btn ghost wide" data-act="close">Close</button></div>`);
  $("modal-body").querySelectorAll("[data-msg]").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.msg === "remind") { closeModal(); return remindBill(number, null); }
      if (b.dataset.msg === "bill") { closeModal(); return shareBill(number); }
      return busy(b, () => composeMessage(number, b.dataset.msg));
    };
  });
}
/* Message ka text server banata hai; staff padh kar apne WhatsApp se bhejta
   hai. Pehle ye function sirf dashboard (app.js) mein tha — staff app mein
   "Send a message" aur payment ke baad wala thank-you chupchaap toot jaate the. */
const MSG_TITLE = {
  payment_thanks: "Payment received — thank you",
  service_thanks: "Thank you",
  delivery_update: "Delivery update",
  review_request: "Feedback request",
};
async function composeMessage(number, kind) {
  let r;
  try { r = await api(`/orders/${encodeURIComponent(number)}/message?kind=${encodeURIComponent(kind)}`); }
  catch (e) { toast(e.message, true); return; }
  SHARE_TEXT = r.text;
  openModal(`<h3>${esc(MSG_TITLE[kind] || "Message")}</h3>
    <p class="said">WhatsApp opens with the message written — just press send. To ${esc(r.name)}.</p>
    <pre class="sharetext">${esc(r.text)}</pre>
    <div class="btnrow">
      <a class="btn go" href="${esc(waUrl(r.phone, r.text))}" target="_blank" rel="noopener" data-act="close">📲 Open WhatsApp</a>
      <button class="btn ghost" id="m-copy">Copy</button>
    </div>
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
  $("m-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(SHARE_TEXT); toast("Copied"); }
    catch (e) { toast("Copy nahi hua — upar se select kar lijiye", true); }
  };
}

/* ─── paise ki yaad ─────────────────────────────────────────────────── */
/* Scheduler khud 3 din / 15 din par yaad dilata hai, par wo maanta hai ki
   order deliver ho chuka hai AUR dukaan ka WhatsApp API juda hai. Counter
   par khada aadmi in dono ka intezaar nahi kar sakta — isliye ek button.

   API se chala gaya to bas ek toast. Na gaya to wahi rasta jo bill share
   karta hai: staff ke apne phone ka WhatsApp, text bhara hua. */
async function remindBill(number, btn) {
  await busy(btn, async () => {
    const r = await api(`/orders/${encodeURIComponent(number)}/remind`, { method: "POST" });
    if (r.sent) {
      toast(`${r.name} ko yaad dila diya 🔔`);
      return;
    }
    openModal(`<h3>Yaad dilayein</h3>
      <p class="said">Dukaan ka WhatsApp API se nahi ja paya. Apne phone se bhej dijiye — ${esc(r.name)} ko.</p>
      <pre class="sharetext">${esc(r.text)}</pre>
      <div class="btnrow">
        <a class="btn go" href="${esc(waUrl(r.phone, r.text))}" target="_blank" rel="noopener" data-act="close">📲 WhatsApp kholein</a>
        <button class="btn ghost" id="m-copy">Copy</button>
      </div>
      <div class="btnrow"><button class="btn ghost" data-act="close">Band karein</button></div>`);
    SHARE_TEXT = r.text;
    $("m-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(SHARE_TEXT); toast("Copied"); }
      catch (e) { toast("Copy nahi hua — upar se select kar lijiye", true); }
    };
  });
}

/* ─── naya bill ─────────────────────────────────────────────────────── */
/* Daam staff nahi bharta — rate card se aata hai, wahi jo WhatsApp wale
   bill par lagta hai. Do jagah do hisaab kabhi nahi. */

let RATES = null, CART = [], PICKED = "", NEEDS_PICKUP = false;
let USUAL = [], USUAL_REF = "";   // ⭐ chune hue grahak ke aam items (sirf sujhaav)
// Chhoot: mode "amt" ya "pct", aur ek value. Do alag field rakhne par log
// dono bhar dete hain aur phir poochte hain ki kaunsa laga.
let DISC = { mode: "amt", value: 0 };
// ⚡ Urgent: on, haath se badla?, badli hui rakam. Server bhi yahi hisaab lagata hai.
let URG = { on: false, manual: false, amt: 0 };
// Chune hue purane grahak ka baaki. Naye grahak par 0.
let PREV_DUE = 0, PREV_BILLS = 0;
let REWARDS = [], REWARD_CODE = "";      // 🎁 grahak ke reward, aur jo laga hai
// Bill ka timer (IMP_006): bill form par pehle asli tap/likhne se Save tak.
// Ek hi document listener — #list doosre tab bhi dikhata hai, isliye
// sirf tab ginte hain jab bill form (b-phone) screen par ho.
let BILL_STARTED = 0;
const startBillTimer = (e) => {
  if (!BILL_STARTED && $("b-phone") && e.target.closest && e.target.closest("#list")) BILL_STARTED = Date.now();
};
document.addEventListener("input", startBillTimer, true);
document.addEventListener("click", startBillTimer, true);

/* ─── New Bill: 4 step (kk-bill.js + kk-bill.css) ─────────────────────
   Hisaab, save, coupon, reward, urgent, kg bora, pickup task, location —
   sab wahi purana code (neeche ke functions). Naya sirf dikhawat:
   phone par ek waqt ek step aur neeche "Next", tablet par step + bill
   saath, aur save ke baad step 4 (labels + receipt + status).
   Do hi raaste: Walk-in (default — grahak dukaan se le jaayega) ya Pickup
   (delivery boy ghar se laata hai, ready hone par wapas pahunchata hai). */
let STEP = 1;
let FULFIL = "walkin";               // walkin | pickup
let BDATE_MANUAL = false;            // tareekh haath se badli? warna SLA se
let DCHG = 0, GSTP = 0, PAYM = "CASH", CAT = "all", BILL_IDEM = "", BILL_SIG = "";
const KB = () => window.KKBill;
const SEARCH_IC = `<svg class="ic kb-si" aria-hidden="true"><use href="/admin/static/icons.svg?v=ui2#i-search"/></svg>`;
const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const localIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
function newIdem() {
  try { if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ""); } catch (e) { /* purana browser */ }
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
const billCfg = () => ME.bill || { gst_percent: 18, gst_default_on: false, normal_days: 4, heavy_days: 5, holidays: [], heavy_words: [] };
// Server ka hi niyam (delivery_date.py): Sunday/chhutti nahi ginte, bhaari kapde = zyada din
function autoDate() {
  if (URG.on) {
    const d = new Date(); d.setDate(d.getDate() + Math.max(0, (ME.urgent || {}).days ?? 1)); return localIso(d);
  }
  const B = billCfg();
  const heavy = CART.some((i) => (B.heavy_words || []).some((w) => `${i.garment} ${i.service}`.toLowerCase().includes(w)));
  let left = Math.max(1, heavy ? B.heavy_days : B.normal_days);
  const hol = new Set(B.holidays || []);
  const d = new Date();
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || hol.has(localIso(d))) continue;
    left -= 1;
  }
  return localIso(d);
}
const custOk = () => !!PICKED || ($("b-phone") && $("b-phone").value.replace(/\D/g, "").length >= 10);

async function showNewBill() {
  $("chips").innerHTML = "";
  if (!ME.features.includes("billing")) {
    $("list").innerHTML = `<div class="empty"><b>Billing is not in this plan</b>Ask the owner to upgrade.</div>`;
    return;
  }
  if (!ME.can_bill) {
    $("list").innerHTML = `<div class="empty"><b>Bill counter par banta hai</b>
      Aapke role mein bill banana nahi hai. Manager ya delivery wale se kahein.</div>`;
    return;
  }
  // Har naye bill par taaza rate card: daam badle hon, ya isi browser ke doosre
  // tab se doosri dukaan mein login hua ho to memory wali list purani dukaan ki hoti
  if (RATES === null) $("list").innerHTML = `<div class="empty">Loading the rate card…</div>`;
  // sabse zyada bikne wala pehle (uses = pichhle 90 din ke bills); sort stable
  try { RATES = (await api("/rates")).sort((a, b) => (b.uses || 0) - (a.uses || 0)); }
  catch (e) {
    // Signal gaya to purani list chalegi; server ne mana kiya to nahi
    if (RATES === null || e.status) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  }
  const services = [...new Set(RATES.map((r) => r.service))];
  if (!services.length) {
    $("list").innerHTML = `<div class="empty"><b>The rate card is empty</b>
      The owner adds prices in Settings → Rate card. Bills need prices.</div>`;
    return;
  }
  const B = billCfg();
  const ctx = PICKUP_BILL_CONTEXT;
  STEP = ctx ? 2 : 1;
  FULFIL = ctx ? "pickup" : "walkin";
  NEEDS_PICKUP = false;
  BDATE_MANUAL = false; DCHG = 0; PAYM = "CASH"; CAT = "all";
  GSTP = B.gst_default_on ? Number(B.gst_percent) || 0 : 0;
  DISC = { mode: "amt", value: 0 };
  URG = { on: false, manual: false, amt: 0 };
  const gstOpts = [...new Set([0, 5, 12, 18, Number(B.gst_percent) || 18])].sort((a, b) => a - b);
  const pctOpts = [0, 5, 10, 15, 20, 25, 50];
  const tags = !!ME.garment_tags;
  const cfgU = ME.urgent || { type: "percent", value: 50, days: 1 };
  const urgWhen = cfgU.days === 0 ? "today" : cfgU.days === 1 ? "tomorrow" : `in ${cfgU.days} days`;
  $("list").innerHTML = `
  <div class="kb" id="kb" data-step="${STEP}">
    <div id="kb-steps"></div>
    <div class="pickup-banner" id="b-pickup-banner" hidden></div>
    <div class="kk-alert" id="b-draft-note" hidden></div>
    <div class="kb-grid">
      <section class="kb-pane kb-p1"><div class="kb-card">
        <h3 class="kb-h">1. Customer details</h3>
        <label class="kb-label" for="b-name">Search customer</label>
        <div class="kb-ac ac-wrap">
          <div class="kb-search">${SEARCH_IC}<input id="b-name" type="search" placeholder="Name or phone number" maxlength="60" autocomplete="off"></div>
          <div class="kb-acp" id="b-ac"></div>
        </div>
        <div id="b-picked" hidden></div>
        <div id="b-newbox">
          <label class="kb-label" for="b-phone">Mobile number *</label>
          <input id="b-phone" type="tel" inputmode="numeric" placeholder="98xxxxxxxx" maxlength="15">
          <small class="kb-err" id="b-phone-err"></small>
          <p class="kb-hint">New customer? Type the name above and the number here.</p>
        </div>
      </div>
      <div class="kb-card">
        <h3 class="kb-h">Where are the clothes?</h3>
        <div class="kb-mode" role="radiogroup" aria-label="Walk-in or pickup">
          <button type="button" role="radio" data-ful="walkin"><span class="em" aria-hidden="true">🏪</span><b>At the shop</b><small>Count now, bill now</small></button>
          <button type="button" role="radio" data-ful="pickup"><span class="em" aria-hidden="true">🛵</span><b>Pickup from home</b><small>${ME.solo ? "You collect and deliver back" : "Delivery boy collects, delivers back"}</small></button>
        </div>
        <p class="kb-hint" id="b-pickhint"></p>
        <div class="kb-pickups" id="b-pickups" hidden></div>
      </div>
      <div class="kb-card urg">
        <div class="kb-switchrow"><div><b>⚡ Urgent</b>
          <small id="b-urgnote">${esc((cfgU.value ? (cfgU.type === "flat" ? `+${money(cfgU.value)}` : `+${cfgU.value}%`) : "no extra charge") + ` · ready ${urgWhen} · washer sees 🔴 URGENT on top`)}</small></div>
          <button type="button" class="kb-sw" id="b-urg" aria-pressed="false" aria-label="Urgent"></button></div>
        <div class="kb-urgamt" id="b-urgbox" hidden><label class="kb-money"><span>₹</span><input id="b-urgamt" type="number" inputmode="decimal" min="0" step="1" aria-label="Urgent charge"></label><small>urgent charge on this bill (0 = waive)</small></div>
      </div>
      <div class="kb-next-in"><button type="button" class="kb-btn go wide" data-kb-go="2">Next: Add clothes →</button></div>
      </section>

      <section class="kb-pane kb-p2"><div class="kb-card">
        <h3 class="kb-h">2. Add clothes / items <small id="b-count"></small></h3>
        <div class="kb-tools">
          <div class="kb-ac"><div class="kb-search">${SEARCH_IC}<input id="b-q" type="search" placeholder="Search" aria-label="Search clothes" autocomplete="off" enterkeyhint="done"></div>
            <div class="kb-acp" id="b-qp"></div></div>
          <button type="button" class="kb-btn ghost" id="b-custom">＋ Custom</button>
        </div>
        <div id="b-usual" class="kb-usual"></div>
        <div class="kb-chips svc" id="b-svcchips" role="tablist" aria-label="Service"></div>
        <div class="kb-chips" id="b-cats" role="tablist" aria-label="Category"></div>
        <div class="kb-tiles" id="b-items" aria-live="polite"></div>
        <div class="kb-items" id="b-cart"></div>
      </div></section>

      <section class="kb-pane kb-p3">
      <div class="kb-card">
        <h3 class="kb-h">3. Order <small id="s-items-h"></small></h3>
        <div class="kb-recap" id="b-recap"></div>
        <button type="button" class="kb-btn ghost sm kb-mt8" data-kb-go="2">✎ Edit items</button>
      </div>
      <div class="kb-card">
        <h3 class="kb-h">Notes <small>optional · staff only, never sent to the customer</small></h3>
        <div class="kb-slots" id="b-notechips">${["Stain", "Delicate", "No starch", "Button missing", "Colour bleed"].map((n) => `<button type="button" data-note="${n}">${n}</button>`).join("")}</div>
        <textarea id="b-notes" class="kb-mt8" maxlength="500" placeholder="e.g. steam iron, careful wash, stain on collar"></textarea>
      </div>
      <div class="kb-card">
        <h3 class="kb-h">Offers &amp; discount <button type="button" class="kb-link" id="b-coupon-open">Coupon code</button></h3>
        <div id="b-coupon-box" hidden>
          <div class="kb-2"><input id="b-coupon" type="text" placeholder="Coupon code" maxlength="30" autocomplete="off"><button type="button" class="kb-btn ghost" id="b-coupon-apply">Apply</button></div>
          <p class="kb-hint" id="b-coupon-note">Checked when the bill is saved.</p>
        </div>
        <div id="b-reward" class="kb-reward" hidden></div>
        <div class="kb-sum-row"><span>Discount</span><span class="kb-ctl">
          <label class="kb-money"><span>₹</span><input id="b-disc" type="number" inputmode="decimal" min="0" placeholder="0" aria-label="Discount in rupees"></label>
          <select id="b-discpct" aria-label="Discount percent">${pctOpts.map((p) => `<option value="${p}">${p}%</option>`).join("")}</select>
        </span></div>
      </div>
      <div class="kb-card">
        <h3 class="kb-h">Payment</h3>
        <div class="kb-sum-row"><span>Total items</span><b id="s-items">0</b></div>
        <div class="kb-sum-row"><span>Subtotal</span><b id="s-sub">₹0</b></div>
        <div class="kb-sum-row neg" id="s-savrow" hidden><span>Customer saves</span><b id="s-sav">₹0</b></div>
        <div class="kb-sum-row" id="s-urgrow" hidden><span>⚡ Urgent charge</span><b id="s-urg">₹0</b></div>
        <div class="kb-sum-row"><span>Pickup / delivery charge</span><span class="kb-ctl">
          <label class="kb-money"><span>₹</span><input id="b-dchg" type="number" inputmode="decimal" min="0" placeholder="0" aria-label="Pickup or delivery charge"></label>
        </span></div>
        <div class="kb-sum-row"><span>GST (optional)</span><span class="kb-ctl">
          <select id="b-gst" aria-label="GST percent">${gstOpts.map((p) => `<option value="${p}"${p === GSTP ? " selected" : ""}>${p ? p + "%" : "Off"}</option>`).join("")}</select>
          <b id="s-gst">₹0</b>
        </span></div>
        <div class="kb-total"><span>Order total</span><b id="s-total">₹0</b></div>
        <div class="kb-sum-row"><span>Advance received</span><span class="kb-ctl">
          <label class="kb-money"><span>₹</span><input id="b-adv" type="number" inputmode="decimal" min="0" placeholder="0" aria-label="Advance paid"></label>
          <button type="button" class="kb-btn ghost sm" id="b-advfull">Full</button>
        </span></div>
        <div class="kb-seg kb-mt8" id="b-pm">
          <button type="button" data-pm="CASH" class="on">Cash</button><button type="button" data-pm="UPI">UPI</button>
          <button type="button" data-pm="CARD">Card</button><button type="button" data-pm="SPLIT">Split</button>
        </div>
        <div id="b-splitbox" hidden>
          <label class="kb-label" for="b-advupi">UPI part of the advance <small>(rest is cash)</small></label>
          <label class="kb-money"><span>₹</span><input id="b-advupi" type="number" inputmode="decimal" min="0" placeholder="0"></label>
        </div>
        <label class="kb-label" for="b-pnote">Payment note (optional)</label>
        <input id="b-pnote" type="text" maxlength="200" placeholder="e.g. partial payment, UPI ref no.">
        <div class="kb-due" id="s-duebox"><span>Remaining for this bill</span><b id="s-due">₹0</b></div>
        <p class="kb-prev" id="s-prev" hidden></p>
      </div>
      <div class="kb-card tint-wash">
        <h3 class="kb-h">Delivery <small id="s-when"></small></h3>
        <div class="kb-2">
          <input id="b-date" type="date" aria-label="Expected delivery date" min="${localIso(new Date())}">
          <select id="b-time" aria-label="Expected time">${KB().timeOptions(lsGet("kb_time", "18:00"))}</select>
        </div>
        <p class="kb-hint">${B.normal_days} working days by default, ${B.heavy_days} for heavy items; Sundays and holidays are skipped. Urgent moves it to ${urgWhen}.</p>
      </div>
      <div class="kb-gen"><span><small>Order total</small><b id="s-gen-total">₹0</b></span>
        <button type="button" class="kb-btn ghost" id="b-draft">Draft</button>
        <button type="button" class="kb-btn go" id="b-save">${tags ? "Bill & print labels" : "Generate bill"}</button></div>
      </section>
    </div>
    <div class="kb-bar" id="b-bar"></div>
    <div class="kb-donewrap" id="kb-done"></div>
  </div>`;

  const kb = $("kb");
  // ek hi click listener — har button data-* se pehchana jaata hai (CSP: koi inline handler nahi)
  kb.addEventListener("click", (e) => {
    const t = e.target.closest("[data-kb-step],[data-kb-go],[data-ful],[data-pm],[data-cust],[data-bar],[data-cat]");
    if (!t || !kb.contains(t) || t.closest("#kb-done")) return;
    if (t.dataset.kbStep) return setStep(Number(t.dataset.kbStep));
    if (t.dataset.kbGo) return setStep(Number(t.dataset.kbGo));
    if (t.dataset.ful) return setFulfil(t.dataset.ful);
    if (t.dataset.pm) {
      PAYM = t.dataset.pm;
      kb.querySelectorAll("[data-pm]").forEach((x) => x.classList.toggle("on", x === t));
      $("b-splitbox").hidden = PAYM !== "SPLIT";
      return;
    }
    if (t.dataset.cust === "new") return clearCustomer(true);
    if (t.dataset.cust === "history") return customerHistory();
    if (t.dataset.cat) { CAT = t.dataset.cat; return KB().keep($("b-cats"), renderPicker); }
    if (t.dataset.bar === "back") return setStep(Math.max(1, STEP - 1));
    if (t.dataset.bar === "draft") return saveDraft();
    if (t.dataset.bar === "next") return STEP < 3 ? setStep(STEP + 1) : saveBill(t);
  });
  $("b-date").value = autoDate();
  $("b-date").onchange = () => { BDATE_MANUAL = !!$("b-date").value; if (!BDATE_MANUAL) $("b-date").value = autoDate(); };
  $("b-time").onchange = () => lsSet("kb_time", $("b-time").value);
  // Chhoot: ₹ ya % — ek hi chalta hai (server ka niyam), doosra apne aap 0
  $("b-disc").oninput = () => {
    DISC = { mode: "amt", value: Math.max(0, parseFloat($("b-disc").value) || 0) };
    $("b-discpct").value = "0";
    renderCart();
  };
  $("b-discpct").onchange = () => {
    DISC = { mode: "pct", value: Number($("b-discpct").value) || 0 };
    $("b-disc").value = "";
    renderCart();
  };
  $("b-urg").onclick = () => {
    URG = { on: !URG.on, manual: false, amt: 0 };
    $("b-urg").classList.toggle("on", URG.on);
    $("b-urg").setAttribute("aria-pressed", String(URG.on));
    $("b-urgbox").hidden = !URG.on;
    if (!BDATE_MANUAL) $("b-date").value = autoDate();
    renderCart();
  };
  $("b-urgamt").oninput = () => {
    URG.manual = true;
    URG.amt = Math.max(0, parseFloat($("b-urgamt").value) || 0);
    renderCart();
  };
  $("b-dchg").oninput = () => { DCHG = Math.max(0, parseFloat($("b-dchg").value) || 0); renderCart(); };
  $("b-gst").onchange = () => { GSTP = Number($("b-gst").value) || 0; renderCart(); };
  $("b-adv").oninput = renderCart;
  $("b-advfull").onclick = () => { $("b-adv").value = String(billMath().total); renderCart(); };
  ["b-disc", "b-adv", "b-dchg", "b-urgamt", "b-advupi"].forEach((id) => { $(id).onfocus = () => $(id).select(); });
  $("b-coupon-open").onclick = () => { $("b-coupon-box").hidden = !$("b-coupon-box").hidden; if (!$("b-coupon-box").hidden) $("b-coupon").focus(); };
  $("b-coupon-apply").onclick = () => {
    const code = $("b-coupon").value.trim().toUpperCase();
    REWARD_CODE = code;
    $("b-coupon-note").textContent = code ? `Coupon ${code} will be checked and applied when the bill is saved.` : "Checked when the bill is saved.";
    paintReward();
  };
  // Search ka dropdown: chunte hi bill mein; tiles aur page apni jagah
  KB().combo({
    input: $("b-q"), panel: $("b-qp"),
    items: (q) => KB().rateOptions(RATES, q, usualInCart),
    onPick: (r) => { tapItem(r); toast(`Added ${r.garment || r.service}`, false, 1500); },
    create: (raw) => newRateModal(PICK_SVC, raw),
  });
  $("b-custom").onclick = () => newRateModal(PICK_SVC, ($("b-q").value || "").trim());
  $("b-save").onclick = (e) => saveBill(e.currentTarget);
  $("b-draft").onclick = saveDraft;
  paintDraftNote();
  $("b-phone").oninput = () => { $("b-phone-err").textContent = ""; paintSteps(); };
  wireCustomerSearch();
  // Note chips: tap = note mein jud jaata hai (ya hat jaata hai)
  kb.querySelectorAll("[data-note]").forEach((b) => {
    b.onclick = () => {
      const ta = $("b-notes"), w = b.dataset.note;
      const parts = ta.value.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
      const at = parts.indexOf(w);
      if (at >= 0) parts.splice(at, 1); else parts.push(w);
      ta.value = parts.join(", ");
      b.classList.toggle("on", at < 0);
    };
  });
  // Delivery boy sirf pickup karta hai — "At the shop" uske liye hai hi nahi
  if (ME.role === "DELIVERY" && !ctx) {
    const w = kb.querySelector('[data-ful="walkin"]');
    if (w) { w.hidden = true; w.closest(".kb-mode").classList.add("one"); }
    FULFIL = "pickup";
    // Uska asli raasta pickup task se bill hai — wo list sabse upar, grahak dhoondhne se pehle
    const first = kb.querySelector(".kb-p1 .kb-card");
    if (first && $("b-pickups")) first.prepend($("b-pickups"));
  }
  setFulfil(FULFIL, true);

  if (ctx) {
    PICKED = ctx.customer_ref || "";
    PREV_DUE = 0;
    PREV_BILLS = 0;
    $("b-name").value = ctx.customer_name || "";
    $("b-phone").value = ctx.customer_phone || "";
    $("b-phone").disabled = true;
    $("b-newbox").hidden = true;
    const pk = ctx.order_number ? `Pickup ${ctx.order_number}` : `Pickup ${ctx.task_code}`;
    $("b-picked").hidden = false;
    $("b-picked").innerHTML = `<div class="kb-cust"><span class="kb-av">${esc(KB().initials(ctx.customer_name))}</span>
      <div class="kb-cust-tx"><b>${esc(ctx.customer_name || "Customer")}</b><small>🛵 ${esc(pk)}</small></div></div>`;
    $("b-pickhint").textContent = "Pickup task linked — this bill completes the collection. No second pickup will be created.";
    kb.querySelectorAll("[data-ful]").forEach((b) => { b.disabled = b.dataset.ful !== "pickup"; });
    $("b-pickup-banner").hidden = false;
    $("b-pickup-banner").innerHTML = `<b>🛵 ${esc(pk)}</b><span>${esc(ctx.customer_name || "Customer")} · add the clothes you collected, then create the bill</span>`;
    $("b-save").textContent = "Create bill & finish pickup";
    // Grahak ne page par coupon lagaya tha — bill par wahi jaata hai
    if (ctx.coupon_code) {
      REWARD_CODE = ctx.coupon_code;
      $("b-pickup-banner").innerHTML += `<span>🎟 Coupon ${esc(ctx.coupon_code)} — applied on this bill</span>`;
    }
    // Grahak ne khud kapde chune the (/billcreation) — wahi cart mein, daam
    // aaj ke rate card se. Boy gin kar sirf ginti theek karta hai.
    if (!CART.length && Array.isArray(ctx.items)) {
      const low = (v) => String(v || "").trim().toLowerCase();
      ctx.items.forEach((it) => {
        const r = RATES.find((x) => low(x.service) === low(it.service) && low(x.garment) === low(it.garment));
        if (!r) return;
        CART.push({ service: r.service, garment: r.garment, qty: Number(it.qty) || 1, rate: r.rate, card: r.rate,
          unit: r.unit || "pc", pieces: Array.isArray(it.pieces) ? it.pieces.map((p) => ({ type: p.type, qty: p.qty })) : [] });
      });
    }
  }
  renderCart();
  setStep(STEP, { force: true, noScroll: true });
}

function setFulfil(v, quiet) {
  FULFIL = v;
  NEEDS_PICKUP = v === "pickup" && !PICKUP_BILL_CONTEXT;
  const kb = $("kb");
  if (!kb) return;
  kb.querySelectorAll("[data-ful]").forEach((b) => {
    b.classList.toggle("on", b.dataset.ful === v);
    b.setAttribute("aria-checked", String(b.dataset.ful === v));
  });
  if (!PICKUP_BILL_CONTEXT) {
    $("b-pickhint").textContent = v === "pickup"
      ? (ME.solo ? "You collect from the customer's home, and deliver back when ready."
        // Delivery boy ka bill = darwaze par, kapde haath mein (server PICKED_UP karta hai)
        : ME.role === "DELIVERY" ? "You are at the customer's door: this bill marks the clothes picked up, and you deliver them back when ready."
        : "Delivery boy collects from the customer's home, and delivers back when ready.")
      : "Customer brought the clothes and collects them from the shop — no delivery run.";
  }
  paintPickups();
  if (!quiet) paintBar();
}

/* Grahak ke darwaze par bill: sahi raasta Work tab ka pickup task ("Create
   bill & pick up") — wo pickup wahin poora karta hai. New Bill mein "Pickup"
   ka matlab hai kapde BAAD mein lene jaana (naya pickup task banta hai).
   Isliye Pickup chunte hi apne khule pickup task yahin: ek tap = usi task se
   bill (jode hue kapde saath rehte hain). Is grahak ka task sabse upar. */
let PICKUPS_SEQ = 0;
async function paintPickups() {
  const box = $("b-pickups");
  if (!box) return;
  if (FULFIL !== "pickup" || PICKUP_BILL_CONTEXT) { box.hidden = true; box.innerHTML = ""; return; }
  const mine = ++PICKUPS_SEQ;
  let tasks = [];
  try { tasks = ((await api("/tasks?tab=mine&limit=50")).tasks || []).filter((t) => t.kind === "pickup" && t.status === "OPEN"); }
  catch (e) { tasks = []; }                        // suvidha hai — na mile to sirf hidayat
  if (mine !== PICKUPS_SEQ || FULFIL !== "pickup" || !$("b-pickups")) return;
  const ref = (t) => (t.order && t.order.customer_ref) || (t.customer && t.customer.customer_ref) || "";
  const name = (t) => (t.order && t.order.customer) || (t.customer && t.customer.name) || t.title || "Customer";
  const ours = (t) => !!PICKED && ref(t) === PICKED;
  tasks.sort((a, b) => ours(b) - ours(a));
  box.hidden = false;
  const note = ME.role === "DELIVERY"
    ? `🛵 <b>Collecting now?</b> Just make the bill — the clothes are marked <b>picked up</b>. Already have a pickup task for this customer? Tap it below instead.`
    : `🛵 <b>At the door?</b> Tap the pickup task below — that bill completes the pickup. "Pickup" here books a <b>new</b> one for later.`;
  box.innerHTML = `<p class="kb-note info">${note}</p>
    ${tasks.length ? `<div class="kb-pick-list">${tasks.slice(0, 6).map((t) => `<button type="button" class="kb-btn ghost sm${ours(t) ? " on" : ""}" data-pickbill="${esc(t.code)}">
        🧾 Bill · ${esc(name(t))}${t.order ? ` · ${esc(t.order.number)}` : ""}${ours(t) ? " — this customer" : ""}</button>`).join("")}</div>`
      : `<p class="kb-hint">No open pickup task for you right now.</p>`}`;
  box.querySelectorAll("[data-pickbill]").forEach((b) => { b.onclick = () => openPickupBill(b.dataset.pickbill); });
}

function paintSteps() {
  const box = $("kb-steps");
  if (!box) return;
  const done = [];
  if (custOk()) done.push(1);
  if (CART.length) done.push(2);
  box.innerHTML = KB().steps(STEP, done, !!ME.garment_tags);
}
function setStep(n, opts = {}) {
  const kb = $("kb");
  if (!kb) return;
  if (!opts.force && n > 1 && STEP === 1 && !custOk()) {
    $("b-phone-err").textContent = "Pick a customer or enter the full 10-digit number.";
    $("b-newbox").hidden = false;
    $("b-phone").focus();
    return;
  }
  if (!opts.force && n === 3 && !CART.length) { toast("Add items first", true); n = 2; }
  const moved = n !== STEP;
  STEP = n;
  kb.dataset.step = String(n);
  paintSteps();
  paintBar();
  // Upar tabhi jab sach mein naya kadam khula. Desktop par teeno saath dikhte
  // hain (kk-bill.css 1100px), wahan page ko chhedne ki koi wajah nahi.
  if (!opts.noScroll && moved && kb.clientWidth < 1100) window.scrollTo({ top: 0, behavior: "instant" });
}

/* Grahak ka purana hisaab — chune hue ke bill (sirf dekhne ke liye) */
async function customerHistory() {
  const name = ($("b-name").value || "").trim();
  if (!name) return;
  openModal(`<h3>Bills — ${esc(name)}</h3><div id="ch-list" class="list"><div class="empty">Loading…</div></div>
    <div class="btnrow"><button class="btn ghost wide" data-act="close">Close</button></div>`);
  let d;
  try { d = await api(`/bills?q=${encodeURIComponent(name)}&days=90&limit=10`); }
  catch (e) { $("ch-list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const rows = (d.bills || []).filter((b) => (b.customer || "").toLowerCase() === name.toLowerCase());
  $("ch-list").innerHTML = rows.length ? rows.map((b) => `<div class="kb-sum-row"><span><b>${esc(b.number)}</b> · ${esc(b.created)}<br><small>${esc(b.items || "")}</small></span>
      <span>${b.due > 0 ? `<b class="kb-red">${money(b.due)} due</b>` : "Paid"}</span></div>`).join("")
    : `<div class="empty">No bills in the last 90 days that you can see.</div>`;
}

function clearCustomer(focus) {
  PICKED = ""; PICKED_C = null; PREV_DUE = 0; PREV_BILLS = 0; REWARDS = []; REWARD_CODE = ""; paintReward();
  USUAL = []; USUAL_REF = ""; paintUsual();
  $("b-picked").hidden = true; $("b-picked").innerHTML = "";
  $("b-phone").disabled = false; $("b-phone").value = "";
  $("b-newbox").hidden = false;
  if (focus) { $("b-name").value = ""; $("b-name").focus(); }
  renderCart();
}

/* ─── kapde jodna: service dropdown + item search ───────────────────── */
/* Pehle: Service dropdown → Item dropdown → Qty → Add, har kapde par.
   Phir tiles aaye — tez the, par chhoti screen par 20-30 kapdon ke tiles
   mein dhoondhna padta tha. Ab: service chuno, item ka naam likhna shuru
   karo ("shi" → Shirt), neeche patli list — tap = jud gaya, dobara = 2.
   Na mile to wahin "＋ Create" — naam pehle se bhara hua. Doosri service
   mein mile to wo bhi dikhta hai. */
let PICK_SVC = "";
function pickerServices() {
  const all = [...new Set(RATES.map((r) => r.service))];
  const uses = {};
  RATES.forEach((r) => { uses[r.service] = (uses[r.service] || 0) + (r.uses || 0); });
  // piece wali services pehle — counter par wahi zyada lagti hain; phir
  // har group mein jo dukaan mein sabse zyada bikti hai
  return all.sort((a, b) => (isKgService(a) - isKgService(b)) || (uses[b] - uses[a]));
}
function renderPicker() {
  const box = $("b-items");
  if (!box || !RATES) return;
  const svcs = pickerServices();
  if (!svcs.includes(PICK_SVC)) PICK_SVC = svcs[0] || "";
  const chipsBox = $("b-svcchips");
  if (chipsBox) {
    chipsBox.innerHTML = svcs.map((sv) => {
      const n = CART.filter((x) => x.service === sv).reduce((a, x) => a + (x.unit === "kg" ? 1 : x.qty), 0);
      return `<button type="button" role="tab" aria-selected="${sv === PICK_SVC}" class="${sv === PICK_SVC ? "on" : ""}" data-svc="${esc(sv)}" data-fam="${KB().fam(sv)}">${esc(sv)}${n ? ` · ${n}` : ""}</button>`;
    }).join("");
    chipsBox.querySelectorAll("[data-svc]").forEach((b) => {
      b.onclick = () => {
        PICK_SVC = b.dataset.svc; $("b-q").value = ""; CAT = "all"; KB().keep(chipsBox, renderPicker);
        // kg chuna = seedha bore wala popup; page par kuch upar-neeche nahi
        if (isKgService(PICK_SVC)) bagSheet(PICK_SVC);
      };
    });
  }
  const catBox = $("b-cats");
  if (isKgService(PICK_SVC)) { if (catBox) catBox.innerHTML = ""; renderKgPicker(box); return; }
  const inSvc = RATES.filter((r) => r.service === PICK_SVC);
  // Category chips: sirf wahi jo is service mein hain
  const cats = new Set(inSvc.map((r) => KB().cat(r.garment, r.unit)));
  if (CAT !== "all" && !cats.has(CAT)) CAT = "all";
  if (catBox) {
    catBox.innerHTML = cats.size > 1 ? KB().CATS.filter(([k]) => k === "all" || cats.has(k)).map(([k, l]) =>
      `<button type="button" role="tab" class="${CAT === k ? "on" : ""}" aria-selected="${CAT === k}" data-cat="${k}">${l}</button>`).join("") : "";
  }
  const rows = inSvc.filter((r) => CAT === "all" || KB().cat(r.garment, r.unit) === CAT);
  // Tile: upar kapda (tap = +1), neeche ADD ya − n + (Blinkit jaisa). Daam badla
  // ho to card ka daam kata hua aur "saves ₹" — grahak ko bill par wahi dikhta hai.
  const tile = (r, n) => {
    const inCart = CART.find((x) => x.service === r.service && x.garment === r.garment);
    const kg = r.unit === "kg";
    const badge = inCart ? (kg ? `${inCart.qty}kg` : inCart.qty) : "";
    const rate = inCart ? inCart.rate : r.rate;
    const save = inCart && rate < r.rate ? (r.rate - rate) : 0;
    return `<div class="kb-tile${inCart ? " in" : ""}" data-fam="${KB().fam(r.service)}">
      ${badge ? `<span class="kb-n">${esc(String(badge))}</span>` : ""}
      <button type="button" class="kb-tile-main" data-tile="${n}" aria-label="${esc((r.garment || "By weight") + " " + r.service)}">
        ${KB().icon(r.garment, r.unit)}<b>${esc(r.garment || "By weight")}</b><small>${esc(r.service)}</small>
        <em>${save ? `<s>${money(r.rate)}</s>` : ""}${money(rate)}${kg ? "/kg" : ""}${save ? `<span class="kb-sv">saves ${money(save)}</span>` : ""}</em></button>
      ${inCart && !kg
        ? `<div class="kb-tq"><button type="button" data-tm="${n}" aria-label="One less">−</button><output>${esc(String(inCart.qty))}</output><button type="button" data-tp="${n}" aria-label="One more">+</button></div>`
        : `<button type="button" class="kb-add" data-tile="${n}">${inCart ? "EDIT" : "ADD"}</button>`}
    </div>`;
  };
  let html = rows.map(tile).join("");
  if (!rows.length) html += `<p class="kb-empty">No items here.</p>`;
  // Rate card par nahi? Wahin jodo (rate card mein bhi save hota hai)
  html += `<button type="button" class="kb-tile add" data-create="1">${KB().icon("", "pc")}<b>＋ New item</b><small>${esc(PICK_SVC)}</small></button>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-tile]").forEach((b) => {
    b.onclick = () => tapItem(rows[parseInt(b.dataset.tile, 10)]);
  });
  box.querySelectorAll("[data-tp]").forEach((b) => { b.onclick = () => tapItem(rows[parseInt(b.dataset.tp, 10)]); });
  box.querySelectorAll("[data-tm]").forEach((b) => { b.onclick = () => untapItem(rows[parseInt(b.dataset.tm, 10)]); });
  const create = box.querySelector("[data-create]");
  if (create) create.onclick = () => newRateModal(PICK_SVC, "");
}
/* ─── KG service: bore ke kapde, sirf ginti ─────────────────────────── */
/* KG service ka rate card par ek hi row hota hai ("By weight"). Pehle yahan
   kapde ka naam likhkar "Create" dabane par wo rate card mein jaane ki
   koshish karta aur 409 aata ("already on the rate card") — kyunki kg mein
   kapde ka koi alag daam hota hi nahi. Ab kg service chunne par search
   kapdon ke NAAM dhoondhta hai; tap = bore mein ek aur (ginti), daam nahi.
   Naam na mile to wahin "＋ Add to the bag" — rate card ko chhuta nahi. */
const COMMON_CLOTHES = [
  "Shirt", "T-shirt", "Pant", "Jeans", "Lower", "Shorts", "Kurta", "Pajama", "Saree",
  "Salwar", "Dupatta", "Frock", "Top", "Jacket", "Sweater", "Towel", "Bedsheet",
  "Pillow cover", "Curtain", "Blanket", "Undergarments", "Socks", "Handkerchief",
];
function isKgService(svc) {
  const rows = (RATES || []).filter((r) => r.service === svc);
  return rows.length > 0 && rows.every((r) => r.unit === "kg");
}
function kgLineFor(svc, quiet) {
  let idx = CART.findIndex((x) => x.service === svc && x.unit === "kg");
  if (idx >= 0) return idx;
  const r = RATES.find((x) => x.service === svc && x.unit === "kg");
  if (!r) return -1;
  CART.push({ service: r.service, garment: r.garment, qty: 1, rate: r.rate, card: r.rate, unit: "kg", pieces: [] });
  if (!quiet) toast(`${r.service} added — enter the weight in kg below`, false, 2200);
  return CART.length - 1;
}
/* Page par kg ki ek hi tile: wazan + kitne kapde. Tap = bag sheet. */
function renderKgPicker(box) {
  const rate = RATES.find((x) => x.service === PICK_SVC && x.unit === "kg");
  const line = CART.find((x) => x.service === PICK_SVC && x.unit === "kg");
  const count = piecesCount(line && line.pieces);
  box.innerHTML = `<button type="button" class="kb-tile${line ? " in" : ""}" data-bag="1" data-fam="${KB().fam(PICK_SVC)}">
      ${line ? `<span class="kb-n">${esc(line.qty)}kg</span>` : ""}${KB().icon("", "kg")}
      <b>${line ? esc(`${line.qty} kg · ${count} clothes`) : "Weigh the bag"}</b>
      <small>${line && count ? esc(piecesLabel(line.pieces)) : "weight, then the clothes inside"}</small>
      <em>${rate ? money(rate.rate) + "/kg" : ""}</em>
    </button>`;
  box.querySelector("[data-bag]").onclick = () => bagSheet(PICK_SVC);
}

/* ─── Bag sheet: kg ka wazan + bore ke kapde, ek popup mein ─────────────
   Pehle ye sab bill ke page par tha: search par keyboard aate hi poora page
   upar chadh jaata, kapda jodte hi cart neeche badhta aur list khisak jaati —
   delivery wala phone par bill bana hi nahi pa raha tha. Ab popup ki
   oonchai keyboard ke upar wali jagah ke barabar rehti hai (visualViewport);
   upar wazan + search tike rehte hain, sirf list scroll hoti hai, aur
   kapdon ka kram khulte waqt tay — tap karne par row ungli ke neeche se
   nahi bhaagti. Badlaav seedha CART mein; band karna = save. */
function bagSheet(svc) {
  let idx = CART.findIndex((x) => x.service === svc && x.unit === "kg");
  const fresh = idx < 0;
  if (fresh) idx = kgLineFor(svc, true);
  if (idx < 0) return;
  const line = CART[idx];
  let touched = false;
  const seen = new Set();
  const names = [];
  [...line.pieces.map((p) => p.type),
   ...RATES.map((r) => (r.garment || "").trim()),
   ...COMMON_CLOTHES].forEach((n) => {
    const k = n.toLowerCase();
    if (n && !seen.has(k)) { seen.add(k); names.push(n); }
  });
  openModal(`<div class="bag-head">
      <h3>${esc(line.garment || line.service)}<small id="bg-sum"></small></h3>
      <button type="button" class="btn go sm" id="bg-done">Done</button>
    </div>
    <div class="bag-weigh">
      <label for="bg-kg">Weight</label>
      <div class="stepper">
        <button type="button" class="step" data-kg="-0.5" aria-label="Half kg less">−</button>
        <input id="bg-kg" type="number" inputmode="decimal" min="0.1" step="0.1" value="${line.qty}" enterkeyhint="done" aria-label="Weight in kg">
        <button type="button" class="step" data-kg="0.5" aria-label="Half kg more">+</button>
      </div>
      <span class="bag-unit">kg</span>
    </div>
    <input id="bg-q" type="search" placeholder="Search cloth — e.g. shirt" autocomplete="off" enterkeyhint="done" aria-label="Search cloth">
    <div class="item-list bag-list" id="bg-list" aria-live="polite"></div>`, "bag");

  const kgIn = $("bg-kg"), qIn = $("bg-q"), list = $("bg-list");
  const paintSum = () => {
    $("bg-sum").textContent = `${money(line.rate)}/kg · ${money(line.qty * line.rate)} · ${piecesCount(line.pieces)} clothes`;
  };
  const bump = (type, by) => {
    const p = line.pieces.find((x) => x.type.toLowerCase() === type.toLowerCase());
    if (p) p.qty += by;
    else if (by > 0) line.pieces.push({ type, qty: by });
    line.pieces = line.pieces.filter((x) => x.qty > 0);
    touched = true;
    if (navigator.vibrate) navigator.vibrate(by > 0 ? 12 : 8);
  };
  let shown = [];
  const paintList = () => {
    const raw = qIn.value.trim().replace(/\s+/g, " ");
    const q = raw.toLowerCase();
    shown = names.filter((n) => !q || n.toLowerCase().includes(q));
    const inBag = new Map(line.pieces.map((p) => [p.type.toLowerCase(), p.qty]));
    let html = shown.map((n, i) => {
      const c = inBag.get(n.toLowerCase());
      return `<button type="button" class="item-row${c ? " in" : ""}" data-pc="${i}">
        <span class="ir-name">${esc(n)}</span>
        ${c ? `<span class="ir-step"><span class="ir-minus" data-minus="1" role="button" aria-label="One less">−</span><b>${c}</b><span class="ir-plus" aria-hidden="true">＋</span></span>`
            : `<span class="ir-add">＋</span>`}
      </button>`;
    }).join("");
    // milte-julte naam mil gaye to "Add shi" sirf bheed — tabhi jab kuch na mile
    if (q && !shown.length) {
      html += `<button type="button" class="item-row create" data-addpc="1">＋ Add “${esc(raw)}” to the bag</button>`;
    }
    list.innerHTML = html;
    paintSum();
  };
  const add = (name) => {
    let type = String(name || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!type) return;
    type = type[0].toUpperCase() + type.slice(1);   // "pillow cover" -> "Pillow cover"
    if (!names.some((n) => n.toLowerCase() === type.toLowerCase())) names.unshift(type);
    bump(type, 1);
    // Search waisa hi rahe — chuna hua kapda ungli ke neeche − n + ke saath
    // tika rahe (pehle khaana saaf hote hi poori list aa jaati aur kapda
    // "gayab" ho jaata). Text select: agla naam likhte hi purana hat jaata hai.
    paintList();
    if (qIn.value) { qIn.focus(); qIn.select(); }
  };
  // Search khula ho aur row dabayi to input ka focus na chhoote — warna
  // keyboard band hokar dobara khulta aur poori sheet uchhalti.
  list.onmousedown = (ev) => { if (document.activeElement === qIn) ev.preventDefault(); };
  list.onclick = (ev) => {
    const row = ev.target.closest("[data-pc], [data-addpc]");
    if (!row) return;
    if (row.dataset.addpc) return add(qIn.value);
    const name = shown[parseInt(row.dataset.pc, 10)];
    if (ev.target.closest("[data-minus]")) { bump(name, -1); paintList(); return; }
    add(name);
  };
  qIn.oninput = paintList;
  qIn.onkeydown = (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    if (!qIn.value.trim()) { qIn.blur(); return; }
    const first = list.querySelector("[data-pc], [data-addpc]");
    if (first) first.click();
  };
  kgIn.onfocus = () => kgIn.select();
  kgIn.oninput = () => {
    const v = parseFloat(kgIn.value);
    if (!(v > 0)) return;
    line.qty = v; touched = true; paintSum();
  };
  kgIn.onchange = () => { if (!(line.qty > 0)) line.qty = 0.5; kgIn.value = line.qty; paintSum(); };
  kgIn.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); kgIn.blur(); } };
  $("modal-body").querySelectorAll("[data-kg]").forEach((b) => {
    b.onclick = () => {
      line.qty = Math.max(0.5, Math.round((line.qty + parseFloat(b.dataset.kg)) * 10) / 10);
      kgIn.value = line.qty; touched = true; paintSum();
    };
  });
  $("bg-done").onclick = closeModal;

  // Popup ko keyboard ke upar wali jagah mein bandh do
  const ov = $("modal-ov");
  const vv = window.visualViewport;
  const fit = () => { ov.style.top = `${vv.offsetTop}px`; ov.style.height = `${vv.height}px`; ov.style.bottom = "auto"; };
  if (vv) { fit(); vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
  MODAL_ONCLOSE = () => {
    if (vv) { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); }
    ov.style.top = ov.style.height = ov.style.bottom = "";
    // khola, kuch nahi kiya = 1 kg ki khaali line cart mein na chhodo
    if (fresh && !touched && !line.pieces.length) {
      const at = CART.indexOf(line);
      if (at >= 0) CART.splice(at, 1);
    }
    renderCart();
  };
  paintList();
  // Wazan − + se; number keyboard tabhi jab khud khaane par tap ho
}

function untapItem(r) {
  if (!r) return;
  const idx = CART.findIndex((x) => x.service === r.service && x.garment === r.garment);
  if (idx < 0) return;
  if (CART[idx].qty <= 1) CART.splice(idx, 1);
  else CART[idx].qty = Math.round((CART[idx].qty - 1) * 100) / 100;
  renderCart();
  if (navigator.vibrate) navigator.vibrate(8);
}

function tapItem(r) {
  if (!r) return;
  let idx = CART.findIndex((x) => x.service === r.service && x.garment === r.garment);
  if (idx >= 0) {
    // wahi kapda dobara: ginti badhti hai, badla hua rate waisa hi rehta hai.
    // KG par dobara tap se wazan nahi badhta — wazan likhna hota hai.
    if (r.unit !== "kg") CART[idx].qty = Math.round((CART[idx].qty + 1) * 100) / 100;
  } else {
    CART.push({ service: r.service, garment: r.garment, qty: 1, rate: r.rate, card: r.rate, unit: r.unit || "pc", pieces: [] });
    idx = CART.length - 1;
  }
  renderCart();
  if (navigator.vibrate) navigator.vibrate(12);   // haath ko pata chale ki juda
  // Keyboard yahan kabhi nahi kholte: wazan/ginti − + se, likhna ho to khaane par tap
  // No toast: the row itself now shows − n +, and a stack of "added" toasts
  // covered the very list being tapped on a small phone.
}

/* Grahak aisa kapda laaya jo rate card par nahi. Bill chhod kar owner ko
   phone karne ke bajaye yahin jod do — rate card mein bhi judta hai, taaki
   agla bill wahi daam le. Server har jod audit karta hai.
   showNewBill() dobara NAHI chalate: wo naam/number ke bhare khaane mita
   deta. Sirf dono dropdown naye sire se bharte hain aur item cart mein. */
function newRateModal(service, itemName = "") {
  const services = [...new Set(RATES.map((r) => r.service))];
  openModal(`<h3>Add to rate card</h3>
    <p class="said">It is added to this bill and saved for the next bills too.</p>
    <label for="nr-svcsel">Service</label>
    <select id="nr-svcsel">${services.map((s) => `<option value="${esc(s)}"${s === service ? " selected" : ""}>${esc(s)}</option>`).join("")}<option value="__new"${service ? "" : " selected"}>➕ New service…</option></select>
    <input id="nr-svc" value="${esc(service || "")}" placeholder="New service name, e.g. Dry Clean" maxlength="60" autocomplete="off"${service ? " hidden" : ""}>
    <div id="nr-itemwrap">
      <label for="nr-item">Item</label>
      <input id="nr-item" value="${esc(itemName)}" placeholder="e.g. Blazer" maxlength="60" autocomplete="off">
    </div>
    <div class="frow">
      <div>
        <label for="nr-unit">Charged per</label>
        <select id="nr-unit"><option value="pc">Piece</option><option value="kg">Kg</option></select>
      </div>
      <div>
        <label for="nr-rate">Rate (₹)</label>
        <input id="nr-rate" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0">
      </div>
    </div>
    <div class="err" id="nr-err"></div>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn go" id="nr-save">Add to bill</button>
    </div>`);
  // KG service mein item nahi hota — poora bora tulta hai (dashboard jaisa)
  const paintUnit = () => { $("nr-itemwrap").hidden = $("nr-unit").value === "kg"; };
  $("nr-unit").onchange = paintUnit;
  // Service dropdown: list se chuno ya "New service…" par naam likho (pehle
  // text + datalist tha — phone par list kabhi khulti hi nahi thi)
  $("nr-svcsel").onchange = () => {
    const sel = $("nr-svcsel"), inp = $("nr-svc");
    if (sel.value === "__new") { inp.hidden = false; inp.value = ""; inp.focus(); return; }
    inp.hidden = true; inp.value = sel.value;
    const k = RATES.find((r) => r.service === sel.value);
    if (k) { $("nr-unit").value = k.unit === "kg" ? "kg" : "pc"; paintUnit(); }
  };
  const known = RATES.find((r) => r.service === service);
  if (known && known.unit === "kg") $("nr-unit").value = "kg";
  paintUnit();
  // jo pehle se pata hai (service, search ka naam) wo dobara nahi poochhte
  $(!service ? "nr-svc" : ($("nr-unit").value === "kg" || itemName) ? "nr-rate" : "nr-item").focus();
  $("nr-save").onclick = (e) => {
    const unit = $("nr-unit").value, rate = parseFloat($("nr-rate").value);
    const svc = $("nr-svc").value.trim(), item = unit === "kg" ? "" : $("nr-item").value.trim();
    const fail = (msg, id) => { $("nr-err").textContent = msg; $(id).focus(); };
    if (!svc) return fail("Write the service name.", "nr-svc");
    if (unit === "pc" && !item) return fail("Write the item name.", "nr-item");
    if (!(rate > 0)) return fail("Enter a rate above ₹0.", "nr-rate");
    $("nr-err").textContent = "";
    return busy(e.currentTarget, async () => {
      // 409: ye item card par pehle se hai — modal mein atkane ke bajaye wahi bill mein jodo
      let row, exists = false;
      try { row = await api("/rates", { method: "POST", body: { service: svc, garment: item, unit, rate } }); }
      catch (err) {
        if (err.status !== 409) { $("nr-err").textContent = err.message; return; }
        exists = true;
        RATES = await api("/rates");
        row = RATES.find((r) => r.service === svc && r.garment === item);
        if (!row) { $("nr-err").textContent = err.message; return; }
      }
      RATES = RATES.filter((r) => !(r.service === row.service && r.garment === row.garment)).concat(row);
      closeModal();
      if (!$("b-items")) return;        // screen badal gayi — rate card to ban hi gaya
      PICK_SVC = row.service;
      tapItem(row);
      toast(exists ? `${row.garment || row.service} is already on the rate card — added at ${money(row.rate)}`
        : `${row.garment || row.service} added — ${money(row.rate)}${row.unit === "kg" ? "/kg" : ""}`);
    });
  };
  $("modal-body").querySelectorAll("input").forEach((el) => {
    el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); $("nr-save").click(); } });
  });
}

/* ─── kharcha ───────────────────────────────────────────────────────── */
/* Petrol, detergent, chai-paani — jo paisa dukaan ke liye nikla, wahi
   likh do. Owner ke dashboard mein naam ke saath dikhta hai. Yahan sirf
   apna daala hua dikhta hai; galti ho to owner hatata hai. */
async function showExpenses(opts = {}) {
  $("chips").innerHTML = "";
  backToMe();
  if (!opts.quiet) $("list").innerHTML = `<div class="empty">Loading…</div>`;
  let d;
  try { d = await api("/expenses"); }
  catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (NAV !== "exp") return;
  const today = new Date();
  const iso = (dt) => new Date(dt.getTime() - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const min = new Date(today); min.setDate(min.getDate() - d.backdate_days);
  $("list").innerHTML = `
    <div class="card">
      <h3>Add expense</h3>
      <label for="x-cat">Category</label>
      <select id="x-cat"><option value="">Pick one…</option>${d.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <div class="frow">
        <div>
          <label for="x-amt">Amount (₹)</label>
          <input id="x-amt" type="number" inputmode="decimal" min="1" step="1" placeholder="0">
        </div>
        <div>
          <label for="x-date">Date</label>
          <input id="x-date" type="date" value="${iso(today)}" min="${iso(min)}" max="${iso(today)}">
        </div>
      </div>
      <label for="x-desc">What for? (optional)</label>
      <input id="x-desc" maxlength="300" placeholder="e.g. petrol for pickups">
      <div class="err" id="x-err"></div>
      <button class="btn go wide" id="x-save">Save expense</button>
      <p class="hint">The owner sees it with your name. Older than ${d.backdate_days} days? Ask the owner.</p>
    </div>
    <div class="card">
      <h3>My expenses <small class="said">${esc(d.month || "this month")} · ${money(d.total)}</small></h3>
      ${d.expenses.length
        ? d.expenses.map((x) => `
          <div class="kv"><span>${esc(whenParts(x.spent_on).top)} · ${esc(x.category)}${x.description ? ` — ${esc(x.description)}` : ""}</span><b>${money(x.amount)}</b></div>`).join("")
        : `<p class="hint mt0">Nothing yet.</p>`}
    </div>`;
  $("x-save").onclick = (e) => {
    const category = $("x-cat").value, amount = parseFloat($("x-amt").value);
    const fail = (msg, id) => { $("x-err").textContent = msg; $(id).focus(); };
    if (!category) return fail("Pick a category.", "x-cat");
    if (!(amount > 0)) return fail("Enter the amount.", "x-amt");
    $("x-err").textContent = "";
    return busy(e.currentTarget, async () => {
      try {
        await api("/expenses", { method: "POST", body: {
          category, amount, spent_on: $("x-date").value || null, description: $("x-desc").value.trim(),
        }});
      } catch (err) { $("x-err").textContent = err.message; return; }
      toast(`${money(amount)} ${category} saved ✅`);
      showExpenses({ quiet: true });
    });
  };
}

/* Ek hisaab, ek jagah. UI aur server dono yahi kram lagate hain:
   gross -> chhoot -> total -> advance -> is bill ka due -> + purana. */
function billMath() {
  const gross = CART.reduce((s, i) => s + i.qty * i.rate, 0);
  const raw = DISC.mode === "pct" ? (gross * DISC.value) / 100 : DISC.value;
  const discount = Math.min(Math.round(raw * 100) / 100, gross);
  // ⚡ Urgent charge chhoot ke baad — server (services/urgent.py) ka hi niyam:
  // default = items ka % (ya fixed ₹), poore rupaye mein
  let urg = 0;
  if (URG.on) {
    const c = ME.urgent || { type: "percent", value: 50 };
    urg = URG.manual ? URG.amt : Math.max(0, Math.round(c.type === "flat" ? c.value : (gross * c.value) / 100));
  }
  // Pickup/delivery charge aur GST — server (create_bill) ka hi kram
  const dchg = Math.max(0, DCHG || 0);
  const base = gross - discount + urg + dchg;
  const gst = Math.round(base * (GSTP || 0)) / 100;
  const total = Math.round((base + gst) * 100) / 100;
  const adv = Math.min(Math.max(0, parseFloat(($("b-adv") || {}).value) || 0), total);
  const due = Math.round((total - adv) * 100) / 100;
  const pieces = CART.reduce((s, i) => s + (i.unit === "kg" ? 1 : i.qty), 0);
  return { gross, discount, urg, dchg, gst, total, adv, due, pieces, grand: Math.round((due + PREV_DUE) * 100) / 100 };
}

let CART_PAINTING = false;
let EDIT_RATE = -1;   // kis line ka daam-khaana khula hai (-1 = koi nahi)
function renderCart() {
  const box = $("b-cart");
  if (!box) return;
  KB().keep($("b-items"), paintUsual);   // chips ki line badle to neeche ki list na khiske
  // Focus wala qty/wazan ka khaana hatate hi browser uska blur/change
  // chalata hai, jo phir renderCart bulata — aadhe bane DOM par dobara
  // innerHTML ("node to be removed is no longer a child"). Ek baar mein ek.
  if (CART_PAINTING) return;
  CART_PAINTING = true;
  try { KKDS.keepScroll(() => paintCart(box), ["b-svcchips", "b-cats"]); } finally { CART_PAINTING = false; }
}
function paintCart(box) {
  renderPicker();   // tiles par ginti ka badge cart ke saath chale
  if (!BDATE_MANUAL && $("b-date")) $("b-date").value = autoDate();   // bhaari kapda = zyada din
  if (!CART.length) {
    box.innerHTML = "";
    paintBar();
    return;
  }
  // Ek kapda = ek line: icon, naam, − qty +, rakam, ✕. Daam ka khaana tabhi
  // khulta hai jab "₹63 each ✎" dabaya jaye — mol-bhav kabhi-kabhi hota hai.
  box.innerHTML = `<div class="kb-sub">Added items <button type="button" class="kb-link kb-draft-link" data-bar="draft">Save as draft</button></div>
    <div class="kb-items-h" aria-hidden="true"><span></span><span>Item / service</span><span>Qty</span><span>Amount</span><span></span></div>
    ${CART.map((i, n) => {
    const kg = i.unit === "kg";
    const changed = i.rate !== i.card;
    return `<div class="kb-it">
      ${KB().icon(i.garment || i.service, i.unit)}
      <div class="kb-it-n"><b>${esc(i.garment || i.service)}</b>
        <button type="button" class="${changed ? "changed" : ""}" data-editrate="${n}">${esc(i.garment ? i.service + " · " : "")}${money(i.rate)}${kg ? "/kg" : " each"}${changed ? ` · card ${money(i.card)}` : ""} ✎</button></div>
      <div class="kb-qty">
        <button type="button" data-q="${n}" data-by="${kg ? -0.5 : -1}" aria-label="${kg ? "Half kg less" : "One less"}">−</button>
        <input type="number" inputmode="${kg ? "decimal" : "numeric"}" data-qty="${n}" value="${i.qty}" min="0.1" step="${kg ? 0.1 : 1}" aria-label="${kg ? "Weight in kg" : "How many"}">
        <button type="button" data-q="${n}" data-by="${kg ? 0.5 : 1}" aria-label="${kg ? "Half kg more" : "One more"}">+</button>
      </div>
      <b class="kb-it-amt">${money(i.qty * i.rate)}</b>
      <button type="button" class="kb-del kb-it-x" data-rm="${n}" aria-label="Remove ${esc(i.garment || i.service)}">✕</button>
      ${EDIT_RATE === n ? `<div class="kb-it-more"><label class="kb-money"><span>₹</span><input type="number" inputmode="decimal" data-rate="${n}" value="${i.rate}" min="0" aria-label="Rate"></label>
        <small>${changed ? "card ₹" + i.card : "rate card price"}</small></div>` : ""}
      ${kg ? `<div class="kb-it-more"><button type="button" data-pieces="${n}">👕 ${piecesCount(i.pieces) ? "Edit clothes" : "+ Add clothes (count only)"}</button>
        ${piecesCount(i.pieces) ? `<small>${esc(piecesLabel(i.pieces))}</small>` : ""}</div>` : ""}
    </div>`;
  }).join("")}`;

  box.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = () => { CART.splice(parseInt(b.dataset.rm, 10), 1); EDIT_RATE = -1; renderCart(); };
  });
  box.querySelectorAll("[data-pieces]").forEach((b) => {
    b.onclick = () => bagSheet(CART[parseInt(b.dataset.pieces, 10)].service);
  });
  box.querySelectorAll("[data-q]").forEach((b) => {
    b.onclick = () => {
      const n = parseInt(b.dataset.q, 10);
      const i = CART[n];
      const next = Math.round((i.qty + parseFloat(b.dataset.by)) * 10) / 10;
      // kapda 1 se − kiya = hata do (ek tap mein galti theek). kg 0.5 se neeche nahi.
      if (i.unit !== "kg" && next < 1) { CART.splice(n, 1); EDIT_RATE = -1; }
      else i.qty = Math.max(i.unit === "kg" ? 0.5 : 1, next);
      renderCart();
    };
  });
  box.querySelectorAll("[data-editrate]").forEach((b) => {
    b.onclick = () => {
      const n = parseInt(b.dataset.editrate, 10);
      EDIT_RATE = EDIT_RATE === n ? -1 : n;
      renderCart();
      const inp = box.querySelector(`[data-rate="${n}"]`);
      if (EDIT_RATE === n && inp) { inp.focus(); inp.select(); }
    };
  });
  // input par re-render nahi karte: har akshar par DOM badalne se cursor
  // field se kood jaata hai. Sirf sums update; poora cart change (blur) par.
  box.querySelectorAll("[data-qty],[data-rate]").forEach((inp) => {
    const idx = parseInt(inp.dataset.qty ?? inp.dataset.rate, 10);
    const isRate = inp.dataset.rate !== undefined;
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      if (!(v >= 0)) return;
      CART[idx][isRate ? "rate" : "qty"] = v;
      paintBar();
    };
    inp.onchange = () => {
      if (!(CART[idx].qty > 0)) CART[idx].qty = CART[idx].unit === "kg" ? 0.5 : 1;
      renderCart();
    };
  });
  paintBar();
}

/* ─── KG line ke kapde: sirf ginti ─────────────────────────────────── */
/* Bill wazan se (3.5 kg x ₹60). Par bore mein kya hai ye likhna zaroori
   hai — washerman ko ginti milani hai, aur wapas dete waqt "ek kurta kam
   hai" ka jawab yahi list hai. Daam kisi kapde ka nahi lagta. */
const piecesCount = (p) => (p || []).reduce((s, x) => s + (parseInt(x.qty, 10) || 0), 0);
const piecesLabel = (p) => (p || []).map((x) => `${x.type} ${x.qty}`).join(", ") + ` — ${piecesCount(p)} pcs`;

/* Kadam 3 ka saar: kaun se kapde, kitne, kis daam — rang service ka */
function paintRecap() {
  const box = $("b-recap");
  if (!box) return;
  box.innerHTML = CART.length ? CART.map((i) => {
    const kg = i.unit === "kg";
    const changed = i.card && i.rate < i.card;
    return `<div class="ln" data-fam="${KB().fam(i.service)}"><span><i></i><span><b class="kb-semi">${kg ? esc(`${i.qty} kg · ${i.service}`) : `${esc(String(i.qty))} × ${esc(i.garment || i.service)}`}</b>
      <small>${kg ? esc(piecesCount(i.pieces) ? piecesLabel(i.pieces) : "by weight") : `${esc(i.service)} · ${money(i.rate)}${changed ? ` <s>${money(i.card)}</s>` : ""}`}</small></span></span>
      <b>${money(i.qty * i.rate)}</b></div>`;
  }).join("") : `<p class="kb-hint">No items yet.</p>`;
}
/* Bill ka saar (step 3) + neeche ki patti. Har input par sirf ginti badalti
   hai, khaane dobara nahi bante — likhte waqt cursor nahi koodta. */
function paintBar() {
  if (!$("kb")) return;
  const m = billMath();
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("s-items", String(m.pieces));
  set("s-sub", money(m.gross));
  set("s-gst", money(m.gst));
  set("s-total", money(m.total));
  set("s-gen-total", money(m.total));
  set("s-due", money(m.due));
  set("b-count", CART.length ? `${m.pieces} item${m.pieces === 1 ? "" : "s"}` : "");
  set("s-items-h", CART.length ? `${m.pieces} item${m.pieces === 1 ? "" : "s"} · ${money(m.gross)}` : "");
  if ($("s-urgrow")) { $("s-urgrow").hidden = !(URG.on && m.urg > 0); set("s-urg", "+" + money(m.urg)); }
  // Kam daam likha (card se neeche) = grahak ki bachat — bill par bhi yahi line jaati hai
  const sav = CART.reduce((a, i) => a + Math.max(0, ((i.card || i.rate) - i.rate) * (i.qty || 0)), 0);
  if ($("s-savrow")) { $("s-savrow").hidden = !(sav > 0.5); set("s-sav", "−" + money(sav)); }
  if ($("s-when") && $("b-date")) $("s-when").textContent = $("b-date").value ? `ready ${KB().shortDate($("b-date").value)}${$("b-time").value ? ", " + KB().time12($("b-time").value) : ""}` : "";
  if (STEP === 3) paintRecap();
  if ($("s-duebox")) $("s-duebox").classList.toggle("paid", m.due <= 0 && CART.length > 0);
  if ($("b-advfull")) $("b-advfull").textContent = `Full ${money(m.total)}`;
  if (URG.on && $("b-urgamt") && !URG.manual && document.activeElement !== $("b-urgamt")) $("b-urgamt").value = String(m.urg);
  if ($("s-prev")) {
    $("s-prev").hidden = !(PREV_DUE > 0);
    $("s-prev").innerHTML = PREV_DUE > 0 ? `<span>Previous dues (${PREV_BILLS} bill${PREV_BILLS > 1 ? "s" : ""})<small>Separate from this bill · total to collect ${money(m.grand)}</small></span><span>${money(PREV_DUE)}</span>` : "";
  }
  paintSteps();
  const bar = $("b-bar");
  if (!bar) return;
  const back = STEP > 1 ? `<button type="button" class="kb-back" data-bar="back" aria-label="Back">‹</button>` : "";
  const sum = STEP === 1
    ? `<b>${esc(($("b-name") && $("b-name").value.trim()) || "New bill")}</b><span>${PICKED ? "Customer selected" : "Step 1 of 3 · customer"}</span>`
    : PREV_DUE > 0 && STEP === 3
      ? `<b>${money(m.grand)}</b><span>${money(m.due)} this bill + ${money(PREV_DUE)} old</span>`
      : `<b>${money(STEP === 3 ? m.due : m.total)}</b><span>${CART.length ? `${m.pieces} item${m.pieces === 1 ? "" : "s"}` : "No items yet"}${
          STEP === 3 ? " · due" : ""}${m.discount > 0 ? " · " + money(m.discount) + " off" : ""}${URG.on ? " · ⚡" : ""}</span>`;
  const label = STEP < 3 ? "Next →"
    : PICKUP_BILL_CONTEXT ? "Create bill ✓" : ME.garment_tags ? "Bill & labels →" : "Generate bill";
  const draftBtn = STEP > 1 && CART.length ? `<button type="button" class="kb-btn ghost kb-bar-draft" data-bar="draft">Draft</button>` : "";
  bar.innerHTML = `${back}<div class="kb-bar-sum">${sum}</div>${draftBtn}<button type="button" class="kb-btn go" data-bar="next">${label}</button>`;
}

/* Naam likhte hi purana grahak. Counter par sabse badi galti yahi hoti
   thi: wahi grahak har baar naye number ke saath dobara ban jaata tha
   (ek digit idhar-udhar), aur uska purana hisaab kahin aur pada rehta.
   Chunne par number NAHI dikhta — bill server par `ref` se banta hai. */
let AC_TIMER = null, AC_SEQ = 0, AC_HITS = [];

function wireCustomerSearch() {
  const input = $("b-name"), box = $("b-ac");
  if (!input || !box) return;
  input.oninput = () => {
    if (PICKED && !PICKUP_BILL_CONTEXT) clearCustomer(false);
    paintBar();
    const q = input.value.trim();
    clearTimeout(AC_TIMER);
    if (q.length < 2) { box.innerHTML = ""; return; }
    const mine = ++AC_SEQ;
    AC_TIMER = setTimeout(async () => {
      let hits = [];
      try { hits = await api(`/customers/search?q=${encodeURIComponent(q)}`); }
      catch (e) { box.innerHTML = ""; return; }   // sujhaav suvidha hai — fail ho to chup
      if (mine !== AC_SEQ) return;                // dheema jawab purani list na dikhaye
      if (document.activeElement !== input) return;   // aadmi aage badh gaya — list dobara na khule
      AC_HITS = hits;
      // Koi nahi mila: dropdown nahi, wo number ke khaane ko dhak kar chipka rehta tha
      box.innerHTML = hits.map((c, i) => `<div data-pick="${i}"><span>${esc(c.name || "No name")} <small>${esc(c.phone_masked)}</small></span>${
            c.due > 0 ? `<span class="due">${money(c.due)} due</span>` : c.order_count ? `<small>${c.order_count} order${c.order_count > 1 ? "s" : ""}</small>` : ""}</div>`).join("");
      box.querySelectorAll("[data-pick]").forEach((row) => {
        row.onclick = () => pickCustomer(AC_HITS[parseInt(row.dataset.pick, 10)]);
      });
      // Number poora likha aur ek hi mila: chunne ki zaroorat nahi
      const digits = q.replace(/\D/g, "");
      if (digits.length >= 10 && hits.length === 1) pickCustomer(hits[0]);
      else if (digits.length >= 10 && !hits.length) { $("b-phone").value = digits.slice(-10); box.innerHTML = ""; input.value = ""; input.placeholder = "Customer name (optional)"; paintBar(); }
    }, 250);
  };
}
function pickCustomer(c) {
  if (!c) return;
  const input = $("b-name"), box = $("b-ac");
  PICKED = c.ref;
  PICKED_C = c;
  PREV_DUE = c.due || 0;
  PREV_BILLS = c.due_bills || 0;
  input.value = c.name || "";
  box.innerHTML = "";
  KB().dropFocus();       // grahak mil gaya: keyboard ka ab kaam nahi
  $("b-phone").value = ""; $("b-phone").disabled = true;
  $("b-phone-err").textContent = "";
  $("b-newbox").hidden = true;
  // Purana udhaar yahin, is pal — grahak abhi saamne khada hai.
  const tag = KB().custTag(c.order_count, c.last_order_at);
  $("b-picked").hidden = false;
  $("b-picked").innerHTML = `<div class="kb-cust${PREV_DUE > 0 ? " owes" : ""}">
      <span class="kb-av">${esc(KB().initials(c.name))}</span>
      <div class="kb-cust-tx"><b>${esc(c.name || "Customer")}</b><span>${esc(c.phone_masked)}</span>
        <small>${c.order_count ? `Total orders: ${c.order_count}${c.last_order_at ? ` · Last: ${esc(KB().shortDate(c.last_order_at))}` : ""}` : "First order"}</small>
        ${PREV_DUE > 0 ? `<small class="kb-owes">⚠ ${money(PREV_DUE)} previous due (${PREV_BILLS} bill${PREV_BILLS > 1 ? "s" : ""})</small>` : ""}</div>
      <span class="kb-tag ${tag.key}">${tag.label}</span></div>
    <div class="kb-cust-btns"><button type="button" class="kb-btn ghost sm" data-cust="new">＋ New customer</button>
      <button type="button" class="kb-btn ghost sm" data-cust="history">View history</button></div>
    ${canLocate() && c.has_location === false && DELIVERY_ROLES.includes(ME.role) && navigator.geolocation
      ? `<div class="kb-note info kb-locnote">📍 <b>No location pinned.</b> At their door? Save it now so the next pickup finds the house.
          <button type="button" class="kb-btn go sm" data-cust="saveloc">Save location</button></div>` : ""}`;
  const locBtn = $("b-picked").querySelector('[data-cust="saveloc"]');
  if (locBtn) locBtn.onclick = () => askSaveLocation(c.ref, c.name);
  // Delivery wala grahak ke darwaze par hi hota hai — pin nahi hai to seedha poochh lo
  if (locBtn && ME.role === "DELIVERY") askSaveLocation(c.ref, c.name);
  renderCart();
  loadRewards(c.ref);
  loadUsual(c.ref);
  if (FULFIL === "pickup") paintPickups();     // is grahak ka pickup task upar aaye
}
// Bahar tap = sujhaav band. Ek hi baar register — pehle har visit par
// naya listener judta tha aur das chakkar ke baad das chal rahe the.
document.addEventListener("click", (e) => {
  const box = $("b-ac");
  if (box && !e.target.closest(".ac-wrap")) box.innerHTML = "";
});

/* 🎁 Reward: grahak chunte hi server se — hai to chip, Apply ek tap, ✕ se hata do */
async function loadRewards(ref) {
  REWARDS = []; REWARD_CODE = "";
  try { REWARDS = (await api(`/customers/${encodeURIComponent(ref)}/rewards`)).available || []; }
  catch (e) { REWARDS = []; }
  paintReward();
}
function paintReward() {
  const box = $("b-reward");
  if (!box) return;
  if (!REWARDS.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = REWARDS.map((r) => r.code === REWARD_CODE
    ? `<div class="rwchip on">🎁 <b>${esc(r.reward)}</b> applied · ${esc(r.code)}<button type="button" class="btn ghost sm" data-rw="">✕ Remove</button></div>`
    : `<div class="rwchip">🎁 Reward: <b>${esc(r.reward)}</b>${r.expires_at ? ` · till ${esc(r.expires_at.slice(0, 10))}` : ""}<button type="button" class="btn go sm" data-rw="${esc(r.code)}">Apply</button></div>`).join("");
  box.querySelectorAll("[data-rw]").forEach((b) => { b.onclick = () => { REWARD_CODE = b.dataset.rw; paintReward(); }; });
}

/* ⭐ Grahak ke aam items (kk-bill.js KKBill.usual): chip chuna = bill mein 1 ke
   saath, × = bill se bahar. Ginti − + se: har baar alag hoti hai, isliye
   pichhli baar wali nahi. Kabhi khud nahi judte. Bill hi asli list hai;
   USUAL_EXTRA sirf ＋ Add wale kapde yaad rakhta hai jab tak wo bill mein hain. */
let USUAL_EXTRA = [];
async function loadUsual(ref) {
  USUAL = []; USUAL_REF = ref;
  paintUsual();
  let items = [];
  try { items = (await api(`/customers/${encodeURIComponent(ref)}/usual-items`)).items || []; }
  catch (e) { items = []; }
  if (USUAL_REF !== ref) return;                         // beech mein doosra grahak
  USUAL = items;
  KB().keep($("b-items"), paintUsual);
}
const usualRate = (u) => (RATES || []).find((r) => r.service === u.service && r.garment === u.garment);
const usualInCart = (u) => CART.some((x) => x.service === u.service && x.garment === u.garment);
const sameItem = (a) => (b) => a.service === b.service && a.garment === b.garment;
function usualList() {
  USUAL_EXTRA = USUAL_EXTRA.filter(usualInCart);
  // rate card mein band ho gaya to chip nahi
  const list = USUAL.filter(usualRate).concat(USUAL_EXTRA.filter((x) => !USUAL.some(sameItem(x))));
  return list.map((u) => {
    const line = CART.find(sameItem(u));
    return { service: u.service, garment: u.garment, title: u.garment || u.service, sub: u.garment ? u.service : "by weight",
      on: !!line, qty: line ? (line.unit === "kg" ? `${line.qty} kg` : `×${line.qty}`) : "" };
  });
}
function paintUsual() {
  const box = $("b-usual");
  if (!box) return;
  KB().usual(box, {
    list: usualList(),
    options: (q) => KB().rateOptions(RATES, q, usualInCart),
    onSelect: (u) => addRate(usualRate(u)),
    onPickRate: (r) => { if (!usualInCart(r)) USUAL_EXTRA.push({ service: r.service, garment: r.garment }); addRate(r); },
    onRemove: (u) => {
      const at = CART.findIndex(sameItem(u));
      if (at >= 0) CART.splice(at, 1);
      EDIT_RATE = -1;
      renderCart();
    },
    onAll: () => { usualList().filter((u) => !u.on).forEach((u) => addRate(usualRate(u), true)); renderCart(); },
  });
}
// Pehle se bill mein ho to dobara nahi (likhi hui ginti na badle)
function addRate(r, quiet) {
  if (!r || usualInCart(r)) return;
  CART.push({ service: r.service, garment: r.garment, qty: 1, rate: r.rate, card: r.rate, unit: r.unit || "pc", pieces: [] });
  if (!quiet) renderCart();
}

/* ─── Draft: isi phone par, server par nahi (dekho kk-ds.js) ─────────────── */
let PICKED_C = null;       // chuna hua grahak — masked number hi, poora kabhi nahi
const draftScope = () => `staff.${ME.shop}.${ME.role}.${ME.name}.${ME.phone}`;
function saveDraft() {
  const name = $("b-name").value.trim(), phone = $("b-phone").value.trim();
  if (!CART.length && !name && !phone) return toast("Nothing to save yet", true);
  const ok = KKDS.draft.save(draftScope(), {
    customer: name, phone: PICKED ? "" : phone, cust: PICKED ? PICKED_C : null,
    items: CART, disc: DISC, notes: $("b-notes").value,
  });
  toast(ok ? "Draft saved on this phone" : "Couldn't save the draft on this device", !ok);
}
function paintDraftNote() {
  const box = $("b-draft-note");
  if (!box) return;
  const d = !PICKUP_BILL_CONTEXT && !CART.length && KKDS.draft.load(draftScope());
  box.hidden = !d;
  if (!d) return;
  box.innerHTML = `<span><b>Draft bill</b><br>${esc(KKDS.draft.label(d))}</span>
    <button type="button" class="btn sm" data-draft="resume">Resume</button>
    <button type="button" class="btn ghost sm" data-draft="discard">Discard</button>`;
  box.querySelector('[data-draft="resume"]').onclick = () => resumeDraft(d);
  box.querySelector('[data-draft="discard"]').onclick = () => { KKDS.draft.clear(draftScope()); paintDraftNote(); };
}
function resumeDraft(d) {
  // Rate card badal chuka ho sakta hai: jo item band ho gaya wo nahi, baaki card ke naye daam ke saath
  const items = (d.items || []).flatMap((i) => {
    const r = RATES.find((x) => x.service === i.service && x.garment === i.garment);
    return r ? [{ ...i, card: r.rate, rate: i.rate === i.card ? r.rate : i.rate }] : [];
  });
  const dropped = (d.items || []).length - items.length;
  CART = items;
  if (d.cust) pickCustomer(d.cust);
  else { $("b-name").value = d.customer || ""; $("b-phone").value = d.phone || ""; }
  $("b-notes").value = d.notes || "";
  DISC = d.disc || { mode: "amt", value: 0 };
  if (DISC.mode === "amt" && DISC.value && $("b-disc")) $("b-disc").value = String(DISC.value);
  KKDS.draft.clear(draftScope());
  paintDraftNote();
  renderCart();
  setStep(CART.length ? 2 : 1, { force: true });
  if (dropped) toast(`${dropped} item${dropped > 1 ? "s" : ""} no longer on the rate card`, true);
}

async function saveBill(btn) {
  const phone = $("b-phone").value.trim();
  if (!PICKED && phone.replace(/\D/g, "").length < 10) {
    setStep(1, { force: true });
    $("b-phone-err").textContent = "Enter the full 10-digit number.";
    return toast("Enter the full number", true);
  }
  if (!CART.length) { setStep(2, { force: true }); return toast("Add items first", true); }
  const m = billMath();
  const upi = PAYM === "SPLIT" ? Math.max(0, parseFloat($("b-advupi").value) || 0) : 0;
  if (upi > m.adv) { setStep(3, { force: true }); return toast("UPI part is more than the advance", true); }
  // Pickup par ho to bill ke baad pin poochhenge — ladka darwaze par hi hai
  const atTheDoor = NEEDS_PICKUP || !!PICKUP_BILL_CONTEXT;
  const lineItems = CART.map((i) => ({
    service: i.service, garment: i.garment, qty: i.qty,
    // Card ka daam hi hai to rate bhejte hi nahi — server card se
    // lagayega. Sirf sach mein badla hua daam override banta hai.
    ...(i.rate !== i.card ? { rate: i.rate } : {}),
    ...(i.unit === "kg" && piecesCount(i.pieces) ? { pieces: i.pieces } : {}),
  }));
  // Ek Save = ek key. Network gaya aur dobara dabaya to server wahi bill lautata
  // hai. Grahak ya bill badla to wo naya bill hai — nayi key; warna server purana
  // order lauta deta. Advance is milan mein nahi: wo badle to bill wahi hai.
  const sig = JSON.stringify([PICKED, PICKED ? "" : phone, lineItems, m.gross, m.discount, m.urg, m.dchg, GSTP, REWARD_CODE || ""]);
  if (sig !== BILL_SIG) BILL_IDEM = "";
  BILL_SIG = sig;
  if (!BILL_IDEM) BILL_IDEM = newIdem();
  await busy(btn, async () => {
    const r = await api("/bills", {
      method: "POST",
      body: {
        customer_ref: PICKED,
        customer_phone: PICKED ? "" : phone,
        customer_name: $("b-name").value.trim(),
        advance: m.adv,
        advance_method: m.adv > 0 ? PAYM : "CASH",
        advance_upi: m.adv > 0 ? upi : 0,
        payment_note: $("b-pnote").value.trim(),
        // Server dono nahi maanta — jo mode chuna hai wahi bhejte hain,
        // doosra hamesha 0. Warna "kaunsa laga" ka jawab do jagah se aata.
        discount_amount: DISC.mode === "amt" ? DISC.value : 0,
        discount_percent: DISC.mode === "pct" ? DISC.value : 0,
        coupon_code: REWARD_CODE || "",
        needs_pickup: NEEDS_PICKUP,
        fulfilment: FULFIL,
        pickup_task_code: PICKUP_BILL_CONTEXT ? PICKUP_BILL_CONTEXT.task_code : "",
        // ⚡ jo rakam screen par dikh rahi thi wahi jaati hai (0 = maaf)
        urgent: URG.on,
        urgent_charge: URG.on ? m.urg : null,
        delivery_charge: m.dchg,
        gst_percent: GSTP,
        // tareekh haath se badli ho tabhi bhejo — warna server SLA se lagata hai
        expected_delivery: BDATE_MANUAL ? $("b-date").value || null : null,
        delivery_time: $("b-time").value || "",
        notes: $("b-notes").value.trim(),
        bill_seconds: BILL_STARTED ? Math.round((Date.now() - BILL_STARTED) / 1000) : null,
        idempotency_key: BILL_IDEM,
        items: lineItems,
      },
    }).catch((e) => {
      // 409: is key par alag bill bana hua hai — wahi key phir bhejna bekaar
      if (e.status === 409) BILL_IDEM = "";
      throw e;
    });
    BILL_IDEM = "";
    KKDS.draft.clear(draftScope());
    const pickupCompleted = !!r.pickup_completed;
    const pickedNow = !pickupCompleted && r.status === "PICKED_UP";   // darwaze par naya bill
    CART = []; PICKED = ""; PREV_DUE = 0; PREV_BILLS = 0; BILL_STARTED = 0; REWARDS = []; REWARD_CODE = "";
    USUAL = []; USUAL_REF = "";
    PICKUP_BILL_CONTEXT = null;
    DISC = { mode: "amt", value: 0 };
    URG = { on: false, manual: false, amt: 0 };
    toast(
      pickupCompleted || pickedNow
        ? `${r.order_number} — bill created and pickup completed ✅`
        : r.previous_due > 0
        ? `${r.order_number} — ${money(r.grand_total)} lena hai (${money(r.previous_due)} purana)`
        : `${r.order_number} created — ${money(r.total)}`,
      false, 5000,
    );
    showBillDone(r);
    loadToday();
    if (pickupCompleted || pickedNow) loadWork({ quiet: true });
    // Pin nahi hai aur ladka grahak ke darwaze par hai: ek tap mein save.
    // Share se PEHLE — share sheet khulte hi aadmi aage badh jaata hai.
    if (canLocate() && (pickupCompleted || atTheDoor) && r.customer_ref && r.customer_has_location === false
        && DELIVERY_ROLES.includes(ME.role) && ME.can_contact && navigator.geolocation) {
      await askSaveLocation(r.customer_ref, r.customer_name);
    }
    // Grahak saamne khada hai — bill turant bhej dein
    shareBill(r.order_number, r.bill_url);
  });
}

/* Step 4 — labels, receipt, status (kk-bill.js). Purane print/share hi chalte hain. */
function showBillDone(r) {
  const kb = $("kb");
  if (!kb) return;
  STEP = 4;
  kb.dataset.step = "4";
  $("kb-steps").innerHTML = KB().steps(4, [1, 2, 3], !!ME.garment_tags);
  window.scrollTo({ top: 0 });
  KB().done($("kb-done"), {
    order: {
      number: r.order_number, customer: r.customer_name, total: r.total, paid: r.advance || 0, due: r.due,
      items: r.items || [], delivery: r.expected_delivery, delivery_time: r.delivery_time, fulfilment: r.fulfilment,
      status: r.status || (r.fulfilment === "pickup" && !r.pickup_completed ? "PICKUP_ASSIGNED" : "RECEIVED"),
    },
    tagsOn: !!ME.garment_tags, qcOn: !!ME.garment_qc, printedBy: "staff",
    api: (path, opts) => api(path, opts || {}),
    paths: {
      labels: (n) => `/garments/labels/${encodeURIComponent(n)}`,
      printEvent: (n) => `/garments/labels/${encodeURIComponent(n)}/print-event`,
      receipt: (n) => `/orders/${encodeURIComponent(n)}/receipt`,
    },
    // receipt WhatsApp par gayi ya nahi — server ka jawab, andaza nahi
    whatsapp: r.whatsapp || null, waConnected: !!ME.can_ask,
    onPrintReceipt: (n) => printBillReceipt(n),
    onShare: (n, url) => shareBill(n, url || r.bill_url),
    onTrack: ME.is_manager ? (n) => orderDetailModal(n) : null,
    onNew: () => { STEP = 1; showNewBill(); },
  });
}

/* Receipt print — wahi do raaste jo "Send the bill" mein the */
async function printBillReceipt(number) {
  let r;
  try { r = await api(`/orders/${encodeURIComponent(number)}/receipt`); }
  catch (e) { toast(e.message, true); return; }
  // Preview wahi jo kagaz par chhapega — logo, bada total, UPI QR (kk-bill.js)
  const logo = r.logo_file ? "/staff/api/media/" + encodeURIComponent(r.logo_file) : "";
  openModal(`<h3>🖨 Print ${esc(number)}</h3>
    <p class="said">${r.paper_mm}mm paper.</p>
    ${r.print_lines ? `<div class="kt-prev">${KB().thermal(r.print_lines, { logo, mm: r.paper_mm })}</div>` : ""}
    <div class="btnrow">
      <a class="btn go" href="${esc(KB().rawbt(r))}" data-act="close">📲 Bluetooth printer</a>
      <button class="btn ghost" id="m-print">🖨 Print</button>
    </div>
    <p class="hint">Bluetooth printer: install the free <b>RawBT</b> app on this Android phone once and pair the printer in it.</p>
    <div class="btnrow"><button class="btn ghost" data-act="close">Close</button></div>`);
  $("m-print").onclick = () => {
    closeModal();
    KB().printReceipt($("receipt"), r, logo);
  };
}

/* ─── team (manager) ────────────────────────────────────────────────── */

async function showTeam(opts = {}) {
  $("chips").innerHTML = "";
  backToMe();
  if (!opts.quiet) $("list").innerHTML = `<div class="empty">Loading…</div>`;
  let rows, stuck = { orders: [] }, cash = { pending: [] };
  try {
    [rows, stuck, cash] = await Promise.all([
      api("/team"),
      api("/stuck").catch(() => ({ orders: [] })),
      api("/cash/handovers").catch(() => ({ pending: [] })),
    ]);
  } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (NAV !== "team") return;
  // Aaj kisne kya kiya — sirf jo hua wahi likho, khaali "0 picked" shor hai
  const dayLine = (d) => {
    if (!d) return "";
    const bits = [
      d.picked && `${d.picked} picked`, d.washed && `${d.washed} washing`, d.ready && `${d.ready} ready`,
      d.delivered && `${d.delivered} delivered`, d.cash && `${money(d.cash)} cash`, d.upi && `${money(d.upi)} UPI`,
    ].filter(Boolean);
    return `<div class="sub mt-xs">Today: ${bits.length ? esc(bits.join(" · ")) : "nothing yet"}</div>`;
  };
  const cashBar = cash.pending.length
    ? `<div class="routebar"><span>💵 <b>${cash.pending.length}</b> cash handover${cash.pending.length > 1 ? "s" : ""} to count</span>
         <button class="btn go sm" id="t-count">Count</button></div>` : "";
  // Atka hua kaam: do din se ek hi status par — tap = poori detail
  const stuckHtml = stuck.orders.length ? `<div class="sechead">⏳ Stuck for ${stuck.hours}h+ (${stuck.orders.length})</div>
    <div class="reg">${stuck.orders.map((o) => `
      <article class="row tappable" data-stuck="${esc(o.number)}">
        <div class="spine late"></div>
        <div class="when late"><b>${o.hours >= 48 ? Math.round(o.hours / 24) + "d" : o.hours + "h"}</b><span>same</span></div>
        <div class="body">
          <div class="line1"><b>${o.urgent ? "🔴 " : ""}${esc(o.customer)}</b></div>
          <div class="sub"><span class="tag late">${esc(STATUS_WORD[o.status] || o.status)}</span>${esc(o.number)}${o.staff ? " · " + esc(o.staff) : ""}</div>
        </div>
      </article>`).join("")}</div>` : "";
  const team = rows.length ? `<div class="sechead">Team</div><div class="reg">${rows.map((s) => `
    <article class="row">
      <div class="spine ${s.open ? "deliver" : "ready"}"></div>
      <div class="when"><b>${s.open}</b><span>open</span></div>
      <div class="body">
        <div class="line1"><b>${esc(s.name)}</b><span class="amt">${s.month_points ? `⭐ ${s.month_points} · ` : ""}${s.done_24h} done</span></div>
        <div class="sub">${esc(roleLabel(s.role))} · ${esc(s.phone_masked)}${s.has_login ? "" : " · no panel login"}</div>
        ${dayLine(s.today)}
      </div>
    </article>`).join("")}</div>`
    : `<div class="empty"><b>No staff yet</b>The owner adds them from the dashboard.</div>`;
  $("list").innerHTML = cashBar + stuckHtml + team;
  if ($("t-count")) $("t-count").onclick = countCash;
  $("list").querySelectorAll("[data-stuck]").forEach((r) => { r.onclick = () => orderDetailModal(r.dataset.stuck); });
}

/* ─── phone par notification (Web Push) ─────────────────────────────── */
/* Live updates (SSE) sirf khule app tak pahunchte hain. Phone jeb mein ho
   to naya kaam, owner ka jawab ya ginne wala cash notification se aata
   hai — service worker dikhata hai, tap = app khulta hai. */
const PUSH_OK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const PUSH_NUDGE_KEY = "kk_push_nudge_off";
function b64ToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function pushState() {
  if (!PUSH_OK) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch (e) { return "off"; }
}
async function pushOn() {
  const { key } = await api("/push/key");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were not allowed — allow them in the browser settings");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const opts = { userVisibleOnly: true, applicationServerKey: b64ToBytes(key) };
  try { sub = sub || await reg.pushManager.subscribe(opts); }
  catch (e) {
    // purani chaabi wala subscription atka ho to hata kar dobara
    if (sub) await sub.unsubscribe();
    sub = await reg.pushManager.subscribe(opts);
  }
  await api("/push/subscribe", { method: "POST", body: sub.toJSON() });
}
async function pushOff() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api("/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}
/* "Test alerts": tap khud ek user gesture hai, isliye yahan vibrate pakka
   chalta hai. Phir server se ek tez notification. Band app par phone kaanpe
   ya nahi, ye Android mein Chrome ki site setting tay karti hai — wahi
   steps yahan dikhte hain (code se ise zabardasti on nahi kiya ja sakta). */
async function testAlerts() {
  try { navigator.vibrate && navigator.vibrate([400, 120, 400]); } catch (_) {}
  let note = "";
  const st = await pushState();
  if (st === "off") {
    try { await pushOn(); paintPushCard(); paintPushNudge(); } catch (e) { note = e.message; }
  }
  if ((await pushState()) === "on") {
    try {
      const r = await api("/push/test", { method: "POST" });
      note = r.sent ? "A test alert is on its way. Lock the phone now and wait a few seconds." : "This phone is not registered yet. Turn Notifications off and on again.";
    } catch (e) { note = e.message; }
  } else if (!note) {
    note = (PUSH_WORD[await pushState()] || PUSH_WORD.off)[1];
  }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  openModal(`<h3>Test alerts</h3>
    <p>${esc(note)}</p>
    ${ios ? `<p class="hint">iPhone does not let web apps vibrate. You will get the notification and its sound only.</p>` : `
    <p><b>Did the phone vibrate?</b> If the notification came but the phone did not vibrate:</p>
    <ol class="steps">
      <li>Long-press the Kwik Klin notification and tap <b>Settings</b> (or open Settings → Apps → Chrome → Notifications).</li>
      <li>Open <b>${esc(location.hostname)}</b> and turn on <b>Vibrate</b>, <b>Sound</b> and <b>Pop on screen</b> (importance: Urgent / High).</li>
      <li>Keep the phone off <b>Silent</b> and <b>Do Not Disturb</b>, and allow Chrome in Battery → no restrictions.</li>
    </ol>`}
    <div class="btnrow"><button type="button" class="btn ghost" id="pt-close">OK</button></div>`);
  $("pt-close").onclick = () => closeModal();
}

/* Login par: is phone ka subscription is aadmi ke naam (ek phone, do log) */
async function pushSync() {
  if ((await pushState()) !== "on" || Notification.permission !== "granted") return;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await api("/push/subscribe", { method: "POST", body: sub.toJSON() });
  } catch (e) { /* agli baar */ }
}
const PUSH_WORD = {
  on: ["On", "New jobs, owner replies and cash to count come to this phone."],
  off: ["Off", "Turn on to get new jobs on this phone even when the app is closed."],
  blocked: ["Blocked", "Notifications are blocked for this site — allow them in the browser settings."],
  unsupported: ["Not available", "This browser cannot show notifications. Install the app from Chrome."],
};
async function paintPushCard() {
  const box = $("p-push");
  if (!box) return;
  const st = await pushState();
  const hi = ME.is_owner && ME.ui_lang === "hi";
  const can = st === "on" || st === "off";
  box.innerHTML = `<span class="you-tile">${icon("i-bell")}</span>
    <span class="you-text"><b>${hi ? "नोटिफ़िकेशन" : "Notifications"}</b>${can ? "" : `<small>${esc(PUSH_WORD[st][1])}</small>`}</span>
    ${can ? `<button type="button" class="you-switch ${st === "on" ? "on" : ""}" id="p-push-tog" role="switch" aria-checked="${st === "on"}" aria-label="Notifications"></button>` : ""}`;
  if ($("p-push-tog")) $("p-push-tog").onclick = (e) => busy(e.currentTarget, async () => {
    if (st === "on") { await pushOff(); toast("Notifications off"); }
    else { await pushOn(); toast("Notifications on 🔔"); }
    paintPushCard(); paintPushNudge();
  });
}
/* Kaam ki screen par ek baar ki yaad — "na" bolo to phir nahi */
async function paintPushNudge() {
  let bar = $("pushbar");
  let off = false;
  try { off = localStorage.getItem(PUSH_NUDGE_KEY) === "1"; } catch (e) { /* private mode */ }
  const show = !off && NAV === "work" && (await pushState()) === "off";
  if (!bar) {
    if (!show) return;
    bar = document.createElement("div");
    bar.id = "pushbar"; bar.className = "routebar pushbar";
    bar.innerHTML = `<span>🔔 Get new jobs on your phone, even when the app is closed</span>
      <span class="pushbar-acts"><button class="btn ghost sm" id="pb-no">Later</button><button class="btn go sm" id="pb-yes">Turn on</button></span>`;
    $("latebar").insertAdjacentElement("beforebegin", bar);
    $("pb-yes").onclick = (e) => busy(e.currentTarget, async () => { await pushOn(); toast("Notifications on 🔔"); bar.hidden = true; });
    $("pb-no").onclick = () => { try { localStorage.setItem(PUSH_NUDGE_KEY, "1"); } catch (e) { /* */ } bar.hidden = true; };
  }
  bar.hidden = !show;
}

/* ─── mere points (grahak ki rating se) ─────────────────────────────── */
const RATING_WORD = { good: "⭐ Excellent", mid: "🙂 Okay", bad: "😞 Needs work" };
async function paintPoints() {
  const box = $("p-points");
  if (!box) return;
  let d;
  try { d = await api("/points"); } catch (e) { box.hidden = true; return; }
  const recent = d.recent.map((r) => `<div class="od-sub"><span>${esc(r.order)} · ${esc(r.at)}</span>
    <span>${esc(RATING_WORD[r.rating] || r.rating)}${r.points ? ` · +${r.points}` : ""}</span></div>`).join("");
  box.innerHTML = `<div class="you-pts"><b>${d.month_points}</b><small>My points this month</small></div>
    <div class="you-marks"><span><b>${d.good}</b>excellent</span><span><b>${d.mid}</b>okay</span><span><b>${d.bad}</b>needs work</span></div>
    ${d.reward_note ? `<p class="you-note">🎁 ${esc(d.reward_note)}</p>` : ""}
    ${recent ? `<details class="od-block"><summary><b>Recent ratings</b></summary>${recent}</details>` : ""}`;
}

/* ─── main (profile) ────────────────────────────────────────────────── */

/* ─── You tab: plan ke hisaab se roop (you.css), sab roles ke liye ek hi dhancha ── */
function youHero(sub, badge) {
  const first = String(ME.name || "?").trim().charAt(0).toUpperCase();
  return `<div class="you-hero"><div class="you-av">${esc(first)}</div>
    <div class="you-who"><b>${esc(ME.name)}</b><span>${esc(sub)}</span></div><em>${esc(badge)}</em></div>`;
}
function youRow(ic, label, attrs = "", sub = "", cls = "") {
  return `<button type="button" class="you-row ${cls}" ${attrs}><span class="you-tile">${icon(ic)}</span>
    <span class="you-text"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
    ${cls === "danger" ? "" : `<i aria-hidden="true">›</i>`}</button>`;
}
function youGroup(title, rows) {
  const on = rows.filter(Boolean);
  return on.length ? `<div class="you-gt">${esc(title)}</div><div class="you-grp">${on.join("")}</div>` : "";
}
function showMe() {
  $("chips").innerHTML = "";
  const plan = ME.plan_validity && window.KKPlanRing ? `<div class="you-card">${KKPlanRing.html(ME.plan_validity, "en")}</div>` : "";
  const points = `<div class="you-card" id="p-points"></div>`;
  const work = youGroup("Work", [
    ME.can_expense ? youRow("i-expense", "Add expense", 'data-go="exp"') : "",
    canTeam() ? youRow("i-users", "Team", 'data-go="team"', "Kisne kya kiya") : "",
  ]);
  const sub = ME.plan_validity ? `${roleLabel(ME.role)} · ${ME.shop || ""}` : `${ME.shop || ""} · ${ME.phone}`;
  $("list").innerHTML = `<div class="you you-${esc(ME.plan_tier || "starter")}">
    ${youHero(sub, ME.plan_validity ? ME.plan : roleLabel(ME.role))}
    <div class="you-body">
      ${plan ? plan + work + points : points + work}
      ${youGroup("App", [
        ME.viewing_as ? "" : `<div class="you-row" id="p-push"></div>`,
        ME.viewing_as ? "" : youRow("i-bell", "Test alerts", 'id="p-push-test"', "Check that this phone vibrates for new work"),
        canInstall() ? youRow("i-upload", "Install the app on your phone", 'id="p-install"') : "",
      ])}
      ${youGroup("Account", [
        youRow("i-settings", "Change password", 'id="p-pw"'),
        youRow("i-logout", "Logout", 'id="p-out"', "", "danger"),
      ])}
    </div></div>`;
  paintPushCard();
  paintPoints();
  $("list").querySelectorAll("[data-go]").forEach((b) => { b.onclick = () => go(b.dataset.go); });
  $("p-pw").onclick = changePw;
  if ($("p-install")) $("p-install").onclick = installApp;
  if ($("p-push-test")) $("p-push-test").onclick = testAlerts;
  $("p-out").onclick = async () => {
    try { await api("/logout", { method: "POST" }); } catch (e) { /* cookie waise bhi jayegi */ }
    // Maalik: dashboard ka login bhi, warna agla khulna usi se wapas andar le aata
    if (ME.is_owner && !ME.viewing_as) {
      try { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); } catch (e) { /* offline */ }
    }
    location.reload();
  };
}

function changePw(forced = false) {
  openModal(`<h3>${forced ? "Set your own password" : "Change password"}</h3>
    ${forced ? `<p class="hint">The owner gave you a temporary password. Choose your own to start work.</p>` : ""}
    ${ME.has_password === false ? "" : `<label for="p-old">${forced ? "Temporary password" : "Current password"}</label>
    <div class="pwrap">
      <input id="p-old" type="password" autocomplete="current-password">
      <button type="button" class="eye" data-eye="p-old" aria-label="Show password">👁</button>
    </div>`}
    <label for="p-new">New password (at least 8)</label>
    <div class="pwrap">
      <input id="p-new" type="password" autocomplete="new-password">
      <button type="button" class="eye" data-eye="p-new" aria-label="Show password">👁</button>
    </div>
    <div class="err" id="p-err"></div>
    <div class="btnrow">
      ${forced ? "" : `<button class="btn ghost" data-act="close">Not now</button>`}
      <button class="btn go" id="m-ok">Save</button>
    </div>`);
  document.querySelectorAll("[data-eye]").forEach((b) => {
    b.onclick = () => {
      const i = $(b.dataset.eye);
      i.type = i.type === "password" ? "text" : "password";
      b.textContent = i.type === "password" ? "👁" : "🙈";
    };
  });
  $("m-ok").onclick = async () => {
    const oldp = $("p-old")?.value || "", newp = $("p-new").value;
    if (newp.length < 8) { $("p-err").textContent = "Use at least 8 characters."; return; }
    try {
      await api("/password", { method: "POST", body: { old_password: oldp, new_password: newp } });
      closeModal(); toast("Password changed ✅");
      const wasForced = ME.must_change_password;
      ME.must_change_password = false; ME.has_password = true; $("pwbanner").hidden = true;
      if (wasForced) { BOOT = null; await start(); }      // ab asli boot: kaam, live, push
    } catch (e) { $("p-err").textContent = e.message; }
  };
}

/* ─── photo ─────────────────────────────────────────────────────────── */
/*
 * Camera ki photo 4-12 MB ki hoti hai. Usse jaisi ki taisi bhejna hi wo
 * "app atak gayi" wali dikkat thi: 2G/3G par do-teen minute aur screen par
 * kuch bhi nahi. Yahan wo phone par hi chhoti ho jaati hai — 1600px JPEG,
 * 8 MB se ~300 KB. Saboot ke liye itni saaf kaafi hai (daag, phata hua,
 * kitne peace — sab dikhta hai).
 *
 * imageOrientation: "from-image" — bina iske phone ki photo server par
 * tedhi pahunchti hai, kyunki canvas EXIF ka ghumaav khud nahi lagata.
 */
const PHOTO_MAX = 1600, PHOTO_Q = 0.72, PHOTO_SKIP = 400 * 1024;

async function shrinkPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  if (file.size <= PHOTO_SKIP) return file;
  if (typeof createImageBitmap !== "function") return file;
  let bmp = null, canvas = null;
  try {
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { bmp = await createImageBitmap(file); }   // purana browser
    const scale = Math.min(1, PHOTO_MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", PHOTO_Q));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch (e) {
    return file;      // kuch bhi kaam na kare to asli file — photo rukti nahi
  } finally {
    // Chhote phone par memory turant chhodna zaroori hai, warna doosri
    // photo par browser tab hi maar deta hai.
    if (bmp && bmp.close) bmp.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/* fetch upload ka progress nahi deta — isliye XHR. Progress hi wo cheez
   hai jo "atak gaya" ko "chal raha hai" bana deti hai. */
function uploadWithProgress(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* khali */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data && data.detail) || `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network problem — check your signal"));
    xhr.ontimeout = () => reject(new Error("Took too long — try again on better signal"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(form);
  });
}

const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");

/* kind: general | damage (kapda pehle se kharab — owner ko alag khabar) |
   proof (grahak ko diye, deliver ke baad) */
const PHOTO_COPY = {
  general: ["add a photo", "Proof of the item\u2019s condition — a stain, a tear, or how many pieces. If anyone later says it was not like that, this is the answer.", "e.g. 12 pieces in the bag"],
  damage: ["mark damage", "Found a stain, tear, missing button or faded colour? Take a photo now — before washing. The customer gets this photo on WhatsApp and on their bill too, so nobody blames the shop later.", "e.g. stain on the collar, button missing"],
  proof: ["delivery photo", "A photo of the clothes handed over at the door. If the customer later says they did not get them, this is the answer.", "e.g. handed to the guard"],
};
function askPhoto(number, kind = "general") {
  const [title, said, hint] = PHOTO_COPY[kind] || PHOTO_COPY.general;
  openModal(`<h3>${esc(number)} — ${title}</h3>
    <p class="said">${esc(said)}</p>
    <input id="ph-file" type="file" accept="image/*" capture="environment">
    <div id="ph-prev" hidden></div>
    <label for="ph-note">Note (optional)</label>
    <input id="ph-note" type="text" maxlength="150" placeholder="${esc(hint)}">
    <div id="ph-bar" class="bar" hidden><i></i></div>
    <div class="err" id="ph-err"></div>
    <div class="btnrow">
      <button class="btn ghost" data-act="close">Not now</button>
      <button class="btn go" id="m-ok">Send</button>
    </div>`);

  let ready = null, preparing = false;

  // Photo chunte hi chhoti karna shuru — bhejne ke waqt tak taiyar milegi
  $("ph-file").onchange = async () => {
    const f = $("ph-file").files[0];
    ready = null;
    if (!f) { $("ph-prev").hidden = true; return; }
    preparing = true;
    $("ph-err").textContent = "";
    $("ph-prev").hidden = false;
    $("ph-prev").textContent = "Getting the photo ready…";
    const small = await shrinkPhoto(f);
    ready = small; preparing = false;
    $("ph-prev").textContent = small.size < f.size
      ? `Ready — ${kb(f.size)} made smaller to ${kb(small.size)}` : `Ready — ${kb(small.size)}`;
  };

  $("m-ok").onclick = async (e) => {
    const btn = e.currentTarget;
    const chosen = $("ph-file").files[0];
    if (!chosen) { $("ph-err").textContent = "Choose a photo first."; return; }
    $("ph-err").textContent = "";
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span>';
    const bar = $("ph-bar"); bar.hidden = false;
    const fill = bar.querySelector("i"); fill.style.width = "2%";
    try {
      // choose ke turant baad Send dabaya ho to yahin ruk kar taiyar karo
      while (preparing) await new Promise((r) => setTimeout(r, 60));
      const file = ready || (await shrinkPhoto(chosen));
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("note", $("ph-note").value.trim());
      fd.append("kind", kind);
      await uploadWithProgress(
        `/staff/api/orders/${encodeURIComponent(number)}/photo`, fd,
        (p) => { fill.style.width = Math.max(2, Math.round(p * 100)) + "%"; },
      );
      closeModal();
      toast(kind === "damage" ? "Damage noted — owner told, photo sent to the customer" : "Photo added — the owner has been told");
    } catch (err) {
      // Fail hone par kaam khatam nahi: wahi photo, ek tap par dobara.
      bar.hidden = true;
      $("ph-err").textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = "Try again";
      return;
    }
    btn.disabled = false; btn.innerHTML = label;
  };
}

/* ─── live updates ──────────────────────────────────────────────────── */
/*
 * Manager ne kaam badla, owner ne jawab diya, kisi ne paisa jama kiya —
 * wo staff ke phone par turant dikhna chahiye, bina refresh ke.
 *
 * SSE, WebSocket nahi: khabar sirf server se phone tak jaati hai, aur
 * connection tootne par browser khud dobara jud jaata hai — jo mobile
 * network par sabse zaroori baat hai. Screen chhupi ho to kuch nahi
 * maangte: chalta hua stream pichhe se battery aur data dono khaata hai.
 */
let LIVE = null, LIVE_TIMER = null, LIVE_POLL = null, LIVE_SEEN = 0;
const SILENCE_MS = 60000;   // server har 20s par dhadkan bhejta hai

const liveProven = () => LIVE_SEEN > 0 && Date.now() - LIVE_SEEN < SILENCE_MS;
const liveSeen = () => { LIVE_SEEN = Date.now(); };

/* Pehle har tick 5 request bhejta tha (/route, /tasks, /today,
   /notifications, /tasks?limit=1) — dukaan mein kahin bhi kuch hua to har
   phone par. Ab ek /boot, wahi jo app khulte waqt aata hai, aur usi ke
   tukde BOOT raste se list/hisaab/ghanti mein jaate hain. */
let LAST_TICK = 0;
const TICK_GAP_MS = 4000;
let TICKING = false;
async function tick() {
  if (document.hidden) return;
  // Dheemi net par pichla tick abhi chal raha ho to doosra saath na chale
  if (TICKING) return;
  // Apne hi kaam ke baad screen abhi taaza hui hai — SSE ki goonj par dobara nahi
  if (Date.now() - LOCAL_REFRESH < 3000) return;
  LAST_TICK = Date.now();
  TICKING = true;
  try { BOOT = await api("/boot"); ME = BOOT.me; }
  catch (e) { BOOT = null; }
  finally { TICKING = false; }
  if (BOOT && BOOT.tasks) setTasksBadge(BOOT.tasks.total || 0);
  // Pichhe se aaya refresh list ko "Loading…" se NAHI badalta —
  // jo card aadmi padh raha hai wo uske haath se nikal jaata tha.
  refreshCurrent({ quiet: true });
  loadToday();
  loadBell();
  if (BOOT) BOOT.route = BOOT.tasks = null;   // dusre tab par bacha hissa purana na pade
  if (!LIVE) startLive();     // stream toot gayi thi to dobara jodo
}
function soon() {
  clearTimeout(LIVE_TIMER);
  // 400ms ka jod (ek saath aaye events ek baar) + do tick ke beech kam se kam 4s
  const wait = Math.max(400, TICK_GAP_MS - (Date.now() - LAST_TICK));
  LIVE_TIMER = setTimeout(tick, wait);
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) soon(); });

function startLive() {
  // Poochhna hamesha chalu — bas jab tak stream khud ko sabit kar rahi hai
  // tab tak chup. Pehle fallback tabhi chalta tha jab onerror teen baar
  // aaye, par 401 par browser dobara judta hi nahi (onerror ek hi baar) —
  // to na stream chalti thi na polling.
  if (!LIVE_POLL) {
    LIVE_POLL = setInterval(() => { if (!liveProven()) tick(); }, 30000);
  }
  if (!("EventSource" in window) || LIVE) return;
  try { LIVE = new EventSource("/staff/api/events", { withCredentials: true }); }
  catch (e) { return; }
  LIVE.addEventListener("ready", liveSeen);
  LIVE.addEventListener("ping", liveSeen);
  LIVE.onmessage = () => { liveSeen(); soon(); };
  LIVE.onerror = (e) => {
    // Source event se, `LIVE` se nahi — neeche wo null ho jaata hai.
    const src = e && e.target;
    if (src && src.readyState === EventSource.CLOSED) {
      // Browser khud nahi jodega (401/5xx) — agla poll dobara koshish karega
      LIVE_SEEN = 0; LIVE = null;
    }
  };
}

const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
/* ─── phone par install ─────────────────────────────────────────────── */
let INSTALL_EVT = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  INSTALL_EVT = e;
  $("installbar").hidden = false;
});
/* Chrome ka event hamesha nahi aata (ek baar mana kiya, ya pehle install tha), isliye
   pakka button: event ho to seedha install, warna phone ke hisaab se tareeka. */
async function installApp() {
  if (INSTALL_EVT) {
    INSTALL_EVT.prompt();
    await INSTALL_EVT.userChoice;
    INSTALL_EVT = null;
    $("installbar").hidden = true;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hi = !ME || ME.ui_lang === "hi";
  const steps = ios
    ? (hi ? "Safari में <b>Share</b> ⬆ दबाएँ, फिर <b>Add to Home Screen</b>." : "In Safari tap <b>Share</b> ⬆, then <b>Add to Home Screen</b>.")
    : (hi ? "Chrome में ऊपर <b>⋮</b> दबाएँ, फिर <b>Install app</b> या <b>Add to Home screen</b>. पहले से इंस्टॉल है तो फ़ोन पर Kwik Klin का आइकन देखें."
      : "In Chrome tap <b>⋮</b> at the top, then <b>Install app</b> or <b>Add to Home screen</b>. If it is already installed, look for the Kwik Klin icon on your phone.");
  openModal(`<h3>📲 ${hi ? "ऐप इंस्टॉल करें" : "Install the app"}</h3><p class="said">${steps}</p>
    <div class="btnrow"><button class="btn go wide" data-act="close">OK</button></div>`);
}
const canInstall = () => !isStandalone;
window.canInstall = canInstall;
$("btn-install").onclick = installApp;
$("lg-install").hidden = !canInstall();
$("lg-install").onclick = installApp;
window.addEventListener("appinstalled", () => { INSTALL_EVT = null; $("installbar").hidden = true; });

// iPhone/iPad Safari "Install" ka event deta hi nahi — wahan tareeka likh
// kar batate hain. Ek baar "OK" dabaya to us phone par dobara nahi.
const IOS_HINT_KEY = "kk_staff_ios_hint_seen";
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS "desktop" UA
let iosHintSeen = false;
try { iosHintSeen = localStorage.getItem(IOS_HINT_KEY) === "1"; } catch (e) { /* private mode */ }
if (isIOS && !isStandalone && !iosHintSeen) $("iosinstall").hidden = false;
$("ios-hide").onclick = () => {
  $("iosinstall").hidden = true;
  try { localStorage.setItem(IOS_HINT_KEY, "1"); } catch (e) { /* private mode */ }
};
$("boot-retry").onclick = retryBoot;

// Service worker sirf HTTPS (ya localhost) par chalta hai — wahi install
// aur offline shell deta hai. Na chale to bhi app chalti hai.
// scope "/staff" (bina slash): default "/staff/" hota, jo "/staff" page ko
// hi nahi gherta — tab na offline shell chalta tha, na serviceWorker.ready
// kabhi poora hota tha. Purana "/staff/" wala registration hata dete hain.
// Solo ka app /solo par — apna SW aur scope (install par apna naam/icon)
const APP_PATH = location.pathname.startsWith("/solo") ? "/solo" : "/staff";
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(APP_PATH + "/sw.js", { scope: APP_PATH }).catch(() => { /* app phir bhi chalegi */ });
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => {
    if (new URL(r.scope).pathname === "/staff/") r.unregister();
  })).catch(() => {});
}

start();


/* ─── urgent staff escalation: foreground banner + best-effort vibration ─── */
(() => {
  const seenKey = "kk_urgent_alert_seen_v1";
  let currentUrgent = null;
  const isUrgentAlert = (d) => {
    const title = String(d && d.title || "");
    const body = String(d && d.body || "");
    return !!(d && (d.urgent === true || d.priority === "urgent" ||
      /urgent|do this now|delivery deadline|turant|तुरंत/i.test(title + " " + body)));
  };
  // Banner khula rahe to har 12 sec phir kaanpe (5 baar tak), jab tak staff
  // OK / Open na dabaye. Browser tabhi vibrate karne deta hai jab is page par
  // pehle ek tap ho chuka ho — app kholne ke baad wo ho hi jaata hai.
  let buzzTimer = null;
  const stopBuzz = () => { clearInterval(buzzTimer); buzzTimer = null; try { navigator.vibrate && navigator.vibrate(0); } catch (_) {} };
  const buzzOnce = () => {
    try {
      if (navigator.vibrate && !document.hidden) navigator.vibrate([500, 150, 500, 150, 500, 150, 900]);
    } catch (_) { /* vibration is optional and browser-controlled */ }
  };
  const vibrateUrgent = () => {
    stopBuzz();
    buzzOnce();
    let n = 0;
    buzzTimer = setInterval(() => {
      const box = $("urgent-alert");
      if (!box || box.hidden || ++n > 5) { stopBuzz(); return; }
      buzzOnce();
    }, 12000);
  };
  const showUrgentAlert = (d) => {
    if (!isUrgentAlert(d)) return;
    const id = String(d.id || d.tag || (String(d.title || "") + "|" + String(d.body || ""))).slice(0, 180);
    let seen = [];
    try { seen = JSON.parse(sessionStorage.getItem(seenKey) || "[]"); } catch (_) {}
    if (seen.includes(id)) return;
    seen = [...seen.slice(-19), id];
    try { sessionStorage.setItem(seenKey, JSON.stringify(seen)); } catch (_) {}
    currentUrgent = { ...d, id };
    const box = $("urgent-alert");
    if (!box) return;
    $("urgent-alert-title").textContent = String(d.title || "Urgent task assigned").replace(/^🚨?\s*/u, "");
    $("urgent-alert-detail").textContent = String(d.body || "Please check the task immediately.").slice(0, 180);
    box.hidden = false;
    vibrateUrgent();
    try { box.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (_) {}
  };
  if ($("urgent-alert-dismiss")) $("urgent-alert-dismiss").addEventListener("click", () => {
    stopBuzz();
    if ($("urgent-alert")) $("urgent-alert").hidden = true;
  });
  if ($("urgent-alert-open")) $("urgent-alert-open").addEventListener("click", () => {
    stopBuzz();
    if ($("urgent-alert")) $("urgent-alert").hidden = true;
    try { go("work"); } catch (_) { window.location.href = "/staff"; }
    try { if (currentUrgent && currentUrgent.url) window.location.href = currentUrgent.url; } catch (_) {}
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type === "KK_URGENT_ALERT") showUrgentAlert(data.payload || {});
    });
  }
  window.addEventListener("pageshow", () => {
    // No auto-alert for old work on refresh; only fresh push messages escalate.
  });
})();
