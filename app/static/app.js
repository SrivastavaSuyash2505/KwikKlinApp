/* Kwik Klin — Laundry Pro dashboard logic.
   All UI strings live in T (single place to change wording). */

"use strict";

// Capture the query string before auth/navigation code can rewrite the URL.
const qs = new URLSearchParams(location.search);

if (new URLSearchParams(location.search).get("probe")) {
  document.title = "PROBE-BOOT";
  window.addEventListener("error", (e) => {
    document.title = "JSERR: " + e.message + " @line " + e.lineno;
  });
}

/* ============================= strings ============================= */
const T = {
  saved: "Saved", deleted: "Deleted", sent: "Sent", created: "Created",
  errGeneric: "Something went wrong", tryAgain: "Try again",
  confirmDelete: "Delete this? This cannot be undone.",
  noData: "Nothing here yet",
  loading: "Loading…",
  billCreated: "Bill created",
  paymentSaved: "Payment recorded",
  statusUpdated: "Status updated",
  dateUpdated: "Delivery date updated",
  reminderSent: "Payment reminder sent",
  windowClosed: "24h window is closed — the customer must message first",
};

const STATUS_LABEL = {
  RECEIVED: "New", PICKUP_ASSIGNED: "Pickup assigned", PICKED_UP: "Picked up",
  IN_WASH: "Washing", IN_DRY: "Drying", IN_IRON: "Ironing",
  READY: "Ready", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered",
  ON_HOLD: "On hold", CANCELLED: "Cancelled",
};
// a status we forgot to name must still read as itself, never "undefined"
const statusName = (s) => STATUS_LABEL[s] || String(s || "").replace(/_/g, " ").toLowerCase();
const STATUS_SEQ = ["RECEIVED", "IN_WASH", "IN_DRY", "IN_IRON", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
const SEGMENT_LABEL = {
  new: "New customers", active_regular: "Active regulars", at_risk: "At risk", selected: "Selected customers",
  lapsed: "Lapsed (60–120d)", lost: "Lost (120d+)", high_value: "High value",
  normal_late: "Late vs usual rhythm",
  outstanding_dues: "Has dues", all_active: "All eligible customers", active_orders: "Customers with active orders",
};

/* ============================= core ============================= */
const DELIVERY_HEAVY_WORDS = [
  "blanket", "kambal", "razai", "quilt", "curtain", "parda",
  "carpet", "sofa", "saree", "lehenga", "sherwani"
];
function nbAutoDeliveryDate() {
  const urgent = NB_URG && NB_URG.on;
  if (urgent) return isoInDays(urgCfg().days);
  const holidays = new Set((SETTINGS_CACHE.delivery_holidays || []).map(String));
  const heavy = realLines().some(([l]) =>
    DELIVERY_HEAVY_WORDS.some(w => String(l.service || "").toLowerCase().includes(w))
  );
  const days = Number(
    heavy ? SETTINGS_CACHE.delivery_heavy_days : SETTINGS_CACHE.delivery_normal_days
  ) || (heavy ? 5 : 4);
  const d = new Date();
  let left = Math.max(1, days);
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() === 0 || holidays.has(iso)) continue;
    left -= 1;
  }
  return isoDateLocal(d);
}
function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}
function apiTimeout(ms) {
  return (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
}
async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  let r;
  // Atka hua 4G socket button ko hamesha "saving…" par chhod deta tha: ab
  // hadd hai (upload ko zyada). Caller apna signal de to wahi chalta hai.
  const signal = opts.signal || apiTimeout(opts.body instanceof FormData ? 120000 : 45000);
  // Network gaya to browser "Failed to fetch" deta hai — owner ko wo
  // nahi, seedhi baat dikhe. (Koi code is error ke shabd par tika nahi.)
  try { r = await fetch(path, Object.assign({}, opts, { headers, signal })); }
  catch (e) {
    if (e && e.name === "TimeoutError") throw new Error("The server is taking too long. Check if it saved before you try again.");
    if (e && e.name === "AbortError" && opts.signal) throw e;
    throw new Error(navigator.onLine ? "Can't reach the server — try again" : "No internet — check your signal and try again");
  }
  if (r.status === 401) { location.href = "/join#login"; throw new Error("Please sign in"); }
  if (!r.ok) {
    let d = T.errGeneric;
    try { d = (await r.json()).detail || d; } catch (e) {}
    const err = new Error(typeof d === "string" ? d : JSON.stringify(d));
    err.status = r.status;
    throw err;
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

/* helpers */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* Junk customer records exist ("." / "—" / blank names). Anywhere a name is
   shown, fall back to the phone number instead of a dot or a blank. */
const JUNK_NAME = /^[\s.\-—–_,'"]*$/;
const displayName = (name, phone) => {
  const n = String(name || "").trim();
  return JUNK_NAME.test(n) ? (phone || "—") : n;
};
const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const money = (v) => "₹" + inr.format(Number(v || 0));
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
/* Clock only. A chat bubble under a "05 Aug" day header that also says
   "05 Aug" tells you nothing — you want the time. */
const fmtClock = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const dayName = (iso) => {
  const d = new Date(iso), now = new Date();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "";
};
const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const named = dayName(iso);
  if (named === "Today") return fmtClock(iso);
  if (named === "Yesterday") return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
function toast(msg, err = false, ms = 0) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), ms || (err ? 5000 : 2600));
}
const skeleton = (n = 4) => Array.from({ length: n }, () => '<div class="skel skelrow"></div>').join("");
const emptyBox = (msg, ico = "") => `<div class="empty">${ico ? `<div class="ico">${ico}</div>` : ""}${esc(msg)}</div>`;
const errBox = (msg, retry) => `<div class="errbox">⚠️ ${esc(msg)}<br><br><button class="btn ghost" onclick="${retry}()">${T.tryAgain}</button></div>`;
/* Android/phone back: popup pehle band ho, phir section badle (hash), aur
   pehle section par "Exit?" poochhe — seedha app band na ho. */
/* Lock background scrolling while any modal/drawer is open; restore exact position on close. */
let KK_SCROLL_LOCK_Y = 0;
let KK_SCROLL_LOCKED = false;
function syncOverlayScrollLock() {
  const active = !!document.querySelector(".overlay.open, #modal-ov.open, .drawer.open, #drawer.open, .modal-ov.open");
  const root = document.documentElement;
  if (active && !KK_SCROLL_LOCKED) {
    KK_SCROLL_LOCK_Y = window.scrollY || window.pageYOffset || 0;
    root.style.setProperty("--kk-scroll-lock-top", "-" + KK_SCROLL_LOCK_Y + "px");
    root.classList.add("overlay-scroll-locked");
    KK_SCROLL_LOCKED = true;
  } else if (!active && KK_SCROLL_LOCKED) {
    root.classList.remove("overlay-scroll-locked");
    root.style.removeProperty("--kk-scroll-lock-top");
    KK_SCROLL_LOCKED = false;
    window.scrollTo(0, KK_SCROLL_LOCK_Y);
  }
}
if (typeof MutationObserver !== "undefined") {
  const kkOverlayObserver = new MutationObserver(syncOverlayScrollLock);
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".overlay, #modal-ov, .drawer, #drawer, .modal-ov").forEach((node) => {
      kkOverlayObserver.observe(node, { attributes: true, attributeFilter: ["class"] });
    });
    syncOverlayScrollLock();
  }, { once: true });
}
const modalOpen = () => $("modal-ov") && $("modal-ov").classList.contains("open");
function openModal(html) {
  if (!modalOpen() && !(history.state && history.state.kk === "modal")) history.pushState({ kk: "modal" }, "", location.href);
  $("modal-body").innerHTML = html;
  $("modal-ov").classList.add("open");
  syncOverlayScrollLock();
  // Phone par input par focus = keyboard apne aap khul jaata; wahan button par
  const touch = window.KKBill && KKBill.touch();
  const first = $("modal-body").querySelector(touch ? "button" : "input, select, textarea, button");
  if (first) first.focus({ preventScroll: true });
}
function closeModal() {
  $("modal-ov").classList.remove("open");
  syncOverlayScrollLock();
  // Explicit close must consume the modal history state; otherwise a later
  // mobile back gesture can navigate away from the dashboard unexpectedly.
  if (history.state && history.state.kk === "modal") {
    history.replaceState({ kk: "nav" }, "", location.href);
  }
}
let EXITING = false;
function askExit() {
  history.pushState({ kk: "nav" }, "", location.href);
  openModal(`<h3>Exit the app?</h3>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">No</button>
    <button class="btn" onclick="EXITING=true;history.go(-3);setTimeout(()=>{try{window.close()}catch(e){}},400)">Yes, exit</button></div>`);
}
window.addEventListener("popstate", () => {
  const st = history.state || {};
  if (modalOpen()) { closeModal(); if (st.kk !== "root") return; }
  if (st.kk === "root") { if (EXITING) { history.back(); return; } askExit(); }
});
if (!(history.state && history.state.kk)) {
  history.replaceState({ kk: "root" }, "", location.href);
  history.pushState({ kk: "nav" }, "", location.href);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("modal-ov") && $("modal-ov").classList.contains("open")) closeModal();
});
function confirmDialog(text, onYes) {
  openModal(`<h3>Confirm</h3><p>${esc(text)}</p>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn danger" id="cf-yes">Yes, continue</button></div>`);
  $("cf-yes").onclick = () => { closeModal(); onYes(); };
}
async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try { await fn(); } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.innerHTML = old;
}
function dlCsvClient(filename, header, rows) {
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = filename; a.click();
}

/* ---------------------------------------------------------- live updates
 *
 * Ajit ne phone se bill banaya aur owner ke khule hue dashboard par wo
 * dikha hi nahi — kyunki page ne dobara poocha hi nahi tha. Ab server
 * bata deta hai, aur page sirf WAHI hissa taaza karta hai jo abhi screen
 * par hai.
 *
 * Teen jaan-boojh kar liye gaye faisle:
 *
 * 1. **Server sirf ISHARA bhejta hai** ("order badla"), poora data nahi.
 *    Page apne hisaab se maangta hai — isliye kisi ka data galat
 *    connection par ja hi nahi sakta.
 * 2. **Refresh debounced hai.** Ek saath dus ishare aayen (bulk kaam) to
 *    ek hi refresh chalta hai, dus nahi.
 * 3. **SSE na chale to bhi kaam chalta rahe.** Purana browser, koi proxy
 *    jo stream kaat de — tab har 45 second par chup-chaap refresh. Dheema
 *    sahi, par owner ko kabhi purana data nahi dikhega.
 */
let LIVE = null, LIVE_TIMER = null, LIVE_FALLBACK = null, LIVE_SEEN = 0;

/* Stream par AAKHRI baar kab kuch aaya — event ho ya dhadkan (ping).
   Server har 20 second par dhadkan bhejta hai, isliye 60 second ki chuppi
   ka matlab hai stream sach mein mar chuki hai. */
const LIVE_SILENCE_MS = 60000;
function liveIsProven() { return LIVE_SEEN > 0 && Date.now() - LIVE_SEEN < LIVE_SILENCE_MS; }
function liveSeen() { LIVE_SEEN = Date.now(); }

function refreshCurrentSection() {
  // Sirf khuli hui screen — background mein baaki sab maangna bekaar hai
  if (CURRENT === "dashboard") loadDashboard({ quiet: true });
  else if (CURRENT === "business") loadBusinessManager();
  else if (CURRENT === "tasks") loadTasks();
  else if (CURRENT === "bills") loadBills();
  else if (CURRENT === "inbox") loadThreads();
}

function liveRefreshSoon() {
  clearTimeout(LIVE_TIMER);
  LIVE_TIMER = setTimeout(refreshCurrentSection, 400);
}

/* Poochhna HAMESHA chalu rehta hai — bas jab tak stream khud ko sabit kar
   rahi hai tab tak chup baitha rehta hai.
 *
 * Pehle ye ulta tha aur wahi ek line owner ke "phone se bana bill dashboard
 * par aata hi nahi" wali shikayat ki jad thi: fallback tabhi chalu hota tha
 * jab `onerror` TEEN baar aa jaye. Par EventSource ka niyam ye hai ki
 * 401/403 jaise jawab par browser connection band karke DOBARA JUDTA HI
 * NAHI — yani `onerror` sirf EK baar aata hai. Ginti kabhi teen tak
 * pahunchti hi nahi thi, isliye na stream chalti thi na polling: khula hua
 * dashboard hamesha ke liye purana ho jaata tha. Aur ye rozmarra ki baat
 * thi — tunnel ka URL badalte hi session cookie chali jaati hai aur page
 * purani admin key par chalta rehta hai, jise EventSource bhej hi nahi
 * sakta. */
function startPollingFallback() {
  if (LIVE_FALLBACK) return;
  LIVE_FALLBACK = setInterval(() => {
    if (document.hidden) return;      // chhupi tab ke liye data maangna bekaar
    if (liveIsProven()) return;       // stream zinda hai — usi se aa jayega
    refreshCurrentSection();
  }, 30000);
}

function startLiveUpdates() {
  startPollingFallback();             // pehle jaal, phir chhalaang
  if (!("EventSource" in window) || LIVE) return;
  try {
    LIVE = new EventSource("/admin/api/events", { withCredentials: true });
  } catch (e) {
    return;
  }
  // `onopen` sirf itna kehta hai ki header aa gaye. Asli saboot ye hai ki
  // stream par kuch GUZRA — "ready", dhadkan, ya koi khabar. Beech ka koi
  // proxy stream ko buffer kar de to headers aa jaate hain par kuch aata
  // nahi; us haalat mein bhi polling chalti rehni chahiye.
  LIVE.addEventListener("ready", liveSeen);
  LIVE.addEventListener("ping", liveSeen);
  LIVE.onmessage = () => { liveSeen(); liveRefreshSoon(); };
  LIVE.onerror = (e) => {
    // CLOSED = browser ne haar maan li (401/403 par wo dobara judta hi
    // nahi). Us waqt intezaar karne ka koi matlab nahi — polling hi ab
    // ekmatra rasta hai. Baaki haalat mein browser khud dobara judta hai.
    // Source event se lete hain, `LIVE` se nahi: neeche wo null ho jaata hai.
    const src = e && e.target;
    if (src && src.readyState === EventSource.CLOSED) {
      LIVE_SEEN = 0;
      LIVE = null;
      refreshCurrentSection();        // jitna peeche reh gaye, abhi pura karo
    }
  };
  // Tab wapas dikhi — jitni der chhupi thi utni der ka farak ek baar mein
  // poora kar lo (mobile browser chhupe tab ka stream rok dete hain).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) liveRefreshSoon();
  });
}

async function kkLogout() {
  // dono cheezein hatao: purani admin key AUR asli session

  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  } catch (e) { /* offline — cookie waise bhi expire ho jayegi */ }
  // Isi phone par Solo / staff app ka login bhi (kk_staff, path /staff) — warna
  // admin se nikal kar bhi app khulte hi purani dukaan mein andar rehta
  try {
    await fetch("/staff/api/logout", { method: "POST", credentials: "same-origin" });
  } catch (e) { /* offline */ }
  location.href = "/join#login";
}

/* login */
/* Session pehle, key baad mein. Dono na hon to login page par bhej do.
 *
 * Ek farak jo bahut maayne rakhta hai: "server ne kaha tum logged in nahi
 * ho" aur "server tak baat hi nahi pahunchi" — ye do alag baatein hain.
 * Pehle dono ka ek hi ilaaj tha, seedha /#login. Isliye phone par har
 * refresh par, jab pehli request signal ki wajah se gir jaati thi, login
 * page ek pal ko jhalak kar chala jaata tha — jabki session bilkul theek
 * tha. Ab network ki hichki par ek baar aur poochha jaata hai, aur phir
 * bhi baat na bane to aadmi jahan hai wahin rehta hai. */
/* Control panel se client ka dashboard: saaf dikhe ki ye aapki dukaan nahi. */
function clientViewBar(me) {
  document.getElementById("client-view-bar")?.remove();
  document.body.classList.toggle("client-view", !!me.client_view);
  if (!me.client_view) return;
  const bar = document.createElement("div");
  bar.id = "client-view-bar";
  bar.className = "client-view-bar";
  bar.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = `👁 You are inside ${me.tenant?.shop_name || "a client"}'s account. Anything you do changes their data.`;
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back to my account";
  back.addEventListener("click", async () => {
    back.disabled = true;
    const r = await fetch("/api/session/exit-client", { method: "POST", credentials: "same-origin" });
    location.href = r.ok ? (await r.json()).next_url : "/admin";
  });
  bar.append(text, back);
  document.querySelector(".main")?.prepend(bar);
}

/* Login poore browser ka ek hota hai. Doosre tab mein client khula ho aur aap purane
   tab par laute, to wo tab chupchap client ka data chhoone lagta tha. Dukaan badli to
   taaza karo, taaki patti dikhe. */
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !SIGNED_IN_AS) return;
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (!r.ok) return;
    const now = await r.json();
    if (now.tenant?.slug !== SIGNED_IN_AS.tenant?.slug) location.reload();
  } catch (e) { /* signal gaya: agli baar */ }
});

async function ensureSignedIn() {
  let me = null, serverAnswered = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      // 5xx = nginx/app restart (deploy) — wo "logged out" nahi, hichki hai
      if (res.status >= 500) throw new Error(`server ${res.status}`);
      serverAnswered = true;
      me = await res.json().catch(() => null);
      break;
    } catch (e) {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  if (me && me.user) {
    SIGNED_IN_AS = me;
    clientViewBar(me);
    const btn = document.querySelector(".logout");
    if (btn) btn.textContent = "⏋ Log out " + (me.user.name || me.user.role);
    renderBillingBanner(me.subscription);
    renewCard(me.subscription);
    applyFeatureLocks(me.features || []);
    if (window.KKTags) KKTags.refresh();   // garment tags: plan + owner ka switch
    return true;                       // session kaafi hai, key ki zaroorat nahi
  }
  if (!serverAnswered) {
    // Signal gaya hai, session nahi. Login par bhejna yahan galat jawab hai.
    toast("No signal — trying again…", true, 4000);
    setTimeout(() => ensureSignedIn().then((ok) => { if (ok) startLiveUpdates(); }), 5000);
    return false;
  }
  location.href = "/join#login";             // server ne saaf kaha: session nahi
  return false;
}
let SIGNED_IN_AS = null;
/* Kya dukaan se WhatsApp bhej sakte hain? /api/me → tenant.wa_connected.
 * Pata na ho (purani admin-key login, session nahi) to haan maan lo —
 * tab bhejne ki koshish hoti hai aur fail par share modal khul jaata hai. */
function waConnected() {
  const t = SIGNED_IN_AS && SIGNED_IN_AS.tenant;
  return !t || t.wa_connected !== false;
}

/* Feature gating — /api/me ke `features` array se. Jo tab plan mein nahi
   hai wo 🔒 ke saath dikhta hai; click par Upgrade prompt. Naya gated tab
   banao to bas FEATURE_TABS mein entry daalo (backend plans.py ke saath). */
const FEATURE_TABS = {
  campaigns: "campaigns",
  // Bikri report + CSV: Premium aur Solo Pro (plans.VIRTUAL_FEATURES); AI Costing /
  // Growth / Usage "reports" ke peeche hi
  reports: "shop_reports",
  // Staff ka kaam — Solo Pro mein staff hai hi nahi (ladka rakha = Premium)
  tasks: "staff_panel",
  training: "service_agent",
  agents: "service_agent",
  usage: "reports",
  scan: "barcode_tracking",
  growth: "reports",
  costing: "reports",
};
const FEATURE_LABELS = {
  campaigns: "Campaigns", reports: "Reports, AI Costing & Growth",
  service_agent: "AI Service Agent", marketing_agent: "Marketing Agent", leads: "Leads",
  barcode_tracking: "Garment tags & scan",
  shop_reports: "Reports", staff_panel: "Staff app (Premium)",
};
let LOCKED_TABS = {};   // tab -> missing feature

function applyFeatureLocks(features) {
  const have = new Set(features);
  LOCKED_TABS = {};
  for (const [tab, feat] of Object.entries(FEATURE_TABS)) {
    const els = document.querySelectorAll(`[data-s="${tab}"]`);
    if (have.has(feat)) {
      els.forEach((el) => { el.classList.remove("locked"); });
      continue;
    }
    LOCKED_TABS[tab] = feat;
    els.forEach((el) => {
      el.classList.add("locked");
      if (!el.querySelector(".lock-ico")) {
        const ico = document.createElement("span");
        ico.className = "lock-ico";
        ico.textContent = " 🔒";
        el.appendChild(ico);
      }
    });
  }
  // Pricing tab Basic ko bhi chahiye (rate card); sirf cost wala card band
  const cg = $("cost-garment-card");
  if (cg) cg.style.display = have.has("reports") ? "" : "none";
  // Staff jodna: jis plan mein staff app nahi (Solo Pro) wahan card DIKHE par
  // tala laga — dukaan wala dekhe ki Premium mein kya hai (owner, 15 Nov 2026)
  const sc = $("staff-card"), sl = $("staff-locked");
  if (sc) sc.classList.toggle("card-locked", !have.has("staff_panel"));
  if (sl) sl.hidden = have.has("staff_panel");
}

/* Tala dabane par: isme kya milta hai, kis plan mein, kitne ka — taaki dukaan
   wala dekhe aur lene ka soche (owner, 15 Nov 2026). Plan aur daam live catalog se. */
const FEATURE_PITCH = {
  staff_panel: ["Washerman aur delivery boy ka apna login — sirf apna kaam dikhe",
    "Delivery boy ghar se pickup kare, cash le, hisaab apne aap", "Kaun kitna kaam kar raha — staff report"],
  campaigns: ["Purane grahakon ko offer bhejo, wapas bulao", "Coupon, reward aur festival offer ek click mein"],
  reports: ["AI Costing — har kapde ki lagat, loss wale rate pakdo", "Growth Center — aur order kaise badhein",
    "AI aur WhatsApp ka poora hisaab"],
  shop_reports: ["Roz / mahine ki bikri, munafa aur udhaar", "Orders aur grahakon ki CSV"],
  barcode_tracking: ["Har kapde par QR tag — koi kapda na khoye", "Scan station: kaunsa kapda kahan pada hai"],
  service_agent: ["AI grahak ko 24×7 WhatsApp par jawab de", "Pickup apne aap book"],
};
async function showUpgrade(feature) {
  const label = FEATURE_LABELS[feature] || feature;
  let plan = null;
  try {
    const cat = await (await fetch("/api/plans")).json();
    const has = (p) => (p.flags || []).includes(feature)
      || (feature === "shop_reports" && (p.flags || []).some((f) => f === "reports" || f === "solo_reports_detailed"));
    plan = (cat.plans || []).find(has) || null;          // catalog sasta -> mehnga
  } catch (e) { plan = null; }
  const pts = FEATURE_PITCH[feature] || [];
  openModal(`<h3>🔒 ${esc(label)}</h3>
    ${plan ? `<p><b>${esc(plan.name)}</b> mein milta hai — <b>₹${plan.price_inr}/mahina</b>${plan.annual_inr ? ` (saal ka ₹${plan.annual_inr})` : ""}.</p>` : "<p>Ye feature aapke plan mein nahi hai.</p>"}
    ${pts.length ? `<ul style="margin:8px 0 0;padding-left:18px">${pts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <p class="muted" style="margin-top:8px">Upgrade karte hi turant khul jaata hai — aapka data waise hi safe rahta hai.</p>
    <div style="margin-top:12px;display:flex;gap:8px">
      <a class="btn" href="/join#pricing" target="_blank" rel="noopener">Plans dekhein</a>
      <button class="btn ghost" onclick="closeModal()">Baad mein</button>
    </div>`);
}


/* 7 din pehle ka renew card — banner se alag, kyunki ise dabana padta hai:
   "Pay now" billing page kholta hai, "Remind me later" 24 ghante chup.
   Ek hi din mein baar-baar chipakne se log ise andekha karne lagte hain. */
function renewCard(sub) {
  if (!sub) return;
  const days = sub.status === "trial" ? sub.days_left : null;
  const grace = sub.read_only ? (sub.grace_days_left ?? 0) : null;
  const due = (days != null && days <= 7) || sub.read_only || sub.locked;
  if (!due) return;
  try {
    if (Number(localStorage.getItem("kk_renew_snooze") || 0) > Date.now()) return;
  } catch (e) {}
  const title = sub.locked ? "Account locked"
    : sub.read_only ? "Your plan has ended"
    : days === 0 ? "Your trial ends today"
    : `Your trial ends in ${days} day${days === 1 ? "" : "s"}`;
  const line = sub.locked
    ? "Your data is safe. Renew to switch everything back on."
    : sub.read_only
      ? `You can still see everything; adding new bills is paused.${grace ? ` ${grace} days before the account locks.` : ""}`
      : "Renew now and nothing stops — orders, WhatsApp and the AI agent keep running.";
  const wrap = document.createElement("div");
  wrap.className = "renew-card";
  wrap.innerHTML = `
    <div class="rc-body">
      <div class="rc-ico">${sub.locked || sub.read_only ? "🔒" : "⏳"}</div>
      <div class="rc-text"><b>${esc(title)}</b><div class="muted">${esc(line)}</div></div>
    </div>
    <div class="rc-actions">
      <a class="btn" href="/billing">Pay / Recharge</a>
      <button class="btn ghost" id="rc-later">Remind me later</button>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector("#rc-later").onclick = () => {
    try { localStorage.setItem("kk_renew_snooze", String(Date.now() + 24 * 3600 * 1000)); } catch (e) {}
    wrap.remove();
  };
}

/* Trial/subscription banner — har page/tab par sabse upar (SPA hai, to ek
   hi banner sab jagah dikhta hai). /api/me ka `subscription` object yahi
   padhta hai; active par kuch nahi dikhta. */
function renderBillingBanner(sub) {
  const old = document.getElementById("billing-banner");
  if (old) old.remove();
  if (!sub || sub.status === "active") return;
  let cls = "warn", text = "";
  if (sub.status === "trial") {
    const d = sub.days_left == null ? "?" : sub.days_left;
    text = "🕒 Trial: " + d + " day" + (d === 1 ? "" : "s") + " left";
    if (sub.days_left != null && sub.days_left <= 2) cls = "danger";
  } else if (sub.locked) {
    cls = "danger";
    text = "🔒 Account locked hai — subscription renew karein. Aapka poora data safe hai.";
  } else if (sub.read_only) {
    cls = "danger";
    const g = sub.grace_days_left == null ? "" :
      " (" + sub.grace_days_left + " din mein account lock ho jayega)";
    text = "⚠️ Trial/subscription khatam — account READ-ONLY hai" + g + ". Data poora safe hai.";
  } else {
    return;
  }
  const div = document.createElement("div");
  div.id = "billing-banner";
  div.className = "billing-banner " + cls;
  div.textContent = text;
  document.body.prepend(div);
}

function showLogin() {
  location.href = "/join#login";
}

/* Debounce — search/filter typing must not re-render (or hit the API) per
   keystroke; 300ms after the last key is when the work happens. */
function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const renderOrdersDeb = debounce(() => renderOrders(), 300);
// Search box: har akshar par server nahi jaate — 300ms chup rahe to ek call
const renderBillsDeb = debounce(() => reloadBills(), 300);
const custSearchDeb = debounce(() => { CUST_SHOWN = 30; renderCustomers(); }, 300);

/* ============================= router ============================= */
const SECTIONS = ["dashboard", "inbox", "newbill", "bills", "scan", "customers", "growth", "expenses", "costing", "reports", "campaigns", "polisher", "business", "tasks", "agents", "usage", "training", "activity", "settings"];
const TITLES = {
  dashboard: ["Dashboard", "Today at a glance"],
  inbox: ["Inbox", "WhatsApp — see and reply yourself"],
  newbill: ["New bill", "Fast entry at the counter"],
  bills: ["Bill history", "Every order, filterable"],
  scan: ["Scan station", "Garment tags — scan, move, track"],
  growth: ["Growth", "Today's actions, enquiry funnel and campaign ROI"],
  customers: ["Customers", "Ledger — business, paid and outstanding"],
  expenses: ["Expenses", "Daily spend and categories"],
  costing: ["AI Costing", "Cost analysis, readiness and next actions"],
  reports: ["Reports", "Revenue, expenses and profit"],
  campaigns: ["Campaigns", "Segments, offers and results"],
  polisher: ["Polisher ledger", "External saree polishing, returns and payments"],
  business: ["Business Manager", "Daily priorities from live business records"],
  tasks: ["Tasks", "Who was given what — pending, done, and replies"],
  agents: ["Agents", "Your AI employees — health and controls"],
  usage: ["AI usage", "How much AI was used and what it cost"],
  training: ["AI training", "Teach the agent your business"],
  activity: ["Activity", "Everything the agent did, and why"],
  settings: ["Settings", "Rates, staff, shop and agent"],
};
let CURRENT = "dashboard", NAVIGATING = false;
function go(sec, push = true) {
  if (!SECTIONS.includes(sec)) sec = "dashboard";
  if (LOCKED_TABS[sec]) { showUpgrade(LOCKED_TABS[sec]); return; }
  CURRENT = sec;
  CUST_DETAIL = null;   // sidebar se Customers = list; deep link baad mein set karta hai
  closeSheet();
  // leaving a full-screen mobile chat closes it
  if (sec !== "inbox") closeThreadMobile(false);
  SECTIONS.forEach((s) => { const el = $("sec-" + s); if (el) el.style.display = s === sec ? "" : "none"; });
  // the Inbox is a full-height app pane, not a page that scrolls: it must
  // reach the bottom of the screen instead of leaving dead space under it
  document.body.classList.toggle("inbox-mode", sec === "inbox");
  document.querySelectorAll(".nav div[data-s]").forEach((el) => el.classList.toggle("on", el.dataset.s === sec));
  document.querySelectorAll(".tabbar div[data-s]").forEach((el) => el.classList.toggle("on", el.dataset.s === sec));
  $("mob-title").textContent = TITLES[sec][0];
  closeSidebar();
  if (push && location.hash !== "#" + sec) {
    NAVIGATING = true;
    location.hash = sec;  // creates a history entry -> Android back works
    setTimeout(() => (NAVIGATING = false), 0);
  }
  if (sec !== "scan" && window.KKTags) KKTags._stopCamera();
  ({ dashboard: loadDashboard, inbox: loadThreads, newbill: initNewBill, bills: loadBills,
     scan: () => window.loadScanStation && loadScanStation(),
     growth: () => window.loadGrowth && loadGrowth(),
     customers: loadCustomers, expenses: loadExpenses, costing: loadCostingWorkbench, reports: loadReports,
     campaigns: loadCampaigns, polisher: loadPolisher, business: loadBusinessManager, tasks: loadTasks, agents: loadAgents, usage: loadUsage, training: loadTraining,
     activity: loadActivity, settings: loadSettings }[sec] || (() => {}))();
}

// Browser/Android back button: '#inbox/<phone>' = open thread, '#sec' = section
window.addEventListener("hashchange", () => {
  if (NAVIGATING) return;
  // Back/forward chalne par koi bhi khula overlay band — pehle modal ya
  // More-sheet naye section ke UPAR latka reh jaata tha aur lagta tha
  // "navigation atak gayi"
  closeModal(); closeSheet(); closeSidebar(); closeDrawer();
  const h = (location.hash || "#dashboard").slice(1);
  if (h.startsWith("inbox/")) {
    if (CURRENT !== "inbox") go("inbox", false);
    openThread(decodeURIComponent(h.slice(6)), false, false);
    return;
  }
  if (h.startsWith("settings/")) {  // deep link to one settings tab
    if (CURRENT !== "settings") go("settings", false);
    stTab(h.slice(9));
    return;
  }
  if (h.startsWith("customers/")) { openCustomerRoute(h.slice(10)); return; }
  closeThreadMobile(false);
  go(h, false);
});

/* URL ka hash -> page. Refresh ke baad bhi wahi screen (customer ka panna bhi). */
function routeFromHash() {
  const h = (location.hash || "#dashboard").slice(1);
  if (h.startsWith("customers/")) return openCustomerRoute(h.slice(10));
  if (h.startsWith("settings/")) { go("settings", false); stTab(h.slice(9)); return; }
  if (h.startsWith("inbox/")) { if (CURRENT !== "inbox") go("inbox", false); return; }   // khuli chat band na ho
  // Inbox page khulte hi load ho chuka — sign-in ke baad dobara load se list
  // ek baar aur jhapakti thi. (Dashboard/Settings dobara chalte hain: wo
  // login ka naam/role padhte hain jo ab aaya hai.)
  if (h === "inbox" && CURRENT === "inbox" && !LOCKED_TABS.inbox) return;
  go(h, false);
}
/* #customers/<phone>: customers section, aur list aate hi us grahak ka panna */
function openCustomerRoute(enc) {
  let phone = "";
  try { phone = decodeURIComponent(enc || ""); } catch (e) { /* toota link */ }
  if (!phone) { go("customers", false); return; }
  if (CURRENT === "customers" && CUSTOMERS_CACHE) { openCustomerDetail(phone, { push: false }); return; }
  go("customers", false);
  CUST_DETAIL = phone;   // loadCustomers list ki jagah ye panna kholega
}
/* URL badlo bina hashchange handler chalaye (wo poora section dobara load karta) */
function setHashQuiet(hash) {
  if (location.hash === "#" + hash) return;
  NAVIGATING = true;
  location.hash = hash;
  setTimeout(() => (NAVIGATING = false), 0);
}

/* Sidebar drawer (phone/tablet) — scrim taps and navigation both close it */
function toggleSidebar() {
  const open = $("sidebar").classList.toggle("open");
  $("side-ov")?.classList.toggle("open", open);
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("side-ov")?.classList.remove("open");
}

/* More sheet */
function openSheet() { $("sheet-ov").classList.add("open"); $("more-sheet").classList.add("open"); }
function closeSheet() { $("sheet-ov")?.classList.remove("open"); $("more-sheet")?.classList.remove("open"); }
function sheetGo(sec) { closeSheet(); go(sec); }

/* Google Business poster: gbp-poster.js owns the dialog; its floating
   launcher covered the tab bar and the chat composer, so it is hidden in
   CSS and opened from the nav / More sheet instead. */
function openGbpPoster() {
  const launch = document.getElementById("kk-gbp-poster-launch");
  if (launch) launch.click();
  else toast("Poster tool is still loading — try again in a moment", true);
}

/* Phone cards: a bill can carry eight buttons, which buries the one the
   counter needs. Keep the first three visible and fold the rest behind a
   "More" toggle. Applied to every rendered card list, whoever renders it. */
const CARD_ACTIONS_VISIBLE = 3;
function foldCardActions(root = document) {
  root.querySelectorAll(".rowcard .act:not([data-folded])").forEach((act) => {
    const btns = [...act.children].filter((el) => el.matches("button, .btn, a.btn"));
    act.dataset.folded = "1";
    if (btns.length <= CARD_ACTIONS_VISIBLE + 1) return;
    btns.slice(CARD_ACTIONS_VISIBLE).forEach((b) => b.classList.add("act-extra"));
    const more = document.createElement("button");
    more.type = "button";
    more.className = "btn ghost sm act-more";
    more.setAttribute("aria-expanded", "false");
    more.textContent = `More (${btns.length - CARD_ACTIONS_VISIBLE})`;
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = act.classList.toggle("act-open");
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "Less" : `More (${btns.length - CARD_ACTIONS_VISIBLE})`;
    });
    act.appendChild(more);
  });
}
function watchCardActions() {
  foldCardActions();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; foldCardActions(); });
  }).observe(document.querySelector(".main") || document.body, { childList: true, subtree: true });
}

/* ============================= dashboard ============================= */
let DASH = null, SUMMARY = null, dashFilter = { status: "", pay: "", q: "", page: 1 };
const PAGE = 25;

async function connectGA4() {
  try {
    const d = await api("/admin/api/ga4/connect-url", { method: "POST" });
    if (!d.url) throw new Error("Google connection URL missing");
    window.location.assign(d.url);
  } catch (e) {
    console.error("GA4 connect failed", e);
    alert("GA4 connect failed: " + (e?.message || e));
  }
}

// GA4 buttons are inserted into dashboard cards as inline handlers.
window.connectGA4 = connectGA4;
window.disconnectGA4 = disconnectGA4;
window.selectGA4Property = selectGA4Property;

async function disconnectGA4() {
  if (!confirm("Disconnect Google Analytics 4 from this dashboard?")) return;
  try {
    await api("/admin/api/ga4/disconnect", { method: "POST" });
    await loadGrowthAnalytics();
  } catch (e) {
    alert("GA4 disconnect failed: " + e.message);
  }
}

async function selectGA4Property() {
  const el = $("ga4-property-picker");
  if (!el || !el.value) return;
  try {
    await api("/admin/api/ga4/property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: el.value }),
    });
    await loadGrowthAnalytics();
  } catch (e) {
    alert("GA4 property selection failed: " + e.message);
  }
}

function refreshGrowthPanel(btn) {
  busy(btn, async () => { await loadGrowthAnalytics(); toast("Growth updated"); });
}
async function loadGrowthAnalytics() {
  const box = $("growth-analytics-body");
  if (!box) return;
  try {
    const [d, ga4, leadAttribution] = await Promise.all([
      api("/admin/api/growth-analytics"),
      api("/admin/api/ga4/status"),
      api("/admin/api/leads/attribution").catch(() => null),
    ]);
    const w = d.website || {}, g = d.gmb || {}, m = d.campaign || {};
    const attributionItems = (leadAttribution?.items || []).slice(0, 8);
    const attributionRows = attributionItems.map((item) => {
      const collected = Number(item.collected_revenue || 0).toLocaleString("en-IN", {
        style: "currency", currency: "INR", maximumFractionDigits: 0,
      });
      return `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto auto;gap:8px;padding:7px 0;overflow-wrap:anywhere;border-bottom:1px solid var(--border);align-items:center">
        <span>${esc(item.source || "unattributed")}</span><span class="muted">${esc(item.campaign || "—")}</span>
        <span>${Number(item.confirmed_orders || 0)} orders</span><b>${collected}</b>
      </div>`;
    }).join("");
    const attributionCard = leadAttribution ? `<div style="margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:10px">
      <b>🎯 Lead → confirmed orders</b>
      <small class="muted" style="display:block;margin-top:4px">Collected revenue uses payments recorded on orders. Clicks are not counted as orders; legacy orders without attribution stay unattributed.</small>
      ${attributionRows || '<div class="muted" style="padding:10px 0">No confirmed orders attributed yet.</div>'}
    </div>` : "";
    let wStatus;
    if (w.configured) {
      wStatus = `<div class="minis">
          <div class="mini"><b>${w.active_users || 0}</b><span>Active now</span></div>
          <div class="mini"><b>${w.views || 0}</b><span>Views</span></div>
          <div class="mini"><b>${w.events || 0}</b><span>Events</span></div></div>
        <div class="g-foot"><small class="muted">GA4 · ${esc(ga4.property_name || ga4.property_id)}</small>
        <button class="btn sm ghost" onclick="connectGA4()">Reconnect</button>
        <button class="btn sm ghost" onclick="disconnectGA4()">Disconnect</button></div>`;
    } else {
      const choices = ga4.choices || [];
      const picker = choices.length > 1
        ? `<select id="ga4-property-picker" class="input sm" style="margin-top:8px;max-width:100%">
            ${choices.map(p => `<option value="${esc(p.property_id)}">${esc(p.property_name)}</option>`).join("")}
          </select><button class="btn sm" style="margin-left:6px" onclick="selectGA4Property()">Use property</button>`
        : "";
      wStatus = `<p class="muted">Not connected${w.error ? ` — ${esc(w.error)}` : ""}. See live visitors on your website.</p>
        <div class="g-foot"><button class="btn sm" onclick="connectGA4()">Connect GA4</button>${picker}</div>`;
    }
    const gm = g.metrics || {};
    const gStatus = g.configured
      ? `<div class="minis">
          <div class="mini"><b>${gm.WEBSITE_CLICKS || 0}</b><span>Website clicks</span></div>
          <div class="mini"><b>${gm.CALL_CLICKS || 0}</b><span>Calls</span></div>
          <div class="mini"><b>${gm.BUSINESS_DIRECTION_REQUESTS || 0}</b><span>Directions</span></div></div>
        <small class="muted">Google reports daily, so this is the latest available period.</small>`
      : `<p class="muted">Not connected${g.error ? ` — ${esc(g.error)}` : ""}. Calls, clicks and directions from your Google listing.</p>`;
    box.innerHTML = `
      <div class="g-grid">
        <div class="g-tile"><div class="g-name"><span class="g-dot ${w.configured ? "on" : ""}"></span>Website</div>${wStatus}</div>
        <div class="g-tile"><div class="g-name"><span class="g-dot ${g.configured ? "on" : ""}"></span>Google Business Profile</div>${gStatus}</div>
      </div>
      <div class="g-camp" onclick="go('campaigns')" role="button" tabindex="0">
        <span><b>${m.messages_sent_this_month || 0}</b> campaign messages sent this month</span>
        <svg class="ic" aria-hidden="true"><use href="/admin/static/icons.svg?v=ui2#i-chevron"/></svg>
      </div>
      ${attributionCard}`;
  } catch (e) {
    box.innerHTML = e.status === 402 ? lockedNote("reports", "Growth — kahan se order aa rahe, aur kaise badhein")
      : `<span class="muted">Growth analytics unavailable: ${esc(e.message)}</span>`;
  }
}
/* Plan mein nahi: kachchi error ki jagah tala + "dekhein kya milta hai" (showUpgrade) */
function lockedNote(feature, what) {
  return `<p class="muted" style="margin:0 0 8px">🔒 ${esc(what)}</p>
    <button type="button" class="btn sm ghost" onclick="showUpgrade('${feature}')">Dekhein kis plan mein milta hai</button>`;
}

async function loadBusinessManager() {
  const kpis = $("business-kpis");
  const delayedBox = $("business-delayed");
  const duesBox = $("business-dues");
  const actionsBox = $("business-actions");
  if (!kpis || !delayedBox || !duesBox || !actionsBox) return;
  kpis.innerHTML = skeleton(4);
  delayedBox.innerHTML = skeleton(2);
  duesBox.innerHTML = skeleton(2);
  actionsBox.innerHTML = '<span class="muted">Checking live records…</span>';
  try {
    const d = await api("/admin/api/dashboard");
    const c = d.counts || {};
    const orders = d.active_orders || [];
    const late = orders.filter((o) => o.tracking && o.tracking.promise_late);
    const dues = d.unpaid_orders || [];
    const escalationRows = d.open_escalations || [];
    const overdueEscalations = escalationRows.filter((item) => item.sla_overdue);
    const outstanding = dues.reduce((sum, o) =>
      sum + Math.max(0, Number(o.total_amount || 0) - Number(o.amount_paid || 0)), 0);
    const tile = (label, value, note, icon) =>
      '<div class="card"><div class="muted">' + icon + ' ' + esc(label) + '</div>' +
      '<div style="font-size:26px;font-weight:700;margin-top:5px">' + esc(String(value)) + '</div>' +
      '<small class="muted">' + esc(note) + '</small></div>';
    kpis.innerHTML =
      tile("New orders today", Number(c.today_new || 0), "Created since the day boundary used by the dashboard", "🧾") +
      tile("Active orders", Number(c.active_total || 0), "Currently in progress", "🧺") +
      tile("Late deliveries", late.length, "Flagged by the delivery tracker", "⏰") +
      tile("Outstanding on delivered orders", money(outstanding), dues.length + " orders awaiting collection", "💰") +
      tile("Open complaints", escalationRows.length, overdueEscalations.length + " past response SLA", overdueEscalations.length ? "🔴" : "🛟");
    const orderLine = (o, extra) =>
      '<div style="padding:9px 0;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><b>' +
      esc(o.order_number || "Order") + '</b><span class="pill ' + (extra === "late" ? "UNPAID" : "PARTIAL") + '">' +
      (extra === "late" ? "Late" : "Payment due") + '</span></div>' +
      '<div class="muted" style="margin-top:3px">' + esc(o.customer || "Customer") + ' · ' +
      esc(statusName(o.status)) + '</div>' +
      (extra === "due" ? '<div style="margin-top:3px"><b>' +
        money(Math.max(0, Number(o.total_amount || 0) - Number(o.amount_paid || 0))) +
        '</b> outstanding</div>' : '') + '</div>';
    delayedBox.innerHTML = late.length
      ? late.slice(0, 8).map((o) => orderLine(o, "late")).join("")
      : emptyBox("No late deliveries flagged.", "✅");
    duesBox.innerHTML = dues.length
      ? dues.slice(0, 8).map((o) => orderLine(o, "due")).join("")
      : emptyBox("No delivered orders have a balance due.", "✅");
    const steps = [];
    if (late.length) steps.push("Review " + late.length + " late order(s) and confirm the next delivery step.");
    if (dues.length) steps.push("Follow up on " + dues.length + " delivered bill(s) with outstanding payment.");
    if (Number(c.due_today || 0)) steps.push(Number(c.due_today) + " active order(s) are due today; check staff progress.");
    if (overdueEscalations.length) steps.unshift("🔴 " + overdueEscalations.length + " customer complaint(s) are past the response SLA. Reply and resolve them now.");
    else if (escalationRows.length) steps.push(escalationRows.length + " customer complaint(s) are waiting for an owner response.");
    if (!steps.length) steps.push("No urgent action is flagged by the current records. Keep order statuses and payments up to date.");
    // Har khuli complaint par "Mark resolved" — owner khud band kare. Resolved
    // complaints neeche ki list se wapas khul sakti hain (galti se band hui ho).
    // Checkbox + "Resolve selected / all": ek-ek band karna 50+ complaints par
    // mumkin nahi tha. Count server ka asli hai, list sabse purani 200 tak.
    const totalOpen = Number(c.open_escalations || escalationRows.length);
    const escalationBar = escalationRows.length ?
      '<div class="esc-bar">' +
      '<label><input type="checkbox" id="esc-all" onchange="escToggleAll(this.checked)"> Select all</label>' +
      '<button class="btn sm ok" id="esc-resolve-sel" disabled onclick="resolveComplaintsBulk(false, 0, this)">Resolve selected</button>' +
      '<button class="btn sm ghost" onclick="resolveComplaintsBulk(true, ' + totalOpen + ', this)">Resolve all ' + totalOpen + '</button>' +
      (totalOpen > escalationRows.length ? '<small class="muted">Showing oldest ' + escalationRows.length + '</small>' : '') +
      '</div><div class="esc-list">' : '';
    const escalationCards = escalationBar + escalationRows.map((item) =>
      '<div class="esc-card' + (item.sla_overdue ? ' overdue' : '') + '">' +
      '<div class="esc-top"><input type="checkbox" class="esc-pick" value="' + esc(item.id) + '" onchange="escSyncSel()" aria-label="Select complaint">' +
      '<b>' + (item.sla_overdue ? '🔴 SLA overdue' : 'Complaint open') + '</b> · ' +
      esc(item.customer || 'Customer') +
      '<button class="btn sm ok esc-btn" onclick="resolveComplaint(\'' + esc(item.id) + '\', true, this)">✓ Mark resolved</button></div>' +
      '<div class="muted" style="margin-top:3px">' + esc(item.question || '') + '</div></div>'
    ).join("") + (escalationRows.length ? '</div>' : '') +
      '<details class="esc-resolved" ontoggle="if(this.open)loadResolvedComplaints()"><summary>Resolved complaints</summary>' +
      '<div id="esc-resolved-list" class="muted" style="padding:6px 0">Loading…</div></details>';
    actionsBox.innerHTML = escalationCards + '<ul style="margin:0;padding-left:20px">' +
      steps.map((s) => '<li style="padding:5px 0">' + esc(s) + '</li>').join("") + '</ul>' +
      '<div class="filters" style="margin-top:10px"><button class="btn sm ghost" onclick="go(\'bills\')">Open bill history</button>' +
      '<button class="btn sm ghost" onclick="go(\'tasks\')">Open staff tasks</button></div>';
  } catch (e) {
    kpis.innerHTML = errBox(e.message, "loadBusinessManager");
    delayedBox.innerHTML = "";
    duesBox.innerHTML = "";
    actionsBox.innerHTML = "";
  }
}

let DASH_SEQ = 0;
/* Complaint resolve / reopen (Business page). Resolve hui complaint SLA
   reminder aur apne-aap wale promo messages ko nahi rokti. */
async function resolveComplaint(id, resolved, btn) {
  let note = null;
  if (resolved) {
    note = prompt("What was done? (optional, for your records)", "");
    if (note === null) return;                       // Cancel = kuch nahi
  }
  await busy(btn, async () => {
    await api(`/admin/api/escalations/${id}/resolve`, { method: "POST", body: { resolved, note: note || null } });
    toast(resolved ? "Complaint marked resolved" : "Complaint reopened");
    loadBusinessManager();
  });
}
function escSyncSel() {
  const picks = [...document.querySelectorAll(".esc-pick")];
  const n = picks.filter((x) => x.checked).length;
  const btn = $("esc-resolve-sel");
  if (btn) { btn.disabled = !n; btn.textContent = n ? "Resolve selected (" + n + ")" : "Resolve selected"; }
  const all = $("esc-all");
  if (all) { all.checked = n > 0 && n === picks.length; all.indeterminate = n > 0 && n < picks.length; }
}
function escToggleAll(on) {
  document.querySelectorAll(".esc-pick").forEach((x) => { x.checked = on; });
  escSyncSel();
}
async function resolveComplaintsBulk(all, total, btn) {
  const ids = all ? [] : [...document.querySelectorAll(".esc-pick:checked")].map((x) => x.value);
  if (!all && !ids.length) return;
  if (!confirm(all ? "Mark all " + total + " open complaints as resolved?" : "Mark " + ids.length + " complaint(s) as resolved?")) return;
  await busy(btn, async () => {
    const r = await api("/admin/api/escalations/resolve-bulk", { method: "POST", body: { ids, all } });
    toast(r.resolved + " complaint(s) marked resolved");
    loadBusinessManager();
  });
}
async function loadResolvedComplaints() {
  const box = $("esc-resolved-list");
  if (!box) return;
  try {
    const rows = await api("/admin/api/escalations?status=resolved&limit=20");
    box.innerHTML = rows.length ? rows.map((r) =>
      '<div class="esc-card resolved"><div class="esc-top"><b>✅ Resolved</b> · ' + esc(r.customer) +
      ' <small class="muted">' + (r.resolved_at ? fmtDate(r.resolved_at) : "") + '</small>' +
      '<button class="btn sm ghost esc-btn" onclick="resolveComplaint(\'' + esc(r.id) + '\', false, this)">Reopen</button></div>' +
      '<div class="muted" style="margin-top:3px">' + esc(r.question || "") + '</div>' +
      (r.note ? '<div style="margin-top:3px;font-size:12.5px">📝 ' + esc(r.note) + '</div>' : "") + '</div>').join("")
      : '<span class="muted">No resolved complaints yet.</span>';
  } catch (e) { box.textContent = e.message; }
}

async function loadDashboard(opts = {}) {
  // Live update (staff ne status badla) par skeleton nahi: screen chamakti
  // thi aur owner padhte-padhte jagah kho deta. Sirf pehli baar dikhta hai.
  const quiet = !!opts.quiet && DASH;
  const seq = ++DASH_SEQ;
  if (!quiet) {
    $("kpis").innerHTML = skeleton(1) ;
    $("dash-orders").innerHTML = skeleton(5);
  }
  // Reports sirf Premium/Business plan aur owner/manager ke liye: wo na mile to
  // poora dashboard (aaj ke order bhi) gayab ho jaata tha — ab bas mahine wale tile
  const [d, sum] = await Promise.allSettled([api("/admin/api/dashboard"), api("/admin/api/reports/summary")]);
  if (seq !== DASH_SEQ) return;           // naya jawab aa chuka — purana na chhaape
  if (d.status === "rejected") {
    if (quiet) return;                    // pichla data dikhta rahe, agli baar phir
    $("kpis").innerHTML = "";
    $("dash-orders").innerHTML = errBox(d.reason.message, "loadDashboard");
    return;
  }
  DASH = d.value;
  SUMMARY = sum.status === "fulfilled" ? sum.value : null;
  renderKpis(); renderChips(); renderOrders(); renderDashHello();
  // WhatsApp aur growth ke ankde har live event par nahi — unka apna 30 sec timer hai
  if (quiet) return;
  loadWaStats();
  loadGrowthAnalytics();
  // Har 30 sec teen API call — sirf tab jab dashboard saamne khula ho.
  // Pehle ye har screen par aur band phone par bhi chalta rehta tha.
  if (!window._growthTimer) window._growthTimer = setInterval(() => {
    if (!document.hidden && CURRENT === "dashboard") loadGrowthAnalytics();
  }, 30000);
}
function renderDashHello() {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = ((SIGNED_IN_AS && SIGNED_IN_AS.user && SIGNED_IN_AS.user.name) || "").split(" ")[0];
  if ($("dash-hello")) $("dash-hello").textContent = name ? `${part}, ${name}` : part;
  if ($("dash-date")) {
    $("dash-date").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
      + " · here is your shop today";
  }
}

/* "unreachable" used to cover every case, including shops that simply never
   connected WhatsApp. Each state needs a different next step from the owner. */
function metaPill(s) {
  if (s.meta_ok) return "";
  const states = {
    not_connected: ["PARTIAL", "WhatsApp not connected"],
    auth_failed: ["UNPAID", "WhatsApp token rejected — reconnect"],
    unreachable: ["UNPAID", "Meta API unreachable"],
    error: ["UNPAID", "Meta API error"],
  };
  const [cls, label] = states[s.meta_state] || states.unreachable;
  return `<span class="pill ${cls}">${label}</span>`;
}
async function loadWaStats() {
  try {
    const s = await api("/admin/api/whatsapp/stats");
    const t = s.templates, q = s.quality;
    const qpill = q ? `<span class="pill ${q === "GREEN" ? "PAID" : "PARTIAL"}">quality ${q.toLowerCase()}</span>` : "";
    const stat = (label, value) => `<div class="mini"><b>${value}</b><span>${label}</span></div>`;
    $("wa-stats").innerHTML = `
      <div class="panel-head"><h3>WhatsApp today</h3><div class="pillrow">${qpill}${metaPill(s)}</div></div>
      <div class="minis">
        ${stat("Sent", s.today.sent)}
        ${stat("Received", s.today.received)}
        ${stat("Customers", s.today.customers_talked)}
        ${stat("Templates", `${t.approved}<small> / ${t.pending} pending${t.rejected ? ` · ${t.rejected} rejected` : ""}</small>`)}
      </div>`;
  } catch (e) {
    $("wa-stats").innerHTML = `<div class="panel-head"><h3>WhatsApp today</h3></div>${e.status === 402
      ? lockedNote("reports", "WhatsApp ka roz ka hisaab — kitne message gaye, kitne padhe") : `<span class="muted">Could not load: ${esc(e.message)}</span>`}`;
  }
}

function renderKpis() {
  const c = DASH.counts, m = (SUMMARY && SUMMARY.month) || {};
  const outstanding = CUSTOMERS_CACHE
    ? CUSTOMERS_CACHE.reduce((a, x) => a + Number(x.outstanding || 0), 0) : null;
  // Aaj ke dono tile dashboard API se: har plan aur har role ko dikhte hain
  $("kpis").innerHTML = `
    ${kpi("Today's orders", money(c.today_value || 0), `${c.today_new || 0} ${Number(c.today_new) === 1 ? "order" : "orders"} · ${c.active_total || 0} active`, "go('bills')", "i-receipt", "orange")}
    ${kpi("Today's collection", money(c.today_collected || 0), "cash + UPI received", "go('bills')", "i-expense", "green")}
    ${SUMMARY ? `
    ${kpi("Revenue this month", money(m.revenue || 0), "payments received", "go('reports')", "i-reports", "blue")}
    ${kpi("Profit this month", money(m.profit || 0), "revenue − expenses", "go('reports')", "i-usage", "teal")}
    ${kpi("Expenses this month", money(m.expenses || 0), "logged spend", "go('expenses')", "i-ledger", "amber")}` : ""}
    ${kpi("Outstanding", outstanding === null ? "…" : money(outstanding), "tap to see who owes", "dashFilter.status='UNPAID';dashFilter.page=1;renderChips();renderOrders();document.getElementById('dash-orders').scrollIntoView({behavior:'smooth'})", "i-users", "red")}
  `;
  if (outstanding === null) loadCustomers(true).then(renderKpis);
}
/* icon: an id from icons.svg ("i-…") draws the sprite icon; anything else
   (older callers pass an emoji) is shown as text. */
const kpi = (lbl, val, sub, click, icon = "📊", tint = "blue") =>
  `<div class="card kpi" onclick="${click}"><span class="kico ${tint}">${String(icon).startsWith("i-")
    ? `<svg class="ic" aria-hidden="true"><use href="/admin/static/icons.svg?v=ui2#${icon}"/></svg>` : icon}</span><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;

function renderChips() {
  const by = DASH.counts.by_status || {};
  // Ginti .cnt pill mein — <b> ke saath koi jagah nahi banti aur "Washing0"
  // ek shabd jaisa padha jaata hai. .cnt ka CSS pehle se maujood tha (uske
  // upar likha comment bhi), sirf yahan lagaya nahi gaya tha.
  const cnt = (n) => `<span class="cnt">${n}</span>`;
  const chips = [["", `All active${cnt(DASH.counts.active_total)}`]]
    .concat((DASH.counts.delayed || 0) ? [["DELAYED", `Overdue${cnt(DASH.counts.delayed)}`]] : [])
    .concat((DASH.counts.due_today || 0) ? [["DUE_TODAY", `Due today${cnt(DASH.counts.due_today)}`]] : [])
    .concat((DASH.counts.due_soon || 0) ? [["DUE_SOON", `Due soon${cnt(DASH.counts.due_soon)}`]] : [])
    .concat(STATUS_SEQ.filter((s) => s !== "DELIVERED")
      .map((s) => [s, `${statusName(s)}${cnt(by[s] || 0)}`]))
    // Delivered par paisa baaki — kaam khatam par hisaab nahi; yahin se collect/message
    .concat([["UNPAID", `Delivered, unpaid${cnt(DASH.counts.unpaid_delivered || 0)}`]]);
  $("dash-chips").innerHTML = chips
    .map(([v, h]) => `<span class="chip ${dashFilter.status === v ? "on" : ""}" onclick="dashFilter.status='${v}';dashFilter.page=1;renderChips();renderOrders()">${h}</span>`)
    .join("");
}

/* Dashboard ki dono listein (chalta kaam + delivered-unpaid) mein se order */
function dashOrder(num) {
  const d = DASH || {};
  return ((d.active_orders || []).concat(d.unpaid_orders || [])).find((x) => x.order_number === num);
}
function orderMatches(o) {
  if (dashFilter.status === "DELAYED") {
    if (!(o.tracking && o.tracking.promise_late)) return false;
  } else if (dashFilter.status === "DUE_TODAY") {
    if (!(o.tracking && o.tracking.due_today)) return false;
  } else if (dashFilter.status === "DUE_SOON") {
    const due = o.expected_delivery ? new Date(o.expected_delivery + "T00:00:00") : null;
    const days = due ? Math.round((due - new Date(new Date().toDateString())) / 86400000) : null;
    if (days !== 1 && days !== 2) return false;
  } else if (dashFilter.status === "UNPAID") { /* alag list, sab rows */ }
  else if (dashFilter.status && o.status !== dashFilter.status) return false;
  if (dashFilter.pay && o.payment_status !== dashFilter.pay) return false;
  const q = dashFilter.q.toLowerCase();
  if (q && !(o.order_number.toLowerCase().includes(q) || (o.customer || "").toLowerCase().includes(q) || o.phone.includes(q))) return false;
  return true;
}
const isOverdue = (o) => (o.tracking && o.tracking.delayed) || (o.expected_delivery && o.expected_delivery < new Date().toISOString().slice(0, 10) && !["DELIVERED", "CANCELLED"].includes(o.status));
/* "Washing 30h / 24h" — stage mein kitni der, hadd ke saath. Hadd paar = laal. */
const fmtHours = (h) => h == null ? "" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
function stageTimer(o) {
  const t = o.tracking;
  if (!t) return "";
  const cls = t.stage_late ? "late" : t.stage_limit && t.stage_hours > t.stage_limit * 0.75 ? "warn" : "";
  return `<span class="stagetime ${cls}" title="${esc(t.delay_reason || `${t.stage_label} since ${fmtWhen(t.stage_since)}`)}">⏱ ${fmtHours(t.stage_hours)}${t.stage_limit ? ` / ${t.stage_limit}h` : ""}</span>`;
}
const whoLine = (o) => [o.washer && `${esc(o.washer)}`, o.delivery_boy && `${esc(o.delivery_boy)}`].filter(Boolean).join(" · ");
const itemsText = (items) => (items || []).filter((i) => i.kind !== "urgent_charge").map((i) =>
  `${i.qty} × ${i.type || i.garment || i.service}` + ((i.pieces || []).length
    ? ` (${piecesCount(i.pieces)} pcs)` : "")).join(", ");

function renderOrders() {
  const src = dashFilter.status === "UNPAID" ? (DASH.unpaid_orders || []) : (DASH.active_orders || []);
  const all = src.filter(orderMatches);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  dashFilter.page = Math.min(dashFilter.page, pages);
  const rows = all.slice((dashFilter.page - 1) * PAGE, dashFilter.page * PAGE);
  if ($("dash-count")) $("dash-count").textContent = `${all.length} ${all.length === 1 ? "order" : "orders"}`;
  if (!rows.length) { $("dash-orders").innerHTML = emptyBox("No orders match — new bills appear here."); $("dash-pager").innerHTML = ""; return; }

  $("dash-orders").innerHTML = `
    <table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th>Payment</th><th>Delivery</th><th>Actions</th></tr></thead>
    <tbody>${rows.map((o) => `
      <tr class="${isOverdue(o) ? "overdue" : ""}">
        <td><b>${o.order_number}</b>${o.priority === "urgent" ? ' <span title="Urgent">⚡</span>' : ""}<div class="muted">${fmtDate(o.created_at)}</div></td>
        <td>${esc(displayName(o.customer, o.phone))}<div class="muted">${esc(o.phone)}</div></td>
        <td style="max-width:140px" title="${esc(itemsText(o.items))}"><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(itemsText(o.items))}</div>${whoLine(o) ? `<div class="muted" style="font-size:12px">${whoLine(o)}</div>` : ""}</td>
        <td><span class="pill ${o.status}">${statusName(o.status)}</span> ${stageTimer(o)}${o.tracking && o.tracking.promise_late ? ' <span class="pill UNPAID">Overdue</span>' : ""}</td>
        <td><span class="pill ${o.payment_status}">${o.payment_status.toLowerCase()}</span><div class="muted">${money(o.amount_paid)} / ${o.total_amount ? money(o.total_amount) : "—"}</div></td>
        <td>${fmtDate(o.expected_delivery)}</td>
        <td><div class="act">
          ${nextStepBtn(o)}
          <button class="btn sm ghost" title="Collect payment" aria-label="Collect payment" onclick="paymentModal('${o.order_number}')">₹</button>
          <button class="btn sm ghost" title="More actions" aria-label="More actions" onclick="orderMenu('${o.order_number}')">⋯</button>
        </div></td>
      </tr>`).join("")}
    </tbody></table>
    <div class="rowcards">${rows.map((o) => `
      <div class="rowcard ordercard ${isOverdue(o) ? "overdue" : ""}">
        <div class="oc-top">
          <div class="oc-who"><b>${esc(displayName(o.customer, o.phone))}</b><span>${o.order_number}${o.priority === "urgent" ? " · ⚡ urgent" : ""}</span></div>
          <span class="pill ${o.status}">${statusName(o.status)}</span>
        </div>
        ${o.tracking && o.tracking.delayed ? `<div class="delaynote">⏱ ${esc(o.tracking.delay_reason)}</div>` : ""}
        <div class="oc-items">${esc(itemsText(o.items)) || '<span class="muted">No items</span>'}</div>
        <div class="oc-meta">
          <span>${money(o.amount_paid)} / ${o.total_amount ? money(o.total_amount) : "—"} <span class="pill ${o.payment_status}">${o.payment_status.toLowerCase()}</span></span>
          <span class="${isOverdue(o) ? "late-t" : ""}">Due ${fmtDate(o.expected_delivery)}</span>
        </div>
        ${whoLine(o) || stageTimer(o) ? `<div class="oc-meta muted"><span>${whoLine(o) || "Not assigned yet"}</span><span>${stageTimer(o)}</span></div>` : ""}
        <div class="act">
          ${nextStepBtn(o)}
          <button class="btn sm ghost" onclick="paymentModal('${o.order_number}')" aria-label="Collect payment">₹ Pay</button>
          <button class="btn sm ghost" onclick="orderMenu('${o.order_number}')" aria-label="More actions">⋯</button>
        </div>
      </div>`).join("")}
    </div>`;
  $("dash-pager").innerHTML = pages > 1
    ? `<button class="btn sm ghost" ${dashFilter.page <= 1 ? "disabled" : ""} onclick="dashFilter.page--;renderOrders()">‹ Prev</button>
       <span class="muted">Page ${dashFilter.page} of ${pages}</span>
       <button class="btn sm ghost" ${dashFilter.page >= pages ? "disabled" : ""} onclick="dashFilter.page++;renderOrders()">Next ›</button>`
    : "";
}

/* "⋯" overflow menus — 5 icons per row made the Actions column wider than
   the card at common laptop widths, pushing it behind a horizontal scroll
   nobody discovers. Two primary actions stay inline; the rest live here. */
function orderMenu(num) {
  const o = dashOrder(num);
  openModal(`<h3>${num}</h3>
    <div class="frm">
      ${o && !["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn ghost" onclick="closeModal();statusModal('${num}','${o.status}')">🔄 Change status</button>` : ""}
      ${o && CL_HOLDABLE.includes(o.status) ? `<button class="btn ghost" onclick="closeModal();dashClothesModal('${num}')">🧺 Clothes — some ready / hold</button>` : ""}
      <button class="btn ghost" onclick="closeModal();messageMenu('${num}')">💬 Send a message</button>
      <button class="btn ghost" onclick="closeModal();shareBillFromOrder('${num}')">📲 Share bill on WhatsApp</button>
      ${o && !["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn ghost" onclick="closeModal();dateModal('${num}')">📅 Delivery date</button>` : ""}
      <button class="btn ghost" onclick="closeModal();orderDetail('${num}')">👁 Details</button>
      ${o ? `<button class="btn ghost" onclick="closeModal();jumpChat('${o.phone}')">💬 Open chat</button>` : ""}
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}
function billMenu(num) {
  const o = BILLS.find((x) => x.order_number === num) || dashOrder(num);
  const step = o && NEXT_STEP[o.status];
  openModal(`<h3>${num}</h3>
    <div class="frm">
      ${step ? `<button class="btn" onclick="closeModal();setStatus('${num}','${o.status}','${step[0]}')">${step[1]}</button>` : ""}
      ${o && !["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn ghost" onclick="closeModal();statusModal('${num}','${o.status}')">🔄 Change status</button>` : ""}
      ${o && CL_HOLDABLE.includes(o.status) ? `<button class="btn ghost" onclick="closeModal();dashClothesModal('${num}')">🧺 Clothes — some ready / hold</button>` : ""}
      <button class="btn ghost" onclick="closeModal();printReceiptFromOrder('${num}')">🖨 Print receipt</button>
      ${window.KKTags && KKTags.tagsOn() ? `<button class="btn ghost" data-kk="labels" data-n="${num}">🏷️ Garment labels</button>` : ""}
      <button class="btn ghost" onclick="closeModal();shareBillFromOrder('${num}')">📲 Share on WhatsApp</button>
      <button class="btn ghost" onclick="closeModal();messageMenu('${num}')">💬 Send a message</button>
      <button class="btn ghost" onclick="closeModal();billingChargeModal('${num}')">➕ Add charge / due</button>
      <button class="btn ghost" onclick="closeModal();editBillModal('${num}')">✏️ Edit bill</button>
      ${o && !["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn ghost danger-ic" onclick="closeModal();setStatus('${num}','${o.status}','CANCELLED')">🚫 Cancel order</button>` : ""}
      <button class="btn ghost danger-ic" onclick="closeModal();deleteBillModal('${num}')">🗑 Delete bill</button>
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}

async function billingChargeModal(number) {
  openModal(`<h3>➕ Add charge / due — ${esc(number)}</h3>
    <div class="frm">
      <div><label>Charge / due name</label><input id="bc-label" maxlength="100" placeholder="Pickup charge"></div>
      <div><label>Amount (₹)</label><input id="bc-amount" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal"></div>
      <div><label>Type</label><select id="bc-kind"><option value="extra_charge">Extra charge</option><option value="due_charge">Additional due</option></select></div>
      <div><label>Note (optional)</label><input id="bc-note" maxlength="300" placeholder="Why was this added?"></div>
    </div>
    <p class="muted">Due is always Total − Paid. This records an adjustment without changing payment history.</p>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="bc-save">Add to bill</button></div>`);
  $("bc-save").onclick = (e) => busy(e.target, async () => {
    const label = $("bc-label").value.trim();
    const amount = Number($("bc-amount").value);
    if (!label || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      throw new Error("Charge name and amount between ₹0.01 and ₹10,00,000 are required");
    }
    await api(`/orders/${encodeURIComponent(number)}/billing-adjustment`, {
      method: "POST",
      body: { label, amount, kind: $("bc-kind").value, note: $("bc-note").value.trim() || null, changed_by: "dashboard" }
    });
    closeModal();
    toast("Charge added");
    if ($("drawer").classList.contains("open")) orderDetail(number);
    loadDashboard();
    if ($("bills-list")) loadBills();
  });
}
function removeBillingAdjustment(number, adjustmentId) {
  confirmDialog("Remove this billing adjustment? The bill total and outstanding due will be recalculated.", async () => {
    try {
      await api(`/orders/${encodeURIComponent(number)}/billing-adjustment/${encodeURIComponent(adjustmentId)}`, { method: "DELETE" });
      toast("Billing adjustment removed");
      orderDetail(number);
      loadDashboard();
      if ($("bills-list")) loadBills();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---- bill par grahak ko message: yaad, thank you, review ----
   Text server banata hai (owner ka apna format bhi). Preview dikhta hai,
   phir dukaan ke number se ya apne WhatsApp se. */
const MSG_KINDS = [
  ["payment_reminder", "💰", "Payment reminder"],
  ["delivery_update", "🚚", "Delivery update (with bill link)"],
  ["payment_thanks", "💚", "Payment received — thank you"],
  ["service_thanks", "🙏", "Thank you for the service"],
  ["review_request", "⭐", "Please review us on Google"],
];
/* Customers page: grahak ka sabse naya bill chunkar wahi message menu */
async function customerMessageMenu(phone) {
  let rows;
  try { rows = await api(`/orders?customer_phone=${encodeURIComponent(phone)}&limit=1`); }
  catch (e) { toast(e.message, true); return; }
  if (!rows.length) { toast("No bill for this customer yet", true); return; }
  messageMenu(rows[0].order_number);
}
async function messageMenu(num) {
  // Chukta bill par "Payment reminder" dikhana galat hai — manager ne abhi
  // paisa liya aur menu phir se paisa maangne ko keh raha tha. Baaki ho tabhi.
  let due = 1;
  try {
    const o = (await api(`/orders/${encodeURIComponent(num)}`)).order;
    due = Number(o.total_amount || 0) - Number(o.amount_paid || 0);
  } catch (e) { due = 1; /* pata na chale to sab options */ }
  const kinds = due > 0 ? MSG_KINDS : MSG_KINDS.filter(([k]) => k !== "payment_reminder");
  openModal(`<h3>💬 Message — ${esc(num)}</h3>
    <p class="muted">${due > 0 ? "You see the message before it goes." : "Bill is paid in full — thank them, or ask for a review."}</p>
    <div class="frm">${kinds.map(([k, ico, label]) =>
      `<button class="btn ghost" data-action="composeMessage" data-num="${esc(num)}" data-kind="${esc(k)}">${ico} ${label}</button>`).join("")}
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}
async function composeMessage(num, kind) {
  if (kind === "payment_reminder") {
    // grahak ke saare baaki bil ek message mein, UPI link ke saath — purana rasta
    let o;
    try { o = (await api(`/orders/${encodeURIComponent(num)}`)).order; } catch (e) { toast(e.message, true); return; }
    closeModal();
    return sendReminder(o.customer_phone);
  }
  let r;
  try { r = await api(`/orders/${encodeURIComponent(num)}/message?kind=${kind}`); }
  catch (e) { toast(e.message, true); return; }
  const label = (MSG_KINDS.find((x) => x[0] === kind) || [])[2] || "Message";
  SHARE_TEXT = r.text; MSG_TARGET = r.phone; MSG_KIND = kind;
  MSG_LABEL = label; MSG_NAME = r.name || "";
  openModal(`<h3>${esc(label)}</h3>
    <p class="muted">To ${esc(displayName(r.name, r.phone))}</p>
    <pre class="sharetext">${esc(r.text)}</pre>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn" onclick="sendComposed(this)">📲 Send</button>
      <button class="btn ghost" onclick="copyShareText()">Copy</button>
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </div>`);
}
let MSG_TARGET = "";
let MSG_KIND = "order_status";
let MSG_LABEL = "Message", MSG_NAME = "";
async function sendComposed(btn) {
  await busy(btn, async () => {
    try {
      await api("/admin/api/inbox/send", {
        method: "POST",
        body: { phone: MSG_TARGET, text: SHARE_TEXT, intent: "transactional", outbound_kind: MSG_KIND || "order_status" },
      });
      sentPopup(`${MSG_LABEL} sent`, MSG_NAME, MSG_TARGET);
    } catch (e) {
      // 24h window band / API nahi — owner ka WhatsApp nahi kholte, saaf batate hain
      sendFailedPopup(MSG_LABEL, e.message, SHARE_TEXT);
    }
  });
}

/* Ek order, ek agla kadam. Row par yahi ek bada button — dropdown khol kar
   sahi status dhoondhna phone par mushkil tha. Poori list (hold/cancel bhi)
   🔄 se, bade buttons mein. */
const NEXT_STEP = {
  PICKUP_ASSIGNED: ["PICKED_UP", "🛵 Picked up"],
  RECEIVED: ["IN_WASH", "Start wash"],
  PICKED_UP: ["IN_WASH", "Start wash"],
  IN_WASH: ["IN_IRON", "Send to iron"],
  IN_DRY: ["IN_IRON", "Send to iron"],
  IN_IRON: ["READY", "Ready"],
  READY: ["DELIVERED", "🚚 Deliver"],
  OUT_FOR_DELIVERY: ["DELIVERED", "✅ Delivered"],
  ON_HOLD: ["IN_WASH", "▶ Resume"],
};
const STEP_LABEL = {
  RECEIVED: "📥 Received", PICKUP_ASSIGNED: "📦 Pickup assigned", PICKED_UP: "🛵 Picked up",
  IN_WASH: "🧼 Washing", IN_DRY: "💨 Drying", IN_IRON: "🔥 Ironing",
  READY: "Ready", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered",
  ON_HOLD: "⏸ On hold", CANCELLED: "🚫 Cancel order",
};
/* Dhulai shuru karte waqt service ke stages maayne rakhte hain: sirf-press
   wala order "Start wash" nahi, "Start iron" dikhaye. Baad ke stage par
   owner ka seedha "Ready" wala shortcut waisa hi. */
const START_STEP = { IN_WASH: "Start wash", IN_IRON: "Start iron", READY: "Ready" };
const SEND_STEP = { IN_IRON: "Send to iron", READY: "Ready" };
function nextStep(o) {
  // Server service ke stages se agla kadam batata hai: Wash -> Iron -> Ready
  if (["RECEIVED", "PICKED_UP"].includes(o.status) && START_STEP[o.next_status]) {
    return [o.next_status, START_STEP[o.next_status]];
  }
  if (["IN_WASH", "IN_DRY", "IN_IRON"].includes(o.status) && SEND_STEP[o.next_status]) {
    return [o.next_status, SEND_STEP[o.next_status]];
  }
  return NEXT_STEP[o.status];
}
function nextStepBtn(o, cls = "btn sm") {
  const n = nextStep(o);
  return n ? `<button class="${cls}" onclick="setStatus('${o.order_number}','${o.status}','${n[0]}')">${n[1]}</button>` : "";
}
async function setStatus(number, current, next) {
  // Delivery means the clothes actually changed hands: choose quantities first.
  if (next === "DELIVERED" && ["READY", "OUT_FOR_DELIVERY"].includes(current)) {
    closeModal(); return dashDeliverModal(number);
  }
  if (next === "CANCELLED" && !confirm(`Cancel order ${number}? The customer's open work stops. The bill stays on record and leaves sales and dues; any money taken is not returned automatically.`)) return;
  try {
    await api(`/orders/${encodeURIComponent(number)}/status`, { method: "POST", body: { status: next, changed_by: "dashboard" } });
  } catch (e) {
    toast(e.message, true);
    // A stale page may show an old status; reconcile it after a rejected move.
    loadDashboard();
    if (typeof loadBills === "function" && $("bills-list")) loadBills();
    return;
  }
  closeModal(); toast(`${number} → ${statusName(next)}`); loadDashboard();
  if (typeof loadBills === "function" && $("bills-list")) loadBills();
}
function statusModal(number, current, showAll = false) {
  const terminal = ["DELIVERED", "CANCELLED"].includes(current);
  if (terminal) {
    toast(`${statusName(current)} orders cannot be changed.`, true);
    return;
  }

  // Keep this in the same order as order_service._SEQUENCE on the server.
  // Server ke _SEQUENCE ka kram — Drying chunne ka option nahi (stage hi nahi raha)
  const sequence = ["RECEIVED", "PICKUP_ASSIGNED", "PICKED_UP", "IN_WASH", "IN_IRON", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
  // Purana order jo abhi "Drying" par khada hai — Washing ke baad wala maano
  const index = sequence.indexOf(current === "IN_DRY" ? "IN_WASH" : current);
  const nexts = current === "ON_HOLD"
    ? sequence
    : sequence.filter((st) => index >= 0 && sequence.indexOf(st) > index);
  const next = NEXT_STEP[current];
  const alternatives = nexts.filter((st) => !next || st !== next[0]);
  const primaryLabel = current === "ON_HOLD" ? "▶ Resume" : (next && next[1]);

  openModal(`<div class="status-modal">
    <div class="status-modal-current">
      <span class="status-modal-eyebrow">CURRENT STATUS</span>
      <span class="pill ${current}">${statusName(current)}</span>
    </div>
    <h3>${esc(number)}</h3>
    <p class="muted">Choose the next step. Customer updates are sent automatically for relevant stages.</p>
    ${next ? `<div class="status-modal-next">
      <span>Recommended next step</span>
      <button class="btn status-primary" onclick="setStatus('${number}','${current}','${next[0]}')">${primaryLabel}</button>
      ${next[0] === "READY" ? `<button class="btn ghost" onclick="closeModal();dashClothesModal('${number}')">Only some are ready…</button>` : ""}
    </div>` : ""}
    <button class="btn ghost status-modal-toggle" onclick="statusModal('${number}','${current}',${showAll ? "false" : "true"})">
      ${showAll ? "Hide other statuses" : "↕ Choose another status"}
    </button>
    ${showAll ? `<div class="status-options">
      ${alternatives.map((st) => `<button class="btn ghost status-option" onclick="setStatus('${number}','${current}','${st}')">${STEP_LABEL[st]}</button>`).join("")}
    </div>` : ""}
    <div class="status-modal-danger">
      ${current !== "ON_HOLD" ? `<button class="btn ghost" onclick="setStatus('${number}','${current}','ON_HOLD')">${STEP_LABEL.ON_HOLD}</button>` : ""}
      <button class="btn ghost danger-ic" onclick="setStatus('${number}','${current}','CANCELLED')">${STEP_LABEL.CANCELLED}</button>
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </div>
  </div>`);
}

/* ---- delivery: sab ya kuch kapde (BUG_008) — staff panel jaisa hi ---- */
let DL = { number: "", slots: [], pick: [], total: 0 };
async function dashDeliverModal(number) {
  let d;
  try { d = await api(`/orders/${encodeURIComponent(number)}`); } catch (e) { toast(e.message, true); return; }
  const slots = [];
  // Washerman ke roke hue kapde ("abhi nahi hue") dene ki list mein nahi
  const can = (x) => (x.deliverable !== undefined ? x.deliverable : x.pending);
  (d.lines || []).forEach((l) => {
    if (l.pieces) l.pieces.forEach((p) => { if (can(p) > 0) slots.push({ line: l.line, piece: p.piece, max: can(p), name: p.type, group: `${l.name} · ${l.weight} kg` }); });
    else if (can(l) > 0) slots.push({ line: l.line, max: can(l), name: l.name, sub: l.service !== l.name ? l.service : "", bag: !!l.bag, weight: l.weight });
  });
  const heldN = (d.clothes && d.clothes.held) || 0;
  if (!slots.length) { toast(heldN ? `Everything left (${heldN}) is on hold with the washerman` : "Nothing left to deliver on this bill", true); return; }
  DL = { number, slots, pick: slots.map((s) => s.max), total: slots.reduce((a, s) => a + s.max, 0) };
  let lastGroup = "";
  openModal(`<h3>Deliver — ${esc(number)}</h3>
    <p class="muted">${esc(displayName(d.order.customer_name, d.order.customer_phone))} · ${DL.total} to deliver${d.clothes.delivered ? ` (${d.clothes.delivered} already delivered)` : ""}</p>
    ${heldN ? `<p class="muted" style="color:#92400e">⏸ ${heldN} on hold with the washerman — they stay pending</p>` : ""}
    ${d.clothes.returned_pending ? `<p class="muted" style="color:#92400e">↩ ${d.clothes.returned_pending} returned (not cleaned) — hand them back with the rest</p>` : ""}
    <div class="btnrow" style="margin-top:8px">
      <button class="btn ghost sm" onclick="dlSet('all')">Select all</button>
      <button class="btn ghost sm" onclick="dlSet('none')">Clear</button>
    </div>
    <div class="dl-list">${slots.map((s, i) => {
      const head = s.group && s.group !== lastGroup ? `<div class="dl-group">${esc(s.group)}</div>` : "";
      lastGroup = s.group || "";
      return head + (s.bag
        ? `<label class="dl-row"><span class="dl-name">${esc(s.name)} <small>${esc(String(s.weight))} kg bag</small></span>
             <input type="checkbox" id="dlq-${i}" checked onchange="DL.pick[${i}]=this.checked?1:0;dlPaint()"></label>`
        : `<div class="dl-row"><span class="dl-name">${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ""}</span>
             <div class="nbc-step">
               <button type="button" aria-label="One less" onclick="dlStep(${i},-1)">−</button>
               <input type="number" id="dlq-${i}" min="0" max="${s.max}" value="${s.max}" inputmode="numeric"
                 oninput="DL.pick[${i}]=Math.max(0,Math.min(${s.max},parseInt(this.value)||0));dlPaint(${i})">
               <button type="button" aria-label="One more" onclick="dlStep(${i},1)">+</button>
             </div><small class="muted" style="min-width:34px">of ${s.max}</small></div>`);
    }).join("")}</div>
    <p id="dl-sum" style="margin-top:10px"></p>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn ok" id="dl-go" onclick="dlSubmit(this)">Deliver</button>
    </div>`);
  dlPaint();
}
function dlStep(i, by) { DL.pick[i] = Math.max(0, Math.min(DL.slots[i].max, DL.pick[i] + by)); dlPaint(); }
function dlSet(which) { DL.pick = DL.slots.map((s) => (which === "all" ? s.max : 0)); dlPaint(); }
function dlPaint(typing) {
  const n = DL.pick.reduce((a, v) => a + v, 0), left = DL.total - n;
  DL.slots.forEach((s, i) => {
    const el = $(`dlq-${i}`);
    if (!el || i === typing) return;
    if (s.bag) el.checked = DL.pick[i] > 0; else el.value = DL.pick[i];
  });
  $("dl-sum").innerHTML = n === 0 ? "Pick the clothes being handed over."
    : left === 0 ? `<b>All ${n}</b> — the order will be marked <b>delivered</b>.`
    : `Delivering <b>${n}</b> · <b style="color:var(--danger)">${left} will stay pending</b>`;
  $("dl-go").textContent = n === 0 ? "Deliver" : left === 0 ? `✅ Deliver all ${n}` : `✅ Deliver ${n}`;
  $("dl-go").disabled = n === 0;
}
async function dlSubmit(btn) {
  await busy(btn, async () => {
    const n = DL.pick.reduce((a, v) => a + v, 0);
    const items = n === DL.total ? null
      : DL.slots.map((s, i) => ({ line: s.line, ...(s.piece != null ? { piece: s.piece } : {}), qty: DL.pick[i] })).filter((x) => x.qty > 0);
    const r = await api(`/orders/${encodeURIComponent(DL.number)}/deliver`, { method: "POST", body: { items } });
    closeModal();
    toast(r.pending ? `${r.delivered_now} delivered — ${r.pending} still pending` : `${DL.number} delivered ✅`);
    loadDashboard();
    if (typeof loadBills === "function" && $("bills-list")) loadBills();
  });
}

/* ---- 🧺 Kapdon ki halat: kuch taiyar / hold / baaki bhi taiyar — staff app jaisa ----
   Washerman ka "12 mein se 10 taiyar" owner/manager bhi yahin se kar sakein.
   Server: /orders/{n}/partial-ready, /hold, /release (delivery.py). */
const CL_READY_SOME = ["RECEIVED", "PICKED_UP", "IN_WASH", "IN_DRY", "IN_IRON"];
const CL_HOLDABLE = CL_READY_SOME.concat(["READY", "OUT_FOR_DELIVERY"]);
const CL_REASONS = ["Stain not gone", "Not dry yet", "Needs repair", "Ironing left", "Colour issue"];
// Bina dhule wapas — daam bill se apne aap hatta hai (server: delivery.return_clothes)
const CL_RETURN_REASONS = ["Stain won't go", "Fabric too weak", "Customer took it back", "Damaged / torn", "Colour may run"];
// jin par kaam baaki (return hue nahi) / jo abhi wapas kiye ja sakte hain (hold wale bhi)
const clWork = (x) => (x.workable !== undefined ? x.workable : x.deliverable) || 0;
const clRtn = (x) => Math.max(0, (x.pending || 0) - (x.returned_pending || 0));
async function dashClothesModal(number) {
  let d;
  try { d = await api(`/orders/${encodeURIComponent(number)}`); } catch (e) { toast(e.message, true); return; }
  const st = d.order.status, c = d.clothes || {}, lines = d.lines || [];
  const free = lines.reduce((a, l) => a + clWork(l), 0);
  const canReturn = lines.some((l) => (l.pieces ? l.pieces.some((p) => clRtn(p) > 0) : clRtn(l) > 0));
  const row = (name, sub, l) => {
    const bits = [l.delivered ? `${l.delivered} delivered` : "", l.held ? `⏸ ${l.held} on hold` : "",
      l.returned ? `↩ ${l.returned} returned` : "",
      clWork(l) ? `${clWork(l)} ${CL_READY_SOME.includes(st) ? "in work" : "ready"}` : ""].filter(Boolean);
    return `<div class="dl-row"><span class="dl-name">${esc(name)}${sub ? ` <small>${esc(sub)}</small>` : ""}</span><small class="muted">${esc(bits.join(" · ") || "—")}</small></div>`;
  };
  const list = lines.map((l) => l.pieces
    ? `<div class="dl-group">${esc(l.name)} · ${esc(String(l.weight))} kg</div>` + l.pieces.map((p) => row(p.type, "", p)).join("")
    : row(l.name, l.bag ? `${l.weight} kg bag` : l.service !== l.name ? l.service : "", l)).join("");
  const why = lines.filter((l) => l.held && l.hold_reason).map((l) => `⏸ ${l.name}: ${l.hold_reason}`)
    .concat(lines.filter((l) => l.returned && l.return_reason).map((l) => `↩ ${l.name}: ${l.return_reason}`));
  openModal(`<h3>🧺 Clothes — ${esc(number)}</h3>
    <p class="muted">${esc(displayName(d.order.customer_name, d.order.customer_phone))} · ${esc(statusName(st))} · ${c.total || 0} clothes${c.delivered ? ` · ${c.delivered} delivered` : ""}${c.held ? ` · <b style="color:#92400e">${c.held} on hold</b>` : ""}</p>
    <div class="dl-list">${list || `<p class="muted">No clothes on this bill.</p>`}</div>
    ${why.length ? `<p class="muted" style="font-size:12px">${esc(why.join(" · "))}</p>` : ""}
    <div class="frm" style="margin-top:12px">
      ${CL_READY_SOME.includes(st) && free > 1 ? `<button class="btn" id="cl-some">✅ Some ready — rest stays on hold</button>` : ""}
      ${c.held ? `<button class="btn ok" id="cl-rest">▶ Rest ready too (${c.held})</button>` : ""}
      ${CL_HOLDABLE.includes(st) && free > 0 ? `<button class="btn ghost" id="cl-hold">⏸ Hold clothes (not done)</button>` : ""}
      ${CL_HOLDABLE.includes(st) && canReturn ? `<button class="btn ghost" id="cl-return">↩ Return clothes (not cleaned — price off the bill)</button>` : ""}
      ${["READY", "OUT_FOR_DELIVERY"].includes(st) && free > 0 ? `<button class="btn ghost" id="cl-deliver">🚚 Deliver some or all</button>` : ""}
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
  if ($("cl-some")) $("cl-some").onclick = () => clPickModal(number, d, "ready");
  if ($("cl-hold")) $("cl-hold").onclick = () => clPickModal(number, d, "hold");
  if ($("cl-return")) $("cl-return").onclick = () => clPickModal(number, d, "return");
  if ($("cl-deliver")) $("cl-deliver").onclick = () => { closeModal(); dashDeliverModal(number); };
  if ($("cl-rest")) $("cl-rest").onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api(`/orders/${encodeURIComponent(number)}/release`, { method: "POST", body: {} });
    closeModal();
    toast(`${number} — held clothes done ✅${r.customer_told ? " · customer told" : ""}`);
    loadDashboard();
    if (typeof loadBills === "function" && $("bills-list")) loadBills();
  });
}
/* Ek hi picker teen kaam ke liye: "ready" = jo TAIYAR hain (shuru mein sab),
   "hold" = jo NAHI hue, "return" = jo bina dhule wapas jaate hain (dono mein
   shuru mein koi nahi, kaaran zaroori). */
function clPickModal(number, d, mode) {
  const ready = mode === "ready", ret = mode === "return";
  const cap = ret ? clRtn : clWork;
  const slots = [];
  (d.lines || []).forEach((l) => {
    if (l.pieces) l.pieces.forEach((p) => { if (cap(p) > 0) slots.push({ line: l.line, piece: p.piece, max: cap(p), name: p.type, group: `${l.name} · ${l.weight} kg` }); });
    else if (cap(l) > 0) slots.push({ line: l.line, max: cap(l), name: l.name, sub: l.service !== l.name ? l.service : "", bag: !!l.bag, weight: l.weight });
  });
  if (!slots.length) { toast("No clothes left on this bill", true); return; }
  const total = slots.reduce((a, s) => a + s.max, 0);
  const pick = slots.map((s) => (ready ? s.max : 0));
  let lastGroup = "";
  openModal(`<h3>${ready ? "✅ Some clothes ready" : ret ? "↩ Return clothes" : "⏸ Hold clothes"} — ${esc(number)}</h3>
    <p class="muted">${ready ? "Keep the clothes that are <b>ready</b>. The rest stay at the shop on hold, and the customer is told how many are ready."
      : ret ? "Pick the clothes going back to the customer <b>without cleaning</b>. Their price (and its GST) comes off the bill."
      : "Pick the clothes that are <b>not done</b>. The rest of the order can move on; these stay at the shop."}</p>
    <div class="dl-list">${slots.map((s, i) => {
      const head = s.group && s.group !== lastGroup ? `<div class="dl-group">${esc(s.group)}</div>` : "";
      lastGroup = s.group || "";
      return head + (s.bag
        ? `<label class="dl-row"><span class="dl-name">${esc(s.name)} <small>${esc(String(s.weight))} kg bag</small></span>
             <input type="checkbox" data-clb="${i}"${pick[i] ? " checked" : ""}></label>`
        : `<div class="dl-row"><span class="dl-name">${esc(s.name)}${s.sub ? ` <small>${esc(s.sub)}</small>` : ""}</span>
             <div class="nbc-step">
               <button type="button" data-cls="${i}" data-by="-1" aria-label="One less">−</button>
               <input type="number" min="0" max="${s.max}" value="${pick[i]}" inputmode="numeric" data-clq="${i}" aria-label="How many">
               <button type="button" data-cls="${i}" data-by="1" aria-label="One more">+</button>
             </div><small class="muted" style="min-width:34px">of ${s.max}</small></div>`);
    }).join("")}</div>
    <div id="cl-whybox" style="margin-top:10px"${ready ? " hidden" : ""}>
      <label for="cl-why">${ready ? `Why are the others not ready? <span class="muted">(optional)</span>` : "Why?"}</label>
      <div class="btnrow" style="flex-wrap:wrap;gap:6px;margin:4px 0">${(ret ? CL_RETURN_REASONS : CL_REASONS).map((r) => `<button type="button" class="btn ghost sm" data-clw="${esc(r)}">${esc(r)}</button>`).join("")}</div>
      <input id="cl-why" maxlength="120" placeholder="e.g. stain not gone, not dry yet">
    </div>
    <p id="cl-sum" style="margin-top:10px"></p>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="cl-go">Save</button>
    </div>`);
  const body = $("modal-body");
  const paint = () => {
    const n = pick.reduce((a, v) => a + v, 0), left = total - n, why = $("cl-why").value.trim();
    if (ready) {
      $("cl-whybox").hidden = left === 0;
      $("cl-sum").innerHTML = n === 0 ? "Pick at least one ready cloth."
        : left === 0 ? `<b>All ${n}</b> ready — same as marking the order ready.`
        : `<b>${n}</b> ready · <b style="color:#92400e">${left} stay at the shop on hold</b>`;
      $("cl-go").textContent = n === 0 ? "✅ Ready" : left === 0 ? `✅ All ${n} ready` : `✅ ${n} ready, hold ${left}`;
      $("cl-go").disabled = n === 0;
    } else {
      $("cl-sum").innerHTML = n === 0 ? "Pick at least one cloth." : why.length < 2 ? "Write why (or tap a reason)."
        : ret ? `<b>${n}</b> go back to the customer uncleaned.` : `<b>${n}</b> will stay at the shop.`;
      $("cl-go").textContent = ret ? (n ? `↩ Return ${n}` : "↩ Return") : (n ? `⏸ Hold ${n}` : "⏸ Hold");
      $("cl-go").disabled = n === 0 || why.length < 2;
    }
    slots.forEach((s, i) => { const q = body.querySelector(`[data-clq="${i}"]`); if (q && document.activeElement !== q) q.value = String(pick[i]); });
  };
  body.querySelectorAll("[data-cls]").forEach((b) => {
    b.onclick = () => { const i = +b.dataset.cls; pick[i] = Math.max(0, Math.min(slots[i].max, pick[i] + parseInt(b.dataset.by, 10))); paint(); };
  });
  body.querySelectorAll("[data-clq]").forEach((inp) => {
    inp.oninput = () => { const i = +inp.dataset.clq; pick[i] = Math.max(0, Math.min(slots[i].max, parseInt(inp.value, 10) || 0)); paint(); };
  });
  body.querySelectorAll("[data-clb]").forEach((cb) => { cb.onchange = () => { pick[+cb.dataset.clb] = cb.checked ? 1 : 0; paint(); }; });
  body.querySelectorAll("[data-clw]").forEach((b) => { b.onclick = () => { $("cl-why").value = b.dataset.clw; paint(); }; });
  $("cl-why").oninput = paint;
  $("cl-go").onclick = (e) => busy(e.currentTarget, async () => {
    const picks = slots.map((s, i) => pick[i] > 0 ? { line: s.line, ...(s.piece !== undefined ? { piece: s.piece } : {}), qty: pick[i] } : null).filter(Boolean);
    const r = await api(`/orders/${encodeURIComponent(number)}/${ready ? "partial-ready" : ret ? "return" : "hold"}`,
      { method: "POST", body: { picks, reason: $("cl-why").value.trim() } });
    closeModal();
    const held = (r.clothes && r.clothes.held) || 0, n = picks.reduce((a, p) => a + p.qty, 0);
    if (ret && r.refund_due > 0) {
      // Paisa wapas dena hai — toast mein chhoot na jaaye
      openModal(`<h3>↩ ${n} returned — ${esc(number)}</h3>
        <p class="muted">${money(r.amount_off)} came off the bill (new total ${money(r.total)}). The customer had already paid more.</p>
        <p style="color:#92400e"><b>Give back ${money(r.refund_due)}</b> to the customer.</p>
        <div class="btnrow"><button class="btn" onclick="closeModal()">OK</button></div>`);
    } else {
      toast(ready ? (held ? `${number} — ${r.ready} ready, ${held} on hold ⏸` : `${number} — ready ✅`)
        : ret ? `${number} — ${n} returned ↩${r.amount_off ? ` · ${money(r.amount_off)} off the bill` : ""}`
        : `${number} — ${n} on hold ⏸`);
    }
    loadDashboard();
    if (typeof loadBills === "function" && $("bills-list")) loadBills();
  });
  paint();
}

function paymentModal(number) {
  // prefill with the outstanding amount — one click for the common case
  const o = ((DASH && DASH.active_orders) || []).find((x) => x.order_number === number)
         || BILLS.find((x) => x.order_number === number);
  const due = o && o.total_amount
    ? Math.max(0, Number(o.total_amount) - Number(o.amount_paid || 0)) : "";
  const hint = o && o.total_amount
    ? `<div class="muted">Due: ${money(due)} (bill ${money(o.total_amount)}, received ${money(o.amount_paid || 0)}) — advance/extra is fine too</div>` : "";
  openModal(`<h3>Collect payment — ${number}</h3>
    <div class="frm">
      <div><label>Amount (₹)</label><input inputmode="decimal" id="pm-amt" type="number" min="1" step="0.01" value="${due || ""}" autofocus></div>
      <div><label>Mode</label><select id="pm-mode"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></div>
      ${hint}
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn ok" id="pm-go">Record payment</button></div>`);
  // Ek modal = ek key: jawab kho jaye aur owner dobara dabaye to bhi ek hi payment
  const payRef = newIdemKey();
  $("pm-go").onclick = (e) => busy(e.target, async () => {
    const amt = parseFloat($("pm-amt").value);
    if (!(amt > 0)) throw new Error("Amount must be greater than 0");
    await api(`/orders/${number}/payment`, { method: "POST", body: { amount: amt, method: $("pm-mode").value, client_ref: payRef } });
    closeModal(); toast(T.paymentSaved); loadDashboard(); loadCustomers(true);
    // Bill history page has its own cache — refresh it too, else the
    // payment looks "not saved" when the modal was opened from there.
    if (typeof loadBills === "function" && $("bills-list")) loadBills();
    // WhatsApp API judi ho to server khud "payment mila" bhej deta hai.
    // Nahi to "mil gaya, dhanyawad" ka preview — apne WhatsApp se bhejo.
    if (waConnected()) toast("Customer notified on WhatsApp");
    else composeMessage(number, "payment_thanks");
  });
}

function dateModal(number) {
  openModal(`<h3>Delivery date — ${number}</h3>
    <div class="frm">
      <div><label>New date</label><input id="dt-new" type="date" value="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}"></div>
      <div><label>Internal reason (never sent to the customer)</label><input id="dt-why" placeholder="e.g. machine under repair"></div>
    </div>
    <p class="muted">The customer gets a polite notice with the new date only.</p>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" id="dt-go">Update date</button></div>`);
  $("dt-go").onclick = (e) => busy(e.target, async () => {
    await api(`/orders/${number}/delivery-date`, { method: "POST", body: { expected_delivery: $("dt-new").value, changed_by: "dashboard", internal_reason: $("dt-why").value || null } });
    closeModal(); toast(T.dateUpdated); loadDashboard();
    if (typeof loadBills === "function" && $("bills-list")) loadBills();
  });
}

async function orderDetail(number) {
  $("drawer").classList.add("open");
  syncOverlayScrollLock();
  $("drawer-body").innerHTML = skeleton(4);
  try {
    const d = await api(`/orders/${encodeURIComponent(number)}`);
    const o = d.order;
    const billingAdjustments = (o.items || []).filter((i) => i && i.id && ["extra_charge", "due_charge"].includes(i.kind));
    $("drawer-body").innerHTML = `
      <h3>${o.order_number} <span class="pill ${o.status}">${statusName(o.status)}</span></h3>
      <p class="muted">${esc(displayName(o.customer_name, o.customer_phone))} · ${esc(o.customer_phone)}</p><hr class="hr">
      <b>Items</b>
      ${(o.items || []).filter((i) => !(i && i.id && ["extra_charge", "due_charge"].includes(i.kind))).map((i) => `<div class="sumrow"><span>${i.qty} × ${esc(i.type || i.garment || i.service || "?")}</span><span>${i.amount != null ? money(i.amount) : ""}</span></div>`
        + (piecesCount(i.pieces) ? `<div class="muted" style="font-size:12.5px;margin:-4px 0 6px">👕 ${esc(piecesLabel(i.pieces))}</div>` : "")).join("")}
      ${billingAdjustments.length ? `<hr class="hr"><b>Additional charges / due</b>${billingAdjustments.map((a) => `<div class="sumrow"><span>${esc(a.label || a.type || "Additional charge")} <span class="muted">(${a.kind === "due_charge" ? "additional due" : "extra charge"})</span>${a.note ? `<div class="muted" style="font-size:12px">${esc(a.note)}</div>` : ""}</span><span>${money(a.amount)} <button class="btn sm ghost danger-ic" onclick="removeBillingAdjustment('${esc(o.order_number)}','${esc(a.id)}')">Remove</button></span></div>`).join("")}` : ""}
      <div class="sumrow"><span>Discount</span><span>${money(o.discount_amount || 0)}</span></div>
      <div class="sumrow"><span>GST</span><span>${money(o.gst_amount || 0)}</span></div>
      <div class="sumrow total"><span>Total</span><span>${o.total_amount ? money(o.total_amount) : "—"}</span></div>
      <div class="sumrow"><span>Paid</span><span>${money(o.amount_paid)} <span class="pill ${o.payment_status}">${o.payment_status.toLowerCase()}</span></span></div>
      ${d.tracking && d.tracking.delayed ? `<div class="delaynote" style="margin-top:10px">⏱ Delayed — ${esc(d.tracking.delay_reason)}</div>` : ""}
      <hr class="hr"><b>Milestones</b>
      ${(d.tracking ? d.tracking.milestones : []).map((m) => `<div class="sumrow">
          <span>${esc(m.label)}<div class="muted" style="font-size:12px">${fmtWhen(m.at)} · ${esc(m.by)}</div></span>
          <span class="${m.late ? "stagetime late" : "muted"}">${m.hours != null ? fmtHours(m.hours) + (m.limit ? ` / ${m.limit}h` : "") : ""}</span></div>`).join("")}
      ${d.tracking ? `<div class="sumrow"><span class="muted">Total so far</span><span class="muted">${fmtHours(d.tracking.total_hours)}</span></div>` : ""}
      ${d.tracking && d.tracking.bill_seconds ? `<div class="sumrow"><span class="muted">Bill created in</span><span class="muted">${d.tracking.bill_seconds < 60 ? d.tracking.bill_seconds + "s" : Math.floor(d.tracking.bill_seconds / 60) + "m " + (d.tracking.bill_seconds % 60) + "s"}</span></div>` : ""}
      <hr class="hr"><b>Work</b> <span class="muted" style="font-size:12px">assigned by the agent</span>
      ${(d.tasks || []).length ? d.tasks.map((t) => `<div class="sumrow"><span>${{ wash: "🧼 Wash & iron", pickup: "🛵 Pickup", delivery: "🚚 Delivery" }[t.kind] || "📋 Task"} <span class="muted">${t.code}</span></span>
          <span>${esc(t.staff || "—")} <span class="pill ${t.status === "DONE" ? "PAID" : t.status === "CANCELLED" ? "UNPAID" : "PARTIAL"}">${t.status.toLowerCase()}</span></span></div>`).join("")
        : `<p class="muted">No work assigned yet.</p>`}
      ${o.notes ? `<hr class="hr"><b>Internal notes</b><p class="muted" style="white-space:pre-wrap">${esc(o.notes)}</p>` : ""}
      <div id="od-garments"></div>
      <div class="btnrow" style="margin-top:14px">
        ${nextStepBtn(o, "btn")}
        ${!["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn ghost" onclick="statusModal('${o.order_number}','${o.status}')">🔄 Status</button>` : ""}
        <button class="btn ghost" onclick="billingChargeModal('${o.order_number}')">➕ Add charge</button>
        <button class="btn ghost" onclick="printReceiptFromOrder('${o.order_number}')">🖨 Print</button>
        <button class="btn ghost" onclick="jumpChat('${o.customer_phone}')">💬 Chat</button>
      </div>`;
    if (window.KKTags) KKTags.drawerGarments(o.order_number, $("od-garments"));
  } catch (e) { $("drawer-body").innerHTML = errBox(e.message, "closeDrawer"); }
}
function closeDrawer() { $("drawer").classList.remove("open"); syncOverlayScrollLock(); }
function jumpChat(phone) { go("inbox"); setTimeout(() => openThread(phone), 250); }

/* ============================= new bill ============================= */
let RATES = [], CUSTOMERS_CACHE = null, LINES = [];
// Bill ka timer pehle asli kaam (tap/likhna) se shuru — screen khuli padi
// rehne ka samay bill mein nahi ginna chahiye
let NB_STARTED = 0, NB_TIMER_WIRED = false;
const STAGE_LIMIT_KEYS = [
  ["PICKUP_ASSIGNED", "Pickup"], ["RECEIVED", "Received (not started)"], ["PICKED_UP", "Picked up"],
  ["IN_WASH", "Washing"], ["IN_DRY", "Drying"], ["IN_IRON", "Ironing"], ["READY", "Ready (waiting delivery)"],
  ["OUT_FOR_DELIVERY", "Out for delivery"], ["ON_HOLD", "On hold"],
];

async function initNewBill() {
  if (!NB_TIMER_WIRED && $("sec-newbill")) {
    NB_TIMER_WIRED = true;
    const start = () => { if (!NB_STARTED) NB_STARTED = Date.now(); };
    $("sec-newbill").addEventListener("input", start, true);
    $("sec-newbill").addEventListener("click", (e) => { if (e.target.closest("button, .chip, select, input")) start(); }, true);
  }
  try {
    [RATES, SETTINGS_CACHE] = await Promise.all([api("/admin/api/rates"), api("/admin/api/settings")]);
  } catch (e) { toast(e.message, true); }
  if (!CUSTOMERS_CACHE) loadCustomers(true);
  if ($("nb-wa-notice")) $("nb-wa-notice").style.display = waConnected() ? "none" : "";
  // Doosre panne se laut kar adhoora bill wahin se — defaults (GST, offer,
  // tareekh) sirf naye bill par, warna 3 se nikal kar aate hi sab badal jaata
  const fresh = !realLines().length && !$("nb-phone").value.trim();
  if (fresh) NBW_DATE_MANUAL = false;
  nbSearchWire();
  if (!LINES.length) addLine();
  if ($("nb-newrate")) $("nb-newrate").style.display = canEditRates() ? "" : "none";
  renderLines();
  if (!NBW_DATE_MANUAL) $("nb-date").value = nbAutoDeliveryDate();
  // Vaade ka samay (kk-bill.js) — pichhli pasand yaad rehti hai
  if (window.KKBill && $("nb-time")) {
    let t = "18:00"; try { t = localStorage.getItem("kb_time") || t; } catch (e) { /* private mode */ }
    $("nb-time").innerHTML = KKBill.timeOptions(t);
    $("nb-time").onchange = () => { try { localStorage.setItem("kb_time", $("nb-time").value); } catch (e) { /* private mode */ } };
  }
  nbDoneClose(false);
  nbPaintUrgent();
  if (fresh) $("nb-gst").checked = !!SETTINGS_CACHE.gst_default_on;
  const preset = $("nb-preset").value;
  $("nb-preset").innerHTML = '<option value="">No discount</option>' +
    (SETTINGS_CACHE.discount_presets || []).map((p, i) =>
      `<option value="${i}">${esc(p.name)} (${p.type === "percent" ? p.value + "%" : "₹" + p.value})</option>`).join("");
  if (!fresh && [...$("nb-preset").options].some((o) => o.value === preset)) $("nb-preset").value = preset;
  // desktop par discount/advance/date sab khule; phone par band (kam hi lagte hain)
  $("nb-more").open = window.matchMedia("(min-width: 768px)").matches;
  // Walk-in / Pickup jo chuna tha wahi (doosre panne se laut kar badle nahi)
  nbSetFulfil(NB_FULFIL);
  calcBill();
}
/* Discount rules, made predictable:
   - a PRESET owns the discount: it fills the ₹ field, keeps it in sync as
     items change (a 10% preset stays 10%), and locks manual entry
   - "No discount" unlocks the ₹ field for manual entry
   - the note under the field says which one is actually applied
   - a coupon is validated at save by the server (noted in the UI) */
function activePreset() {
  const i = $("nb-preset").value;
  if (i === "") return null;
  return (SETTINGS_CACHE.discount_presets || [])[parseInt(i)] || null;
}
function applyPreset() {
  if (!activePreset()) $("nb-disc").value = "";
  calcBill();
}
function addLine() { LINES.push({ service: "", garment: "", qty: 1, rate: "", amount: 0, pieces: [] }); renderLines(); }
function delLine(i) { LINES.splice(i, 1); if (!LINES.length) addLine(); renderLines(); }
/* Sabse zyada bikne wala pehle: `uses` = pichhle 90 din mein kitne bills mein
   (server deta hai). sort stable hai — barabar ho to rate card ka purana kram. */
const byUses = (a, b) => (b.uses || 0) - (a.uses || 0);
const services = () => {
  const active = RATES.filter((r) => r.is_active);
  const total = {};
  active.forEach((r) => { total[r.service] = (total[r.service] || 0) + (r.uses || 0); });
  return [...new Set(active.map((r) => r.service))].sort((a, b) => total[b] - total[a]);
};
const garmentsFor = (svc) => RATES.filter((r) => r.is_active && r.service === svc).sort(byUses);

function renderLines() { KKDS.keepScroll(paintLines, ["nbq-svcs", "nbw-cats"]); }
function paintLines() {
  $("nb-lines").innerHTML = LINES.map((l, i) => `
    <div class="lineitem">
      <div class="lf lf-service"><span class="ll">Service</span>
        <select aria-label="Service" onchange="svcPick(${i},this.value)">
          <option value="">Service…</option>
          ${services().map((s) => `<option value="${esc(s)}" ${l.service === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
          ${canEditRates() ? `<option value="${NEW_RATE}">➕ New service…</option>` : ""}
        </select></div>
      <div class="lf lf-item"><span class="ll">Item</span>
        <select aria-label="Item" onchange="itemPick(${i},this.value)">
          <option value="">Item…</option>
          ${garmentsFor(l.service).map((r) => `<option value="${esc(r.garment)}" ${l.garment === r.garment ? "selected" : ""}>${esc(r.garment || "(per kg)")} — ₹${r.rate}/${r.unit}</option>`).join("")}
          ${canEditRates() && l.service ? `<option value="${NEW_RATE}">➕ New item…</option>` : ""}
        </select></div>
      <div class="lf lf-qty"><span class="ll">Qty / kg</span>
        <input inputmode="decimal" type="number" min="0.1" step="0.1" value="${l.qty}" aria-label="Quantity" title="Qty / kg"
          onchange="LINES[${i}].qty=parseFloat(this.value)||1;calcBill()"></div>
      <div class="lf lf-rate"><span class="ll">Rate ₹</span>
        <input inputmode="decimal" type="number" min="0" step="0.01" value="${l.rate}" placeholder="Rate" aria-label="Rate in rupees"
          onchange="LINES[${i}].rate=parseFloat(this.value)||0;calcBill()"><small class="nb-cost" id="nb-cost-${i}"></small></div>
      <div class="lf lf-amt"><span class="ll">Amount</span>
        <div class="money" id="nb-amt-${i}">${money(l.amount)}</div></div>
      <button class="btn sm ghost danger-ic del" aria-label="Remove item" title="Remove item" onclick="delLine(${i})">✕</button>
      ${lineUnit(l) === "kg" ? `<div class="lf lf-pieces">
        <button class="btn ghost sm" onclick="piecesModal(${i})">👕 ${piecesCount(l.pieces) ? "Edit clothes" : "+ Add clothes (count only)"}</button>
        ${piecesCount(l.pieces) ? `<span class="muted">${esc(piecesLabel(l.pieces))}</span>` : ""}
      </div>` : ""}
    </div>`).join("");
  // Chips ki line ya tiles badlein, page wahin rahe (iPhone khud nahi sambhalta)
  const paint = () => { renderQuick(); nbUsualPaint(); };
  if (window.KKBill) KKBill.keep($("nbq-items"), paint); else paint();
  calcBill();
}

/* ---- phone par bill: tap karke jodo ----
   Do dropdown har item par (service, phir item) phone par sabse dheema
   kaam tha — aur har item ek bada dabba banta tha. Yahan upar service ke
   chips, neeche us service ke kapde daam ke saath: ek tap = 1 juda, dobara
   tap = 2. Neeche chhota cart. Data wahi LINES hai jo desktop editor
   likhta hai, isliye hisaab aur save ek hi rasta. */
let NB_SVC = "";
let NBQ_LIST = [];   // tiles as rendered (search can mix services)

/* Kapde kahan hain — dukaan par, ya grahak se lene jaana hai? Lene jaana
   ho to pickup_date jaata hai aur order delivery wale ki list mein pickup
   banke dikhta hai. Pehle ye sawaal sirf staff panel poochhta tha; dashboard
   ka har bill "dukaan mein hai" maana jaata tha. */
/* ⚡ Urgent — ek tap. Charge owner ki setting se apne aap (items ka % ya
   fixed ₹), jab tak haath se na badla jaye; "No charge" se maaf. Delivery
   date "urgent delivery days" par aa jaati hai. Order urgent banta hai —
   washerman ke work order par 🔴 URGENT, staff list mein sabse upar. */
let NB_URG = { on: false, manual: false };
const urgCfg = () => {
  const s = SETTINGS_CACHE || {};
  const days = parseInt(s.urgent_delivery_days);
  return {
    type: s.urgent_charge_type === "flat" ? "flat" : "percent",
    value: Math.max(0, Number(s.urgent_charge_value ?? 50) || 0),
    days: Number.isFinite(days) ? Math.max(0, days) : 1,
  };
};
const urgDefault = (sub) => {
  const c = urgCfg();
  const raw = c.type === "flat" ? c.value : (sub * c.value) / 100;
  return raw > 0 ? Math.round(raw) : 0;
};
const isoInDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const daysWord = (d) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);
function nbToggleUrgent(force) {
  NB_URG.on = force === undefined ? !NB_URG.on : !!force;
  NB_URG.manual = false;
  const c = urgCfg();
  $("nb-date").value = nbAutoDeliveryDate();
  nbPaintUrgent();
  calcBill();
}
function nbPaintUrgent() {
  const c = urgCfg();
  $("nb-urgent-btn").classList.toggle("on", NB_URG.on);
  $("nb-urgent-btn").setAttribute("aria-pressed", String(NB_URG.on));
  $("nb-urg-box").hidden = !NB_URG.on;
  $("nb-urg-hint").textContent = (c.value ? (c.type === "flat" ? `+₹${c.value}` : `+${c.value}%`) : "no extra charge")
    + ` · ready ${daysWord(c.days)} · washer sees 🔴 URGENT on top`;
}
function nbUrgentInput() { NB_URG.manual = true; calcBill(); }
function nbUrgentWaive() { NB_URG.manual = true; $("nb-urg-amt").value = 0; calcBill(); }
function nbUrgentReset() { NB_URG.manual = false; calcBill(); }

let NB_PICKUP = false;
/* walkin | pickup (server: Order.fulfilment). Dukaan ke do hi raaste:
   walkin = grahak kapde dukaan par laaya aur wahin se le jaayega — READY par
   delivery boy ko koi kaam nahi; pickup = delivery boy ghar se laata hai
   (pickup_date + PICKUP_ASSIGNED) aur READY par wapas pahunchata hai.
   Server "delivery" bhi maanta hai (purane order), bas yahan chunav nahi. */
let NB_FULFIL = "walkin";
function nbSetPickup(on) { nbSetFulfil(on ? "pickup" : "walkin"); }
function nbSetFulfil(v) {
  NB_FULFIL = v === "pickup" ? "pickup" : "walkin";
  NB_PICKUP = NB_FULFIL === "pickup";
  document.querySelectorAll("#sec-newbill [data-ful]").forEach((b) => {
    b.classList.toggle("on", b.dataset.ful === NB_FULFIL);
    b.setAttribute("aria-checked", String(b.dataset.ful === NB_FULFIL));
  });
  $("nb-pickup-box").hidden = !NB_PICKUP;
  $("nb-pickup-err").textContent = "";
  // aaj ki tareekh IST mein — toISOString (UTC) raat 12 se 5:30 tak kal wala din deta
  if (NB_PICKUP && !$("nb-pickup-date").value) $("nb-pickup-date").value = isoDateLocal(new Date());
  $("nb-pick-hint").textContent = NB_PICKUP
    ? "Delivery boy collects from the customer's home, and delivers back when ready."
    : "Customer brought the clothes and collects them from the shop — no delivery run.";
  calcBill();
}
/* Advance kaise mila — Split = kuch cash, kuch UPI (do asli payment bante hain) */
function nbAdvMode() {
  const split = $("nb-advmode").value === "SPLIT";
  $("nb-splitbox").hidden = !split;
  if (!split) $("nb-advupi").value = "";
  $("nb-adv-err").textContent = "";
  calcBill();
}
const realLines = () => LINES.map((l, i) => [l, i]).filter(([l]) => l.service);
/* Tiles aur jode hue kapde — staff app wala roop (kk-bill.js: KKBill.icon,
   KKBill.cat). Data aur raaste wahi: NBQ_LIST, nbTap, nbStep, nbSetQty,
   delLine, piecesModal. Naya sirf category chip aur "₹80 each ✎" daam. */
let NBW_CAT = "all";     // Top wear / Ethnic / … (sirf is service ke)
let NBW_EDIT = -1;       // kis line ka daam khula hai
function renderQuick() {
  if (!$("nbq-svcs")) return;
  const K = window.KKBill;
  const icon = (g, u) => (K ? K.icon(g, u) : "");
  const cat = (r) => (K ? K.cat(r.garment, r.unit) : "other");
  // piece wali services (Dry Clean, Wash & Iron…) pehle — counter par yahi
  // zyada lagti hain; kg wali baad mein. Rate card API unit se sort karke
  // deti hai, jisme "kg" pehle aata tha.
  const isKg = (s) => garmentsFor(s).every((r) => r.unit === "kg");
  const svcs = services().sort((a, b) => isKg(a) - isKg(b));
  if (!svcs.includes(NB_SVC)) NB_SVC = svcs[0] || "";
  $("nbq-svcs").innerHTML = svcs.map((s) => {
    const n = realLines().filter(([l]) => l.service === s).reduce((a, [l]) => a + (lineUnit(l) === "kg" ? 1 : parseFloat(l.qty) || 0), 0);
    return `<button type="button" role="tab" class="${s === NB_SVC ? "on" : ""}" aria-selected="${s === NB_SVC}" data-fam="${K ? K.fam(s) : "wash"}"
      onclick="nbPickSvc(this.dataset.s)" data-s="${esc(s)}">${esc(s)}${n ? ` · ${n}` : ""}</button>`;
  }).join("");
  // Search ab dropdown hai (nbSearchWire): tiles sirf service + category se
  const inSvc = garmentsFor(NB_SVC);
  // Category chips: sirf wahi jo is service mein hain
  const cats = new Set(inSvc.map(cat));
  if (NBW_CAT !== "all" && !cats.has(NBW_CAT)) NBW_CAT = "all";
  if ($("nbw-cats")) {
    $("nbw-cats").innerHTML = K && cats.size > 1 ? K.CATS.filter(([k]) => k === "all" || cats.has(k)).map(([k, l]) =>
      `<button type="button" role="tab" class="${NBW_CAT === k ? "on" : ""}" aria-selected="${NBW_CAT === k}" onclick="nbwCat(this.dataset.c)" data-c="${k}">${l}</button>`).join("") : "";
  }
  const items = inSvc.filter((r) => NBW_CAT === "all" || cat(r) === NBW_CAT);
  NBQ_LIST = items;
  $("nbq-items").innerHTML = items.length
    ? items.map((r, n) => {
        // Tile: upar kapda (tap = +1), neeche ADD ya − n + (Blinkit jaisa). Daam
        // card se kam likha ho to kata hua card aur "saves ₹" — bill par wahi.
        const inCart = LINES.find((l) => l.service === r.service && l.garment === r.garment);
        const kg = r.unit === "kg";
        const count = inCart ? (kg ? `${inCart.qty}kg` : inCart.qty) : "";
        const rate = inCart ? Number(inCart.rate) : Number(r.rate);
        const save = inCart && rate < Number(r.rate) ? Number(r.rate) - rate : 0;
        const li = inCart ? LINES.indexOf(inCart) : -1;
        return `<div class="kb-tile${inCart ? " in" : ""}" data-fam="${K ? K.fam(r.service) : "wash"}">
          ${inCart ? `<span class="kb-n">${esc(String(count))}</span>` : ""}
          <button type="button" class="kb-tile-main" onclick="nbTap(${n})" aria-label="${esc((r.garment || "By weight") + " · " + r.service)}">
            ${icon(r.garment, r.unit)}<b>${esc(r.garment || "By weight")}</b><small>${esc(r.service)}</small>
            <em>${save ? `<s>${money(r.rate)}</s>` : ""}${money(rate)}${kg ? "/kg" : ""}${save ? `<span class="kb-sv">saves ${money(save)}</span>` : ""}</em></button>
          ${inCart
            ? `<div class="kb-tq"><button type="button" aria-label="${kg ? "Half kg less" : "One less"}" onclick="nbStep(${li},-1)">−</button><output>${esc(String(count))}</output><button type="button" aria-label="${kg ? "Half kg more" : "One more"}" onclick="nbStep(${li},1)">+</button></div>`
            : `<button type="button" class="kb-add" onclick="nbTap(${n})">ADD</button>`}
        </div>`;
      }).join("")
    : `<p class="kb-empty">${svcs.length ? "No items in this service." : "Your rate card is empty — add an item with “＋ Custom”."}</p>`;
  const rows = realLines();
  if (NBW_EDIT >= LINES.length) NBW_EDIT = -1;
  $("nb-cart").innerHTML = rows.length ? `<div class="kb-sub">Added items <button type="button" class="kb-link kb-draft-link" onclick="nbDraftSave()">Save as draft</button></div>
    <div class="kb-items-h" aria-hidden="true"><span></span><span>Item / service</span><span>Qty</span><span>Amount</span><span></span></div>`
    + rows.map(([l, i]) => {
      const kg = lineUnit(l) === "kg";
      const card = (RATES.find((x) => x.service === l.service && x.garment === l.garment) || {}).rate;
      const changed = card != null && Number(card) !== Number(l.rate);
      const name = l.garment || l.service;
      return `<div class="kb-it">
        ${icon(name, kg ? "kg" : "pc")}
        <div class="kb-it-n"><b>${esc(name)}</b>
          <button type="button" class="${changed ? "changed" : ""}" onclick="nbwEditRate(${i})">${esc(l.garment ? l.service + " · " : "")}${money(l.rate)}${kg ? "/kg" : " each"}${changed ? ` · card ${money(card)}` : ""} ✎</button>
          <small class="nb-cost" id="nbc-cost-${i}"></small></div>
        <div class="kb-qty">
          <button type="button" aria-label="${kg ? "Half kg less" : "One less"}" onclick="nbStep(${i},-1)">−</button>
          <input type="number" inputmode="${kg ? "decimal" : "numeric"}" min="${kg ? 0.1 : 1}" step="${kg ? 0.1 : 1}" value="${esc(l.qty)}" id="nbc-qty-${i}" aria-label="${kg ? "Weight in kg" : "How many"}"
            onchange="nbSetQty(${i},this.value)" oninput="nbLiveQty(${i},this.value)">
          <button type="button" aria-label="${kg ? "Half kg more" : "One more"}" onclick="nbStep(${i},1)">+</button>
        </div>
        <b class="kb-it-amt" id="nbc-amt-${i}">${money(l.amount)}</b>
        <button type="button" class="kb-del kb-it-x" aria-label="Remove ${esc(name)}" onclick="delLine(${i})">✕</button>
        ${NBW_EDIT === i ? `<div class="kb-it-more"><label class="kb-money"><span>₹</span><input type="number" inputmode="decimal" min="0" step="0.5" value="${esc(l.rate)}" id="nbw-rate-${i}" aria-label="Rate"
            onchange="LINES[${i}].rate=parseFloat(this.value)||0;renderLines()" oninput="LINES[${i}].rate=parseFloat(this.value)||0;calcBill()"></label>
          <small>${changed ? "card " + money(card) : "rate card price"}</small></div>` : ""}
        ${kg ? `<div class="kb-it-more"><button type="button" onclick="piecesModal(${i})">👕 ${piecesCount(l.pieces) ? "Edit clothes" : "+ Add clothes (count only)"}</button>
          ${piecesCount(l.pieces) ? `<small>${esc(piecesLabel(l.pieces))}</small>` : ""}</div>` : ""}
      </div>`;
    }).join("") : "";
}
function nbwCat(c) { NBW_CAT = c || "all"; if (window.KKBill) KKBill.keep($("nbw-cats"), renderQuick); else renderQuick(); }
function nbwEditRate(i) {
  NBW_EDIT = NBW_EDIT === i ? -1 : i;
  renderQuick();
  const box = $(`nbw-rate-${i}`);
  if (box) { box.focus(); box.select(); }
}
function nbPickSvc(s) { NB_SVC = s; if ($("nbq-q")) $("nbq-q").value = ""; if (window.KKBill) KKBill.keep($("nbq-svcs"), renderQuick); else renderQuick(); }
function nbTap(n) { nbAddRate(NBQ_LIST[n]); }
function nbAddRate(r) {
  if (!r) return;
  // khaali placeholder line (desktop editor ka "Service…") phone par bekaar
  LINES = LINES.filter((l) => l.service);
  const same = LINES.find((l) => l.service === r.service && l.garment === r.garment);
  if (same) {
    // kg par dobara tap se wazan nahi badhta — wazan − + se
    if (r.unit !== "kg") same.qty = (parseFloat(same.qty) || 0) + 1;
  } else {
    LINES.push({ service: r.service, garment: r.garment, qty: 1, rate: parseFloat(r.rate), amount: 0, pieces: [] });
  }
  $("nb-items-err").textContent = "";
  renderLines();    // keyboard yahan kabhi nahi kholte: ginti − + se
}
/* Search ka dropdown: chunte hi bill mein, tiles aur page apni jagah */
function nbSearchWire() {
  if (!window.KKBill || !$("nbq-q") || $("nbq-q").dataset.wired) return;
  $("nbq-q").dataset.wired = "1";
  KKBill.combo({
    input: $("nbq-q"), panel: $("nbq-p"),
    items: (q) => KKBill.rateOptions(RATES.filter((r) => r.is_active), q, nbInBill),
    onPick: (r) => { nbAddRate(r); toast(`Added ${r.garment || r.service}`); },
    create: (raw) => { const last = LINES.length - 1; if (last < 0 || LINES[last].service) addLine(); newRateModal(LINES.length - 1, NB_SVC, raw); },
    empty: () => "Not on the rate card",
  });
}
function nbStep(i, by) {
  const l = LINES[i];
  const kg = lineUnit(l) === "kg";
  const q = Math.round(((parseFloat(l.qty) || 0) + (kg ? by / 2 : by)) * 10) / 10;
  if (q < (kg ? 0.5 : 1)) { if (kg) return; delLine(i); return; }
  l.qty = q;
  renderLines();
}
function nbLiveQty(i, v) {
  // likhte waqt poora re-render nahi — cursor kood jaata hai; sirf rakam
  const q = parseFloat(v);
  if (q > 0) { LINES[i].qty = q; calcBill(); }
}
function nbSetQty(i, v) {
  const q = parseFloat(v);
  LINES[i].qty = q > 0 ? q : 1;
  renderLines();
}

/* ---- KG line ke kapde: sirf ginti, daam nahi ----
   Bill wazan se banta hai (3.5 kg x ₹60). Par bore mein kya-kya hai ye
   likhna zaroori hai — washerman ginti milata hai, aur wapas dete waqt
   "ek kurta kam hai" ka jawab yahi list hai. */
const lineUnit = (l) => (RATES.find((x) => x.service === l.service && x.garment === l.garment) || {}).unit;
const piecesCount = (p) => (p || []).reduce((s, x) => s + (parseInt(x.qty) || 0), 0);
const piecesLabel = (p) => (p || []).map((x) => `${x.type} ${x.qty}`).join(", ") + ` — ${piecesCount(p)} pcs`;
let PC_DRAFT = [];
function piecesModal(i) {
  PC_DRAFT = (LINES[i].pieces || []).map((x) => ({ ...x }));
  if (!PC_DRAFT.length) PC_DRAFT.push({ type: "", qty: 1 });
  // naam rate card ke kapdon se sujhaav — par koi bhi likha ja sakta hai
  const names = [...new Set(RATES.map((r) => (r.garment || "").trim()).filter(Boolean))].sort();
  openModal(`<h3>Clothes in this ${esc(LINES[i].service || "bag")}</h3>
    <p class="muted">Count only — the bill stays by weight. Staff and the receipt see this list.</p>
    <datalist id="pc-names">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    <div id="pc-rows" style="margin-top:10px"></div>
    <button class="btn ghost sm" onclick="pcAdd()">+ Add another cloth</button>
    <div class="sumrow" style="margin-top:10px"><span>Total pieces</span><b id="pc-total">0</b></div>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="pcSave(${i})">Save clothes</button>
    </div>`);
  pcRender();
  const first = $("pc-rows").querySelector("input");
  if (first && !(window.KKBill && KKBill.touch())) first.focus();
}
function pcRender() {
  $("pc-rows").innerHTML = PC_DRAFT.map((x, n) => `
    <div class="pc-row">
      <input list="pc-names" value="${esc(x.type)}" placeholder="Cloth, e.g. Shirt" maxlength="60" aria-label="Cloth name"
        oninput="PC_DRAFT[${n}].type=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();pcAdd()}">
      <input type="number" min="1" step="1" inputmode="numeric" value="${x.qty}" aria-label="How many"
        oninput="PC_DRAFT[${n}].qty=parseInt(this.value)||0;pcTotal()">
      <button class="btn sm ghost danger-ic" aria-label="Remove cloth" onclick="pcDel(${n})">✕</button>
    </div>`).join("");
  pcTotal();
}
function pcTotal() { $("pc-total").textContent = piecesCount(PC_DRAFT.filter((x) => (x.type || "").trim())); }
function pcAdd() {
  PC_DRAFT.push({ type: "", qty: 1 });
  pcRender();
  const rows = $("pc-rows").querySelectorAll(".pc-row input[list]");
  rows[rows.length - 1].focus();
}
function pcDel(n) { PC_DRAFT.splice(n, 1); if (!PC_DRAFT.length) PC_DRAFT.push({ type: "", qty: 1 }); pcRender(); }
function pcSave(i) {
  // ek hi kapda do baar likha ho to jod do — "Shirt 2" + "shirt 3" = Shirt 5
  const merged = [];
  PC_DRAFT.forEach((x) => {
    const type = (x.type || "").trim().replace(/\s+/g, " ");
    const qty = parseInt(x.qty) || 0;
    if (!type || qty < 1) return;
    const same = merged.find((m) => m.type.toLowerCase() === type.toLowerCase());
    if (same) same.qty += qty; else merged.push({ type, qty });
  });
  LINES[i].pieces = merged;
  closeModal();
  renderLines();
}
function lineRate(i) {
  const l = LINES[i];
  const r = RATES.find((x) => x.service === l.service && x.garment === l.garment);
  if (r) l.rate = parseFloat(r.rate);
  renderLines();
}

/* Settings ke upar plan ka card: /api/me sirf owner aur manager ko deta hai */
function paintPlanRing() {
  const box = $("set-plan-ring"), v = SIGNED_IN_AS?.tenant?.plan_validity;
  if (!box || !window.KKPlanRing) return;
  box.innerHTML = v ? `<div class="card">${KKPlanRing.html(v, "en")}</div>` : "";
}

/* Counter par grahak aisa kapda laaya jo rate card par nahi hai — bill
   chhod kar Settings jaane ke bajaye yahin jod do. Wo rate card mein bhi
   save hota hai, taaki agle bill par wahi daam mile.
   Sirf owner/manager: server bhi rate card badalne ki ijazat inhi ko deta
   hai, to option wahi dikhe jo sach mein chalega. */
const NEW_RATE = "__new__";
const canEditRates = () => {
  const role = SIGNED_IN_AS?.user?.role;
  return !role || role === "OWNER" || role === "MANAGER";   // !role = admin-key login
};
function svcPick(i, v) {
  if (v === NEW_RATE) { renderLines(); newRateModal(i, ""); return; }
  LINES[i].service = v; LINES[i].garment = ""; lineRate(i);
}
function itemPick(i, v) {
  if (v === NEW_RATE) { renderLines(); newRateModal(i, LINES[i].service); return; }
  LINES[i].garment = v; lineRate(i);
}
function newRateModal(i, service, itemName = "") {
  const unit = (garmentsFor(service)[0] || {}).unit || "pc";
  openModal(`<h3>${service ? "New item" : "New service"}</h3>
    <p class="muted">Added to your rate card too, so the next bill has it.</p>
    <div class="frm">
      <div class="setfield"><label for="nr-svcsel">Service</label>
        <select id="nr-svcsel" onchange="nrSvcPick()">${services().map((s) => `<option value="${esc(s)}"${s === service ? " selected" : ""}>${esc(s)}</option>`).join("")}<option value="__new"${service ? "" : " selected"}>➕ New service…</option></select>
        <input id="nr-svc" value="${esc(service)}" placeholder="New service name, e.g. Dry Clean" maxlength="60" autocomplete="off" style="margin-top:6px"${service ? " hidden" : ""}></div>
      <div class="setfield" id="nr-itemwrap"><label for="nr-item">Item</label>
        <input id="nr-item" value="${esc(itemName)}" placeholder="e.g. Blazer" maxlength="60" autocomplete="off"></div>
      <div class="split2">
        <div class="setfield"><label for="nr-unit">Charged per</label>
          <select id="nr-unit" onchange="nrUnit()">
            <option value="pc">Piece</option><option value="kg">Kg</option>
          </select></div>
        <div class="setfield"><label for="nr-rate">Rate (₹)</label>
          <input id="nr-rate" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0"></div>
      </div>
      <small class="fielderr" id="nr-err"></small>
    </div>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="nr-save" onclick="saveNewRate(this,${i})">Add to bill</button>
    </div>`);
  $("nr-unit").value = unit;
  nrUnit();
  // jo pehle se pata hai use dobara mat poochho — seedha agle khaali khaane par
  $(!service ? "nr-svc" : unit === "kg" || itemName ? "nr-rate" : "nr-item").focus();
  $("modal-body").querySelectorAll("input").forEach((el) => {
    el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("nr-save").click(); } };
  });
}
function nbNewRate() {
  // khaali aakhri line ho to wahi bharo, warna nayi line
  const last = LINES.length - 1;
  if (last < 0 || LINES[last].service) addLine();
  newRateModal(LINES.length - 1, "");
}
/* Service: list se chuno (dropdown), ya "New service…" par naam likho.
   Pehle text + datalist tha — phone par list kabhi khulti hi nahi thi. */
function nrSvcPick() {
  const sel = $("nr-svcsel"), inp = $("nr-svc");
  if (!sel || !inp) return;
  if (sel.value === "__new") { inp.hidden = false; inp.value = ""; inp.focus(); }
  else { inp.hidden = true; inp.value = sel.value; const u = (garmentsFor(sel.value)[0] || {}).unit; if (u && $("nr-unit")) { $("nr-unit").value = u; nrUnit(); } }
}
function nrUnit() {
  // kg wali service ka koi "item" nahi hota — poora bora tolta hai
  $("nr-itemwrap").style.display = $("nr-unit").value === "kg" ? "none" : "";
}
async function saveNewRate(btn, i) {
  const err = $("nr-err");
  err.textContent = "";
  const service = $("nr-svc").value.trim();
  const unit = $("nr-unit").value;
  const garment = unit === "kg" ? "" : $("nr-item").value.trim();
  const rate = parseFloat($("nr-rate").value);
  const fail = (msg, id) => { err.textContent = msg; $(id).focus(); };
  if (!service) return fail("Service name is required.", "nr-svc");
  if (unit === "pc" && !garment) return fail("Item name is required.", "nr-item");
  if (!(rate > 0)) return fail("Enter a rate above ₹0.", "nr-rate");
  await busy(btn, async () => {
    // 409: ye item card par pehle se hai — modal mein atkane ke bajaye wahi bill mein jodo
    let exists = false;
    try {
      await api("/admin/api/rates", { method: "POST", body: { service, garment, unit, rate } });
    } catch (e) {
      if (e.status !== 409) { err.textContent = e.message; return; }
      exists = true;
    }
    RATES = await api("/admin/api/rates");
    RM_RATES = RATES;   // Settings ka rate card bhi naya dekhe
    closeModal();
    toast(exists ? `${garment || service} is already on the rate card — added to the bill` : `${garment || service} added to the rate card`);
    NB_SVC = service;   // phone par nayi service ka chip chuna hua dikhe
    if (!LINES[i]) return;
    LINES[i].service = service; LINES[i].garment = garment;
    lineRate(i);
  });
}
/* Rate card par is line ki cost (Settings → Pricing → Cost per garment se
   bhari hui). Khaali = pata nahi, koi warning nahi. */
const lineCost = (l) => {
  const r = RATES.find((x) => x.service === l.service && x.garment === l.garment);
  return r && r.cost_rate != null && r.cost_rate !== "" ? Number(r.cost_rate) : null;
};
function calcBill() {
  let sub = 0;
  LINES.forEach((l, i) => {
    l.amount = (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0);
    sub += l.amount;
    const el = $("nb-amt-" + i); if (el) el.textContent = money(l.amount);
    const ph = $("nbc-amt-" + i); if (ph) ph.textContent = money(l.amount);
    // Cost se neeche rate likha? Owner ko dikhe — rokte nahi, bas batate hain
    const cost = lineCost(l), rate = parseFloat(l.rate) || 0;
    const below = cost != null && rate > 0 && rate < cost;
    for (const id of ["nb-cost-" + i, "nbc-cost-" + i]) {
      const c = $(id); if (!c) continue;
      c.textContent = below ? `Below cost — costs you ${money(cost)}` : "";
      c.classList.toggle("on", below);
    }
  });
  // preset owns the discount and tracks the subtotal live; manual otherwise
  const p = activePreset();
  const discEl = $("nb-disc");
  let disc;
  if (p) {
    disc = p.type === "percent" ? Math.round(sub * p.value) / 100 : Math.min(p.value, sub);
    discEl.value = disc || "";
    discEl.disabled = true;
  } else {
    discEl.disabled = false;
    disc = parseFloat(discEl.value) || 0;
  }
  const dnote = $("nb-disc-note");
  if (dnote) dnote.textContent = p
    ? `${p.name} applied${p.type === "percent" ? ` (${p.value}% of subtotal)` : ""} — manual entry is off`
    : (disc ? "Manual discount applied" : "");
  // ⚡ Urgent charge — chhoot ke baad (chhoot kapdon par hai, jaldi ki fees par nahi)
  let urg = 0;
  if (NB_URG.on) {
    if (!NB_URG.manual) $("nb-urg-amt").value = urgDefault(sub);
    urg = Math.max(0, parseFloat($("nb-urg-amt").value) || 0);
    $("nb-urg-note").textContent = (urg ? `${money(urg)} added to the bill` : "No urgent charge — still marked urgent")
      + ($("nb-date").value ? ` · delivery ${fmtDate($("nb-date").value)}` : "");
  }
  $("nb-urg-sum").hidden = !(NB_URG.on && urg);
  $("nb-urg-sumamt").textContent = money(urg);
  const pct = (parseFloat(SETTINGS_CACHE.gst_percent) || 18) / 100;
  const gst = $("nb-gst").checked ? Math.round((sub - disc + urg) * pct * 100) / 100 : 0;
  const total = Math.max(0, sub - disc + urg + gst);
  const adv = parseFloat($("nb-adv").value) || 0;
  $("nb-sub").textContent = money(sub);
  $("nb-gstamt").textContent = money(gst);
  $("nb-total").textContent = money(total);
  $("nb-due").textContent = money(Math.max(0, total - adv));
  // phone ki neeche wali patti + band section ka ek-line saar
  if ($("nb-bar-total")) {
    const n = realLines().length;
    $("nb-bar-total").textContent = money(total);
    $("nb-bar-count").textContent = !n ? "No items yet"
      : `${n} item${n > 1 ? "s" : ""}` + (adv ? ` · ${money(Math.max(0, total - adv))} due` : "")
        + (NB_PICKUP ? " · pickup" : "") + (NB_URG.on ? " · ⚡ urgent" : "");
  }
  if ($("nb-more-sum")) {
    const bits = [];
    if (disc) bits.push(`Discount ${money(disc)}`);
    if (gst) bits.push(`GST ${money(gst)}`);
    if (adv) bits.push(`Advance ${money(adv)}`);
    if ($("nb-coupon").value.trim()) bits.push(`Coupon ${$("nb-coupon").value.trim()}`);
    if ($("nb-date").value) bits.push(`Delivery ${fmtDate($("nb-date").value)}`);
    $("nb-more-sum").textContent = bits.join(" · ");
  }
  return { sub, disc, gst, total, adv, urg };
}
/* SECURITY: the customer's NAME comes from their WhatsApp profile — it is
   attacker-controlled text. It must never travel through an inline
   onclick="...'${name}'" JS string (a single quote breaks out = XSS).
   Rows are picked by INDEX into this array instead. */
let AC_HITS = [];
let AC_TIMER = null;      // debounce: har akshar par server nahi jaate
let AC_SEQ = 0;           // dher saare jawab aayen to sirf AAKHRI wala lagta hai

/* Naam ya number likhte hi purane customer ka sujhaav.
 *
 * Pehle ye chunaav BROWSER karta tha, `CUSTOMERS_CACHE` par — yani sirf un
 * teen sau customers par jo page ne utaare the. Jiska naam us list mein
 * nahi tha wo mila hi nahi karta tha, aur staff naya customer bana deta
 * tha; wahi ek grahak do baar dukaan mein baith jaata tha.
 *
 * Ab chunaav DB karta hai (indexed), aur network par sirf aath row aati
 * hain. Do cheezein zaroori thin:
 *   - **Debounce**: har keystroke par request nahi. 200ms chup rahe to ek
 *     request. "Anmol" par ek call, paanch nahi.
 *   - **Sequence**: dheema jawab tez jawab ke baad aa kar purane sujhaav
 *     na dikha de. Har request ka number hota hai; purana aaye to phenk
 *     diya jaata hai.
 *
 * SECURITY: customer ka naam unke WhatsApp profile se aata hai — yani
 * unka likha hua text. Wo kabhi inline onclick="...'${name}'" ke andar
 * nahi jaata (ek quote = XSS). Row INDEX se chuni jaati hai. */
const NB_CUST_HINT = "Old customers show up as you type — tap one to pick.";
function custAc(fieldId) {
  const isName = fieldId === "nb-name";
  const box = $(isName ? "nb-ac-name" : "nb-ac");
  const other = $(isName ? "nb-ac" : "nb-ac-name");
  if (other) other.innerHTML = "";
  if (!isName) { const err = $("nb-phone-err"); if (err) err.textContent = ""; }
  const q = $(fieldId).value.trim();
  clearTimeout(AC_TIMER);
  const hint = $("nb-cust-hint");
  if (hint) hint.textContent = NB_CUST_HINT;
  if (q.length < 2) { box.innerHTML = ""; return; }
  const mine = ++AC_SEQ;
  AC_TIMER = setTimeout(async () => {
    let hits = [];
    try {
      hits = await api(`/admin/api/customers/search?q=${encodeURIComponent(q)}`);
    } catch (e) {
      box.innerHTML = "";       // sujhaav ek suvidha hai — fail ho to chup
      return;
    }
    if (mine !== AC_SEQ) return;            // beech mein aur likh diya gaya
    if (document.activeElement !== $(fieldId)) return;   // aadmi aage badh gaya — list dobara na khule
    AC_HITS = hits;
    // Koi nahi mila to dropdown nahi: wo agle khaane ko dhak kar chipka rehta tha
    if (hint && !hits.length) hint.textContent = "No match — this will be a new customer";
    box.innerHTML = hits.map((c, i) =>
      `<div data-action="pickCust" data-index="${i}">${esc(displayName(c.name, c.phone))} · ${esc(c.phone)}</div>`).join("");
  }, 200);
}

function pickCust(i) {
  const c = AC_HITS[i];
  if (!c) return;
  $("nb-phone").value = c.phone;
  $("nb-name").value = c.name || "";
  $("nb-ac").innerHTML = "";
  const nameBox = $("nb-ac-name");
  if (nameBox) nameBox.innerHTML = "";
  if (window.KKBill) KKBill.dropFocus();   // grahak mil gaya: keyboard ka ab kaam nahi
  nbRewards(c.phone);
  nbUsual(c.phone);
}

/* ---- 🎁 reward on New bill: grahak chunte hi dikhe, ek tap mein lage, ✕ se hate ---- */
let NB_REWARDS = [], NB_REWARD_PHONE = "";
async function nbRewards(phone) {
  phone = (phone || "").trim();
  if (!phone || phone === NB_REWARD_PHONE) return;
  NB_REWARD_PHONE = phone; NB_REWARDS = [];
  try { NB_REWARDS = (await api(`/admin/api/customers/rewards?phone=${encodeURIComponent(phone)}`)).available || []; }
  catch (e) { NB_REWARDS = []; }
  nbRewardPaint();
}
function nbRewardPaint() {
  const box = $("nb-reward");
  if (!box) return;
  const cur = ($("nb-coupon").value || "").trim().toUpperCase();
  if (!NB_REWARDS.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = NB_REWARDS.map((r) => r.code === cur
    ? `<div class="rwchip on">🎁 <b>${esc(r.reward)}</b> applied · ${esc(r.code)} <button type="button" class="btn sm ghost" data-action="nbRewardClear">✕ Remove</button></div>`
    : `<div class="rwchip">🎁 Customer has <b>${esc(r.reward)}</b> earned${r.expires_at ? ` · valid till ${esc(r.expires_at.slice(0, 10))}` : ""} <button type="button" class="btn sm" data-action="nbRewardApply" data-code="${esc(r.code)}">Apply</button></div>`).join("");
}
/* ---- ⭐ grahak ke aam items (kk-bill.js KKBill.usual): chip chuna = bill mein 1 ke
   saath, × = bill se bahar, kabhi khud nahi. Ginti − + se: har baar alag hoti
   hai. Bill (LINES) hi asli list hai; NB_USUAL_EXTRA sirf ＋ Add wale kapde yaad
   rakhta hai jab tak wo bill mein hain. ---- */
let NB_USUAL = [], NB_USUAL_PHONE = "", NB_USUAL_EXTRA = [];
async function nbUsual(phone) {
  phone = (phone || "").trim();
  if (phone === NB_USUAL_PHONE) return;
  NB_USUAL_PHONE = phone; NB_USUAL = [];
  nbUsualPaint();                                        // pichhle grahak ke chips turant hatao
  if (phone) {
    try { NB_USUAL = (await api(`/admin/api/customers/usual-items?phone=${encodeURIComponent(phone)}`)).items || []; }
    catch (e) { NB_USUAL = []; }
    if (phone !== NB_USUAL_PHONE) return;                // beech mein doosra grahak chun liya
  }
  nbUsualPaint();
}
const nbInBill = (u) => LINES.some((l) => l.service === u.service && (l.garment || "") === (u.garment || ""));
const nbRateOf = (u) => RATES.find((x) => x.is_active && x.service === u.service && x.garment === u.garment);
function nbUsualList() {
  NB_USUAL_EXTRA = NB_USUAL_EXTRA.filter(nbInBill);
  const same = (a) => (b) => a.service === b.service && (a.garment || "") === (b.garment || "");
  // rate card se mel na khaye (beech mein band hua) to chip nahi
  const list = NB_USUAL.filter(nbRateOf).concat(NB_USUAL_EXTRA.filter((x) => !NB_USUAL.some(same(x))));
  return list.map((u) => {
    const l = LINES.find(same(u));
    return { service: u.service, garment: u.garment || "", title: u.garment || u.service, sub: u.garment ? u.service : "by weight",
      on: !!l, qty: l ? (lineUnit(l) === "kg" ? `${l.qty} kg` : `×${l.qty}`) : "" };
  });
}
function nbUsualPaint() {
  const box = $("nb-usual");
  if (!box || !window.KKBill) return;
  KKBill.usual(box, {
    list: nbUsualList(),
    options: (q) => KKBill.rateOptions(RATES.filter((r) => r.is_active), q, nbInBill),
    onSelect: (u) => nbUsualAdd(u),
    onPickRate: (r) => { if (!nbInBill(r)) NB_USUAL_EXTRA.push({ service: r.service, garment: r.garment }); nbUsualAdd(r); },
    onRemove: (u) => {
      const at = LINES.findIndex((l) => l.service === u.service && (l.garment || "") === u.garment);
      if (at >= 0) delLine(at);
    },
    onAll: () => { nbUsualList().filter((u) => !u.on).forEach((u) => nbUsualAdd(u, true)); renderLines(); },
  });
}
// Pehle se bill mein hai to dobara nahi (likhi hui ginti wahi rahe)
function nbUsualAdd(u, quiet) {
  const r = u && nbRateOf(u);
  if (!r || nbInBill(u)) return;
  LINES = LINES.filter((l) => l.service);              // khaali "Service…" line hatao
  LINES.push({ service: r.service, garment: r.garment, qty: 1, rate: parseFloat(r.rate), amount: 0, pieces: [] });
  $("nb-items-err").textContent = "";
  if (!quiet) renderLines();
}
/* ---- Draft: isi device par, server par nahi (dekho kk-ds.js) ---- */
const nbDraftScope = () => `admin.${SIGNED_IN_AS?.tenant?.slug || "home"}.${SIGNED_IN_AS?.user?.email || "key"}`;
function nbDraftSave() {
  const phone = $("nb-phone").value.trim(), items = nbwItems();
  if (!phone && !items.length) return toast("Nothing to save yet", true);
  const ok = KKDS.draft.save(nbDraftScope(), {
    customer: $("nb-name").value.trim() || phone, phone, name: $("nb-name").value.trim(),
    items: items.map((l) => ({ ...l, card: (RATES.find((x) => x.service === l.service && x.garment === l.garment) || {}).rate })),
    notes: $("nb-notes").value, disc: $("nb-disc").value,
  });
  toast(ok ? "Draft saved on this device" : "Couldn't save the draft on this device", !ok);
}
function nbDraftPaint() {
  const box = $("nb-draft-note");
  if (!box) return;
  const d = NBW_STEP === 1 && !nbwItems().length && KKDS.draft.load(nbDraftScope());
  box.hidden = !d;
  if (d) box.innerHTML = `<span><b>Draft bill</b><br>${esc(KKDS.draft.label(d))}</span>
    <button type="button" class="btn sm" data-action="nbDraftResume">Resume</button>
    <button type="button" class="btn ghost sm" data-action="nbDraftDiscard">Discard</button>`;
}
function nbDraftResume() {
  const d = KKDS.draft.load(nbDraftScope());
  if (!d) return nbDraftPaint();
  // Rate card badal chuka ho sakta hai: band item nahi; haath se badla daam wahi, baaki naya card
  const items = (d.items || []).flatMap((l) => {
    const r = RATES.find((x) => x.is_active && x.service === l.service && x.garment === l.garment);
    return r ? [{ ...l, rate: Number(l.rate) === Number(l.card) ? parseFloat(r.rate) : l.rate }] : [];
  });
  const dropped = (d.items || []).length - items.length;
  LINES = items;
  if (!LINES.length) addLine();
  $("nb-phone").value = d.phone || "";
  $("nb-name").value = d.name || "";
  $("nb-notes").value = d.notes || "";
  $("nb-disc").value = d.disc || "";
  nbRewards(d.phone); nbUsual(d.phone);
  KKDS.draft.clear(nbDraftScope());
  renderLines();
  nbwGo(items.length ? 2 : 1, { force: true });
  if (dropped) toast(`${dropped} item${dropped > 1 ? "s" : ""} no longer on the rate card`, true);
}
function nbRewardApply(code) { $("nb-coupon").value = code; nbRewardPaint(); toast("Reward applied — discount shows on save"); }
function nbRewardClear() { $("nb-coupon").value = ""; nbRewardPaint(); }
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "nb-phone") { nbRewards(e.target.value); nbUsual(e.target.value); }
});
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "pickCust") return pickCust(Number(el.dataset.index));
  if (action === "composeMessage") return composeMessage(el.dataset.num, el.dataset.kind);
  if (action === "nbRewardApply") return nbRewardApply(el.dataset.code);
  if (action === "nbRewardClear") return nbRewardClear();
  if (action === "nbDraftResume") return nbDraftResume();
  if (action === "nbDraftDiscard") { KKDS.draft.clear(nbDraftScope()); return nbDraftPaint(); }
  if (action === "rwToggle") return rwToggle(el.dataset.id);
  if (action === "rwDelete") return rwDelete(el.dataset.id);
  if (action === "tplDelete") return tplDelete(el.dataset.name);
  if (action === "taskCustomerPick") return selectTaskCustomer(el.dataset.id, el.dataset.name, el.dataset.phone);
  if (action === "rmDeleteGarment") return rmDeleteGarment(el.dataset.name);
  if (action === "rmDeleteService") return rmDeleteService(el.dataset.name);
  if (action === "rmRename") return rmRename(el.dataset.kind, el.dataset.name);
  if (action === "toggleStage") return toggleStage(el.dataset.service, el.dataset.stage);
});
/* Grahak aur dukaan ka likha naam data-* mein jaata hai, inline handler mein nahi:
   onclick ke JS string mein esc() bekaar hai, browser &#39; ko wapas ' bana deta hai. */
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (!el) return;
  if (el.dataset.change === "rmCell") return rmCell(el.dataset.garment, el.dataset.service, el.value, el.dataset.id);
  if (el.dataset.change === "costingAlloc") return costingAlloc(el.dataset.category, el.value);
});

/* ---- Settings → Rewards ---- */
let RW_RULES = [];
async function loadRewards() {
  let rules = { rules: [], suggested: [] }, earned = { rewards: [] };
  try { [rules, earned] = await Promise.all([api("/admin/api/rewards/rules"), api("/admin/api/rewards/earned")]); }
  catch (e) { $("rw-rules").innerHTML = errBox(e.message); return; }
  RW_RULES = rules.rules;
  $("rw-rules").innerHTML = RW_RULES.length ? `<div class="stafflist">${RW_RULES.map((r) => `
    <div class="staffrow ${r.active ? "" : "off"}">
      <div class="who"><div class="nm">${esc(r.name)}</div>
        <div class="meta"><span class="badge">${esc(r.condition)}</span><span class="badge role">${esc(r.reward)}</span>
          ${r.min_order ? `<span class="badge">min bill ${money(r.min_order)}</span>` : ""}<span class="badge">coupon valid ${r.valid_days} days</span>
          <span class="statuspill ${r.active ? "on" : "off"}">${r.active ? "Active" : "Paused"}</span></div></div>
      <div class="acts">
        <button class="btn sm ghost" data-action="rwToggle" data-id="${esc(r.id)}">${r.active ? "Pause" : "Resume"}</button>
        <button class="btn sm danger" data-action="rwDelete" data-id="${esc(r.id)}">Delete</button>
      </div></div>`).join("")}</div>`
    : `<div class="emptystate">No reward rules yet. Start with the suggested ones below.</div>`;
  const have = new Set(RW_RULES.map((r) => r.name));
  const sug = (rules.suggested || []).filter((s) => !have.has(s.name));
  $("rw-suggest").innerHTML = sug.length ? `<div class="muted" style="margin-bottom:6px">Suggested (laundry industry standard):</div>` + sug.map((s, i) =>
    `<button class="btn sm ghost" style="margin:0 6px 6px 0" onclick="rwAddSuggested(${i})">＋ ${esc(s.name)} → ${s.reward_type === "percent" ? s.value + "% off" + (s.max_discount ? " (max ₹" + s.max_discount + ")" : "") : "₹" + s.value + " off"}</button>`).join("") : "";
  window.RW_SUG = sug;
  const list = earned.rewards || [];
  $("rw-earned").innerHTML = list.length ? `<table class="tbl keep"><thead><tr><th>Customer</th><th>Reward</th><th>Code</th><th>Status</th><th>Earned</th><th></th></tr></thead><tbody>${list.map((x) => `
    <tr><td>${esc(x.customer || "")}<div class="muted">${esc(x.customer_phone || "")}</div></td><td>${esc(x.reward)}<div class="muted">${esc(x.rule || "")}</div></td>
    <td><b>${esc(x.code)}</b></td><td><span class="pill ${x.status === "used" ? "PAID" : x.status === "earned" ? "PARTIAL" : "UNPAID"}">${x.status}</span>${x.note ? `<div class="muted">${esc(x.note)}</div>` : ""}</td>
    <td class="muted">${fmtDate(x.earned_at)}${x.expires_at ? `<div>till ${fmtDate(x.expires_at)}</div>` : ""}</td>
    <td>${x.status === "earned" ? `<button class="btn sm danger" onclick="rwCancel('${x.id}')">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">No rewards given yet.</p>`;
}
async function rwPost(body) {
  try { await api("/admin/api/rewards/rules", { method: "POST", body }); toast("Rule added"); loadRewards(); }
  catch (e) { toast(e.message, true); }
}
function rwAddSuggested(i) { const s = (window.RW_SUG || [])[i]; if (s) rwPost({ ...s, active: true }); }
function rwAdd() {
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  const body = {
    name: $("rw-name").value.trim(), kind: $("rw-kind").value, threshold: num("rw-threshold"),
    window_days: num("rw-window") || 30, reward_type: $("rw-type").value, value: num("rw-value"),
    max_discount: num("rw-cap"), min_order: num("rw-min"), valid_days: num("rw-valid") || 30, active: true,
  };
  if (!body.name || !body.threshold || !body.value) { toast("Name, condition value and reward value are required", true); return; }
  rwPost(body);
}
async function rwToggle(id) {
  const r = RW_RULES.find((x) => x.id === id); if (!r) return;
  const body = { name: r.name, kind: r.kind, window_days: r.window_days, threshold: r.threshold, reward_type: r.reward_type,
    value: r.value, max_discount: r.max_discount, min_order: r.min_order, valid_days: r.valid_days, active: !r.active };
  try { await api(`/admin/api/rewards/rules/${id}`, { method: "PUT", body }); loadRewards(); } catch (e) { toast(e.message, true); }
}
async function rwDelete(id) {
  if (!confirm("Delete this rule? Rewards already given stay valid.")) return;
  try { await api(`/admin/api/rewards/rules/${id}`, { method: "DELETE" }); loadRewards(); } catch (e) { toast(e.message, true); }
}
async function rwCancel(id) {
  if (!confirm("Cancel this reward? The coupon stops working.")) return;
  try { await api(`/admin/api/rewards/earned/${id}/cancel`, { method: "POST" }); toast("Reward cancelled"); loadRewards(); } catch (e) { toast(e.message, true); }
}

/* Bahar tap karte hi sujhaav band — warna wo doosre field ke upar chipka
   reh jaata hai. */
document.addEventListener("click", (e) => {
  if (e.target.closest(".autocomplete")) return;
  ["nb-ac", "nb-ac-name"].forEach((id) => { const b = $(id); if (b) b.innerHTML = ""; });
});

let NB_IDEM = "", NB_SIG = "";
function newIdemKey() {
  try { if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ""); } catch (_) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
async function saveBill(btn) {
  await busy(btn, async () => {
    // inline validation: the mistake is shown AT the field, not only a toast
    $("nb-phone-err").textContent = ""; $("nb-items-err").textContent = "";
    const t = calcBill();
    const phone = $("nb-phone").value.trim();
    if (!phone) {
      $("nb-phone-err").textContent = "Customer mobile number is required.";
      $("nb-phone").focus();
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      $("nb-phone-err").textContent = "That number looks too short — 10 digits needed.";
      $("nb-phone").focus();
      return;
    }
    // KG line ka item naam khali hota hai. Pehle kg ki pehchan service ke
    // NAAM mein "kg" dhoondh kar hoti thi — "Premium Wash" (kg) jaisi line
    // chupchaap gir jaati aur "Add at least one item" aata (BUG_006). Ab
    // rate card ki unit se.
    const items = LINES.filter((l) => l.service && (l.garment || lineUnit(l) === "kg")).map((l) => {
      const r = RATES.find((x) => x.service === l.service && x.garment === l.garment) || {};
      const item = { type: l.garment || l.service, service: l.service, qty: l.qty, rate: l.rate, amount: l.amount, unit: r.unit || "pc" };
      if (r.unit === "kg" && piecesCount(l.pieces)) item.pieces = l.pieces;
      return item;
    });
    if (!items.length) {
      $("nb-items-err").textContent = "Add at least one item — tap a service, then an item.";
      $("nb-items-err").scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (t.urg > 0) {
      // jaldi ki fees bill ki apni line — receipt par "Urgent charge", kapdon mein nahi ginti
      items.push({ type: "Urgent charge", service: "Urgent", qty: 1, rate: t.urg, amount: t.urg, unit: "pc", kind: "urgent_charge" });
    }
    if (NB_PICKUP && !$("nb-pickup-date").value) {
      $("nb-pickup-err").textContent = "Pick the day to collect the clothes.";
      $("nb-pickup-date").focus();
      return;
    }
    // Split: UPI hissa advance se zyada nahi ho sakta (server bhi rokta hai)
    const advMode = $("nb-advmode").value;
    const advUpi = advMode === "SPLIT" ? Math.max(0, parseFloat($("nb-advupi").value) || 0) : 0;
    $("nb-adv-err").textContent = "";
    if (advMode === "SPLIT" && t.adv > 0 && advUpi > t.adv) {
      $("nb-adv-err").textContent = "UPI part is more than the advance.";
      $("nb-more").open = true;
      $("nb-advupi").focus();
      return;
    }
    const body = {
      customer_phone: phone, customer_name: $("nb-name").value.trim() || null, items,
      total_amount: t.total, discount_amount: t.disc || null, gst_amount: t.gst || null,
      expected_delivery: $("nb-date").value || null, notes: $("nb-notes").value.trim() || null,
      // SPLIT = baaki cash + UPI hissa alag (server do payment likhta hai)
      advance_amount: t.adv || null, advance_method: t.adv ? (advMode === "SPLIT" ? "CASH" : advMode) : null,
      advance_split_upi: t.adv && advMode === "SPLIT" && advUpi > 0 ? advUpi : null,
      payment_note: $("nb-pnote").value.trim() || null,
      coupon_code: $("nb-coupon").value.trim() || null,
      // walkin | pickup | delivery — receipt aur READY wala message isi se
      fulfilment: NB_FULFIL,
      delivery_time: ($("nb-time") && $("nb-time").value) || null,
      // pickup_date bhara = kapde lene jaana hai: order delivery wale ki
      // list mein PICKUP_ASSIGNED banke jaata hai (staff panel jaisa)
      pickup_date: NB_PICKUP ? $("nb-pickup-date").value : null,
      priority: NB_URG.on ? "urgent" : "normal",
      // IMP_006: "New bill" par pehle tap se Save tak kitne second
      bill_seconds: NB_STARTED ? Math.round((Date.now() - NB_STARTED) / 1000) : null,
    };
    // Ek bill = ek key. Network gaya aur dobara Save dabaya to server wahi
    // order lautata hai — doosra order, doosra advance, doosre tags nahi.
    // Grahak ya bill badla to wo naya bill hai — purani key par server purana
    // order lauta deta. Advance is milan mein nahi: wo badle to bill wahi hai.
    const sig = JSON.stringify([phone, items, t.total, t.disc, t.gst, body.coupon_code]);
    if (sig !== NB_SIG) NB_IDEM = "";
    NB_SIG = sig;
    if (!NB_IDEM) NB_IDEM = newIdemKey();
    body.idempotency_key = NB_IDEM;
    let out;
    try { out = await api("/orders", { method: "POST", body }); }
    catch (e) {
      // 409: is key par alag bill bana hua hai — wahi key phir bhejna bekaar
      if (e.status === 409) NB_IDEM = "";
      throw e;
    }
    NB_IDEM = "";
    NB_STARTED = 0;
    KKDS.draft.clear(nbDraftScope());
    toast(T.billCreated + " — " + out.order_number);
    showBillSuccess(out);
    LINES = []; addLine();
    ["nb-phone", "nb-name", "nb-disc", "nb-adv", "nb-notes", "nb-coupon", "nb-preset", "nb-advupi", "nb-pnote"].forEach((id) => ($(id).value = ""));
    $("nb-advmode").value = "CASH"; nbAdvMode();
    // agla bill naye grahak ka — pichhle ke reward/usual chips na dikhen
    NB_REWARD_PHONE = ""; NB_REWARDS = []; nbRewardPaint();
    NB_USUAL_PHONE = ""; NB_USUAL = []; nbUsualPaint();
    nbSetPickup(false);
    nbToggleUrgent(false);   // agla bill normal se shuru (date bhi normal)
    calcBill();   // re-enables the manual discount field after a preset
    loadDashboard();
  });
}
function showBillSuccess(o) {
  if (window.KKBill && $("nb-done")) return nbShowDone(o);   // kk-bill.js: step 4 (staff app jaisa)
  if (window.KKTags) return KKTags.success(o);   // garments.js: print, labels, share
  const n = esc(o.order_number);
  const wa = waConnected();
  // Jhooth mat bolo: API juda nahi to customer ko kuch nahi gaya.
  const line = wa
    ? "Customer notified on WhatsApp; staff got the work order."
    : "WhatsApp not connected — customer has <b>not</b> been messaged. Share the bill from your phone:";
  openModal(`<h3>✅ ${n} created</h3>
    <p class="muted">Total ${o.total_amount ? money(o.total_amount) : "—"} · ${esc(o.customer_name || o.customer_phone)}. ${line}</p>
    <div class="btnrow" style="margin-top:12px">
      <button class="btn ghost" onclick="printReceiptFromOrder('${n}')">🖨 Print bill</button>
      ${wa ? `<button class="btn ghost" onclick="waBill('${n}')">📲 Send from shop number</button>` : ""}
      <button class="btn ${wa ? "ghost" : ""}" onclick="closeModal();shareBillFromOrder('${n}')">💬 Share on WhatsApp</button>
      <button class="btn ${wa ? "" : "ghost"}" onclick="closeModal()">Done</button>
    </div>`);
}

/* Step 4 — labels, receipt, status (kk-bill.js, staff app wala hi). Print /
   share / order detail — sab purane function. `o.whatsapp` server ka jawab
   hai: receipt sach mein gayi ya nahi (andaza nahi). */
function nbShowDone(o) {
  const total = Number(o.total_amount || 0), paid = Number(o.amount_paid || 0);
  const tags = !!(window.KKTags && typeof KKTags.tagsOn === "function" && KKTags.tagsOn());
  $("nb-form").hidden = true;
  if ($("nb-bar")) $("nb-bar").hidden = true;
  $("nb-done").hidden = false;
  $("nb-done-steps").innerHTML = KKBill.steps(4, [1, 2, 3], tags);
  KKBill.done($("nb-done-body"), {
    order: {
      number: o.order_number, customer: o.customer_name || o.customer_phone, total, paid, due: Math.max(0, total - paid),
      items: o.items || [], delivery: o.expected_delivery, delivery_time: o.delivery_time, fulfilment: o.fulfilment,
      status: o.status, created_at: o.created_at,
    },
    tagsOn: tags, qcOn: !!SETTINGS_CACHE.garment_qc_enabled, printedBy: "dashboard",
    api: (path, opts) => api(path, opts || {}),
    paths: {
      labels: (n) => `/admin/api/orders/${encodeURIComponent(n)}/labels`,
      printEvent: (n) => `/admin/api/orders/${encodeURIComponent(n)}/labels/print-event`,
      receipt: (n) => `/orders/${encodeURIComponent(n)}/receipt`,
    },
    saveSize: (size) => api("/admin/api/settings", { method: "PUT", body: { key: "label_size", value: size } }),
    whatsapp: o.whatsapp || null, waConnected: waConnected(),
    onPrintReceipt: (n) => printReceiptFromOrder(n),
    onShare: (n) => shareBillFromOrder(n),
    onTrack: (n) => orderDetail(n),
    onNew: () => nbDoneClose(true),
  });
  window.scrollTo({ top: 0 });
}
function nbDoneClose(focus) {
  if (!$("nb-done")) return;
  // bill ban chuka tha (kadam 4 khula) = naya bill, phir se kadam 1 se
  const fresh = !$("nb-done").hidden;
  $("nb-done").hidden = true;
  $("nb-done-body").innerHTML = "";
  $("nb-form").hidden = false;
  if ($("nb-bar")) $("nb-bar").hidden = false;
  if (fresh || focus) { NBW_DATE_MANUAL = false; NBW_EDIT = -1; NBW_CAT = "all"; nbwClearCust(false); }
  nbwGo(fresh || focus ? 1 : NBW_STEP, { force: true, quiet: true, noScroll: true });
  if (focus) { window.scrollTo({ top: 0 }); $("nb-phone").focus(); }
}

/* ---- New Bill: 1 → 2 → 3 kadam (dashboard) ----
   Purana form aur purane function waise hi; ye sirf dikhata hai ki kaunsa
   kadam khula hai. Peeche jaana hamesha khula (patti, ← Back, phone ka back
   button); aage tabhi jab pichhla kadam poora ho — number (aur pickup ka
   din), phir kam se kam ek kapda. Galti usi kadam par, usi khaane par.
   Phone ka back: har "aage" par history mein ek entry ({kk:"nav", nbw:n});
   popstate us entry ka kadam khol deta hai. Modal / exit wala tantra
   (openModal, askExit) waisa hi — wo kk dekhta hai, nbw nahi. */
let NBW_STEP = 1;
// Tareekh haath se badli? Tab tak har kadam par SLA se — kadam 1 par tareekh
// dikhti hai par saree/kambal (zyada din) kadam 2 mein judte hain
let NBW_DATE_MANUAL = false;
const nbwItems = () => LINES.filter((l) => l.service && (l.garment || lineUnit(l) === "kg"));
function nbwCheck(step) {
  if (step === 1) {
    const phone = $("nb-phone").value.trim();
    if (!phone) return { id: "nb-phone", err: "nb-phone-err", msg: "Customer mobile number is required." };
    if (phone.replace(/\D/g, "").length < 10) return { id: "nb-phone", err: "nb-phone-err", msg: "That number looks too short — 10 digits needed." };
    if (NB_PICKUP && !$("nb-pickup-date").value) return { id: "nb-pickup-date", err: "nb-pickup-err", msg: "Pick the day to collect the clothes." };
  }
  if (step === 2 && !nbwItems().length) {
    return { id: "nbq-svcs", err: "nb-items-err", msg: "Add at least one item — tap a service, then an item." };
  }
  return null;
}
function nbwGo(n, opts = {}) {
  const form = $("nb-form");
  if (!form) return;
  n = Math.min(3, Math.max(1, Number(n) || 1));
  const from = NBW_STEP;
  let bad = null;
  if (!opts.force) {
    for (let s = Math.min(from, n); s < n; s++) {
      bad = nbwCheck(s);
      if (bad) { n = s; break; }
    }
  }
  // khule sujhaav naye kadam ke upar na latken
  ["nb-ac", "nb-ac-name"].forEach((id) => { const b = $(id); if (b) b.innerHTML = ""; });
  if (n > from && !opts.fromHistory && CURRENT === "newbill") {
    // jis kadam se aage gaye uski entry par uska number, phir har naye kadam ki ek
    const st = history.state || {};
    if (!st.kk || st.kk === "nav") history.replaceState({ ...st, kk: "nav", nbw: from }, "", location.href);
    for (let s = from + 1; s <= n; s++) history.pushState({ kk: "nav", nbw: s }, "", location.href);
  }
  NBW_STEP = n;
  form.dataset.step = String(n);
  if (!NBW_DATE_MANUAL && $("nb-date")) { $("nb-date").value = nbAutoDeliveryDate(); calcBill(); }
  nbwPaint();
  // Upar tabhi jab sach mein naya kadam khula
  if (!opts.noScroll && n !== from) window.scrollTo({ top: 0, behavior: "instant" });
  if (bad && !opts.quiet) nbwShowErr(bad);
}
function nbwShowErr(bad) {
  $(bad.err).textContent = bad.msg;
  const el = $(bad.id);
  if (el && el.offsetParent) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
}
/* Peeche: history mein apni entry ho to wahi raasta (phone ka back aur ye
   button ek jaise chalein), warna seedha. */
function nbwBack(to) {
  to = Math.max(1, to);
  const st = history.state || {};
  if (st.nbw === NBW_STEP && NBW_STEP > to) history.go(to - NBW_STEP);
  else nbwGo(to, { force: true });
}
async function nbwSave(btn) {
  for (const s of [1, 2]) {
    const bad = nbwCheck(s);
    if (bad) { nbwBack(s); $(bad.err).textContent = bad.msg; return; }   // galti wale kadam par, khaane ke neeche
  }
  await saveBill(btn);
  if ($("nb-done") && !$("nb-done").hidden) {
    // bill ban gaya: kadam wali entries hata do — back ab pichhle panne par
    const s = (history.state || {}).nbw || 1;
    if (s > 1) history.go(1 - s);
  }
}
function nbwPaint() {
  const form = $("nb-form");
  if (!form || !window.KKBill) return;
  nbDraftPaint();
  if ($("nb-draft")) $("nb-draft").hidden = NBW_STEP === 1 && !nbwItems().length;
  const tags = !!(window.KKTags && typeof KKTags.tagsOn === "function" && KKTags.tagsOn());
  const done = [1, 2].filter((s) => !nbwCheck(s));
  $("nb-steps").innerHTML = KKBill.steps(NBW_STEP, done, tags);
  $("nb-back").hidden = NBW_STEP === 1;
  const next = $("nb-next");
  // busy() spinner dikha raha ho to label mat chheno
  if (!next.disabled) {
    next.textContent = NBW_STEP === 1 ? "Next: Clothes →" : NBW_STEP === 2 ? "Next: Review →"
      : tags ? "Bill & print labels" : "Generate bill";
  }
  if ($("nbw-gstp")) $("nbw-gstp").textContent = `${parseFloat((SETTINGS_CACHE || {}).gst_percent) || 18}%`;
  // bill save hua (saveBill ne number khaali kiya) = grahak ka card bhi hatao
  if (NBW_CUST && !$("nb-phone").value.trim()) nbwClearCust(false);
  const items = nbwItems();
  const pcs = items.reduce((s, l) => s + (lineUnit(l) === "kg" ? 1 : parseFloat(l.qty) || 0), 0);
  if ($("nbw-count")) $("nbw-count").textContent = pcs ? `${pcs} item${pcs === 1 ? "" : "s"}` : "";
  if ($("nbw-pcs")) $("nbw-pcs").textContent = String(pcs);
  const m = calcBill();
  if ($("nbw-count3")) $("nbw-count3").textContent = pcs ? `${pcs} item${pcs === 1 ? "" : "s"}` : "";
  // Card se kam daam likha = grahak ki bachat (bill par "you saved" wahi line)
  const sav = items.reduce((a, l) => { const c = (RATES.find((x) => x.service === l.service && x.garment === l.garment) || {}).rate;
    return a + (c != null && Number(l.rate) < Number(c) ? (Number(c) - Number(l.rate)) * (parseFloat(l.qty) || 0) : 0); }, 0);
  if ($("nbw-savrow")) { $("nbw-savrow").hidden = !(sav > 0.5); $("nbw-sav").textContent = "−" + money(sav); }
  if ($("nbw-when")) { const t = $("nb-time").value; $("nbw-when").textContent = $("nb-date").value ? `ready ${fmtDate($("nb-date").value)}${t && window.KKBill ? ", " + KKBill.time12(t) : ""}` : ""; }
  if ($("nbw-duebox")) $("nbw-duebox").classList.toggle("paid", m.total - m.adv <= 0 && items.length > 0);
  if ($("nbw-advfull")) $("nbw-advfull").textContent = `Full ${money(m.total)}`;
  // Cash / UPI / Card / Split — asli khaana chhupa select (#nb-advmode) hai
  const pm = $("nb-advmode") ? $("nb-advmode").value : "CASH";
  document.querySelectorAll("#nbw-pm [data-pm]").forEach((b) => {
    b.classList.toggle("on", b.dataset.pm === pm);
    b.setAttribute("aria-checked", String(b.dataset.pm === pm));
  });
  if ($("nbw-coupon") && $("nb-coupon").value.trim()) $("nbw-coupon").hidden = false;
  if (NBW_STEP === 3) nbwRecap();
}

/* Purana grahak chuna (pickCust ne khaane bhar diye) — ab uska card:
   naam, kitne order, New / Regular / VIP, aur purana udhaar */
let NBW_CUST = null;
function nbwShowCust(c) {
  const K = window.KKBill;
  if (!K || !$("nbw-cust")) return;
  NBW_CUST = c;
  const tag = K.custTag(c.order_count, c.last_order_at);
  $("nbw-custin").hidden = true;
  $("nbw-cust").hidden = false;
  $("nbw-cust").innerHTML = `<div class="kb-cust" id="nbw-custcard">
      <span class="kb-av">${esc(K.initials(c.name))}</span>
      <div class="kb-cust-tx"><b>${esc(displayName(c.name, c.phone))}</b><span>${esc(c.phone)}</span>
        <small>${c.order_count ? `Total orders: ${c.order_count}${c.last_order_at ? ` · Last: ${esc(K.shortDate(c.last_order_at))}` : ""}` : "First order"}</small>
        <small class="kb-owes" id="nbw-owes" hidden></small></div>
      <span class="kb-tag ${tag.key}">${tag.label}</span></div>
    <div class="kb-cust-btns"><button type="button" class="kb-btn ghost sm" data-nbw="custnew">＋ New customer</button>
      <button type="button" class="kb-btn ghost sm" data-nbw="custhistory">View history</button></div>`;
  // Purana udhaar yahin, is pal — grahak abhi saamne khada hai
  api(`/admin/api/customers/${encodeURIComponent(c.phone)}/detail`).then((d) => {
    if (NBW_CUST !== c) return;               // beech mein doosra grahak chun liya
    c.detail = d;
    const due = Number(d.customer.outstanding) || 0;
    if (due > 0 && $("nbw-owes")) {
      $("nbw-owes").hidden = false;
      $("nbw-owes").textContent = `⚠ ${money(due)} previous due`;
      $("nbw-custcard").classList.add("owes");
    }
  }).catch(() => { /* card bina udhaar ke bhi theek */ });
}
function nbwClearCust(focus) {
  NBW_CUST = null;
  if ($("nbw-cust")) { $("nbw-cust").hidden = true; $("nbw-cust").innerHTML = ""; }
  if ($("nbw-custin")) $("nbw-custin").hidden = false;
  if (!focus) return;
  // "＋ New customer": pichhle grahak ka number, naam, reward, usual — sab hatao
  $("nb-phone").value = ""; $("nb-name").value = "";
  NB_REWARD_PHONE = ""; NB_REWARDS = []; nbRewardPaint();
  NB_USUAL_PHONE = ""; NB_USUAL = []; nbUsualPaint();
  $("nb-phone").focus();
  nbwPaint();
}
/* Grahak ke pichhle bill — sirf dekhne ke liye; bill wahin ka wahin */
async function nbwCustHistory() {
  const c = NBW_CUST;
  if (!c) return;
  openModal(`<h3>Bills — ${esc(displayName(c.name, c.phone))}</h3><div id="nbh-list"><p class="muted">Loading…</p></div>
    <div class="btnrow"><button class="btn ghost" data-kk="close">Close</button></div>`);
  let d = c.detail;
  if (!d) {
    try { d = c.detail = await api(`/admin/api/customers/${encodeURIComponent(c.phone)}/detail`); }
    catch (e) { if ($("nbh-list")) $("nbh-list").innerHTML = errBox(e.message); return; }
  }
  const box = $("nbh-list");
  if (!box) return;
  const rows = (d.orders || []).slice(0, 10);
  box.innerHTML = rows.length ? rows.map((o) => {
    const due = Math.max(0, Number(o.total_amount || 0) - Number(o.amount_paid || 0));
    return `<button type="button" class="kb-sum-row nbh-row" data-kk="detail" data-n="${esc(o.order_number)}">
      <span><b>${esc(o.order_number)}</b> · ${esc(fmtDate(o.created_at))}<br><small>${esc(String(o.status || "").replace(/_/g, " ").toLowerCase())}</small></span>
      <span>${o.total_amount == null ? "—" : due > 0 ? `<b class="kb-red">${money(due)} due</b>` : "Paid"}</span></button>`;
  }).join("") : `<p class="muted">No bills yet.</p>`;
}
/* Kadam 3 ke upar: kiska bill, kitne kapde — tap = us kadam par wapas */
function nbwRecap() {
  const box = $("nb-recap");
  if (!box) return;
  const name = $("nb-name").value.trim(), phone = $("nb-phone").value.trim();
  const ful = NB_FULFIL === "pickup" ? "Pickup" : "Walk-in";
  const t = $("nb-time").value;
  const when = $("nb-date").value ? `${fmtDate($("nb-date").value)}${t && window.KKBill ? ", " + KKBill.time12(t) : ""}` : "";
  const items = nbwItems();
  const pcs = items.reduce((s, l) => s + (lineUnit(l) === "kg" ? 1 : parseFloat(l.qty) || 0), 0);
  const list = items.slice(0, 3).map((l) => `${l.garment || l.service} ${lineUnit(l) === "kg" ? l.qty + " kg" : "×" + l.qty}`).join(", ")
    + (items.length > 3 ? ` +${items.length - 3} more` : "");
  const K = window.KKBill;
  const first = items[0];
  box.innerHTML = `
    <button type="button" class="nbw-rc" data-kb-step="1"><span class="kb-av" aria-hidden="true">${esc(K ? K.initials(name || "?") : "")}</span>
      <span class="nbw-rc-tx"><b>${esc(name || "Customer")}</b><small>${esc(phone)} · ${ful}${NB_URG.on ? " · ⚡ urgent" : ""}${when ? " · " + esc(when) : ""}</small></span><em>Edit</em></button>`;
  // Har kapda apni line: rang service ka, daam badla ho to card kata hua
  const lines = $("nb-recap-lines");
  if (lines) lines.innerHTML = items.map((l) => {
    const kg = lineUnit(l) === "kg";
    const card = (RATES.find((x) => x.service === l.service && x.garment === l.garment) || {}).rate;
    const changed = card != null && Number(l.rate) < Number(card);
    return `<div class="ln" data-fam="${K ? K.fam(l.service) : "wash"}"><span><i></i><span><b class="kb-semi">${kg ? esc(`${l.qty} kg · ${l.service}`) : `${esc(String(l.qty))} × ${esc(l.garment || l.service)}`}</b>
      <small>${kg ? esc(piecesCount(l.pieces) ? piecesLabel(l.pieces) : "by weight") : `${esc(l.service)} · ${money(l.rate)}${changed ? ` <s>${money(card)}</s>` : ""}`}</small></span></span>
      <b>${money(l.amount)}</b></div>`;
  }).join("") + `<button type="button" class="kb-btn ghost sm kb-mt8" data-kb-step="2">✎ Edit items</button>`;
}
/* Note chips: tap = note mein jud jaata hai (ya hat jaata hai) */
function nbNoteChip(b) {
  const ta = $("nb-notes"), w = b.dataset.note;
  const parts = ta.value.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  const at = parts.indexOf(w);
  if (at >= 0) parts.splice(at, 1); else parts.push(w);
  ta.value = parts.join(", ");
  b.classList.toggle("on", at < 0);
}
// Patti, ← Back, Next — ek delegated listener (markup mein onclick nahi)
document.addEventListener("click", (e) => {
  const t = e.target.closest("#nb-form [data-kb-step], #nb-form [data-nbw]");
  if (!t || t.disabled) return;
  if (t.dataset.kbStep) {
    const n = Number(t.dataset.kbStep);
    return n < NBW_STEP ? nbwBack(n) : nbwGo(n);
  }
  if (t.dataset.nbw === "back") return nbwBack(NBW_STEP - 1);
  if (t.dataset.nbw === "next") return NBW_STEP < 3 ? nbwGo(NBW_STEP + 1) : nbwSave(t);
  if (t.dataset.nbw === "advfull") { $("nb-adv").value = String(calcBill().total); calcBill(); return; }
  if (t.dataset.nbw === "coupon") {
    $("nbw-coupon").hidden = !$("nbw-coupon").hidden;
    if (!$("nbw-coupon").hidden) $("nb-coupon").focus();
    return;
  }
  if (t.dataset.nbw === "custnew") return nbwClearCust(true);
  if (t.dataset.nbw === "custhistory") return nbwCustHistory();
});
// Cash / UPI / Card / Split — chhupe select ko badlo, nbAdvMode (purana) baaki karta hai
document.addEventListener("click", (e) => {
  const b = e.target.closest("#nbw-pm [data-pm]");
  if (!b) return;
  $("nb-advmode").value = b.dataset.pm;
  nbAdvMode();
});
// Sujhaav se purana grahak chuna: pickCust (upar) khaane bharta hai, yahan card
document.addEventListener("click", (e) => {
  const row = e.target.closest('#nb-form [data-action="pickCust"]');
  if (!row) return;
  const c = AC_HITS[Number(row.dataset.index)];
  if (c) nbwShowCust(c);
});
// Phone/browser ka back: entry ka kadam kholo (sirf peeche — aage history se nahi)
window.addEventListener("popstate", () => {
  if (CURRENT !== "newbill" || modalOpen() || !$("nb-form") || $("nb-form").hidden) return;
  const s = (history.state || {}).nbw || 1;
  if (s < NBW_STEP) nbwGo(s, { force: true, fromHistory: true });
});
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "nb-date") NBW_DATE_MANUAL = !!e.target.value;
});
// Number likha, kapda juda — patti ke ✓ aur Save ka label saath chalein
let NBW_RAF = 0;
const nbwSoon = () => { if (!NBW_RAF) NBW_RAF = requestAnimationFrame(() => { NBW_RAF = 0; if (CURRENT === "newbill") nbwPaint(); }); };
["input", "change", "click"].forEach((ev) => document.addEventListener(ev, nbwSoon));

/* ---- bill: text server banata hai (services/receipt.py) ----
   Staff panel aur dashboard ka ek hi bill — pehle dono apna-apna banate
   the aur dheere-dheere alag ho gaye. `text` WhatsApp ke liye (₹),
   `print_text` chhote thermal printer ke liye (ASCII, 32/48 akshar). */
const billReceipt = (number) => api(`/orders/${encodeURIComponent(number)}/receipt`);

/* ---- print: chhota Bluetooth thermal printer ----
   Saste 58/80mm Bluetooth printer "classic Bluetooth" hote hain — browser
   unse seedha baat nahi kar sakta (Web Bluetooth sirf BLE + HTTPS). India
   ki dukaanein isliye Android par RawBT app chalati hain: ye link bill ke
   ESC/POS bytes seedha usko de deta hai, printer pair RawBT mein ek baar.
   Doosra rasta phone/PC ka apna print (printer ki app ya PC printer). */
let PRINT_TEXT = "", PRINT_MM = 58;
let PRINT_LOGO = "";
let PRINT_R = null;       // poora receipt jawab: thermal design (print_lines, escpos_b64)
function rawbtUrl(text) {
  // ESC @ (reset) + text + 4 khaali line + GS V 66 0 (kaat do, jahan cutter ho)
  const body = "\x1b@" + text.replace(/[^\x0a\x20-\x7e]/g, "") + "\n\n\n\n" + "\x1dVB\x00";
  return `intent:base64,${btoa(body)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}
async function printReceiptFromOrder(number) {
  let r;
  try { r = await billReceipt(number); } catch (e) { toast(e.message, true); return; }
  PRINT_TEXT = r.print_text; PRINT_MM = r.paper_mm; PRINT_R = r;
  PRINT_LOGO = r.logo_file ? "/admin/media/" + encodeURIComponent(r.logo_file) : "";
  const android = /Android/i.test(navigator.userAgent);
  // Preview wahi jo kagaz par chhapega (logo, bada total, UPI QR) — kk-bill.js
  const K = window.KKBill;
  const preview = K && r.print_lines
    ? `<div class="kt-prev">${K.thermal(r.print_lines, { logo: PRINT_LOGO, mm: r.paper_mm })}</div>`
    : `<pre class="sharetext receipt-preview">${esc(r.print_text)}</pre>`;
  openModal(`<h3>🖨 Print bill ${esc(r.order_number)}</h3>
    <p class="muted">${r.paper_mm}mm paper · logo, size and terms in Settings → Business Profile.</p>
    ${preview}
    <div class="btnrow" style="margin-top:12px">
      <a class="btn${android ? "" : " ghost"}" href="${esc(K ? K.rawbt(r) : rawbtUrl(r.print_text))}" onclick="closeModal()">📲 Bluetooth printer</a>
      <button class="btn${android ? " ghost" : ""}" onclick="closeModal();browserPrint()">🖨 Print</button>
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:10px">Bluetooth printer: Android phone par <b>RawBT</b> app (Play Store, free) ek baar install karke printer pair kar lein — phir har bill ek tap mein.</p>`);
}
function browserPrint() {
  const el = $("receipt");
  // Naya design (logo, bold total, QR) — kk-bill.js; na ho to purana text
  if (window.KKBill && PRINT_R && PRINT_R.print_lines) { KKBill.printReceipt(el, PRINT_R, PRINT_LOGO); return; }
  // Logo text ke upar — thermal/normal printer dono browser print se ise
  // chhaapte hain. RawBT wala one-tap raasta text-only hai (ESC/POS).
  el.innerHTML = (PRINT_LOGO ? `<img class="rcpt-logo" src="${PRINT_LOGO}" alt="">` : "") +
    `<span>${esc(PRINT_TEXT)}</span>`;
  el.className = PRINT_MM === 80 ? "paper-80" : "paper-58";
  const img = el.querySelector("img");
  if (img && !img.complete) { img.onload = img.onerror = () => window.print(); }
  else window.print();
}
/* ---- bill ko WhatsApp par bhejna ----
 *
 * Do raaste hain, aur dono chahiye:
 *
 *   1. Dukaan ke apne WhatsApp number se (Cloud API). Sabse achha — customer
 *      ko shop ka number dikhta hai, thread inbox mein rehta hai. Par ye tabhi
 *      chalta hai jab tenant ne WhatsApp connect kiya ho AUR 24h window khuli ho.
 *
 *   2. wa.me deep link. Owner ke apne phone/WhatsApp Web se khulta hai, bill
 *      text pehle se bhara hua. Isme koi API, token ya setup nahi chahiye —
 *      isliye ye kabhi gayab nahi hota.
 *
 * Pehle sirf (1) tha, to jis dukaan ne API connect nahi kiya uske liye bill
 * bhejne ka koi rasta hi nahi bachta tha — button dabta tha aur error aata tha.
 * Ab (1) fail hone par seedha (2) khul jaata hai, aur (2) har bill par apne
 * aap bhi maujood hai.
 *
 * window.open() ko `await` ke baad bulana popup blocker khaa jaata hai (user
 * gesture khatam ho chuka hota hai), isliye fallback ek modal deta hai jisme
 * asli <a> link hota hai — us par click khud user ka gesture hai. */

/* wa.me sirf digits leta hai, "+" ya space ke bina. 10-ank ke local number
 * par default country code (91) lagta hai — baaki jaisa hai waisa. */
function waDigits(phone) {
  const d = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  return d.length === 10 ? "91" + d : d;
}
function waShareUrl(phone, text) {
  const n = waDigits(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

let SHARE_TEXT = "";

/* Deep-link wala share — bina kisi API ke, hamesha kaam karta hai. */
/* Kisi bhi text ko WhatsApp par bhejne ka fallback — bill ho ya reminder.
   Ek hi modal, kyunki do banane ka matlab hai ek din unme se ek theek
   karna bhool jaana. */
function shareTextModal(phone, text, title, note) {
  SHARE_TEXT = text;
  openModal(`<h3>${esc(title)}</h3>
    <p class="muted">${esc(note)}</p>
    <pre class="sharetext">${esc(SHARE_TEXT)}</pre>
    <div class="btnrow" style="margin-top:12px">
      <a class="btn" href="${esc(waShareUrl(phone, SHARE_TEXT))}" target="_blank" rel="noopener"
         onclick="closeModal()">Open WhatsApp</a>
      <button class="btn ghost" onclick="copyShareText()">Copy text</button>
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </div>`);
}

function shareBillModal(r, note) {
  shareTextModal(
    r.phone, r.text, `Share bill ${r.order_number}`,
    note || `WhatsApp khulega, bill pehle se likha hua — bas Send dabana hai. To: ${displayName(r.name, r.phone)}`,
  );
}
async function copyShareText() {
  try { await navigator.clipboard.writeText(SHARE_TEXT); toast("Copied — paste it in WhatsApp"); }
  catch (e) { toast("Could not copy — select the text above and copy manually", true); }
}

/* Bill history se: order pehle server se lao, phir share modal. */
async function shareBillFromOrder(number) {
  try { shareBillModal(await billReceipt(number)); }
  catch (e) { toast(e.message, true); }
}

async function waBill(number) {
  let r;
  try { r = await billReceipt(number); } catch (e) { toast(e.message, true); return; }
  if (!waConnected()) { shareBillModal(r); return; }   // API hai hi nahi — seedha share
  try {
    await api("/admin/api/inbox/send", {
      method: "POST", body: { phone: r.phone, text: r.text, intent: "transactional", outbound_kind: "bill" },
    });
    toast(T.sent);
  } catch (e) {
    // API connect nahi hai / window band hai / send fail — kaam ruke nahi.
    shareBillModal(r, `Shop ke number se nahi bheja ja saka (${e.message}). Apne WhatsApp se bhej dijiye:`);
  }
}

/* ============================= bills ============================= */
let BILLS = [], billFilter = { q: "", status: "", pay: "", from: "", to: "", page: 1 };
/* Bills ki list ab SERVER se ek page aati hai.
 *
 * Pehle ye sabse naye 200 bill utaar kar browser mein chhaanti thi. Us
 * soch mein do khaamiyan hain jo dukaan badhte hi dikhti hain: 201-wa
 * bill kisi bhi tarah nahi milta — na search se, na page badalne se — aur
 * har baar poora 200 ka bojh phone par utarta hai.
 *
 * Ab jo dikhana hai wahi maanga jaata hai (25), aur `total` alag se aata
 * hai taaki "Page 3 of 47" sach bole. Search/filter DB tak jaate hain,
 * isliye pichhle saal ka bill bhi utni hi aasani se milta hai. */
let BILLS_TOTAL = 0, BILLS_SEQ = 0;

async function loadBills() {
  // Customer ke panne par BILLS usi grahak ke bills hain. Wahan se payment,
  // status ya delete hua ho to panna hi taaza karo — bill history apne
  // section mein jaate waqt khud load hoti hai.
  if (CURRENT === "customers" && CUST_DETAIL) { refreshCustomerDetailSoon(); return; }
  const f = billFilter;
  $("bills-list").innerHTML = skeleton(6);
  const p = new URLSearchParams({
    limit: PAGE, offset: (f.page - 1) * PAGE,
  });
  if (f.q) p.set("q", f.q);
  if (f.status) p.set("status", f.status);
  if (f.pay) p.set("payment", f.pay);
  if (f.from) p.set("date_from", f.from);
  if (f.to) p.set("date_to", f.to);
  const mine = ++BILLS_SEQ;
  let out;
  try {
    out = await api("/admin/api/bills?" + p.toString());
  } catch (e) {
    $("bills-list").innerHTML = errBox(e.message, "loadBills");
    return;
  }
  // Jaldi-jaldi type karne par purana jawab baad mein aakar nayi list na
  // mita de — sirf aakhri request ka natija lagta hai.
  if (mine !== BILLS_SEQ) return;
  BILLS = out.items;
  BILLS_TOTAL = out.total;
  renderBills();
}

/* Filter badla -> pehle page par wapas aur server se dobara maango.
   (Pehle ye sirf browser mein chhaanta tha, isliye alag function tha.) */
function reloadBills() { billFilter.page = 1; loadBills(); }

function renderBills() {
  const f = billFilter;
  const pages = Math.max(1, Math.ceil(BILLS_TOTAL / PAGE));
  if (!BILLS.length) {
    $("bills-list").innerHTML = emptyBox("No bills match these filters.", "🧾");
    $("bills-pager").innerHTML = "";
    return;
  }
  $("bills-list").innerHTML = `
    <table class="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Total / due</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${BILLS.map((o) => billRowHtml(o, "tr")).join("")}</tbody></table>
    <div class="rowcards">${BILLS.map((o) => billRowHtml(o, "card")).join("")}</div>`;
  $("bills-pager").innerHTML = pages > 1
    ? `<button class="btn sm ghost" ${f.page <= 1 ? "disabled" : ""} onclick="billFilter.page--;loadBills()">‹ Prev</button>
       <span class="muted">Page ${f.page} of ${pages} · ${BILLS_TOTAL} bills</span>
       <button class="btn sm ghost" ${f.page >= pages ? "disabled" : ""} onclick="billFilter.page++;loadBills()">Next ›</button>` : "";
}
function billRowHtml(o, kind) {
  const due = o.total_amount ? Number(o.total_amount) - Number(o.amount_paid) : null;
  if (kind === "tr") return `<tr>
    <td><b>${o.order_number}</b><div class="muted">${fmtDate(o.created_at)}</div></td>
    <td>${esc(displayName(o.customer_name, o.customer_phone))}<div class="muted">${esc(o.customer_phone)}</div></td>
    <td style="max-width:150px" title="${esc(itemsText(o.items))}"><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(itemsText(o.items))}</div></td>
    <td class="money">${o.total_amount ? money(o.total_amount) : "—"}${due > 0 ? `<div class="muted">due ${money(due)}</div>` : ""}</td>
    <td><div class="pillrow"><span class="pill ${o.status}">${statusName(o.status)}</span><span class="pill ${o.payment_status}">${o.payment_status.toLowerCase()}</span></div></td>
    <td><div class="act">
      ${!["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn sm ghost status-change-btn" title="Change status" aria-label="Change status" onclick="statusModal('${o.order_number}','${o.status}')">↕ Status</button>` : ""}
      <button class="btn sm ghost" title="Details" aria-label="Details" onclick="orderDetail('${o.order_number}')">👁</button>
      <button class="btn sm ghost" title="Collect payment" aria-label="Collect payment" onclick="paymentModal('${o.order_number}')">₹</button>
      <button class="btn sm ghost" title="More actions" aria-label="More actions" onclick="billMenu('${o.order_number}')">⋯</button>
    </div></td></tr>`;
  return `<div class="rowcard">
    <div class="r1"><b>${o.order_number}</b><span class="pill ${o.status}">${statusName(o.status)}</span></div>
    <div class="kv"><span>${esc(displayName(o.customer_name, o.customer_phone))}</span><span>${fmtDate(o.created_at)}</span></div>
    <div class="kv"><span>${o.total_amount ? money(o.total_amount) : "—"}</span><span class="pill ${o.payment_status}">${o.payment_status.toLowerCase()}</span></div>
    <div class="act">
    ${!["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn sm ghost status-change-btn" onclick="statusModal('${o.order_number}','${o.status}')">↕ Change status</button>` : ""}
    <button class="btn sm ghost" onclick="orderDetail('${o.order_number}')">Details</button>
    <button class="btn sm ghost" onclick="printReceiptFromOrder('${o.order_number}')">Print</button>
    ${window.KKTags && KKTags.tagsOn() ? `<button class="btn sm ghost" data-kk="labels" data-n="${o.order_number}">Labels</button>` : ""}
    <button class="btn sm ghost" onclick="shareBillFromOrder('${o.order_number}')">Share</button>
    <button class="btn sm ghost" onclick="messageMenu('${o.order_number}')">💬 Message</button>
    <button class="btn sm ghost" onclick="paymentModal('${o.order_number}')">Payment</button>
    <button class="btn sm ghost" onclick="editBillModal('${o.order_number}')">Edit</button>
    ${!["DELIVERED", "CANCELLED"].includes(o.status) ? `<button class="btn sm ghost" onclick="setStatus('${o.order_number}','${o.status}','CANCELLED')">Cancel order</button>` : ""}
    <button class="btn sm danger" onclick="deleteBillModal('${o.order_number}')">Delete</button></div></div>`;
}

/* ---- bill edit / delete ---- */
function billByNumber(num) { return BILLS.find((b) => b.order_number === num); }

/* Edit bill opens as a BILL: one row per garment with qty and rate, the
   total adding itself up — not a box you retype text into. */
let EB = { num: "", lines: [] };

async function editBillModal(num) {
  const o = billByNumber(num);
  if (!o) return;
  await ensureRates();
  EB = {
    num,
    lines: (o.items || []).map((i) => ({
      item: i.type || i.garment || i.service || "",
      service: i.service || "",
      unit: i.unit || "pc",
      qty: Number(i.qty) || 1,
      rate: i.rate != null ? Number(i.rate) : "",
      // KG line ke kapde — edit screen inhe dikhata nahi, par save par
      // gira dena matlab ginti hamesha ke liye gayab
      pieces: i.pieces || null,
      kind: i.kind || null,   // "urgent_charge" line edit ke baad bhi wahi rahe
    })),
    paid: Number(o.amount_paid || 0),
    total: o.total_amount != null ? Number(o.total_amount) : null,
  };
  if (!EB.lines.length) EB.lines.push(ebBlank());

  openModal(`<h3>Bill — ${num}</h3>
    <p class="muted">${esc(o.customer_name || o.customer_phone)} · ${fmtDate(o.created_at)}</p>
    <div class="billedit">
      <div class="bl head"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span><span></span></div>
      <div id="eb-lines"></div>
      <button class="btn ghost sm" onclick="ebAdd()" style="margin-top:8px">+ Add item</button>
      <div class="billtot">
        <div class="sumrow"><span>Total</span><span class="money" id="eb-sum">—</span></div>
        <div class="sumrow"><span>Received</span><span class="money">${money(EB.paid)}</span></div>
        <div class="sumrow total"><span>Due</span><span class="money" id="eb-due">—</span></div>
      </div>
    </div>
    <div class="frm" style="margin-top:14px">
      <div class="split2">
        <div class="setfield"><label for="eb-total">Total (₹) — adds up automatically</label>
          <input inputmode="decimal" id="eb-total" type="number" min="0" step="0.01" value="${o.total_amount ?? ""}"
                 oninput="EB.manual=true;ebCalc()">
          <small>No rates entered? You can type the total here yourself.</small></div>
        <div class="setfield"><label for="eb-date">Delivery date</label>
          <input id="eb-date" type="date" value="${o.expected_delivery || ""}"></div>
      </div>
      <div class="setfield"><label for="eb-notes">Internal note (never sent to the customer)</label>
        <input id="eb-notes" value="${esc(o.notes || "")}"></div>
      <small class="fielderr" id="eb-err"></small>
    </div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="eb-save">Save changes</button>
    </div>`);
  ebRender();

  $("eb-save").onclick = (e) => busy(e.target, async () => {
    $("eb-err").textContent = "";
    const items = EB.lines
      .filter((l) => (l.item || "").trim())
      .map((l) => {
        const row = { type: l.item.trim(), qty: Number(l.qty) || 1 };
        if (l.rate !== "" && l.rate != null) row.rate = Number(l.rate);
        // keep what the rate card told us, so the receipt and the next
        // edit still know which service this garment was billed under
        if (l.service) row.service = l.service;
        if (l.unit) row.unit = l.unit;
        if (l.unit === "kg" && (l.pieces || []).length) row.pieces = l.pieces;
        if (l.kind) row.kind = l.kind;
        return row;
      });
    if (!items.length) { $("eb-err").textContent = "Add at least one item."; return; }
    const total = $("eb-total").value === "" ? null : parseFloat($("eb-total").value);
    if (total !== null && !(total >= 0)) { $("eb-err").textContent = "That total doesn't look right."; return; }
    await api(`/orders/${EB.num}`, { method: "PUT", body: {
      items, total_amount: total, expected_delivery: $("eb-date").value || null,
      notes: $("eb-notes").value, edited_by: "dashboard",
    }});
    closeModal(); toast("Bill updated"); loadBills(); loadDashboard();
  });
}

/* The kapda field is the rate card, not a typing box: pick the garment and
   its price comes along. Two things must never be lost — an item that is
   NOT on the card (old bill, one-off) stays selected as-is, and the last
   option drops the row back to free text so a new kapda is always billable. */
const ebBlank = () => ({ item: "", service: "", unit: "pc", qty: 1, rate: "" });
const kapdaList = () => RATES.filter((r) => r.is_active && (r.garment || "").trim());

async function ensureRates() {
  // Bill history can be opened without ever visiting New bill
  if (RATES.length) return;
  try { RATES = await api("/admin/api/rates"); } catch (e) { RATES = []; }
}

function ebKapda(l, i) {
  const list = kapdaList();
  if (l.custom || !list.length) {
    return `<div class="kapda kapdanew">
      <input id="eb-item-${i}" value="${esc(l.item)}" placeholder="garment name"
             oninput="EB.lines[${i}].item=this.value">
      ${list.length ? `<button class="btn sm ghost" title="Pick from list" onclick="ebFromList(${i})">☰</button>` : ""}
    </div>`;
  }
  const cur = (l.item || "").trim();
  const hit = list.findIndex((r) =>
    r.garment.toLowerCase() === cur.toLowerCase() && (!l.service || r.service === l.service));
  let opts = `<option value=""${cur ? "" : " selected"}>Pick a garment…</option>`;
  if (cur && hit < 0) opts += `<option value="keep" selected>${esc(cur)}</option>`;
  let svc = null;
  list.forEach((r, n) => {
    if (r.service !== svc) {
      if (svc !== null) opts += "</optgroup>";
      svc = r.service;
      opts += `<optgroup label="${esc(svc)}">`;
    }
    opts += `<option value="${n}"${n === hit ? " selected" : ""}>${esc(r.garment)} — ₹${r.rate}${r.unit === "kg" ? "/kg" : ""}</option>`;
  });
  if (svc !== null) opts += "</optgroup>";
  opts += `<option value="new">➕ New garment — not on the list</option>`;
  return `<select class="kapda" onchange="ebPick(${i},this.value)">${opts}</select>`;
}

function ebPick(i, val) {
  const l = EB.lines[i];
  if (val === "keep") return;
  if (val === "new") {
    l.custom = true; l.item = ""; l.service = "";
    // a price that came with the old garment is meaningless for a new one
    if (l.fromCard) { l.rate = ""; l.fromCard = false; }
    ebRender();
    const box = $("eb-item-" + i); if (box) box.focus();
    return;
  }
  if (val === "") { l.item = ""; l.service = ""; ebRender(); return; }
  const r = kapdaList()[parseInt(val)];
  if (!r) return;
  l.item = r.garment; l.service = r.service; l.unit = r.unit;
  l.rate = parseFloat(r.rate);   // card price, still editable in the Rate box
  l.fromCard = true;
  ebRender();
}
function ebFromList(i) { EB.lines[i].custom = false; ebRender(); }

function ebRender() {
  $("eb-lines").innerHTML = EB.lines.map((l, i) => `
    <div class="bl">
      ${ebKapda(l, i)}
      <input inputmode="decimal" class="k-qty" type="number" min="0.1" step="0.5" value="${l.qty}"
             oninput="EB.lines[${i}].qty=parseFloat(this.value)||0;ebCalc()">
      <input inputmode="numeric" class="k-rate" type="number" min="0" step="1" value="${l.rate}" placeholder="—"
             oninput="EB.lines[${i}].rate=this.value===''?'':parseFloat(this.value)||0;ebCalc()">
      <span class="money" id="eb-amt-${i}">—</span>
      <button class="btn sm ghost" title="Hatao" onclick="ebDel(${i})">✕</button>
    </div>`).join("");
  ebCalc();
}
function ebAdd() { EB.lines.push(ebBlank()); ebRender(); }
function ebDel(i) { EB.lines.splice(i, 1); if (!EB.lines.length) ebAdd(); else ebRender(); }

function ebCalc() {
  let sum = 0, anyRate = false;
  EB.lines.forEach((l, i) => {
    const amt = (Number(l.rate) || 0) * (Number(l.qty) || 0);
    if (l.rate !== "" && l.rate != null) anyRate = true;
    sum += amt;
    const cell = $(`eb-amt-${i}`);
    if (cell) cell.textContent = l.rate === "" || l.rate == null ? "—" : money(amt);
  });
  // rows win unless the owner typed a total himself
  if (anyRate && !EB.manual) $("eb-total").value = sum ? sum.toFixed(2) : "";
  const total = parseFloat($("eb-total").value);
  $("eb-sum").textContent = isFinite(total) ? money(total) : "—";
  $("eb-due").textContent = isFinite(total) ? money(Math.max(0, total - EB.paid)) : "—";
}

function deleteBillModal(num) {
  const o = billByNumber(num);
  if (!o) return;
  const paid = Number(o.amount_paid || 0);
  openModal(`<h3>Delete bill ${num}?</h3>
    <p class="muted">${esc(o.customer_name || o.customer_phone)} · ${o.total_amount ? money(o.total_amount) : "—"}</p>
    <p class="muted">The bill, its status history${paid > 0 ? ` and the ${money(paid)} payment record` : ""} — all gone, and there is no undo.</p>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn danger" id="db-go">Yes, delete it</button>
    </div>`);
  $("db-go").onclick = (e) => busy(e.target, async () => {
    await api(`/orders/${num}?deleted_by=dashboard`, { method: "DELETE" });
    closeModal(); toast(`${num} deleted`); loadBills(); loadDashboard();
  });
}
function billsCsv() {
  dlCsvClient("bills.csv",
    ["order", "date", "customer", "phone", "total", "paid", "status", "payment"],
    BILLS.map((o) => [o.order_number, o.created_at.slice(0, 10), o.customer_name || "", o.customer_phone, o.total_amount || "", o.amount_paid, o.status, o.payment_status]));
}

/* ============================= customers ============================= */
/* The cache stays at the server's default 300 (same as before) because the
   "Total outstanding" KPI and the reports top-list sum over it. The LIST
   renders a window of 30 and grows via "Aur dikhao" — past the cache it
   pages the API with limit/offset, so every customer stays reachable. */
let CUST_SHOWN = 30, CUST_MAYBE_MORE = false;
const CUST_CHUNK = 100;
async function loadCustomers(quiet = false) {
  if (!quiet) $("cust-list").innerHTML = skeleton(6);
  CUST_SHOWN = 30;
  try { CUSTOMERS_CACHE = await api("/admin/api/customers"); } catch (e) { if (!quiet) $("cust-list").innerHTML = errBox(e.message, "loadCustomers"); return; }
  CUST_MAYBE_MORE = CUSTOMERS_CACHE.length >= 300;
  // Grahak ka panna khula ho to list mat dikhao — payment/delete ke baad
  // owner list par phenk diya jaata tha. Panna hi taaza karo.
  if (CUST_DETAIL && CURRENT === "customers") { refreshCustomerDetailSoon(); return; }
  if (!quiet || CURRENT === "customers") renderCustomers();
}
/* Delete/edit ke baad list wahin rahe: skeleton nahi (page chhota hokar upar chala jaata tha),
   jitni rows khuli thin utni hi. Popup ka scroll-lock pehle khul jaye, phir jagah yaad karo. */
async function reloadCustomersInPlace() {
  await new Promise((r) => setTimeout(r));
  if (CUST_DETAIL) { await loadCustomers(true); return; }   // panna khula hai: wahi taaza
  const y = window.scrollY, shown = CUST_SHOWN;
  await loadCustomers(true);
  CUST_SHOWN = Math.max(shown, 30);
  renderCustomers();
  window.scrollTo(0, y);
}
function visibleCustomers() {
  const q = (($("cust-search") && $("cust-search").value) || "").toLowerCase();
  return (CUSTOMERS_CACHE || [])
    .filter((c) => !q || (c.name || "").toLowerCase().includes(q) || c.phone.includes(q))
    .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));
}
async function custMore(btn) {
  const all = visibleCustomers();
  if (CUST_SHOWN < all.length) { CUST_SHOWN += 50; renderCustomers(); return; }
  if (!CUST_MAYBE_MORE) return;
  btn.disabled = true;
  try {
    const r = await api(`/admin/api/customers?limit=${CUST_CHUNK}&offset=${CUSTOMERS_CACHE.length}`);
    CUSTOMERS_CACHE = CUSTOMERS_CACHE.concat(r);
    CUST_MAYBE_MORE = r.length >= CUST_CHUNK;
  } catch (e) { toast(e.message, true); btn.disabled = false; return; }
  CUST_SHOWN += 50;
  renderCustomers();
}
const CUST_SELECTED = new Set();

function toggleCustomerSelected(phone, checked) {
  if (checked) CUST_SELECTED.add(phone); else CUST_SELECTED.delete(phone);
  renderCustomers();
}
function toggleVisibleCustomers(checked) {
  const rows = visibleCustomers().slice(0, CUST_SHOWN);
  rows.forEach((c) => checked ? CUST_SELECTED.add(c.phone) : CUST_SELECTED.delete(c.phone));
  renderCustomers();
}
async function bulkDeleteCustomers() {
  const phones = [...CUST_SELECTED];
  if (!phones.length) { toast("Select customers first", true); return; }
  const selected = phones.map(customerByPhone).filter(Boolean);
  const bills = selected.reduce((n, c) => n + Number(c.total_orders || 0), 0);
  const promptText = `You selected ${phones.length} customer(s). ${bills} bill(s), payments and chat history may also be deleted. Type DELETE to confirm.`;
  if (prompt(promptText) !== "DELETE") return;
  try {
    const r = await api("/admin/api/customers/bulk-delete", { method: "DELETE", body: { phones } });
    phones.forEach((p) => CUST_SELECTED.delete(p));
    toast(`${r.deleted_count} customer(s) deleted; ${r.orders_deleted} bill(s) removed`);
    await reloadCustomersInPlace();
    loadDashboard();
  } catch (e) {
    toast(e.message || "Bulk delete failed", true);
  }
}
/* Customers: summary tiles, filter chips, and one clean row per person.
   Bulk-delete checkboxes appear only in Select mode — they used to sit on
   every card, one stray tap from a destructive bulk action. */
let CUST_FILTER = "all", CUST_SELECT_MODE = false;
const CUST_FILTERS = {
  all: ["All", () => true],
  owes: ["Owes money", (c) => Number(c.outstanding) > 0],
  active: ["Active orders", (c) => Number(c.active_orders) > 0],
  opted: ["Opted out", (c) => !!c.opted_out],
};
function setCustFilter(f) { CUST_FILTER = f; CUST_SHOWN = 30; renderCustomers(); }
function toggleCustSelectMode() {
  CUST_SELECT_MODE = !CUST_SELECT_MODE;
  if (!CUST_SELECT_MODE) CUST_SELECTED.clear();
  if ($("cust-select-btn")) $("cust-select-btn").textContent = CUST_SELECT_MODE ? "Done" : "Select";
  renderCustomers();
}
const initials = (name, phone) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts.slice(0, 2).map((p) => p[0]).join("") : String(phone || "").slice(-2)).toUpperCase();
};
function renderCustKpis() {
  const box = $("cust-kpis");
  if (!box) return;
  const all = CUSTOMERS_CACHE || [];
  const owes = all.filter((c) => Number(c.outstanding) > 0);
  const out = owes.reduce((a, c) => a + Number(c.outstanding || 0), 0);
  const active = all.filter((c) => Number(c.active_orders) > 0).length;
  const plus = CUST_MAYBE_MORE ? "+" : "";
  box.innerHTML =
    kpi("Customers", `${all.length}${plus}`, "", "setCustFilter('all')", "i-users", "blue") +
    kpi("Owe money", `${owes.length}${plus}`, "", "setCustFilter('owes')", "i-ledger", "red") +
    kpi("Outstanding", money(out), "", "setCustFilter('owes')", "i-expense", "amber") +
    kpi("Active orders", `${active}${plus}`, "", "setCustFilter('active')", "i-receipt", "green");
}
function renderCustomers() {
  if (!$("cust-list")) return;
  renderCustKpis();
  const test = (CUST_FILTERS[CUST_FILTER] || CUST_FILTERS.all)[1];
  const searched = visibleCustomers();
  if ($("cust-chips")) {
    $("cust-chips").innerHTML = Object.entries(CUST_FILTERS).map(([k, [label, fn]]) =>
      `<span class="chip ${CUST_FILTER === k ? "on" : ""}" onclick="setCustFilter('${k}')">${label}<span class="cnt">${searched.filter(fn).length}</span></span>`).join("");
  }
  const all = searched.filter(test);
  if (!all.length) {
    $("cust-list").innerHTML = emptyBox((CUSTOMERS_CACHE || []).length
      ? "Nobody matches — try another filter or search."
      : "No customers yet — they appear after their first bill or message.", "👥");
    return;
  }
  const rows = all.slice(0, CUST_SHOWN);
  const more = all.length > rows.length || CUST_MAYBE_MORE;
  const selectedCount = CUST_SELECTED.size;
  const allVisibleSelected = rows.length > 0 && rows.every((c) => CUST_SELECTED.has(c.phone));
  const moreBtn = more
    ? `<div style="padding:12px;text-align:center"><button class="btn ghost sm" onclick="custMore(this)">⬇ Show more (${rows.length}${CUST_MAYBE_MORE ? "+" : " / " + all.length})</button></div>`
    : "";
  const selectBar = CUST_SELECT_MODE ? `<div class="cust-selectbar">
    <label><input type="checkbox" ${allVisibleSelected ? "checked" : ""} onchange="toggleVisibleCustomers(this.checked)"> Select all ${rows.length}</label>
    <span class="muted">${selectedCount} selected</span>
    <button class="btn sm danger" ${selectedCount ? "" : "disabled"} onclick="bulkDeleteCustomers()">🗑 Delete selected</button>
  </div>` : "";
  const due = (c) => Number(c.outstanding) > 0
    ? `<span class="pill UNPAID">${money(c.outstanding)} due</span>`
    : `<span class="pill PAID">Clear</span>`;
  const sw = (c) => `<label class="switch" title="Automatic payment reminders"><input type="checkbox" ${c.payment_reminders_enabled ? "checked" : ""} ${c.opted_out ? "disabled" : ""} onchange="setPaymentReminder('${c.phone}', this.checked)"><i></i><span>Auto reminder</span></label>`;
  const pick = (c) => CUST_SELECT_MODE
    ? `<input class="cust-pick" aria-label="Select ${esc(c.phone)}" type="checkbox" ${CUST_SELECTED.has(c.phone) ? "checked" : ""} onchange="toggleCustomerSelected('${esc(c.phone)}', this.checked)">` : "";
  const who = (c) => `<div class="cust-who cust-open" role="button" tabindex="0" title="Open customer page"
      onclick="openCustomerDetail('${esc(c.phone)}')" onkeydown="if(event.key==='Enter')openCustomerDetail('${esc(c.phone)}')">
    ${pick(c)}<span class="avatar">${esc(initials(c.name, c.phone))}</span>
    <div><b>${esc(displayName(c.name, c.phone))}</b>${c.opted_out ? ' <span class="tag">opted out</span>' : ""}${c.nav_url ? ` <a href="${esc(c.nav_url)}" target="_blank" rel="noopener" title="Open location in Google Maps" onclick="event.stopPropagation()">📍</a>` : ""}<span class="muted">${esc(c.phone)}</span></div></div>`;
  const acts = (c) => `<div class="act">
    <button class="btn sm ghost" title="Open customer page" aria-label="Open customer page" onclick="openCustomerDetail('${c.phone}')">👁</button>
    ${Number(c.outstanding) > 0 ? `<button class="btn sm" onclick="sendReminder('${c.phone}')">Remind</button>` : ""}
    <button class="btn sm ghost" onclick="jumpChat('${c.phone}')">Chat</button>
    <button class="btn sm ghost" title="Actions" aria-label="Actions" onclick="customerMenu('${c.phone}')">⋯</button></div>`;
  $("cust-list").innerHTML = selectBar + `
    <table class="tbl cust-tbl"><thead><tr><th>Customer</th><th>Orders</th><th>Business</th><th>Paid</th><th>Balance</th><th>Reminders</th><th>Last seen</th><th>Actions</th></tr></thead>
    <tbody>${rows.map((c) => `
      <tr><td>${who(c)}</td>
      <td>${c.total_orders}${Number(c.active_orders) ? ` <span class="muted">· ${c.active_orders} active</span>` : ""}</td>
      <td class="money">${money(c.business)}</td><td class="money">${money(c.paid)}</td>
      <td>${due(c)}</td><td>${sw(c)}</td>
      <td class="muted">${c.last_message_at ? fmtWhen(c.last_message_at) : "—"}</td>
      <td>${acts(c)}</td></tr>`).join("")}
    </tbody></table>
    <div class="rowcards">${rows.map((c) => `
      <div class="rowcard custcard">
        <div class="cc-top">${who(c)}${due(c)}</div>
        <div class="cc-meta"><span>${c.total_orders} orders${Number(c.active_orders) ? ` · ${c.active_orders} active` : ""}</span><span>${money(c.business)} business</span></div>
        <div class="cc-foot">${sw(c)}${acts(c)}</div>
      </div>`).join("")}</div>${moreBtn}`;
}

/* ---- grahak ka apna panna: profile + pichle saare bill ek jagah ---- */
let CUST_DETAIL = null, CUST_DETAIL_T = null;
function refreshCustomerDetailSoon() {
  clearTimeout(CUST_DETAIL_T);
  CUST_DETAIL_T = setTimeout(() => {
    if (CUST_DETAIL && CURRENT === "customers") openCustomerDetail(CUST_DETAIL, { quiet: true, push: false });
  }, 150);
}
async function openCustomerDetail(phone, opts = {}) {
  const box = $("cust-list");
  if (!box) return;
  CUST_DETAIL = phone;
  // URL mein grahak — refresh par yahi panna khule, aur phone ka Back list par laaye
  if (opts.push !== false) setHashQuiet("customers/" + encodeURIComponent(phone));
  const y = window.scrollY;
  if (!opts.quiet) box.innerHTML = skeleton(4);
  let d;
  try {
    d = await api(`/admin/api/customers/${encodeURIComponent(phone)}/detail`);
  } catch (e) {
    if (opts.quiet) { closeCustomerDetail(); return; }   // grahak hat gaya / number badla
    box.innerHTML = errBox(e.message, `openCustomerDetail('${phone}')`); return;
  }
  if (CUST_DETAIL !== phone || CURRENT !== "customers") return;   // beech mein kahin aur chale gaye
  const c = d.customer;
  // Bills panel ke saare card-actions (details/edit/payment/print) BILLS se
  // order dhoondhte hain — isliye yahan wahi array is grahak ke bills se
  // bhar dete hain. Bills panel kholne par wo khud dobara load hota hai.
  BILLS = d.orders || [];
  const due = Number(c.outstanding) > 0
    ? `<span class="pill UNPAID">${money(c.outstanding)} due</span>`
    : `<span class="pill PAID">All clear</span>`;
  const meta = [
    c.address ? `🏠 ${esc(c.address)}` : "",
    c.nav_url ? `<a href="${esc(c.nav_url)}" target="_blank" rel="noopener">📍 Open location</a>` : "",
    c.last_message_at ? `💬 Last seen ${fmtWhen(c.last_message_at)}` : "",
    c.created_at ? `Since ${fmtDate(c.created_at)}` : "",
  ].filter(Boolean).join(" · ");
  const orders = (d.orders || []).length
    ? `<div class="rowcards cust-detail-orders">${d.orders.map((o) => billRowHtml(o, "card")).join("")}</div>`
    : emptyBox("No bills yet — make the first one from New bill.", "🧾");
  box.innerHTML = `
    <div class="cust-detail">
      <div style="padding:12px 12px 0"><button class="btn sm ghost" onclick="closeCustomerDetail()">← All customers</button></div>
      <div class="cust-detail-head">
        <span class="avatar big">${esc(initials(c.name, c.phone))}</span>
        <div class="cdh-main">
          <b>${esc(displayName(c.name, c.phone))}</b>${c.opted_out ? ' <span class="tag">opted out</span>' : ""}
          <div class="muted">${esc(c.phone)}</div>
          ${meta ? `<div class="muted cdh-meta">${meta}</div>` : ""}
        </div>
        ${due}
      </div>
      <div class="grid kpis cust-detail-kpis">
        ${kpi("Bills", c.total_orders + (Number(c.active_orders) ? ` <small>· ${c.active_orders} active</small>` : ""), "", "", "i-receipt", "blue")}
        ${kpi("Business", money(c.business), "", "", "i-expense", "green")}
        ${kpi("Paid", money(c.paid), "", "", "i-ledger", "green")}
        ${kpi("Balance", money(c.outstanding), "", "", "i-ledger", Number(c.outstanding) > 0 ? "red" : "green")}
      </div>
      <div class="act" style="padding:0 12px 12px;flex-wrap:wrap">
        ${Number(c.outstanding) > 0 ? `<button class="btn sm ok" onclick="customerPaymentModal('${c.phone}', ${Number(c.outstanding)})">₹ Receive payment</button>` : ""}
        ${Number(c.outstanding) > 0 ? `<button class="btn sm" onclick="sendReminder('${c.phone}')">💰 Remind</button>` : ""}
        <button class="btn sm ghost" onclick="jumpChat('${c.phone}')">📨 Chat</button>
        <button class="btn sm ghost" onclick="customerMessageMenu('${c.phone}')">💬 Message</button>
        <button class="btn sm ghost" onclick="editCustomerModal('${c.phone}')">✏️ Edit</button>
        <button class="btn sm ghost" onclick="customerMenu('${c.phone}')">⋯</button>
      </div>
      <div id="cd-next"></div>
      <div style="padding:0 12px 4px"><b>🧾 Bills (${c.total_orders})</b></div>
      ${orders}
    </div>`;
  if (window.KKGrowth) KKGrowth.customerCard(c.phone, $("cd-next"));   // growth.js: repeat-order suggestion
  if (opts.quiet) window.scrollTo(0, y);
  else box.scrollIntoView({ block: "start", behavior: "smooth" });
}
function closeCustomerDetail() {
  CUST_DETAIL = null;
  setHashQuiet("customers");
  renderCustomers();
}

/* Ek saath paisa: kul baaki bhara hua aata hai, owner kam kar sakta hai.
   Server purane bill se bharta hai, baaki due rehta hai, grahak ko ek raseed. */
function customerPaymentModal(phone, due) {
  const c = customerByPhone(phone) || {};
  openModal(`<h3>Receive payment</h3>
    <p class="muted">${esc(displayName(c.name, phone))} · total due <b>${money(due)}</b></p>
    <div class="frm">
      <div><label for="cp-amt">Amount received (₹)</label>
        <input inputmode="decimal" id="cp-amt" type="number" min="1" max="${due}" step="0.01" value="${due}" autofocus></div>
      <div><label for="cp-mode">Mode</label><select id="cp-mode"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></div>
      <div class="muted" id="cp-hint"></div>
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn ok" id="cp-go">Record payment</button></div>`);
  const hint = () => {
    const a = parseFloat($("cp-amt").value) || 0;
    $("cp-hint").innerHTML = a > due ? `<span style="color:var(--danger)">More than the total due (${money(due)}).</span>`
      : a > 0 ? `Oldest bills are cleared first. ${a < due ? `<b>${money(due - a)}</b> will stay due.` : "All bills will be fully paid."} The customer gets one WhatsApp receipt.`
      : "";
  };
  $("cp-amt").oninput = hint; hint();
  $("cp-go").onclick = (e) => busy(e.target, async () => {
    const amt = parseFloat($("cp-amt").value);
    if (!(amt > 0)) throw new Error("Amount must be greater than 0");
    if (amt > due + 0.001) throw new Error(`Amount is more than the total due (${money(due)})`);
    const r = await api(`/admin/api/customers/${encodeURIComponent(phone)}/payment`,
      { method: "POST", body: { amount: amt, method: $("cp-mode").value } });
    closeModal();
    toast(`${money(r.paid)} recorded on ${r.bills.length} bill(s)` + (Number(r.balance) > 0 ? ` · ${money(r.balance)} still due` : " · all clear ✅"));
    if (r.sent) sentPopup("Payment receipt sent", r.name, r.phone);
    else sendFailedPopup("Payment receipt", r.error, r.text);
    loadDashboard(); loadCustomers(true);   // panna khula hai -> wahi taaza hota hai
  });
}

/* Ek ⋯ se saare kaam — har jagah wahi pattern (dashboard, bill history, staff panel) */
function customerMenu(phone) {
  const c = (typeof visibleCustomers === "function" ? visibleCustomers() : []).find((x) => x.phone === phone) || {};
  openModal(`<h3>${esc(displayName(c.name, phone))}</h3>
    <p class="muted">${esc(phone)}${Number(c.outstanding) > 0 ? ` · <b style="color:var(--danger)">${money(c.outstanding)} due</b>` : ""}</p>
    <div class="frm">
      ${Number(c.outstanding) > 0 ? `<button class="btn" onclick="closeModal();sendReminder('${phone}')">💰 Payment reminder (all bills)</button>` : ""}
      <button class="btn ghost" onclick="closeModal();customerMessageMenu('${phone}')">💬 Send a message</button>
      <button class="btn ghost" onclick="closeModal();jumpChat('${phone}')">📨 Open chat</button>
      ${c.nav_url ? `<a class="btn ghost" href="${esc(c.nav_url)}" target="_blank" rel="noopener">🗺 Open location in Google Maps</a>` : ""}
      <button class="btn ghost" onclick="closeModal();editCustomerModal('${phone}')">✏️ Edit customer</button>
      <button class="btn ghost danger-ic" onclick="closeModal();deleteCustomerModal('${phone}')">🗑 Delete customer</button>
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}

/* ---- customer edit / delete ---- */
function customerByPhone(p) { return (CUSTOMERS_CACHE || []).find((c) => c.phone === p); }

function editCustomerModal(phone) {
  const c = customerByPhone(phone);
  if (!c) return;
  const digits = String(phone).replace(/^\+91/, "");
  openModal(`<h3>Edit customer</h3>
    <div class="frm">
      <div class="setfield"><label for="ec-name">Name</label>
        <input id="ec-name" value="${esc(c.name || "")}"></div>
      <div class="setfield"><label for="ec-phone">Phone</label>
        <input id="ec-phone" type="tel" inputmode="numeric" value="${esc(digits)}">
        <small>Changing the number moves their whole chat and all bills to the new number.</small>
        <small class="fielderr" id="ec-phone-err"></small></div>
      <div class="setfield"><label for="ec-addr">Address</label>
        <input id="ec-addr" value="${esc(c.address || "")}"></div>
      <div class="setfield"><label for="ec-map">Google Maps link <span class="muted">(optional)</span></label>
        <input id="ec-map" value="${esc(c.map_url || "")}" placeholder="Paste a Google Maps share link">
        <small>${c.has_location
          ? `📍 Pin saved${c.accuracy_m ? ` (GPS ±${c.accuracy_m} m${c.accuracy_m > 60 ? " — weak; ask staff to re-save at the gate, or paste an exact link" : ""})` : ""} — delivery staff get one-tap directions.`
          : "Delivery staff can also save the pin from their app while at the door."}</small></div>
    </div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="ec-save">Save changes</button>
    </div>`);
  $("ec-save").onclick = (e) => busy(e.target, async () => {
    $("ec-phone-err").textContent = "";
    const ph = $("ec-phone").value.replace(/\D/g, "");
    if (ph.length !== 10) { $("ec-phone-err").textContent = "Phone must be 10 digits."; return; }
    await api(`/admin/api/customers/${encodeURIComponent(phone)}`, { method: "PUT", body: {
      name: $("ec-name").value, phone: ph, address: $("ec-addr").value,
      map_url: $("ec-map").value.trim(),
    }});
    if (CUST_DETAIL === phone) {
      CUST_DETAIL = "+91" + ph;
      setHashQuiet("customers/" + encodeURIComponent(CUST_DETAIL));
    }
    closeModal(); toast("Customer updated"); reloadCustomersInPlace();
  });
}

function deleteCustomerModal(phone) {
  const c = customerByPhone(phone);
  if (!c) return;
  const label = displayName(c.name, c.phone);
  const n = Number(c.total_orders || 0);
  openModal(`<h3>Delete ${esc(label)}?</h3>
    <p class="muted">${c.phone}</p>
    <p class="muted">${n
      ? `Their <b>${n} bill(s)</b>, payments and full chat history will be deleted too. Report numbers will change.`
      : "They have no bills. Their chat history will be deleted."}</p>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn danger" id="dc-go">Yes, delete them</button>
    </div>`);
  $("dc-go").onclick = (e) => busy(e.target, async () => {
    await api(`/admin/api/customers/${encodeURIComponent(phone)}?force=true`, { method: "DELETE" });
    if (CUST_DETAIL === phone) { CUST_DETAIL = null; setHashQuiet("customers"); }
    closeModal(); toast(`${label} deleted`); reloadCustomersInPlace(); loadDashboard();
  });
}
async function setPaymentReminder(phone, enabled) {
  try {
    await api(`/admin/api/customers/${encodeURIComponent(phone)}`, { method: "PUT", body: { payment_reminders_enabled: enabled } });
    const c = customerByPhone(phone);
    if (c) c.payment_reminders_enabled = enabled;
    toast(enabled ? "Automatic payment reminders enabled" : "Automatic payment reminders disabled");
  } catch (e) {
    toast(e.message, true);
    loadCustomers(true);
  }
}

async function sendReminder(phone) {
  // Text SERVER banata hai. Browser ke paas sirf kul rakam hoti hai —
  // kaunse bill, kis din ke, kitne ke, aur dukaan ka asli naam, ye sab
  // wahan hai. Yahan banane ki koshish mein hi "— Kwik Klin" har dukaan
  // ke message mein chipak gaya tha.
  let r;
  try {
    r = await api("/admin/api/customers/reminder", { method: "POST", body: { phone } });
  } catch (e) { toast(e.message, true); return; }

  // Customer module se message hamesha dukaan ke system (shop number) se
  // jaata hai — owner ka apna WhatsApp app nahi khulta. Nateeja popup mein.
  if (r.sent) { sentPopup(T.reminderSent, r.name, r.phone); return; }
  sendFailedPopup("Payment reminder", r.error, r.text);
}

/* Bheja gaya — saaf popup, taaki owner ko pakka pata ho ki message gaya. */
function sentPopup(title, name, phone) {
  openModal(`<div style="text-align:center">
    <div style="font-size:44px;line-height:1">✅</div>
    <h3 style="margin:8px 0 4px">${esc(title)}</h3>
    <p class="muted">To ${esc(displayName(name, phone))}</p>
    <div class="btnrow" style="justify-content:center;margin-top:12px">
      <button class="btn" onclick="closeModal()">OK</button>
    </div></div>`);
}
function sendFailedPopup(title, reason, text) {
  SHARE_TEXT = text || "";
  openModal(`<div style="text-align:center">
    <div style="font-size:44px;line-height:1">⚠️</div>
    <h3 style="margin:8px 0 4px">${esc(title)} not sent</h3>
    <p class="muted">${esc(reason || "WhatsApp is not connected for this shop.")}</p>
    <div class="btnrow" style="justify-content:center;margin-top:12px">
      ${SHARE_TEXT ? `<button class="btn ghost" onclick="copyShareText()">Copy text</button>` : ""}
      <button class="btn" onclick="closeModal()">OK</button>
    </div></div>`);
}

/* Media ka URL. Login session ho to cookie hi kaafi hai; sirf purane
   admin-key wale rasta ke liye ?key= lagta hai. Khali key jodne se server
   401 deta tha aur Inbox mein toota hua dabba dikhta tha. */
const mediaUrl = (path) => path;

/* ---- chat text + ticks, WhatsApp style ---- */
/* Trailing newlines in a stored/approved body rendered as a big empty hole
   under the message (white-space: pre-wrap). Trim, and never allow more
   than one blank line in a row. */
const tidy = (s) => String(s || "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
const oneLine = (s) => tidy(s).replace(/\s+/g, " ");

/* ✓ sent · ✓✓ delivered · blue ✓✓ read · ⚠ failed — Meta's status, not a
   decoration. The old UI painted a blue ✓✓ on everything, so a message
   sitting undelivered looked read. */
function ticks(status) {
  if (status === "read") return ` <span class="tick read">✓✓</span>`;
  if (status === "delivered") return ` <span class="tick">✓✓</span>`;
  if (status === "failed") return ` <span class="tick fail">⚠</span>`;
  return ` <span class="tick">✓</span>`;   // sent, or an older row
}
let BY_WAMID = {};

/* Thread list previews: a file must read like WhatsApp's own list —
   "🎤 Voice note", not "[audio:/admin/media/in-f7ed7c2...]". */
const PREVIEW_ICON = {
  image: "📷 Photo", audio: "🎤 Voice note", voice: "🎤 Voice note",
  video: "🎥 Video", document: "📄 File", location: "📍 Location",
  contact: "📇 Contact", reaction: "", button: "", template: "📑 Template",
};
function previewText(raw) {
  const m = String(raw || "").match(/^\[(\w+)[:\]]([^\]]*)\]?\s*(.*)$/s);
  if (!m) return raw || "";
  const label = PREVIEW_ICON[m[1]];
  if (label === undefined) return raw;          // unknown marker: show as-is
  const rest = (m[3] || "").trim();
  // a transcribed voice note shows the words, like WhatsApp shows a caption
  return rest ? (label ? `${label}: ${rest}` : rest) : label;
}

/* Template bodies for the Inbox, so a sent template reads as the message
   the customer actually got instead of "[template:kk_thankyou_rating]".
   Meta is the source of truth; if it is unreachable the name chip still
   renders, so the inbox never regresses to raw brackets. */
let TPL_PREVIEW = {};
async function loadTplPreview() {
  if (Object.keys(TPL_PREVIEW).length) return;
  try {
    (await api("/admin/api/templates")).forEach((t) => {
      TPL_PREVIEW[t.name] = {
        body: t.body || "",
        buttons: (t.buttons || []).map((b) => b.text || b.type || ""),
      };
    });
  } catch (e) { /* Meta down — names still show */ }
}

/* ============================= AI usage ============================= */
const usd = (n) => "$" + Number(n || 0).toFixed(Number(n) >= 1 ? 2 : 4);
const inrCost = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n || 0));

/* Period filter: 1 = aaj, 7, 30 din. Calls/tokens/spend, purpose, model aur
   attribution isi period ke; budget alert aur "Monthly at this rate" hamesha
   poore mahine ke. Browser yaad rakhta hai. */
const USAGE_RANGES = [[1, "Today"], [7, "7 days"], [30, "30 days"]];
let USAGE_DAYS = (() => {
  try { const v = Number(localStorage.getItem("kk_usage_days")); return [1, 7, 30].includes(v) ? v : 30; }
  catch (_) { return 30; }
})();
function usageRange(days) {
  USAGE_DAYS = days;
  try { localStorage.setItem("kk_usage_days", String(days)); } catch (_) {}
  loadUsage();
}
function renderUsageRange() {
  $("usage-range").innerHTML = USAGE_RANGES.map(([d, label]) =>
    `<button type="button" class="chip ${USAGE_DAYS === d ? "on" : ""}" aria-pressed="${USAGE_DAYS === d}"
      onclick="usageRange(${d})">${label}</button>`).join("");
}

async function loadUsage() {
  renderUsageRange();
  $("usage-kpis").innerHTML = skeleton(1);
  $("usage-models").innerHTML = skeleton(3);
  let u;
  try { u = await api(`/admin/api/usage?days=${USAGE_DAYS}`); window.__LLM_USAGE = u; }
  catch (e) { $("usage-models").innerHTML = errBox(e.message, "loadUsage"); return; }

  const capNote = u.daily_request_cap
    ? `${u.calls_left_today} left today`
    : "no limit set";
  const budgetNote = u.monthly_budget_usd
    ? `budget ${usd(u.monthly_budget_usd)}` : "no budget set";

  // A forecast warning is more useful than showing a budget number alone.
  // Use the backend's same-month projection; never label estimated token
  // pricing as an exact Google invoice.
  const budget = Number(u.monthly_budget_usd || 0);
  const projectedUsd = Number(u.projected_month_usd || 0);
  const monthUsd = Number(u.month?.cost_usd || 0);
  const budgetPct = budget > 0 ? Math.round((projectedUsd / budget) * 100) : null;
  const budgetTone = budgetPct === null ? "muted"
    : budgetPct >= 100 ? "var(--danger)"
    : budgetPct >= 80 ? "var(--warn)" : "var(--ok)";
  const budgetTitle = budgetPct === null ? "AI spend alert is not configured"
    : budgetPct >= 100 ? "Projected AI spend is over budget"
    : budgetPct >= 80 ? "AI budget warning" : "AI spend is within budget";
  const budgetDetail = budgetPct === null
    ? "Set a monthly AI budget in Settings to enable forecast warnings."
    : `Recorded this month: ${usd(monthUsd)} · projected: ${usd(projectedUsd)} / ${usd(budget)} (${budgetPct}%). Forecast is an estimate, not an invoice.`;
  $("usage-budget-alert").innerHTML = `<div class="card" style="border-left:4px solid ${budgetTone};margin-bottom:14px">
    <b style="color:${budgetTone}">${esc(budgetTitle)}</b>
    <p class="muted" style="margin-top:5px">${esc(budgetDetail)}</p>
    ${budgetPct !== null ? `<div style="height:7px;background:var(--n100);border-radius:5px;overflow:hidden;margin-top:10px">
      <div style="height:100%;width:${Math.min(100, Math.max(0, budgetPct))}%;background:${budgetTone};border-radius:5px"></div>
    </div>` : ""}
  </div>`;

  const p = u.period || { ...u.month, days: 30 };
  const pName = p.days === 1 ? "today" : `${p.days} days`;
  $("usage-kpis").innerHTML =
    kpi(`AI calls · ${pName}`, p.calls, p.days === 1 ? capNote : `${p.failed_calls || 0} failed`, "", "⚡", "orange") +
    kpi(`Tokens · ${pName}`, kTok(p.input_tokens + p.output_tokens),
        `in ${kTok(p.input_tokens)} · out ${kTok(p.output_tokens)}`, "", "🔤", "blue") +
    kpi(`Spend · ${pName}`, u.all_free ? "₹0 (free)" : inrCost(p.cost_inr),
        u.all_free ? "on the free tier" : `${usd(p.cost_usd)} · month ${inrCost(u.month.cost_inr)} · ${budgetNote}`, "", "💰", "green") +
    kpi("Monthly at this rate", u.all_free ? "₹0" : inrCost((u.month.cost_inr || 0) / Math.max(1, new Date().getDate()) * 30),
        `${u.month.calls} calls so far`, "", "📈", "purple");

  // series mahine/7 din tak bhi aati hai (simulator ke liye) — chart sirf period
  const s = (u.series || []).filter((d) => !p.start || d.date >= p.start);
  $("usage-chart-title").textContent = p.days === 1 ? "Today's usage" : `Daily usage (${p.days} days)`;
  const max = Math.max(1, ...s.map((d) => d.calls));
  $("usage-chart").innerHTML = s.length
    ? `<div style="display:flex;align-items:flex-end;gap:3px;height:130px">` +
      s.map((d) => `<div title="${d.date}: ${d.calls} calls, ${kTok(d.tokens)} tokens"
        onclick="toast('${d.date}: ${d.calls} calls, ${kTok(d.tokens)} tokens')"
        style="flex:1;min-width:0;background:var(--g-blue);border-radius:3px 3px 0 0;cursor:pointer;
        height:${Math.max(3, (d.calls / max) * 100)}%"></div>`).join("") + `</div>
      <div class="muted" style="display:flex;justify-content:space-between;margin-top:6px">
        <span>${s[0].date.slice(5)}</span><span>today</span></div>`
    : emptyBox("No AI calls recorded yet.", "📊");

  const rows = u.by_purpose || [];
  const totTok = rows.reduce((a, r) => a + r.tokens, 0) || 1;
  $("usage-purpose").innerHTML = rows.length
    ? rows.map((r) => `
      <div class="sumrow"><span>${esc(PURPOSE_LABEL[r.purpose] || r.purpose)}</span>
        <span>${r.calls} calls · ${kTok(r.tokens)}${u.all_free ? "" : " · " + inrCost(r.cost_inr)}</span></div>
      <div style="height:5px;background:var(--n100);border-radius:3px;margin-bottom:8px">
        <div style="height:5px;width:${Math.round((r.tokens / totTok) * 100)}%;background:var(--g-orange);border-radius:3px"></div>
      </div>`).join("")
    : `<p class="muted">Nothing in this period yet.</p>`;

  const byModel = p.by_model || [];
  $("usage-models").innerHTML =
    '<p class="muted">Provider: <b>' + esc(u.provider) + '</b> · ' + esc(u.models.smart) + ' / ' + esc(u.models.cheap) + '</p>' +
    '<table class="tbl"><thead><tr><th>Model</th><th>Calls</th><th>Input</th><th>Output</th><th>Failed</th><th>Cost</th></tr></thead><tbody>' +
    (byModel.map((m) => '<tr><td><b>' + esc(m.model) + '</b></td><td>' + m.calls + '</td><td>' + kTok(m.input_tokens) + '</td><td>' +
      kTok(m.output_tokens) + '</td><td>' + (m.failed || 0) + '</td><td class="money">' + (m.priced ? inrCost(m.cost_inr) : '<span class="muted">free</span>') + '</td></tr>').join("")
      || '<tr><td colspan="6" class="muted">No calls in this period.</td></tr>') + '</tbody></table>' +
    '<div class="rowcards">' + (byModel.map((m) => '<div class="rowcard"><div class="r1"><b>' + esc(m.model) + '</b><span class="money">' +
      (m.priced ? inrCost(m.cost_inr) : "free") + '</span></div><div class="kv"><span>' + m.calls + ' calls · ' + (m.failed || 0) + ' failed</span><span>in ' +
      kTok(m.input_tokens) + ' · out ' + kTok(m.output_tokens) + '</span></div></div>').join("") || '<p class="muted">No calls in this period.</p>') + '</div>' +
    '<p class="muted" style="margin-top:10px">Rates and limits can be changed in Settings — past usage is re-priced with the new rates too.</p>';

  const a = u.attribution || {};
  const orders = a.by_order || [];
  const customers = a.by_customer || [];
  const un = a.unattributed || {calls: 0, tokens: 0, cost_usd: 0};
  const linkedCalls = orders.reduce((n, x) => n + x.calls, 0) + customers.reduce((n, x) => n + x.calls, 0);
  const orderRows = orders.slice(0, 20).map(x =>
    '<tr><td><b>' + esc(x.order_number) + '</b></td><td>' + esc(x.customer_name) + '</td><td>' + x.calls + '</td><td>' + kTok(x.tokens) + '</td><td>' +
    (x.failed_calls || 0) + '</td><td class="money">' + (u.all_free ? "free" : inrCost(x.cost_inr)) + '</td></tr>').join("");
  const customerRows = customers.slice(0, 20).map(x =>
    '<tr><td><b>' + esc(x.customer_name) + '</b></td><td>' + x.calls + '</td><td>' + kTok(x.tokens) + '</td><td>' + (x.failed_calls || 0) + '</td><td class="money">' +
    (u.all_free ? "free" : inrCost(x.cost_inr)) + '</td></tr>').join("");
  $("usage-attribution").innerHTML =
    kpi("Linked AI calls", linkedCalls, "Customer/order context available", "", "🔗", "blue") +
    kpi("Unlinked calls", un.calls || 0, "Background/system AI", "", "🧩", "orange") +
    kpi("Unlinked cost", u.all_free ? "₹0 (free)" : inrCost(un.cost_inr), "Not safely assignable to an order", "", "⚠️", "purple") +
    (orders.length ? '<div style="margin-top:14px"><b>By order — one active order at call time</b><table class="tbl" style="margin-top:8px"><thead><tr><th>Order</th><th>Customer</th><th>Calls</th><th>Tokens</th><th>Failed</th><th>Cost</th></tr></thead><tbody>' +
      orderRows + '</tbody></table></div>' : '<p class="muted">No single-active-order AI calls yet.</p>') +
    (customers.length ? '<div style="margin-top:14px"><b>By customer — multiple active orders / no safe order link</b><table class="tbl" style="margin-top:8px"><thead><tr><th>Customer</th><th>Calls</th><th>Tokens</th><th>Failed</th><th>Cost</th></tr></thead><tbody>' +
      customerRows + '</tbody></table></div>' : "") +
    '<p class="muted" style="margin-top:10px">Order attribution is conservative: only one active order gets an order-level link; multiple active orders stay at customer level.</p>';
  calcUsageSimulator();
}
function setUsageSimNemotron() {
  $("usage-sim-in").value = "0.05";
  $("usage-sim-out").value = "0.20";
  calcUsageSimulator();
}
function calcUsageSimulator() {
  const inputRate = Math.max(0, Number($("usage-sim-in")?.value || 0));
  const outputRate = Math.max(0, Number($("usage-sim-out")?.value || 0));
  const series = window.__LLM_USAGE?.series || [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayKey = isoDateLocal(now);
  const estimateDay = (d) => {
    const usdCost = (Number(d.input_tokens || 0) / 1e6) * inputRate + (Number(d.output_tokens || 0) / 1e6) * outputRate;
    return { usd: usdCost, inr: d.fx_usd_inr ? usdCost * Number(d.fx_usd_inr) : null };
  };
  const monthDays = series.filter(d => new Date(d.date + "T00:00:00") >= monthStart);
  const last7Days = series.slice(-7);
  const month = monthDays.reduce((a, d) => {
    const x = estimateDay(d); a.in += Number(d.input_tokens || 0); a.out += Number(d.output_tokens || 0); a.calls += Number(d.calls || 0); a.usd += x.usd; a.inr += x.inr || 0; return a;
  }, {in:0,out:0,calls:0,usd:0,inr:0});
  const today = series.find(d => d.date === todayKey);
  const todayEst = today ? estimateDay(today) : {usd:0,inr:0};
  const last7 = last7Days.reduce((a, d) => {
    const x = estimateDay(d); a.tokens += Number(d.tokens || 0); a.usd += x.usd; a.inr += x.inr || 0; return a;
  }, {tokens:0,usd:0,inr:0});
  const projected = month.inr && now.getDate() ? month.inr / now.getDate() * 30 : 0;
  const fxLabel = window.__LLM_USAGE?.fx?.source || "historical USD/INR";
  $("usage-simulator").innerHTML =
    kpi("This month", inrCost(month.inr), `${kTok(month.in)} in · ${kTok(month.out)} out · ${usd(month.usd)}`, "", "💵", "green") +
    kpi("Projected 30 days", inrCost(projected), `${month.calls} calls so far`, "", "📈", "blue") +
    kpi("Today", inrCost(todayEst.inr), `${today?.calls || 0} AI calls · ${today?.fx_usd_inr ? "₹" + Number(today.fx_usd_inr).toFixed(2) + "/$" : "FX unavailable"}`, "", "⚡", "orange") +
    kpi("Last 7 days", inrCost(last7.inr), `${kTok(last7.tokens)} tokens · exact input/output`, "", "📊", "purple") +
    `<p class="muted" style="margin-top:10px">INR conversion uses the USD/INR rate attached to each usage date (${esc(fxLabel)}). No rough 50/50 token split. USD is shown only as a reference. Forecast is an estimate, not a provider invoice.</p>`;
}
const PURPOSE_LABEL = {
  reply: "Customer replies", intent: "Understanding messages", extract: "Reading bills/commands",
  vision: "Bill from photo", query: "Your questions", marketing: "Writing campaigns",
  social: "Daily poster", other: "Other",
  staff_command_extract: "Staff commands", staff_chat: "Staff chat (no longer uses AI)",
  staff_expense_extract: "Staff expenses", staff_voice: "Staff voice notes",
  relay_compose: "Messages relayed to staff", customer_voice: "Customer voice notes",
  customer_image: "Customer photos", inbound_non_lead_classif: "Spam / lead check",
  inbox_suggest: "Inbox ✨ suggestions", memory: "Customer memory", followup: "Customer follow-ups",
  gbp_post: "Google posts",
};

/* ============================= tasks ============================= */
let TASKS = [], taskFilter = "OPEN";

async function loadTasks() {
  $("task-list").innerHTML = skeleton(5);
  try {
    // STAFF is normally filled by the Settings page — the "naya kaam" form
    // needs it here too, so fetch it if we came straight to Tasks
    const [tasks, staff] = await Promise.all([
      api("/admin/api/tasks?status=ALL&limit=200"),
      STAFF.length ? Promise.resolve(STAFF) : api("/admin/api/staff"),
    ]);
    TASKS = tasks; STAFF = staff;
  } catch (e) { $("task-list").innerHTML = errBox(e.message, "loadTasks"); return; }
  renderTaskKpis(); renderTaskChips(); renderTasks();
}

function renderTaskKpis() {
  const open = TASKS.filter((t) => t.status === "OPEN");
  const stuck = open.filter((t) => t.escalated || t.age_hours >= 6);
  const unassigned = open.filter((t) => !t.staff);
  const doneToday = TASKS.filter((t) => t.status === "DONE"
    && t.completed_at && t.completed_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
  $("task-kpis").innerHTML =
    kpi("Open work", open.length, "Team ka pending kaam", "", "📋", "orange") +
    kpi("Stuck", stuck.length, "6h+ old ya escalated", "", "🚨", "red") +
    kpi("Unassigned", unassigned.length, "Kisi staff ko nahi diya", "", "👤", "orange") +
    kpi("Done today", doneToday.length, "", "", "✅", "green");
}

function renderTaskChips() {
  const counts = {
    OPEN: TASKS.filter((t) => t.status === "OPEN").length,
    DONE: TASKS.filter((t) => t.status === "DONE").length,
    ALL: TASKS.length,
  };
  // Ginti label se chipki hui thi ("Pending1") — ab apne pill mein, saaf
  // padhne layak. Ye asli buttons hain, isliye keyboard/tab se bhi chalte
  // hain aur screen-reader ko pata hota hai kaunsa chuna hua hai.
  $("task-chips").innerHTML = [["OPEN", "Pending"], ["DONE", "Done"], ["ALL", "All"]]
    .map(([v, label]) => `<button type="button" class="chip ${taskFilter === v ? "on" : ""}"
      aria-pressed="${taskFilter === v}"
      onclick="taskFilter='${v}';renderTaskChips();renderTasks()">${label}<span class="cnt">${counts[v]}</span></button>`)
    .join("");
}

function renderTasks() {
  const rows = TASKS.filter((t) => taskFilter === "ALL" || t.status === taskFilter);
  if (!rows.length) {
    $("task-list").innerHTML = emptyBox(
      taskFilter === "OPEN" ? "No pending tasks 🎉" : "Nothing here.", "✅");
    return;
  }
  // Har kaam apna card — poora card khulta hai (click ya Enter), aur
  // buttons alag rehte hain taaki "Done" dabane par detail na khul jaye.
  $("task-list").innerHTML = `<div class="taskgrid">` + rows.map((t) => {
    const open = t.status === "OPEN";
    const late = open && (t.escalated || t.age_hours >= 6);
    return `
    <article class="taskcard ${open ? "" : "off"} ${late ? "late" : ""}"
      tabindex="0" role="button" aria-label="${esc(t.code)} details"
      onclick="taskDetail('${t.code}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();taskDetail('${t.code}')}">
      <div class="tc-top">
        <span class="badge">${t.code}</span>
        <span class="statuspill ${open ? "off" : "on"}">${
          t.status === "OPEN" ? `${t.age_hours}h pending` : t.status === "DONE" ? "Done" : "Cancelled"}</span>
      </div>
      <div class="tc-title">${t.urgent ? "🔴 " : ""}${esc(t.title)}</div>
      <div class="tc-meta">
        <span class="badge role">${t.staff ? esc(t.staff) : "unassigned"}</span>
        ${t.kind ? `<span class="badge">${esc(t.kind)}</span>` : ""}
        ${t.customer_name ? `<span class="badge">👤 ${esc(t.customer_name)}</span>` : ""}
        ${t.order_number ? `<span class="badge">${esc(t.order_number)}</span>` : ""}
        ${t.due_at ? `<span class="badge ${new Date(t.due_at) < new Date() && open ? "warn" : ""}">⏰ ${whenIST(t.due_at)} IST</span>` : ""}
        ${t.ping_count ? `<span class="badge">reminded ${t.ping_count}×</span>` : ""}
        ${t.escalated ? `<span class="badge warn">escalated to you</span>` : ""}
        ${t.awaiting_reply ? `<span class="badge warn">❓ sawaal — jawab baaki</span>` : ""}
      </div>
      ${t.awaiting_reply ? `<div class="tc-reply">❓ ${esc(t.staff || "they")}: ${esc(t.last_question)}</div>` : ""}
      ${t.reply ? `<div class="tc-reply">💬 ${esc(t.staff || "they")}: ${esc(t.reply)}</div>` : ""}
      ${open ? `
      <div class="tc-acts" onclick="event.stopPropagation()">
        <button class="btn sm ghost" onclick="pingTask('${t.code}', this)">Ask</button>
        <button class="btn sm" onclick="doneTask('${t.code}', this)">Done</button>
        <button class="btn sm ghost" onclick="cancelTask('${t.code}', this)">Cancel</button>
      </div>` : ""}
    </article>`;
  }).join("") + `</div>`;
}

/* Tareekh ka ek hi roop — pehle ye taskDetail ke andar band tha, isliye
   thread use nahi kar pata tha. */
const when = (s) => (s ? new Date(s).toLocaleString("en-IN", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}) : "—");
const whenIST = (s) => (s ? new Date(s).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
}) : "—");

/* Card par click -> poori kahani ek jagah: kise diya, kab, kitni baar
   yaad dilaya, usne kya kaha. Pehle ye sab kahin dikhta hi nahi tha. */
function editTaskModal(code) {
  const t = TASKS.find((x) => x.code === code);
  if (!t) return;
  const staffOpts = (STAFF || []).filter((s) => s.is_active || s.name === t.staff)
    .map((s) => `<option value="${esc(s.name)}" ${s.name === t.staff ? "selected" : ""}>${esc(s.name)} · ${esc(s.role || "")}</option>`).join("");
  const localDue = t.due_at ? (() => { const d = new Date(t.due_at); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16); })() : "";
  openModal(`<h3>Edit task · ${esc(t.code)}</h3>
    <div class="frm">
      <div class="setfield"><label>Task / Instructions</label><textarea id="et-title" rows="3">${esc(t.title)}</textarea></div>
      <div class="split2">
        <div class="setfield"><label>Task type</label><select id="et-kind">
          ${[["pickup","Pickup"],["wash","Washing"],["dry","Drying"],["iron","Ironing"],["delivery","Delivery"],["packing","Packing"],["custom","Custom"],["general","General"]].map(([v,l])=>`<option value="${v}" ${(t.kind||"general")===v?"selected":""}>${l}</option>`).join("")}
        </select></div>
        <div class="setfield"><label>Priority</label><select id="et-priority">
          <option value="normal" ${t.urgent?"":"selected"}>Normal</option><option value="urgent" ${t.urgent?"selected":""}>Urgent</option>
        </select></div>
      </div>
      <div class="setfield"><label>Assigned staff</label><select id="et-staff"><option value="">Unassigned</option>${staffOpts}</select></div>
      <div class="split2">
        <div class="setfield"><label>Customer name</label><input id="et-customer-name" value="${esc(t.customer_name || "")}"></div>
        <div class="setfield"><label>Customer phone</label><input inputmode="numeric" id="et-customer-phone" type="tel" value="${esc(t.customer_phone || "")}"></div>
      </div>
      <div class="setfield"><label>Order number (optional)</label><input id="et-order" value="${esc(t.order_number || "")}" placeholder="KK-YYYYMMDD-01"></div>
      <div class="setfield"><label>Due date & time (IST)</label><input id="et-due" type="datetime-local" value="${localDue}"></div>
      <small class="muted">Save karne par changes database mein save honge.</small>
      <small class="fielderr" id="et-err"></small>
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="et-save">Save changes</button></div>`);
  $("et-save").onclick = (e) => busy(e.target, async () => {
    const title = $("et-title").value.trim();
    if (title.length < 2) { $("et-err").textContent = "Task instructions likhiye."; return; }
    const phone = $("et-customer-phone").value.trim();
    if (phone && phone.replace(/\D/g, "").length < 10) { $("et-err").textContent = "Customer phone valid nahi hai."; return; }
    await api(`/admin/api/tasks/${encodeURIComponent(code)}`, { method: "PUT", body: {
      title, kind: $("et-kind").value, priority: $("et-priority").value,
      staff: $("et-staff").value || null,
      customer_name: $("et-customer-name").value.trim() || null,
      customer_phone: phone || null,
      order_number: $("et-order").value.trim() || null,
      due_at: $("et-due").value ? taskDueISO($("et-due").value) : null,
    }});
    closeModal(); toast("Task updated and saved"); await loadTasks();
  });
}

function taskDetail(code) {
  const t = TASKS.find((x) => x.code === code);
  if (!t) return;
  const open = t.status === "OPEN";
  const row = (k, v) => `<div class="dt-row"><span>${k}</span><b>${v}</b></div>`;
  openModal(`
    <h3>${t.urgent ? "🔴 " : ""}${esc(t.title)}</h3>
    <div class="tc-meta" style="margin:-4px 0 12px">
      <span class="badge">${t.code}</span>
      <span class="statuspill ${open ? "off" : "on"}">${
        t.status === "OPEN" ? `${t.age_hours}h pending` : t.status === "DONE" ? "Done" : "Cancelled"}</span>
      ${t.escalated ? `<span class="badge warn">escalated to you</span>` : ""}
    </div>
    <div class="dtl">
      ${row("Given to", t.staff ? esc(t.staff) : "unassigned")}
      ${t.order_number ? row("Order", esc(t.order_number)) : ""}
      ${t.customer_name ? row("Customer", esc(t.customer_name)) : ""}
      ${t.kind ? row("Type", esc(t.kind)) : ""}
      ${t.due_at ? row("Due", `${whenIST(t.due_at)} IST`) : ""}
      ${row("Created", `${when(t.created_at)}${t.created_by ? ` · ${esc(t.created_by)}` : ""}`)}
      ${row("Last reminder", when(t.last_ping_at))}
      ${row("Times asked", t.ping_count || 0)}
      ${t.eta_text ? row("They said", esc(t.eta_text)) : ""}
      ${t.completed_at ? row("Closed", when(t.completed_at)) : ""}
    </div>
    ${t.reply ? `<div class="tc-reply" style="margin-top:12px">💬 ${esc(t.staff || "they")}: ${esc(t.reply)}</div>` : ""}
    <div id="tt-box"></div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal();editTaskModal('${t.code}')">✏️ Edit task</button>
      <button class="btn ghost" onclick="closeModal()">Close</button>
      ${open ? `
        <button class="btn ghost" onclick="pingTask('${t.code}', this, true)">Ask again</button>
        <button class="btn ghost" onclick="cancelTask('${t.code}', this, true)">Cancel task</button>
        <button class="btn" onclick="doneTask('${t.code}', this, true)">Mark done</button>` : ""}
    </div>`);
  if (t.msg_count) loadTaskThread(t.code);
}

/* Staff ke sawaal aur unke jawab — wahi thread jo panel mein dikhta hai.
 *
 * Ye poora rasta backend mein pehle se bana pada tha (/tasks/{code}/messages
 * aur /reply), par dashboard mein use bulane wala kuch nahi tha. Yani staff
 * ka sawaal DB mein likha jata tha aur wahin mar jata tha: owner ko na
 * koi screen milti thi, na — WhatsApp API juda na ho to — koi khabar.
 *
 * Isliye thread task ke andar hai, alag page par nahi: sawaal hamesha kisi
 * ek kaam ke baare mein hota hai, aur uska jawab dene ke liye wahi kaam
 * saamne hona chahiye. */
async function loadTaskThread(code) {
  const box = document.getElementById("tt-box");
  if (!box) return;
  box.innerHTML = `<div class="muted" style="margin-top:12px">Loading…</div>`;
  let th;
  try { th = await api(`/admin/api/tasks/${code}/messages`); }
  catch (e) { box.innerHTML = `<div class="muted" style="margin-top:12px">${esc(e.message)}</div>`; return; }
  if (!document.getElementById("tt-box")) return;      // sheet band ho gayi
  box.innerHTML = `
    <div class="tt-thread">
      ${th.messages.map((m) => `
        <div class="tt-msg ${m.who === "staff" ? "them" : "us"}">
          ${esc(m.text)}
          <span class="tt-at">${esc(m.who === "staff" ? m.name : "Aapne")} · ${when(m.at)}</span>
        </div>`).join("")}
    </div>
    <textarea id="tt-text" rows="2" placeholder="Jawab likhein…"></textarea>
    <div class="btnrow" style="margin-top:8px">
      <button class="btn" onclick="sendTaskReply('${code}', this)">Send reply</button>
    </div>
    <div id="tt-wa"></div>`;
}

async function sendTaskReply(code, btn) {
  const el = document.getElementById("tt-text");
  const text = (el.value || "").trim();
  if (text.length < 2) { toast("Jawab likhein pehle", true); return; }
  await busy(btn, async () => {
    const r = await api(`/admin/api/tasks/${code}/reply`, { method: "POST", body: { text } });
    el.value = "";
    await loadTaskThread(code);
    loadTasks();
    if (r.whatsapp) { toast("Jawab bhej diya"); return; }
    // WhatsApp API se nahi gaya. Jawab panel mein to dikh hi raha hai, par
    // staff ko tab tak pata nahi chalega jab tak wo khud khole. Owner ke
    // apne phone ka WhatsApp hamesha hai — wahi rasta jo staff panel bill
    // share karne ke liye use karta hai: link par tap khud user ka gesture
    // hai, isliye popup blocker ise nahi rokta.
    toast("Panel mein chala gaya — WhatsApp se bhejna ho to neeche");
    const wa = document.getElementById("tt-wa");
    if (wa && r.staff_phone) {
      wa.innerHTML = `<div class="btnrow" style="margin-top:8px">
        <a class="btn" target="_blank" rel="noopener"
           href="${esc(waShareUrl(r.staff_phone, r.wa_text))}">📲 ${esc(r.staff_name || "Staff")} ko WhatsApp par bhejein</a>
      </div>`;
    }
  });
}


/* Task ke teen kaam: pooch lo, band karo, radd karo.
 *
 * Teenon ek hi raste se jate hain taaki teenon ek jaise BOLEN. Pehle button
 * dabate hi kuch nahi dikhta tha — network dheema ho to aadmi ko lagta tha
 * click laga hi nahi, aur wo dobara dabata tha. Ab: turant spinner, phir
 * toast, phir list taaza. Sheet se dabaya ho to sheet kaam POORA hone par
 * band hoti hai (pehle wo pehle band ho jati thi, isliye galti dikhti hi
 * nahi thi — jawab kahin kho jata tha). */
async function taskAction(code, path, btn, shut, okMsg) {
  const run = async () => {
    const r = await api(`/admin/api/tasks/${code}/${path}`, { method: "POST" });
    if (shut) closeModal();
    toast((r && r.detail) || okMsg);
    loadTasks();
  };
  if (!btn) { try { await run(); } catch (e) { toast(e.message, true); } return; }
  await busy(btn, run);           // busy() khud galti par toast kar deta hai
}

async function pingTask(code, btn, shut) {
  return taskAction(code, "ping", btn, shut, "Reminder sent");
}
async function doneTask(code, btn, shut) {
  return taskAction(code, "done", btn, shut, `${code} closed`);
}
function cancelTask(code, btn, shut) {
  confirmDialog(`Cancel ${code}? The staff member will get no more reminders.`, async () => {
    // confirm apni modal khud band karta hai; detail sheet bhi tabhi jaye
    await taskAction(code, "cancel", null, shut, `${code} cancelled`);
  });
}
async function pingAllTasks(btn) {
  await busy(btn, async () => {
    const r = await api("/admin/api/jobs/task-followups", { method: "POST" });
    toast(r.sent ? `Reminded ${r.sent} people` : "Nobody needed a reminder right now");
    loadTasks();
  });
}

let TASK_CUSTOMER = null;
let TASK_CUSTOMER_TIMER = null;

function taskDueISO(value) {
  if (!value) return null;
  // Task dates are shop-local IST, regardless of the device/browser timezone.
  const d = new Date(value + ":00+05:30");
  if (Number.isNaN(d.getTime())) throw new Error("Due date/time is invalid");
  return d.toISOString();
}

async function searchTaskCustomers(value, {showRecent = false} = {}) {
  const q = (value || "").trim();
  const box = $("nt-cust-results");
  if (!box) return;
  clearTimeout(TASK_CUSTOMER_TIMER);
  if (!showRecent && q.length < 2) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="muted" style="padding:8px">Loading customers…</div>';
  TASK_CUSTOMER_TIMER = setTimeout(async () => {
    try {
      const url = q
        ? "/admin/api/tasks/customers?q=" + encodeURIComponent(q)
        : "/admin/api/tasks/customers";
      const rows = await api(url);
      if (!rows.length) {
        box.innerHTML = '<button type="button" class="acitem muted" onclick="newTaskCustomerModal()">No customer found — + Add new</button>';
        return;
      }
      box.innerHTML = rows.map(c => `
        <button type="button" class="acitem" data-action="taskCustomerPick" data-id="${esc(c.id)}" data-name="${esc(c.name)}" data-phone="${esc(c.phone)}">
          <b>${esc(c.name)}</b><span>${esc(c.phone)}</span>
        </button>`).join("");
    } catch (err) {
      box.innerHTML = '<div class="muted" style="padding:8px">Could not search customers.</div>';
    }
  }, showRecent ? 0 : 180);
}

async function loadTaskCustomerOrders(customerId) {
  const wrap = $("nt-order-wrap"), sel = $("nt-order-select");
  if (!wrap || !sel) return;
  wrap.style.display = "";
  sel.innerHTML = '<option value="">No order selected</option><option disabled>Loading running orders…</option>';
  try {
    const rows = await api("/admin/api/tasks/customers/" + encodeURIComponent(customerId) + "/orders");
    sel.innerHTML = '<option value="">No order selected</option>' +
      rows.map(o => `<option value="${esc(o.order_number)}">${esc(o.order_number)} · ${esc(o.status)} · ₹${Number(o.total_amount || 0).toLocaleString("en-IN")}</option>`).join("");
    if (!rows.length) {
      sel.innerHTML = '<option value="">No running order</option>';
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Could not load orders</option>';
  }
}

function selectTaskCustomer(id, name, phone) {
  TASK_CUSTOMER = { id, name, phone };
  $("nt-customer").value = name + " · " + phone;
  $("nt-customer-id").value = id;
  $("nt-cust-results").innerHTML = "";
  $("nt-order").value = "";
  loadTaskCustomerOrders(id);
}

function newTaskCustomerModal() {
  openModal(`<h3>➕ Add customer</h3>
    <div class="frm">
      <div class="setfield"><label>Name</label><input id="nc-name" placeholder="Customer name" autofocus></div>
      <div class="setfield"><label>WhatsApp / Mobile</label><input id="nc-phone" type="tel" inputmode="numeric" placeholder="98765 43210"></div>
      <div class="setfield"><label>Address <span class="muted">(optional)</span></label><textarea id="nc-address" rows="2" placeholder="Pickup/delivery address"></textarea></div>
      <small class="fielderr" id="nc-err"></small>
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal();newTaskModal()">Back</button><button class="btn" id="nc-save">Save customer</button></div>`);
  $("nc-save").onclick = (e) => busy(e.target, async () => {
    const name = $("nc-name").value.trim(), phone = $("nc-phone").value.trim();
    if (!name || phone.replace(/\D/g, "").length < 10) { $("nc-err").textContent = "Name and valid mobile number are required."; return; }
    const r = await api("/admin/api/tasks/customers", { method: "POST", body: {
      name, phone, address: $("nc-address").value.trim() || null
    }});
    TASK_CUSTOMER = r;
    closeModal();
    newTaskModal();
    selectTaskCustomer(r.id, r.name, r.phone);
    toast(r.existing ? "Existing customer selected" : "Customer added");
  });
}

function newTaskModal() {
  TASK_CUSTOMER = null;
  const opts = (STAFF || []).filter((s) => s.is_active)
    .map((s) => `<option value="${esc(s.name)}">${esc(s.name)} · ${esc(s.role || "")}</option>`).join("");
  openModal(`<h3>New task</h3>
    <p class="muted" style="margin-top:-6px">Database-linked work item — customer, order, staff and due time stay connected.</p>
    <div class="frm">
      <div class="setfield"><label>Task type</label>
        <select id="nt-kind">
          <option value="pickup">🧺 Pickup</option><option value="wash">🧼 Washing</option>
          <option value="dry">💨 Drying</option><option value="iron">👔 Ironing</option>
          <option value="delivery">🚚 Delivery</option><option value="packing">📦 Packing</option>
          <option value="custom">🛠️ Custom</option><option value="general">📋 General</option>
        </select></div>
      <div class="setfield"><label>Customer <span class="muted">(needed for Pickup / Delivery)</span></label>
        <input id="nt-customer" placeholder="Search existing customer by name or WhatsApp…" autocomplete="off">
        <input id="nt-customer-id" type="hidden">
        <div id="nt-cust-results" class="acp"></div>
        <button type="button" class="btn ghost sm" style="margin-top:6px" onclick="newTaskCustomerModal()">＋ Add new customer</button>
      </div>
      <div class="setfield" id="nt-order-wrap" style="display:none"><label>Running order <span class="muted">(optional)</span></label>
        <select id="nt-order-select"><option value="">Select running order</option></select>
        <input id="nt-order" type="hidden">
        <small class="muted">Customer select karte hi uske active/running orders yahan automatically aayenge.</small></div>
      <div class="split2">
        <div class="setfield"><label>Assign to</label>
          <select id="nt-staff"><option value="">No staff yet</option>${opts}</select></div>
        <div class="setfield"><label>Due date & time <span class="muted">IST</span></label>
          <input id="nt-due" type="datetime-local"></div>
      </div>
      <div class="setfield"><label>Instructions</label>
        <textarea id="nt-title" rows="3" placeholder="Pick clothes from customer, check count, create bill…"></textarea>
        <small>The task and its linked customer/order are stored in the database. The same details are sent to the assignee on WhatsApp.</small>
        <small class="fielderr" id="nt-err"></small></div>
      <div class="setfield"><label>Priority</label>
        <select id="nt-urgent"><option value="false">Normal</option><option value="true">Urgent</option></select></div>
    </div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="nt-go">Create & send task</button>
    </div>`);
  $("nt-customer").oninput = () => searchTaskCustomers($("nt-customer").value);
  $("nt-customer").onfocus = () => searchTaskCustomers($("nt-customer").value, {showRecent: true});
  $("nt-order-select").onchange = () => { $("nt-order").value = $("nt-order-select").value; };
  $("nt-go").onclick = (e) => busy(e.target, async () => {
    const title = $("nt-title").value.trim();
    const kind = $("nt-kind").value;
    const customerId = $("nt-customer-id").value || null;
    const orderNumber = $("nt-order").value.trim() || null;
    // Sirf ghar jaane wale kaam ko grahak chahiye — dhulai/press dukaan ka kaam bhi hota hai
    const needsCustomer = ["pickup", "delivery"].includes(kind);
    if (title.length < 2) { $("nt-err").textContent = "Instructions/task detail likhiye."; return; }
    if (needsCustomer && !customerId && !orderNumber) {
      $("nt-err").textContent = "Pickup/Delivery task ke liye customer select kijiye.";
      return;
    }
    const due = $("nt-due").value ? taskDueISO($("nt-due").value) : null;
    const r = await api("/admin/api/tasks", { method: "POST", body: {
      title,
      kind,
      staff: $("nt-staff").value || null,
      order_number: orderNumber,
      customer_id: customerId,
      due_at: due,
      urgent: $("nt-urgent").value === "true",
    }});
    closeModal();
    toast(r.updated_existing
      ? `${r.code} — this order already had an open ${kind} task; it is updated with your instructions`
      : `${r.code} created and assigned`, false, r.updated_existing ? 7000 : 3000);
    loadTasks();
  });
}

/* ============================= expenses============================= */
// Server ki list (built-in + owner ki apni) — staff panel aur AI agent bhi
// yahi dekhte hain. loadExpenses bharta hai.
let EXP_CATS = [];
let EXP_CUSTOM = [];
let EXPENSES = [];
/* Expenses list ek calendar mahine ki (server: ?month=YYYY-MM). Pehle aakhri
   200 kharche aate the aur neeche ka Total pichhle mahine ke bhi jod deta. */
let EXP_MONTH = isoDateLocal(new Date()).slice(0, 7);
const expensesUrl = () => `/admin/api/expenses?month=${EXP_MONTH}`;
function expMonthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
async function expShiftMonth(step, btn) {
  const [y, m] = EXP_MONTH.split("-").map(Number);
  const d = new Date(y, m - 1 + step, 1);
  const next = isoDateLocal(d).slice(0, 7);
  if (next > isoDateLocal(new Date()).slice(0, 7)) return;     // aage ka mahina nahi
  const run = async () => {
    const rows = await api(`/admin/api/expenses?month=${next}`);
    EXP_MONTH = next; EXPENSES = rows;
    renderExpenses(); renderExpChart();
  };
  if (btn) await busy(btn, run); else { try { await run(); } catch (e) { toast(e.message, true); } }
}
function expMonthNav() {
  const cur = isoDateLocal(new Date()).slice(0, 7);
  return `<div class="filters" style="padding:12px 12px 0;align-items:center;gap:8px">
    <button class="btn sm ghost" aria-label="Previous month" onclick="expShiftMonth(-1, this)">‹</button>
    <b style="min-width:9em;text-align:center">${esc(expMonthLabel(EXP_MONTH))}</b>
    <button class="btn sm ghost" aria-label="Next month" onclick="expShiftMonth(1, this)" ${EXP_MONTH >= cur ? "disabled" : ""}>›</button>
  </div>`;
}
let expSort = { key: "spent_on", dir: -1 }, expQuery = "";
function paintExpCats(keep) {
  const cur = keep ?? $("exp-cat").value;
  $("exp-cat").innerHTML = '<option value="">Select category…</option>'
    + EXP_CATS.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (EXP_CATS.includes(cur)) $("exp-cat").value = cur;
}
async function loadExpenses() {
  $("exp-list").innerHTML = skeleton(4);
  paintExpCats("");
  $("exp-date").value = isoDateLocal(new Date());
  let cats;
  try {
    [EXPENSES, SUMMARY, cats] = await Promise.all([
      api(expensesUrl()), api("/admin/api/reports/summary"), api("/admin/api/expense-categories"),
    ]);
  } catch (e) { $("exp-list").innerHTML = errBox(e.message, "loadExpenses"); return; }
  EXP_CATS = cats.all; EXP_CUSTOM = cats.custom;
  paintExpCats();
  const t = SUMMARY.today || {}, m = SUMMARY.month || {}, lm = SUMMARY.last_month || {};
  const profit = Number(m.profit || 0);
  // "vs last month" — omit when there is no baseline to compare against
  const delta = (now, prev) => {
    const p = Number(prev || 0);
    if (!p) return "";
    const pct = Math.round(((Number(now || 0) - p) / Math.abs(p)) * 100);
    const cls = pct > 0 ? "down" : pct < 0 ? "up" : "";   // more spend = bad (red)
    return `<span class="sub ${cls}">${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(pct)}% vs last month</span>`;
  };
  const profitDelta = (() => {
    const p = Number(lm.profit || 0);
    if (!p) return "revenue − expenses";
    const pct = Math.round(((profit - p) / Math.abs(p)) * 100);
    return `<span class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs last month</span>`;
  })();
  $("exp-kpis").innerHTML =
    kpi("Expenses today", money(t.expenses || 0), fmtDate(new Date().toISOString()), "", "📅", "amber") +
    kpi("Expenses this month", money(m.expenses || 0), delta(m.expenses, lm.expenses), "", "🗓️", "pink") +
    kpi("Profit this month", money(profit), profitDelta, "go('reports')", profit < 0 ? "📉" : "💰", profit < 0 ? "red" : "green");
  // profit value takes the sign colour directly
  const pv = $("exp-kpis").querySelectorAll(".kpi")[2]?.querySelector(".val");
  if (pv) pv.style.color = profit < 0 ? "var(--danger)" : "var(--ok)";
  renderExpenses(); renderExpChart();
  loadExpenseTarget();
}

/* ---- Mahine ka target ----
 * Fixed kharche (rent, salary, bijli...) ka jod = is mahine kam se kam
 * itna kamana hai. Roz ka hisaab server karta hai (services/expense_target.py):
 * aaj kitna aaya, aaj aur kitna laana hai, mahine mein kitna baaki. */
let EXP_TARGET = null;
const TARGET_SUGGEST = ["Dukaan ka rent", "Staff salary", "Bijli", "Loan / machine EMI", "Phone + internet", "Detergent / material"];
async function loadExpenseTarget() {
  const box = $("exp-target");
  if (!box) return;
  try { EXP_TARGET = await api("/admin/api/expense-target"); }
  catch (e) { box.innerHTML = ""; return; }
  renderExpenseTarget();
  // Pehli baar: setup khud khul jaaye — ek session mein ek hi baar, "Baad mein" ki izzat
  if (!EXP_TARGET.configured) {
    let asked = false;
    try { asked = sessionStorage.getItem("kk_target_asked") === "1"; sessionStorage.setItem("kk_target_asked", "1"); } catch (e) {}
    if (!asked) openTargetSetup();
  }
}
function renderExpenseTarget() {
  const t = EXP_TARGET, box = $("exp-target");
  if (!t || !box) return;
  if (!t.configured) {
    box.innerHTML = `<div class="card tgt-empty">
      <div><b>🎯 Mahine ka target set karein</b>
      <p class="muted">Rent, salary, bijli jaisa fixed kharcha ek baar bhar dijiye — roz dikhega kitna aaya aur kitna laana hai.</p></div>
      <button class="btn" onclick="openTargetSetup()">Fixed kharcha bharein</button></div>`;
    return;
  }
  const st = { ahead: ["ok", "✅ Aage ho", `${money(-t.gap)} aage`],
               behind: ["warn", "⚠️ Thoda peeche", `${money(t.gap)} peeche`],
               far_behind: ["bad", "🔴 Bahut peeche", `${money(t.gap)} peeche`] }[t.state] || ["warn", "", ""];
  const todayDone = t.today_left <= 0;
  const tip = t.state === "ahead"
    ? `👏 <b>Badhiya!</b> Aaj tak ka hissa poora — ${money(-t.gap)} aage ho.`
    : `💡 <b>${money(t.gap)} peeche ho.</b> Ab se roz ${money(t.need_per_day)} laana hai — ${t.work_days_left} kaam ke din bache.`;
  box.innerHTML = `<div class="card tgt tgt-${st[0]}">
    <div class="tgt-head">
      <div><div class="tgt-title">🎯 ${esc(t.month)} ka target</div>
        <div class="tgt-nums"><b>${money(t.month_total)}</b><span>/ ${money(t.target)} aaya</span></div></div>
      <span class="tgt-pill">${st[1]} · ${st[2]}</span>
    </div>
    <div class="tgt-bar" role="img" aria-label="${t.percent}% of monthly target">
      <i style="width:${Math.min(100, t.percent)}%"></i><s style="left:${Math.min(100, t.expected_percent)}%" title="Aaj tak itna hona chahiye"></s></div>
    <div class="tgt-legend"><span>${t.percent}% poora</span><span>▏Aaj tak ${money(t.expected_till_today)} hona chahiye</span></div>
    <div class="tgt-tiles">
      <div class="tgt-tile tgt-today"><div class="k">Aaj ka target</div><div class="v">${money(t.need_per_day)}</div>
        <div class="h">Aaj aaya <b>${money(t.today_total)}</b></div></div>
      <div class="tgt-tile"><div class="k">Aaj aur laana hai</div>
        <div class="v ${todayDone ? "ok" : "bad"}">${todayDone ? "✅ Poora" : money(t.today_left)}</div>
        <div class="h">${todayDone ? `${money(t.today_total - t.need_per_day)} zyada` : "aaj band hone tak"}</div></div>
      <div class="tgt-tile"><div class="k">Mahine mein baaki</div><div class="v">${money(t.remaining)}</div>
        <div class="h">${t.work_days_left} kaam ke din bache</div></div>
      <div class="tgt-tile"><div class="k">Target ke upar munafa</div><div class="v ${t.profit_over_target > 0 ? "ok" : ""}">${money(t.profit_over_target)}</div>
        <div class="h">Shuru ka roz ka target ${money(t.daily_target)}</div></div>
    </div>
    <div class="tgt-tip">${tip}</div>
    <details class="tgt-fixed"><summary>📌 Fixed kharcha — ${money(t.fixed_paid)} diya / ${money(t.target)}</summary>
      ${t.items.map((i) => `<div class="tgt-fx"><span>${esc(i.name)}</span><span class="money">${money(i.amount)}</span>
        ${i.paid ? `<span class="tgt-paid">✓ Diya</span>`
                 : `<button class="btn sm ghost" data-name="${esc(i.name)}" onclick="markFixedPaid(this)">Diya ✓</button>`}</div>`).join("")}
      <div class="btnrow"><button class="btn sm ghost" onclick="openTargetSetup()">✏️ Fixed kharcha badlein</button></div>
    </details>
  </div>`;
}
function targetRowHtml(name, amount) {
  return `<div class="tgt-row"><input class="tgt-name" placeholder="Kharcha (jaise Rent)" value="${esc(name || "")}" maxlength="40" aria-label="Expense name">
    <input class="tgt-amt" type="number" inputmode="numeric" min="0" step="1" placeholder="₹ 0" value="${amount || ""}" aria-label="Monthly amount" oninput="targetSetupTotal()">
    <button class="btn sm ghost" aria-label="Remove" title="Hatao" onclick="this.parentNode.remove();targetSetupTotal()">✕</button></div>`;
}
function openTargetSetup() {
  const t = EXP_TARGET || {};
  const rows = (t.items && t.items.length) ? t.items : TARGET_SUGGEST.map((n) => ({ name: n, amount: "" }));
  openModal(`<h3>Har mahine ka fixed kharcha</h3>
    <p class="muted">Jo kharcha har mahine pakka hota hai, bas ek baar bharein. Iska jod hi aapka mahine ka target hai.</p>
    <div id="tgt-rows">${rows.map((r) => targetRowHtml(r.name, r.amount)).join("")}</div>
    <button class="btn sm ghost" style="margin:6px 0 10px" onclick="$('tgt-rows').insertAdjacentHTML('beforeend', targetRowHtml('', ''))">＋ Aur fixed kharcha jodein</button>
    <label class="tgt-days">Mahine mein kaam ke din <input id="tgt-days" type="number" min="1" max="31" value="${t.work_days || 26}" oninput="targetSetupTotal()"></label>
    <div class="tgt-sum"><div>Har mahine kam se kam itna kamana hai</div><b id="tgt-total">₹0</b>
      <div>Roz ka target <b id="tgt-daily">₹0</b></div></div>
    <small class="fielderr" id="tgt-err"></small>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Baad mein</button>
      <button class="btn" onclick="saveTargetSetup(this)">Target set karein →</button></div>`);
  targetSetupTotal();
}
function targetSetupRows() {
  return [...document.querySelectorAll("#tgt-rows .tgt-row")].map((r) => ({
    name: r.querySelector(".tgt-name").value.trim(), amount: Number(r.querySelector(".tgt-amt").value || 0),
  }));
}
function targetSetupTotal() {
  const total = targetSetupRows().reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  const days = Math.max(1, Number($("tgt-days")?.value || 26));
  if ($("tgt-total")) $("tgt-total").textContent = money(total);
  if ($("tgt-daily")) $("tgt-daily").textContent = money(Math.round(total / days));
}
async function saveTargetSetup(btn) {
  // Naam bina rakam (khali suggestion) chhod do — sirf bhari hui lines jaati hain
  const items = targetSetupRows().filter((r) => r.amount > 0 || (r.name && !TARGET_SUGGEST.includes(r.name)));
  if (!items.length) { $("tgt-err").textContent = "Kam se kam ek kharcha ki rakam bhariye."; return; }
  await busy(btn, async () => {
    try {
      EXP_TARGET = await api("/admin/api/expense-target", {
        method: "PUT", body: { items, work_days: Number($("tgt-days").value || 26) },
      });
    } catch (e) { $("tgt-err").textContent = e.message; return; }
    closeModal(); renderExpenseTarget();
    toast(`Target set: ${money(EXP_TARGET.target)} / mahina · roz ${money(EXP_TARGET.daily_target)}`);
  });
}
async function markFixedPaid(btn) {
  const name = btn.dataset.name;
  await busy(btn, async () => {
    try {
      EXP_TARGET = await api("/admin/api/expense-target/paid", { method: "POST", body: { name } });
    } catch (e) { toast(e.message, true); return; }
    toast(`${name} — kharcha entry ban gayi`);
    renderExpenseTarget();
    const keep = document.querySelector("#exp-target details"); if (keep) keep.open = true;
    try { EXPENSES = await api(expensesUrl()); renderExpenses(); } catch (e) {}
  });
}
function expSortBy(key) {
  if (expSort.key === key) expSort.dir *= -1;
  else expSort = { key, dir: key === "spent_on" ? -1 : -1 };
  renderExpenses();
}
function expFilter(v) { expQuery = (v || "").toLowerCase(); renderExpenses(); }
function renderExpenses() {
  if (!EXPENSES.length) {
    $("exp-list").innerHTML = expMonthNav() + emptyBox(`No expenses in ${expMonthLabel(EXP_MONTH)}.`, "💸");
    return;
  }
  const q = expQuery;
  const rows = EXPENSES
    .filter((e) => !q || e.category.toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q))
    .sort((a, b) => {
      const k = expSort.key;
      const av = k === "amount" ? Number(a.amount) : a.spent_on;
      const bv = k === "amount" ? Number(b.amount) : b.spent_on;
      return (av < bv ? -1 : av > bv ? 1 : 0) * expSort.dir;
    });
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const arrow = (k) => expSort.key === k ? (expSort.dir < 0 ? " ▼" : " ▲") : "";
  if (!rows.length) {
    $("exp-list").innerHTML = expMonthNav() + `
      <div class="filters" style="padding:12px 12px 0"><input type="search" aria-label="Search expenses" value="${esc(expQuery)}" placeholder="Search category or description…" oninput="expFilter(this.value)"></div>
      ${emptyBox("No expenses match your search.", "🔍")}`;
    return;
  }
  $("exp-list").innerHTML = expMonthNav() + `
    <div class="filters" style="padding:12px 12px 0"><input type="search" aria-label="Search expenses" value="${esc(expQuery)}" placeholder="Search category or description…" oninput="expFilter(this.value)"></div>
    <table class="tbl zebra"><thead><tr>
      <th class="sortable" onclick="expSortBy('spent_on')">Date${arrow("spent_on")}</th>
      <th>Category</th>
      <th class="sortable num" onclick="expSortBy('amount')">Amount${arrow("amount")}</th>
      <th>Description</th><th></th></tr></thead>
    <tbody>${rows.map((e) => `
      <tr><td class="nowrap">${fmtDate(e.spent_on)}</td><td>${esc(e.category)}</td>
      <td class="money">${money(e.amount)}</td>
      <td class="muted" style="max-width:260px" title="${esc(e.description || "")}"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.description || "")}</div>${e.added_by ? `<div style="font-size:11.5px">by ${esc(e.added_by)}</div>` : ""}</td>
      <td><div class="act"><button class="btn sm ghost" aria-label="Edit expense" title="Edit" onclick="editExpense('${e.id}')">✏️</button><button class="btn sm ghost danger-ic" aria-label="Delete expense" title="Delete" onclick="delExpense('${e.id}')">🗑</button></div></td></tr>`).join("")}
    </tbody>
    <tfoot><tr class="totalrow"><td>Total · ${esc(expMonthLabel(EXP_MONTH))}</td><td class="muted">${rows.length} item${rows.length > 1 ? "s" : ""}</td>
      <td class="money">${money(total)}</td><td></td><td></td></tr></tfoot></table>
    <div class="rowcards">${rows.map((e) => `
      <div class="rowcard"><div class="r1"><b>${esc(e.category)}</b><span class="money">${money(e.amount)}</span></div>
      <div class="kv"><span>${fmtDate(e.spent_on)}</span><span>${esc(e.description || "")}</span></div>
      ${e.added_by ? `<div class="kv"><span>Added by</span><span>${esc(e.added_by)}</span></div>` : ""}
      <div class="act"><button class="btn sm ghost" onclick="editExpense('${e.id}')">✏️ Edit</button><button class="btn sm ghost danger-ic" onclick="delExpense('${e.id}')">🗑 Delete</button></div></div>`).join("")}
      <div class="rowcard" style="background:var(--n50)"><div class="r1"><b>Total (${rows.length})</b><span class="money">${money(total)}</span></div></div>
    </div>`;
}
async function saveExpense(btn) {
  $("exp-cat-err").textContent = ""; $("exp-amt-err").textContent = "";
  const cat = $("exp-cat").value;
  const amt = parseFloat($("exp-amt").value);
  if (!cat) { $("exp-cat-err").textContent = "Pick a category."; $("exp-cat").focus(); return; }
  if (!(amt > 0)) { $("exp-amt-err").textContent = "Enter an amount greater than 0."; $("exp-amt").focus(); return; }
  await busy(btn, async () => {
    await api("/admin/api/expenses", { method: "POST", body: { category: cat, amount: amt, spent_on: $("exp-date").value, description: $("exp-desc").value.trim() || null } });
    $("exp-cat").value = ""; $("exp-amt").value = ""; $("exp-desc").value = "";
    toast(`✓ ${money(amt)} expense saved`); loadExpenses();
  });
}
/* Owner ki apni categories — "Packaging", "Petrol", "Chai-paani". Staff
   panel aur AI agent bhi isi list se chunte hain. Built-in hatti nahi;
   apni hatane se purane kharche nahi mitte, sirf naye ki list se jaati hai. */
function manageExpCats() {
  const builtin = EXP_CATS.filter((c) => !EXP_CUSTOM.includes(c));
  openModal(`<h3>Expense categories</h3>
    <p class="muted">Your own categories show up here, in the staff panel and for the AI agent.</p>
    <div class="frm">
      <div class="setfield"><label for="ec-name">New category</label>
        <div style="display:flex;gap:8px">
          <input id="ec-name" placeholder="e.g. Packaging" maxlength="40" autocomplete="off" style="flex:1">
          <button class="btn" id="ec-add" onclick="addExpCat(this)">Add</button>
        </div>
        <small class="fielderr" id="ec-err"></small></div>
      <div class="setfield"><label>Your categories</label>
        <div id="ec-custom">${EXP_CUSTOM.length
          ? EXP_CUSTOM.map((c, i) => `<div class="sumrow"><span>${esc(c)}</span>
              <button class="btn sm ghost danger-ic" aria-label="Remove ${esc(c)}" onclick="delExpCat(${i})">✕</button></div>`).join("")
          : `<p class="muted">None yet.</p>`}</div></div>
      <div class="setfield"><label>Built-in</label>
        <p class="muted">${builtin.map(esc).join(" · ")}</p></div>
    </div>
    <div class="btnrow" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">Done</button></div>`);
  $("ec-name").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("ec-add").click(); } };
  $("ec-name").focus();
}
async function addExpCat(btn) {
  const name = $("ec-name").value.trim();
  $("ec-err").textContent = "";
  if (name.length < 2) { $("ec-err").textContent = "Type a name first."; $("ec-name").focus(); return; }
  await busy(btn, async () => {
    let r;
    try { r = await api("/admin/api/expense-categories", { method: "POST", body: { name } }); }
    catch (e) { $("ec-err").textContent = e.message; return; }
    EXP_CATS = r.all; EXP_CUSTOM = [...EXP_CUSTOM, r.name];
    paintExpCats(r.name);   // seedha nayi category chuni hui — form bharna jaari rahe
    toast(`"${r.name}" added`);
    manageExpCats();
  });
}
function delExpCat(i) {
  const name = EXP_CUSTOM[i];
  if (!name) return;
  confirmDialog(`Remove "${name}"? Old expenses keep this category; it just won't be offered for new ones.`, async () => {
    try {
      const r = await api(`/admin/api/expense-categories/${encodeURIComponent(name)}`, { method: "DELETE" });
      EXP_CATS = r.all; EXP_CUSTOM = EXP_CUSTOM.filter((c) => c !== name);
      paintExpCats(); toast(`"${name}" removed`); manageExpCats();
    } catch (e) { toast(e.message, true); }
  });
}
function editExpense(id) {
  const e = EXPENSES.find((x) => x.id === id);
  if (!e) return;
  const cats = [...new Set([...(EXP_CATS || []), e.category])];
  openModal(`<h3>Edit expense</h3>
    <div class="frm">
      <div class="setfield"><label>Date</label><input id="ee-date" type="date" value="${esc(e.spent_on)}" required></div>
      <div class="setfield"><label>Category</label><select id="ee-category">${cats.map((x) => `<option value="${esc(x)}" ${x===e.category?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
      <div class="setfield"><label>Amount (₹)</label><input inputmode="decimal" id="ee-amount" type="number" min="0.01" step="0.01" value="${esc(e.amount)}" required></div>
      <div class="setfield"><label>Description</label><textarea id="ee-description" rows="2" maxlength="300">${esc(e.description || "")}</textarea></div>
      <small class="fielderr" id="ee-err"></small>
    </div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="ee-save">Save changes</button></div>`);
  $("ee-save").onclick = (btn) => busy(btn.target || btn, async () => {
    const amount = Number($("ee-amount").value);
    if (!$("ee-date").value || !Number.isFinite(amount) || amount <= 0) { $("ee-err").textContent = "Date aur positive amount required hain."; return; }
    await api(`/admin/api/expenses/${encodeURIComponent(id)}`, { method: "PUT", body: {
      spent_on: $("ee-date").value, category: $("ee-category").value,
      amount, description: $("ee-description").value.trim() || null,
    }});
    closeModal(); toast("Expense updated and saved"); await loadExpenses();
  });
}
function delExpense(id) {
  const e = EXPENSES.find((x) => x.id === id);
  const label = e ? `${money(e.amount)} — ${e.category}` : "this expense";
  confirmDialog(`Delete ${label}? This cannot be undone.`, async () => {
    try { await api(`/admin/api/expenses/${id}`, { method: "DELETE" }); toast(T.deleted); loadExpenses(); }
    catch (e) { toast(e.message, true); }
  });
}
const PALETTE = ["#2f6bff", "#f59e0b", "#16a34a", "#d97706", "#7c3aed", "#0e7490", "#dc2626", "#78716c"];
/* money=true (Expenses/Reports): every legend value is a ₹ amount, and the
   donut shows the total in its middle. money=false keeps the old count look. */
function donutHtml(pairs, opts = {}) {
  const asMoney = opts.money !== false;
  const total = pairs.reduce((a, [, v]) => a + v, 0) || 1;
  let acc = 0;
  const stops = pairs.map(([, v], i) => {
    const from = (acc / total) * 360; acc += v;
    return `${PALETTE[i % PALETTE.length]} ${from}deg ${(acc / total) * 360}deg`;
  });
  const fmt = (v) => asMoney ? money(v) : (typeof v === "number" && v > 999 ? money(v) : v);
  const legend = pairs.map(([k, v], i) => {
    const pct = Math.round((v / total) * 100);
    return `<div><span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span>${esc(k)} — <b>${fmt(v)}</b>${asMoney ? ` <span class="muted">(${pct}%)</span>` : ""}</div>`;
  }).join("");
  const center = asMoney
    ? `<div class="donut-center"><span class="dc-lbl">Total</span><span class="dc-val">${money(total)}</span></div>`
    : "";
  return [`<div class="donut" style="background:conic-gradient(${stops.join(",")})">${center}</div>`, legend];
}
function renderExpChart() {
  const byCat = {};
  EXPENSES.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const pairs = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (!pairs.length) { $("exp-chart").innerHTML = emptyBox("No spending to chart yet.", "📊"); return; }
  const [donut, legend] = donutHtml(pairs, { money: true });
  $("exp-chart").innerHTML = `<div class="split2" style="align-items:center">${donut}<div class="legend">${legend}</div></div>`;
}

/* ============================= reports ============================= */
/* 📅 Monthly report — ek mahina chuno, saare ankde us mahine ke (IST), saath
   mein pichhle mahine se tulna. Server: /admin/api/reports/month. */
let REP_MONTH = isoDateLocal(new Date()).slice(0, 7);
let REP_MONTH_DATA = null;
// Received ka hissa: is period ke bill ka / purane bill ka (purana udhaar)
function recvSplit(d, label) {
  if (d.received_old === undefined || !(Number(d.received_old) > 0)) return "";
  return `<div class="mr-split">${esc(label)} ${money(d.received_new)} · older bills ${money(d.received_old)}</div>`;
}
function monthlyReportCard() {
  const d = REP_MONTH_DATA;
  if (!d) return "";
  const c = d.current, p = d.previous;
  // goodUp=false: badhna bura (kharcha) — laal
  const delta = (now, prev, goodUp = true) => {
    const a = Number(now || 0), b = Number(prev || 0);
    if (!b) return "";
    const pct = Math.round(((a - b) / Math.abs(b)) * 100);
    if (!pct) return ` · <span class="mr-flat">same</span>`;
    const good = (pct > 0) === goodUp;
    return ` · <span class="${good ? "mr-up" : "mr-down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
  };
  const tile = (lbl, val, sub, cls = "") =>
    `<div class="mr-tile ${cls}"><div class="mr-l">${lbl}</div><div class="mr-v">${val}</div><div class="mr-s">${sub}</div></div>`;
  const prevNum = (v, isMoney = true) => `${esc(p.short)} ${isMoney ? money(v) : Number(v || 0)}`;
  const profit = Number(c.profit || 0);
  return `<div class="card mr-card">
    <div class="mr-head"><b>📅 Monthly report</b>
      <div class="mr-nav">
        <button class="btn sm ghost" aria-label="Previous month" onclick="repShiftMonth(-1, this)">‹</button>
        <span class="mr-m">${esc(c.label)}</span>
        <button class="btn sm ghost" aria-label="Next month" onclick="repShiftMonth(1, this)" ${d.is_current_month ? "disabled" : ""}>›</button>
      </div></div>
    <div class="mr-grid">
      ${tile("Orders", Number(c.orders || 0), prevNum(p.orders, false) + delta(c.orders, p.orders))}
      ${tile("Billed", money(c.billed), prevNum(p.billed) + delta(c.billed, p.billed))}
      ${tile("Received", money(c.received), prevNum(p.received) + delta(c.received, p.received) + recvSplit(c, c.label.split(" ")[0] + " bills"))}
      ${tile("Expenses", money(c.expenses), prevNum(p.expenses) + delta(c.expenses, p.expenses, false))}
      ${tile("Profit", `<span style="color:${profit < 0 ? "var(--danger)" : "var(--ok)"}">${money(c.profit)}</span>`,
             prevNum(p.profit) + delta(c.profit, p.profit), profit < 0 ? "mr-loss" : "mr-profit")}
      ${tile("Still to collect", money(c.to_collect), `from ${esc(c.label.split(" ")[0])} bills`)}
    </div>
    <div class="mr-note">Received = money that came in this month (cash, UPI and online), even for older bills — so it can be more than Billed when old dues get paid. Profit = Received − Expenses. Dates are in IST.</div>
  </div>`;
}
async function repShiftMonth(step, btn) {
  const [y, m] = REP_MONTH.split("-").map(Number);
  const next = isoDateLocal(new Date(y, m - 1 + step, 1)).slice(0, 7);
  if (next > isoDateLocal(new Date()).slice(0, 7)) return;
  await busy(btn, async () => {
    const d = await api(`/admin/api/reports/month?month=${next}`);
    REP_MONTH = next; REP_MONTH_DATA = d;
    const box = document.querySelector("#rep-body .mr-card:not(#rr-card):not(#bs-card)");
    if (box) box.outerHTML = monthlyReportCard();
  });
}

/* 🗓 Kisi bhi do tareekh ka hisaab (19 Nov 2026): "1 se 19 tak kitne ka bill
   bana, kitna paisa aaya" — /admin/api/reports/range (services/shop_report.py) */
function rangeReportCard() {
  const today = isoDateLocal(new Date()), first = today.slice(0, 8) + "01";
  return `<div class="card mr-card" id="rr-card">
    <div class="mr-head"><b>🗓 Any dates</b>
      <div class="mr-nav" style="flex-wrap:wrap;gap:6px;align-items:center">
        <label class="muted" for="rr-from">From</label><input type="date" id="rr-from" value="${first}" max="${today}" style="width:auto">
        <label class="muted" for="rr-to">To</label><input type="date" id="rr-to" value="${today}" max="${today}" style="width:auto">
        <button class="btn sm" onclick="repRange(this)">Show</button>
      </div></div>
    <div id="rr-body" class="muted">…</div>
  </div>`;
}
async function repRange(btn) {
  const from = $("rr-from").value, to = $("rr-to").value, box = $("rr-body");
  if (!box) return;
  const run = async () => {
    let d;
    try { d = await api(`/admin/api/reports/range?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`); }
    catch (e) { box.innerHTML = `<span class="muted">${esc(e.message)}</span>`; return; }
    const m = d.received_by_method || {};
    const split = [["Cash", m.cash], ["UPI", m.upi], ["Card", m.card], ["Other", m.other]]
      .filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${money(v)}`).join(" · ") || "—";
    const tile = (lbl, val, sub) =>
      `<div class="mr-tile"><div class="mr-l">${lbl}</div><div class="mr-v">${val}</div><div class="mr-s">${sub}</div></div>`;
    const profit = Number(d.profit || 0);
    box.className = "";
    box.innerHTML = `<div class="mr-grid">
        ${tile("Bills made", d.bills, `${money(d.billed)} billed · avg ${money(d.avg_bill)}`)}
        ${tile("Billed", money(d.billed), d.discount ? `after ${money(d.discount)} discount` : "")}
        ${tile("Received", money(d.received), esc(split) + recvSplit(d, "These bills"))}
        ${tile("Still to collect", money(d.to_collect), "from these bills")}
        ${tile("Expenses", money(d.expenses), "")}
        ${tile("Profit", `<span style="color:${profit < 0 ? "var(--danger)" : "var(--ok)"}">${money(d.profit)}</span>`, "received − expenses")}
      </div>
      <div class="mr-note">${esc(fmtDate(d.from))} – ${esc(fmtDate(d.to))} (${d.days} day${d.days === 1 ? "" : "s"}, IST) · ${d.new_customers} new customer${d.new_customers === 1 ? "" : "s"}. Billed = bills made in these days; Received = money that came in these days, even for older bills (so it can be more than Billed).</div>`;
  };
  if (btn) await busy(btn, run); else await run();
}

/* 📊 Business summary (19 Nov 2026, owner: "Monthly report 2 kaudi ka, sidha
   rakho jaise baaki SaaS"). Ek hi card: upar period chuno (This month / Last
   month / 7 / 30 din / This year / Custom), 6 box, har box mein pichhle utne
   hi dino se tulna. Data /admin/api/reports/range se (dono period). Purane
   monthlyReportCard / rangeReportCard waise hi pade hain, ab dikhte nahi. */
let BS_PRESET = "this_month";
function bsIso(d) { return isoDateLocal(d); }
function bsRange(preset) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const day = (y, m, d) => new Date(y, m, d);
  const y = t.getFullYear(), m = t.getMonth();
  const shiftMonth = (a, b) => {           // same days, previous month (31 -> 30 clamp)
    const back = (d) => { const last = day(d.getFullYear(), d.getMonth(), 0).getDate();
      return day(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), last)); };
    return [back(a), back(b)];
  };
  const before = (a, b) => {                // equal length, just before
    const n = Math.round((b - a) / 864e5) + 1;
    return [day(a.getFullYear(), a.getMonth(), a.getDate() - n), day(a.getFullYear(), a.getMonth(), a.getDate() - 1)];
  };
  let a, b, p;
  if (preset === "last_month") { a = day(y, m - 1, 1); b = day(y, m, 0); p = [day(y, m - 2, 1), day(y, m - 1, 0)]; }
  else if (preset === "7" || preset === "30") { b = t; a = day(y, m, t.getDate() - Number(preset) + 1); p = before(a, b); }
  else if (preset === "this_year") { a = day(y, 0, 1); b = t; p = [day(y - 1, 0, 1), day(y - 1, m, t.getDate())]; }
  else if (preset === "custom") {
    a = new Date(($("bs-from") || {}).value + "T00:00"); b = new Date(($("bs-to") || {}).value + "T00:00");
    if (isNaN(a) || isNaN(b)) return null;
    p = before(a, b);
  } else { a = day(y, m, 1); b = t; p = shiftMonth(a, b); }
  return { a, b, pa: p[0], pb: p[1] };
}
function bsLabel(a, b) {
  const o = { day: "numeric", month: "short" };
  const sameY = a.getFullYear() === b.getFullYear();
  return `${a.toLocaleDateString("en-IN", sameY ? o : { ...o, year: "numeric" })} – ${b.toLocaleDateString("en-IN", { ...o, year: "numeric" })}`;
}
function bizSummaryCard() {
  const today = bsIso(new Date()), first = today.slice(0, 8) + "01";
  const opt = (v, l) => `<option value="${v}"${BS_PRESET === v ? " selected" : ""}>${l}</option>`;
  return `<div class="card mr-card bs-card" id="bs-card">
    <div class="mr-head"><div><b>📊 Business summary</b><div class="bs-range muted" id="bs-range"></div></div>
      <div class="bs-ctrl">
        <select id="bs-preset" aria-label="Period" onchange="BS_PRESET=this.value;$('bs-custom').hidden=this.value!=='custom';if(this.value!=='custom')bsLoad()">
          ${opt("this_month", "This month")}${opt("last_month", "Last month")}${opt("7", "Last 7 days")}${opt("30", "Last 30 days")}${opt("this_year", "This year")}${opt("custom", "Custom dates")}
        </select>
        <span id="bs-custom" class="bs-custom"${BS_PRESET === "custom" ? "" : " hidden"}>
          <input type="date" id="bs-from" value="${first}" max="${today}" aria-label="From">
          <span class="muted">to</span>
          <input type="date" id="bs-to" value="${today}" max="${today}" aria-label="To">
          <button class="btn sm" onclick="bsLoad(this)">Apply</button>
        </span>
      </div></div>
    <div id="bs-body">${skeleton(2)}</div>
  </div>`;
}
async function bsLoad(btn) {
  const box = $("bs-body");
  if (!box) return;
  const r = bsRange(BS_PRESET);
  if (!r) { toast("Pick both dates", true); return; }
  const q = (a, b) => `/admin/api/reports/range?date_from=${bsIso(a)}&date_to=${bsIso(b)}`;
  const run = async () => {
    let c, p;
    try { [c, p] = await Promise.all([api(q(r.a, r.b)), api(q(r.pa, r.pb)).catch(() => null)]); }
    catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    $("bs-range").textContent = `${bsLabel(r.a, r.b)} · compared with ${bsLabel(r.pa, r.pb)}`;
    const delta = (now, prev, goodUp = true) => {
      if (!p) return "";
      const x = Number(now || 0), y = Number(prev || 0);
      if (!y) return x ? `<span class="muted">new</span>` : `<span class="muted">—</span>`;
      const pct = Math.round(((x - y) / Math.abs(y)) * 100);
      if (!pct) return `<span class="mr-flat">same</span>`;
      return `<span class="${(pct > 0) === goodUp ? "mr-up" : "mr-down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
    };
    const tile = (lbl, val, now, prev, isMoney = true, goodUp = true, extra = "", cls = "") =>
      `<div class="mr-tile ${cls}"><div class="mr-l">${lbl}</div><div class="mr-v">${val}</div>
        <div class="mr-s">${delta(now, prev, goodUp)}${p ? ` <span class="muted">vs ${isMoney ? money(prev) : Number(prev || 0)}</span>` : ""}</div>${extra}</div>`;
    const P = p || {};
    const profit = Number(c.profit || 0);
    const older = Number(c.received_old || 0) > 0
      ? `<div class="mr-split">${money(c.received_new)} from these bills · ${money(c.received_old)} old dues</div>` : "";
    box.innerHTML = `<div class="mr-grid">
        ${tile("Orders", Number(c.bills || 0), c.bills, P.bills, false)}
        ${tile("Billed", money(c.billed), c.billed, P.billed)}
        ${tile("Received", money(c.received), c.received, P.received, true, true, older)}
        ${tile("Expenses", money(c.expenses), c.expenses, P.expenses, true, false)}
        ${tile("Profit", `<span style="color:${profit < 0 ? "var(--danger)" : "var(--ok)"}">${money(c.profit)}</span>`,
               c.profit, P.profit, true, true, "", profit < 0 ? "mr-loss" : "mr-profit")}
        ${tile("Still to collect", money(c.to_collect), c.to_collect, P.to_collect, true, false)}
      </div>
      <div class="mr-note">Received = money that came in during these days, for any bill. Profit = Received − Expenses.</div>`;
  };
  btn ? await busy(btn, run) : await run();
}
async function loadReports() {
  $("rep-body").innerHTML = skeleton(5);
  try {
    const [sum, dash, mg] = await Promise.all([api("/admin/api/reports/summary"), api("/admin/api/dashboard"),
      api("/admin/api/reports/margin?months=6").catch(() => null)]);
    SUMMARY = sum; DASH = dash; MARGIN = mg;
    if (!CUSTOMERS_CACHE) await loadCustomers(true);
  } catch (e) { $("rep-body").innerHTML = errBox(e.message, "loadReports"); return; }
  const periods = [["Today", SUMMARY.today], ["This week", SUMMARY.week], ["This month", SUMMARY.month]];
  const maxV = Math.max(1, ...periods.flatMap(([, p]) => [Number(p.revenue || 0), Number(p.expenses || 0), Math.abs(Number(p.profit || 0))]));
  const bars = periods.map(([lbl, p]) => `
    <div class="bargrp">
      <div style="display:flex;gap:4px;align-items:flex-end;height:110px;width:100%;justify-content:center">
        <div class="bar rev" style="height:${(Number(p.revenue || 0) / maxV) * 100}%" title="Revenue ${money(p.revenue)}"></div>
        <div class="bar exp" style="height:${(Number(p.expenses || 0) / maxV) * 100}%" title="Expenses ${money(p.expenses)}"></div>
        <div class="bar pft" style="height:${(Math.max(0, Number(p.profit || 0)) / maxV) * 100}%" title="Profit ${money(p.profit)}"></div>
      </div>
      <div class="muted">${lbl}</div>
      <div style="font-size:11px" class="muted">R ${money(p.revenue)} · E ${money(p.expenses)} · P ${money(p.profit)}</div>
    </div>`).join("");
  const statusPairs = Object.entries(DASH.counts.by_status || {}).map(([k, v]) => [statusName(k) || k, v]);
  const [sd, sl] = statusPairs.length ? donutHtml(statusPairs, { money: false }) : ["", ""];
  const top = (CUSTOMERS_CACHE || []).slice().sort((a, b) => Number(b.business) - Number(a.business)).slice(0, 8);
  setTimeout(() => bsLoad(), 0);     // card ban jaane ke baad: is mahine ki 1 se aaj tak
  $("rep-body").innerHTML = bizSummaryCard() + `
    <div class="card" style="margin-top:14px"><b>Revenue vs expenses vs profit</b>
      <div class="muted" style="margin-bottom:6px">Revenue = money received in the period, for any bill · IST</div>
      <div class="bars">${bars}</div>
      <div class="legend" style="flex-direction:row;gap:16px;margin-top:8px">
        <div><span class="sw" style="background:var(--brand)"></span>Revenue</div>
        <div><span class="sw" style="background:var(--n300)"></span>Expenses</div>
        <div><span class="sw" style="background:var(--ok)"></span>Profit</div></div></div>
    <div class="split2" style="margin-top:14px">
      <div class="card"><b>Active orders by status</b><div class="split2" style="align-items:center;margin-top:8px">${sd}<div class="legend">${sl}</div></div></div>
      <div class="card"><b>Top customers by business</b>
        ${top.map((c) => `<div class="sumrow"><span>${esc(displayName(c.name, c.phone))}</span><span class="money">${money(c.business)}</span></div>`).join("") || emptyBox(T.noData)}
      </div></div>
    ${marginCards()}
    <div class="btnrow" style="margin-top:12px;justify-content:flex-start">
      <button class="btn ghost" onclick="dlServer('/admin/api/export/orders.csv','orders.csv')">⬇ Orders CSV</button>
      <button class="btn ghost" onclick="dlServer('/admin/api/export/customers.csv','customers.csv')">⬇ Customers CSV</button>
    </div>`;
}
/* 📊 Margin — mahine dar mahine aur service-wise (services/garment_cost.py).
   Cost = kharcha ÷ effort units; Settings → Pricing → Cost per garment wala hi hisaab. */
let MARGIN = null;
function marginCards() {
  const m = MARGIN; if (!m) return "";
  const pct = (v) => v == null ? "—" : `${v.toFixed(0)}%`;
  const cls = (v) => v == null ? "" : v < 15 ? "cst-bad" : v < 35 ? "cst-mid" : "cst-ok";
  const months = m.months.filter((x) => x.orders || x.expenses);
  const mrows = months.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.orders}</td><td class="money">${money(x.billed)}</td>
    <td class="money">${money(x.expenses)}</td><td>${x.unit_cost == null ? "—" : money(x.unit_cost)}</td><td class="${cls(x.margin_pct)}">${pct(x.margin_pct)}</td></tr>`).join("");
  const srows = m.services.map((x) => `<tr><td>${esc(x.service)}</td><td>${x.qty}</td><td class="money">${money(x.revenue)}</td>
    <td class="money">${x.cost == null ? "—" : money(x.cost)}</td><td class="${cls(x.margin_pct)}">${pct(x.margin_pct)}</td></tr>`).join("");
  const thin = m.thin_margin.map((x) => `<div class="sumrow"><span>${esc(x.garment || (x.unit === "kg" ? "per kg" : ""))} <small class="muted">${esc(x.service)}${x.sold_qty ? ` · sold ${x.sold_qty}` : ""}</small></span>
    <span><span class="money">${money(x.rate)}</span> <small class="muted">cost ${money(x.cost)}</small> <b class="${cls(x.margin_pct)}">${pct(x.margin_pct)}</b></span></div>`).join("");
  return `
    <div class="card" style="margin-top:14px"><b>📊 Margin by month</b>
      <div class="muted" style="margin-bottom:6px">Billed = bills made in the month (not payments). Margin = (billed − expenses) ÷ billed. Cost per unit = expenses ÷ effort units of everything billed.</div>
      ${mrows ? `<div style="overflow-x:auto"><table class="tbl keep"><thead><tr><th>Month</th><th>Bills</th><th>Billed</th><th>Expenses</th><th>Cost / unit</th><th>Margin</th></tr></thead><tbody>${mrows}</tbody></table></div>` : emptyBox(T.noData)}
    </div>
    <div class="split2" style="margin-top:14px">
      <div class="card"><b>By service</b> <small class="muted">${esc(m.period.from)} → ${esc(m.period.to)}</small>
        ${srows ? `<div style="overflow-x:auto;margin-top:8px"><table class="tbl keep"><thead><tr><th>Service</th><th>Qty</th><th>Revenue</th><th>Cost</th><th>Margin</th></tr></thead><tbody>${srows}</tbody></table></div>` : emptyBox(T.noData)}
      </div>
      <div class="card"><b>Thin or negative margin</b> <small class="muted">rate card, under 15%</small>
        <div style="margin-top:8px">${thin || `<p class="muted">${m.services.length ? "Nothing under 15% — or costs not applied yet (Settings → Pricing)." : T.noData}</p>`}</div>
      </div>
    </div>`;
}
async function dlServer(path, name) {
  const r = await fetch(path);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
}

/* ============================= campaign control center ============================= */
let CAMPAIGN_SELECTED_CUSTOMERS = [];
// Fallback until /campaigns/variables answers; the server list is the source.
let CAMPAIGN_VARIABLES = [
  {key:"name",label:"Customer name",sample:"Aarav"},{key:"phone",label:"Mobile number",sample:"98XXXXXX10"},
  {key:"address",label:"Address",sample:"B-12, Sigra, Varanasi"},{key:"due_amount",label:"Due amount (₹)",sample:"620.00"},
  {key:"total_orders",label:"Total orders",sample:"7"},{key:"last_order_no",label:"Last order number",sample:"KK-1042"},
  {key:"last_order_amount",label:"Last order amount (₹)",sample:"450.00"},{key:"last_order_date",label:"Last order date",sample:"12 Oct 2026"},
  {key:"shop_name",label:"Shop name",sample:"Kwik Klin"},
];
let CAMPAIGN_VARIABLES_LOADED = false;
let CAMPAIGN_CUSTOMER_CACHE = {};
let CAMPAIGN_SEARCH_TIMER = null;
let CAMPAIGN_PICKER_ROWS = [];
let CAMPAIGN_POLL_TIMER = null;

function setCampaignNote(text, state = "warn") {
  const note = $("camp-send-validation");
  if (!note) return;
  note.textContent = text || "";
  note.dataset.state = state;
}
const campaignRemote = () => CampaignShared.adapters.tenant(api);
function campaignStatusClass(status, stats) { return CampaignShared.statusInfo(status, stats).tone; }
function campaignStatusLabel(status, stats) { return CampaignShared.statusInfo(status, stats).label; }
// Har jagah wahi ginti: "queued || sent" poora hote hi 36 ko 6 dikhata tha
function campaignRecipientTotal(s) { return ["queued","sent","delivered","read","replied","failed","skipped","uncertain","holdout"].reduce((n,k)=>n+Number(s[k]||0),0); }
function campaignPauseNote(c) {
  if (c.status !== "paused") return "";
  const when = c.resume_at ? " Tries again " + fmtWhen(c.resume_at) + "." : "";
  return '<p class="cs-pause" role="status">' + esc(CampaignShared.pauseReason(c.pause_reason)) + "." + esc(when) + "</p>";
}
function campaignIssueNote(s) {
  const uncertain = Number(s.uncertain || 0), failed = Number(s.failed || 0);
  if (!uncertain && !failed) return "";
  return '<p class="cs-pause cs-issue">' + (failed ? failed + " not sent. " : "") + (uncertain ? uncertain + " uncertain: WhatsApp did not confirm, so these are not sent again." : "") + "</p>";
}
function campaignLiveActions(c) {
  return (["approved","sending"].includes(c.status) ? '<button onclick="pauseCampaign(\'' + c.id + '\')">Pause</button>' : "") +
    (c.status === "paused" ? '<button onclick="resumeCampaign(\'' + c.id + '\')">Resume</button>' : "");
}
function campaignKpi(icon, value, label, tone, action) {
  return '<button type="button" class="camp-kpi camp-kpi-' + tone + '"' + (action ? ' onclick="' + action + '"' : '') +
    '><span class="camp-kpi-icon">' + icon + '</span><strong>' + esc(String(value ?? 0)) +
    '</strong><small>' + esc(label) + '</small></button>';
}
function renderCampaignOverview(d) {
  const k = $("camp-kpis");
  if (k) k.innerHTML = [
    campaignKpi("📣", d.total_campaigns, "Total Campaigns", "blue"),
    campaignKpi("✓", d.messages_sent, "Messages Sent", "orange"),
    campaignKpi("✓✓", d.messages_delivered, "Messages Delivered", "green"),
    campaignKpi("!", d.messages_failed, "Messages Failed", "red", "openFailedCampaignMessages()"),
    campaignKpi("⏭", d.messages_skipped, "Messages Skipped", "gray"),
    campaignKpi("?", d.messages_uncertain, "Uncertain", "orange"),
    campaignKpi("↩", d.replies_received, "Replies Received", "purple"),
    campaignKpi("▶", d.currently_sending, "Currently Sending", "orange", "document.getElementById('camp-running')?.scrollIntoView({behavior:'smooth',block:'center'})"),
    campaignKpi("％", d.delivery_rate + "%", "Delivery Rate", "green")
  ].join("");
  const s = d.campaign_status || {};
  const status = $("camp-status-grid");
  if (status) status.innerHTML =
    '<div><span>Running</span><b>' + (s.running || 0) + '</b></div>' +
    '<div><span>Paused</span><b>' + (s.paused || 0) + '</b></div>' +
    '<div><span>Completed</span><b>' + (s.completed || 0) + '</b></div>' +
    '<div><span>Failed</span><b>' + (s.failed || 0) + '</b></div>' +
    '<div><span>Cancelled</span><b>' + (s.cancelled || 0) + '</b></div>';
  const run = $("camp-running");
  if (!run) return;
  const rows = d.running_campaigns || [];
  run.innerHTML = rows.length ? '<div class="camp-running-title">Currently running</div>' + rows.map((x) =>
    '<div class="camp-running-row">' +
      '<div class="camp-running-main"><div><b>' + esc(x.name) + '</b><span class="camp-badge ' + campaignStatusClass(x.status) + '">' + esc(campaignStatusLabel(x.status)) + '</span></div>' +
      '<small>' + x.processed + ' / ' + x.total + ' processed · Sent ' + x.sent + ' · Waiting ' + (x.queued || 0) + ' · Failed ' + x.failed + ' · Skipped ' + x.skipped + ' · Uncertain ' + (x.uncertain || 0) + ' · Replies ' + x.replies + '</small>' + campaignPauseNote(x) + '</div>' +
      '<div class="camp-progress"><span style="width:' + Math.min(100, Number(x.progress) || 0) + '%"></span></div>' +
      '<div class="camp-running-foot"><span>' + (Number(x.progress) || 0) + '%</span><span class="cs-actions">' + (x.status === "paused" ? '<button class="btn sm" onclick="resumeCampaign(\'' + x.id + '\')">Resume</button>' : '<button class="btn ghost sm" onclick="pauseCampaign(\'' + x.id + '\')">Pause</button>') + '<button class="btn ghost sm" onclick="openCampaignDetail(\'' + x.id + '\')">View details</button></span></div>' +
    '</div>'
  ).join("") : '<div class="camp-running-empty">No campaign is currently sending.</div>';
}
async function loadCampaigns() {
  if (!$("sec-campaigns")?.dataset.tab) { campTabRestore(); restoreCampaignDraft(); }
  clearTimeout(CAMPAIGN_POLL_TIMER);
  if ($("camp-list") && !$("camp-list").querySelector(".camp-history-item")) $("camp-list").innerHTML = '<div class="camp-skeleton" aria-hidden="true"></div><div class="camp-skeleton" aria-hidden="true"></div>';
  $("seg-cards").innerHTML = "";
  try {
    const [overview, segs, camps] = await Promise.all([
      api("/admin/api/campaigns/overview"),
      api("/admin/api/segments"),
      api("/admin/api/campaigns")
    ]);
    renderCampaignOverview(overview);
    renderSegments(segs);
    renderCampaigns(camps);
    loadCampaignVariables();
    loadManualLeads();
    selectCampaignAudience($("camp-seg")?.value || "all_active", false);
    updateCampaignPreview();
    // Keep polling briefly after send completion too: WhatsApp delivery/read
    // acknowledgements often arrive after the campaign worker marks "sent".
    const nowMs = Date.now();
    const awaitingReceipts = camps.some((c) => {
      if (c.status !== "sent" || !c.sent_at) return false;
      const sentAt = Date.parse(c.sent_at);
      return Number.isFinite(sentAt) && nowMs - sentAt < 5 * 60 * 1000;
    });
    if ((overview.running_campaigns || []).length || awaitingReceipts) {
      CAMPAIGN_POLL_TIMER = setTimeout(loadCampaigns, 10000);
    }
  } catch (e) {
    if ($("camp-kpis")) $("camp-kpis").innerHTML = errBox(e.message, "loadCampaigns");
    if ($("camp-list")) $("camp-list").innerHTML = errBox(e.message, "loadCampaigns");
  }
}
function applyLeadTemplate(k){const name=($("manual-lead-name")?.value||"Customer").trim(),service=($("manual-lead-need")?.value||"laundry service").trim(),t={welcome:"Namaste {name} ji, aapki call ke follow-up mein Kwik Klin se message kar raha hoon. Aapko {service} mein kis cheez ki help chahiye?",offer:"Namaste {name} ji! Kwik Klin par {service} ke liye hum aapki help kar sakte hain. Details ke liye reply karein.",payment:"Namaste {name} ji, Kwik Klin se payment update ke liye message kar rahe hain."};if($("manual-lead-message"))$("manual-lead-message").value=(t[k]||"").replace(/\{name\}/g,name).replace(/\{service\}/g,service);updateLeadMessagePreview();}
function updateLeadContext(){const name=($("manual-lead-name")?.value||"").trim(),phone=($("manual-lead-phone")?.value||"").trim(),service=($("manual-lead-need")?.value||"").trim(),root=$("manual-lead-context-summary");if(root)root.textContent=(name||"Lead name not entered")+" · "+(phone||"WhatsApp number not entered")+" · "+(service||"Service not specified");updateLeadMessagePreview();}
function updateLeadMessagePreview(){const raw=$("manual-lead-message")?.value||"",name=($("manual-lead-name")?.value||"").trim(),service=($("manual-lead-need")?.value||"").trim(),v=raw.replace(/\{name\}/g,name||"").replace(/\{business_name\}/g,"Kwik Klin").replace(/\{service\}/g,service||"").replace(/\{due_amount\}/g,"").replace(/\{last_order_date\}/g,""),c=$("manual-lead-message-count");if(c)c.textContent=raw.length+"/1200";const p=$("manual-lead-message-preview");if(p)p.textContent=v.trim()||"Your reviewed WhatsApp message will appear here.";}
function wrapLeadSelection(a,b){const x=$("manual-lead-message");if(!x)return;const s=x.selectionStart,e=x.selectionEnd,t=x.value.slice(s,e);x.setRangeText(a+t+b,s,e,"select");x.focus();updateLeadMessagePreview();}
function insertLeadEmoji(){const e=prompt("Choose emoji: 😊 🎉 🌸 ✨ ❤️ 🙏 👕 🧺");if(!e)return;const x=$("manual-lead-message");if(!x)return;const s=x.selectionStart||x.value.length;x.setRangeText(e,s,x.selectionEnd||s,"end");x.focus();updateLeadMessagePreview();}
function draftManualLeadMessage() {
  const name = ($("manual-lead-name")?.value || "").trim();
  const need = ($("manual-lead-need")?.value || "").trim();
  if (!name || !need) {
    toast("Enter the customer name and interested service first.");
    return;
  }
  const message = "Namaste " + name + " ji, aapki call ke follow-up mein Kwik Klin se message kar raha hoon. Aapne " + need + " mein interest dikhaya tha. Aapko pricing, pickup timing ya service details mein kis cheez ki help chahiye? — Kwik Klin";
  $("manual-lead-message").value = message;
  $("manual-lead-message").focus();
  updateLeadMessagePreview();
}
async function submitManualLead(sendWhatsApp) {
  const name = ($("manual-lead-name")?.value || "").trim();
  const phone = ($("manual-lead-phone")?.value || "").trim();
  const need = ($("manual-lead-need")?.value || "").trim();
  const notes = ($("manual-lead-notes")?.value || "").trim();
  const consent = Boolean($("manual-lead-consent")?.checked);
  let message = ($("manual-lead-message")?.value || "").trim();
  const status = $("manual-lead-status");
  if (!name || !phone || !need) {
    if (status) status.textContent = "Name, WhatsApp number and interested service are required.";
    return;
  }
  if (sendWhatsApp && !consent) {
    if (status) status.textContent = "WhatsApp follow-up bhejne se pehle customer ki permission confirm karo.";
    return;
  }
  if (sendWhatsApp && !message) {
    draftManualLeadMessage();
    message = ($("manual-lead-message")?.value || "").trim();
  }
  if (sendWhatsApp && !message) return;
  if (sendWhatsApp && !confirm("Send this reviewed WhatsApp message to " + phone + "?")) return;
  const buttons = Array.from(document.querySelectorAll("#manual-lead-handoff button"));
  buttons.forEach((b) => { if (b.dataset.busy !== "true") { b.dataset.wasDisabled = b.disabled ? "1" : "0"; b.disabled = true; } });
  if (status) status.textContent = sendWhatsApp ? "Saving lead and sending WhatsApp…" : "Saving lead…";
  try {
    const result = await api("/admin/api/leads/manual", {
      method: "POST",
      body: {
        name, phone, need, call_notes: notes || null,
        whatsapp_consent_confirmed: consent,
        send_whatsapp: Boolean(sendWhatsApp),
        message: sendWhatsApp ? message : null,
      },
    });
    if (status) status.textContent = result.message || (result.whatsapp_status === "sent" ? "WhatsApp sent." : "Lead saved.");
    if (result.whatsapp_status === "sent" || !sendWhatsApp) {
      ["manual-lead-name", "manual-lead-phone", "manual-lead-need", "manual-lead-notes", "manual-lead-message"].forEach((id) => { if ($(id)) $(id).value = ""; });
      if ($("manual-lead-consent")) $("manual-lead-consent").checked = false;
    }
    await loadManualLeads();
  } catch (e) {
    if (status) status.textContent = e.message || "Could not save the lead.";
  } finally {
    buttons.forEach((b) => { b.disabled = b.dataset.wasDisabled === "1"; delete b.dataset.wasDisabled; });
  }
}
async function loadManualLeads() {
  const root = $("manual-lead-list");
  if (!root) return;
  try {
    const leads = await api("/admin/api/leads?limit=20");
    root.innerHTML = leads.length ? '<div style="display:grid;gap:8px">' + leads.map((lead) => {
      const next = lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleString("en-IN") : "Not scheduled";
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px">' +
        '<div style="min-width:0"><b>' + esc(lead.name || lead.phone) + '</b><div style="font-size:12px;color:var(--muted)">' + esc(lead.phone) + ' · ' + esc(lead.need || "Service not specified") + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:4px">Next follow-up: ' + esc(next) + '</div></div>' +
        '<div style="text-align:right"><span class="camp-badge ' + (lead.stage === "CONTACTED" || lead.stage === "INTERESTED" ? "completed" : "draft") + '">' + esc(lead.stage) + '</span><div style="font-size:10px;color:var(--muted);margin-top:5px">' + esc(lead.source || "lead") + '</div></div></div>';
    }).join("") + "</div>" : '<p style="font-size:12px;color:var(--muted)">No leads yet. Add a phone-call lead above.</p>';
  } catch (e) {
    root.innerHTML = '<p style="font-size:12px;color:var(--muted)">Lead list could not load: ' + esc(e.message) + '</p>';
  }
}

function renderSegments(segs) {
  const sel = $("camp-seg");
  if (sel) {
    // The 10-second refresh while a campaign sends used to rebuild this list
    // and drop the owner's choice back to "All" — a "Selected customers"
    // campaign then went to everyone. Keep whatever was chosen.
    const current = sel.value;
    const keys = ["all_active","active_regular","lapsed","normal_late","high_value","outstanding_dues","active_orders"];
    sel.innerHTML = keys.filter((k) => segs.counts[k] != null)
      .map((k) => '<option value="' + k + '">' + esc(SEGMENT_LABEL[k] || k) + '</option>').join("") + '<option value="selected">Selected customers</option>';
    if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
  }
  window.CAMPAIGN_SEG_COUNTS = segs.counts || {};
  updateCampaignAudienceCount();
}
function renderCampaigns(camps) {
  if (!camps.length) {
    $("camp-list").innerHTML = emptyBox("No campaigns yet — your first one takes about two minutes.", "📣")
      + `<div style="text-align:center;margin:14px 0 4px"><button class="btn" onclick="resetCampaignForm()">＋ New campaign</button></div>`;
    return;
  }
  $("camp-list").innerHTML = camps.map((c) => {
    const s = c.stats || {};
    const cls = campaignStatusClass(c.status, s);
    const img = c.creative_file ? '<img class="camp-history-img" src="/admin/media/' + encodeURIComponent(c.creative_file) + '" alt="Campaign creative" loading="lazy" decoding="async" onerror="this.remove()">' : "";
    const actions =
      '<details class="camp-actions"><summary aria-label="Campaign actions">⋮</summary><div>' +
      '<button onclick="openCampaignDetail(\'' + c.id + '\')">View details</button>' +
      campaignLiveActions(c) +
      '<button onclick="duplicateCampaign(\'' + c.id + '\')">Duplicate</button>' +
      (["approved","sending","scheduled","paused"].includes(c.status) ? '<button onclick="cancelCampaign(\'' + c.id + '\')">Cancel campaign</button>' : "") +
      (["approved","sending","scheduled","paused"].includes(c.status) ? "" : '<button class="danger" onclick="deleteCampaign(\'' + c.id + '\')">Delete campaign</button>') +
      '</div></details>';
    return '<article class="camp-history-item" data-campaign-status="'+esc(c.status)+'" data-campaign-name="'+esc((c.name||"").toLowerCase())+'">' +
      '<div class="camp-history-item-top"><div class="camp-history-name"><b>' + esc(c.name) + '</b><div class="muted">' +
        esc(c.campaign_type||"promotion")+' · '+esc(SEGMENT_LABEL[c.segment] || c.segment) + ' · ' + new Date(c.created_at).toLocaleString() + '</div></div>' +
        '<div class="camp-history-actions"><span class="camp-badge ' + cls + '">' + esc(campaignStatusLabel(c.status, s)) + '</span>' + actions + '</div></div>' +
      img +
      '<div class="camp-history-msg">' + esc(c.message_text) + '</div>' +
      (c.frequency_bypassed?'<span class="camp-badge draft">Frequency limit bypassed</span>':'') +
      (c.complaints_bypassed?'<span class="camp-badge draft">Complaint suppression bypassed</span>':'') +
      (c.scheduled_at?'<div class="camp-history-audience">Scheduled: <b>'+esc(fmtDate(c.scheduled_at))+'</b></div>':'') +
      '<div class="camp-history-meta">' +
        '<span>Recipients <b>' + campaignRecipientTotal(s) + '</b></span>' +
        '<span>Waiting <b>' + (s.queued || 0) + '</b></span>' +
        '<span>Sent <b>' + ((s.sent || 0) + (s.delivered || 0) + (s.read || 0) + (s.replied || 0)) + '</b></span><span>Delivered <b>' + ((s.delivered || 0) + (s.read || 0) + (s.replied || 0)) + '</b></span>' +
        '<span>Failed <b>' + (s.failed || 0) + '</b></span><span>Replies <b>' + (s.replied || 0) + '</b></span>' +
        '<span>Skipped <b>' + (s.skipped || 0) + '</b></span>' + (s.uncertain ? '<span>Uncertain <b>' + s.uncertain + '</b></span>' : '') + '</div>' +
      campaignPauseNote(c) + campaignIssueNote(s) +
      (c.segment === "selected" ? '<div class="camp-history-audience">Selected customers: <b>' + (c.selected_customer_count || 0) + '</b></div>' : '') +
      (["draft","suggested"].includes(c.status) ? '<div class="act"><button class="btn sm" onclick="approveCampaign(\'' + c.id + '\')">Start sending</button><button class="btn sm ghost" onclick="cancelCampaign(\'' + c.id + '\')">Cancel</button></div>' : '') +
      '</article>';
  }).join("");
}
const CAMPAIGN_MESSAGE_TEMPLATES={festival:"Namaste {name} ji! 🌸 Aapko aur aapke parivaar ko hardik shubhkamnayein. — Kwik Klin",offer:"Namaste {name} ji! ✨ Kwik Klin ke saath apne kapdon ko fresh rakhein.",payment:"Namaste {name} ji, aapke account mein ₹{due_amount} payment pending hai. — Kwik Klin",pickup:"Namaste {name} ji! 👕 Aapka Kwik Klin pickup schedule hai.",referral:"Namaste {name} ji! ❤️ Kwik Klin ko apne doston ke saath share karein."};
async function generateCampaignDraft(btn) {
  const status = $("camp-ai-status");
  const type = selectedCampaignType();
  const currentSegment = $("camp-seg")?.value || "all_active";
  const segment = type === "payment_reminder" ? "outstanding_dues"
    : (type === "wish" ? "all_active" : (currentSegment === "selected" ? "all_active" : currentSegment));
  if (status) status.textContent = "Generating a draft… no messages will be sent.";
  try {
    await busy(btn, async () => {
      const draft = await api("/admin/api/campaigns/ai-draft", {
        method: "POST",
        body: { segment, goal: ($("camp-ai-goal")?.value || "increase repeat orders").trim().slice(0, 120) }
      });
      if ($("camp-name")) $("camp-name").value = draft.campaign_name || "Kwik Klin campaign";
      if ($("camp-msg")) $("camp-msg").value = draft.message || "";
      window.CAMPAIGN_CUSTOM_IMAGE = draft.creative_file || null;
      if (draft.creative_file) {
        const url = "/admin/media/" + encodeURIComponent(draft.creative_file);
        if ($("camp-image-preview")) $("camp-image-preview").innerHTML =
          '<div class="camp-image-card"><img src="' + url + '" alt="AI campaign poster preview"><button type="button" class="btn ghost sm" onclick="removeCampaignImage()">Remove image</button></div>';
        if ($("camp-preview-image")) $("camp-preview-image").innerHTML =
          '<img src="' + url + '" alt="AI campaign poster">';
      } else {
        if ($("camp-image-preview")) $("camp-image-preview").innerHTML = "";
        if ($("camp-preview-image")) $("camp-preview-image").innerHTML = "";
      }
      const gmb = $("camp-ai-gmb-preview");
      if (gmb) gmb.hidden = false;
      if ($("camp-ai-gmb-title")) $("camp-ai-gmb-title").textContent = draft.gmb_title || "";
      if ($("camp-ai-gmb-body")) $("camp-ai-gmb-body").textContent = draft.gmb_body || "";
      if ($("camp-ai-gmb-cta")) $("camp-ai-gmb-cta").textContent = draft.gmb_cta || "Learn more";
      if ($("camp-ai-offer")) $("camp-ai-offer").textContent =
        (draft.offer_type || "no_discount") + " · " + Number(draft.discount_value || 0) +
        (draft.offer_type === "percent" ? "% off" : "") + " · minimum order ₹" +
        Number(draft.min_order || 0) + " · " + Number(draft.validity_days || 7) + " day(s) · code " +
        (draft.coupon_code || "not set") + " (suggestion only; verify before use)";
      if ($("camp-ai-rationale")) $("camp-ai-rationale").textContent = draft.rationale || "";
      updateCampaignMsgCount();
      updateCampaignPreview();
      if (status) status.textContent = "Draft ready. Review the WhatsApp copy, poster and Google text, then preview recipients. Nothing has been sent.";
      toast("AI draft ready for review.");
    });
  } catch (e) {
    if (status) status.textContent = "AI draft failed: " + (e.message || "Please retry.");
  }
}
function selectedCampaignType(){return document.querySelector('input[name="camp-type"]:checked')?.value||"promotion";}
function campaignTypeChanged(){const t=selectedCampaignType();document.querySelectorAll(".camp-type-card").forEach(e=>e.classList.toggle("selected",Boolean(e.querySelector("input")?.checked)));if($("camp-rule-frequency"))$("camp-rule-frequency").checked=t!=="wish";if($("camp-rule-complaints"))$("camp-rule-complaints").checked=true;const h=$("camp-type-help");if(h)h.textContent=t==="wish"?"Greeting goes to all active customers (or only the customers you select) and bypasses frequency limits; opt-outs and blocked numbers remain excluded.":t==="payment_reminder"?"Payment reminders go to customers with outstanding dues (or only the customers you select); anyone with no dues is skipped.":"Promotion follows the selected audience and rules.";const l=$("camp-audience-lock-note");if(l){l.hidden=t==="promotion";l.textContent=t==="wish"?"Greeting uses all active customers — or choose Selected Customers or Customers with active orders.":"Payment reminders go to customers with dues — or choose Selected Customers or Customers with active orders; those with no dues are skipped."}selectCampaignAudience($("camp-seg")?.value||"all_active",false);updateCampaignPreview();}
function applyCampaignTemplate(k){let m=CAMPAIGN_MESSAGE_TEMPLATES[k];if(k?.startsWith("saved:")){try{m=JSON.parse(localStorage.getItem("kwikklin_campaign_templates_v1")||"[]")[Number(k.slice(6))]?.message}catch(_){}}if(!m)return;if($("camp-msg"))$("camp-msg").value=m;updateCampaignMsgCount();updateCampaignPreview();}
function saveCampaignTemplate(){const m=$("camp-msg")?.value||"";if(!m.trim()){setCampaignNote("Write a message before saving a template.","warn");return;}const n=prompt("Template name");if(!n?.trim())return;let a=[];try{a=JSON.parse(localStorage.getItem("kwikklin_campaign_templates_v1")||"[]")}catch(_){}a.push({name:n.trim().slice(0,80),message:m.slice(0,4000)});a=a.slice(-30);localStorage.setItem("kwikklin_campaign_templates_v1",JSON.stringify(a));const s=$("camp-template");if(s){const o=document.createElement("option");o.value="saved:"+(a.length-1);o.textContent=n.trim();s.appendChild(o);s.value=o.value;}}
function wrapCampaignSelection(a,b){const x=$("camp-msg");if(!x)return;const s=x.selectionStart,e=x.selectionEnd,t=x.value.slice(s,e);x.setRangeText(a+t+b,s,e,"select");x.focus();updateCampaignMsgCount();updateCampaignPreview();}
function renderCampaignVariableOptions(){const s=$("camp-var");if(!s)return;s.innerHTML='<option value="">＋ Insert variable…</option>'+CAMPAIGN_VARIABLES.map(v=>'<option value="'+esc(v.key)+'">'+esc(v.label)+' — {'+esc(v.key)+'}</option>').join("");}
async function loadCampaignVariables(){if(CAMPAIGN_VARIABLES_LOADED){renderCampaignVariableOptions();return;}try{const r=await api("/admin/api/campaigns/variables");if(Array.isArray(r)&&r.length){CAMPAIGN_VARIABLES=r;CAMPAIGN_VARIABLES_LOADED=true;}}catch(_){}renderCampaignVariableOptions();}
function insertCampaignVariable(sel){const k=sel.value;sel.value="";if(!k)return;const x=$("camp-msg");if(!x)return;const s=x.selectionStart??x.value.length;x.setRangeText("{"+k+"}",s,x.selectionEnd??s,"end");x.focus();updateCampaignMsgCount();updateCampaignPreview();}
function fillCampaignSample(text){const m=Object.fromEntries(CAMPAIGN_VARIABLES.map(v=>[v.key,v.sample]));return String(text||"").replace(/\{([a-zA-Z_]+)\}/g,(_,k)=>m[k]??"");}
function insertCampaignEmoji(){const e=prompt("Choose emoji: 😊 🎉 🌸 ✨ ❤️ 🙏 👕 🧺");if(!e)return;const x=$("camp-msg");if(!x)return;const s=x.selectionStart||x.value.length;x.setRangeText(e,s,x.selectionEnd||s,"end");x.focus();updateCampaignMsgCount();updateCampaignPreview();}
function toggleCampaignSchedule(){const later=document.querySelector('input[name="camp-send-mode"]:checked')?.value==="later",x=$("camp-scheduled-at");if(x){x.hidden=!later;if(later&&!x.value){const d=new Date(Date.now()+86400000);d.setHours(10,0,0,0);x.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}}updateCampaignPreview();}
function filterCampaignHistory(){const s=$("camp-history-filter")?.value||"all",q=($("camp-history-search")?.value||"").toLowerCase();document.querySelectorAll("#camp-list [data-campaign-status]").forEach(e=>{const st=e.dataset.campaignStatus,matchStatus=s==="all"||(s==="sending"&&["approved","sending"].includes(st))||st===s;e.hidden=!matchStatus||!e.dataset.campaignName?.includes(q);});}
async function previewCampaignRecipients(showList=true){window.CAMPAIGN_PREVIEW_DATA=null;const root=$("camp-recipient-preview");if(!root)return null;if(showList){root.hidden=false;root.innerHTML='<p class="muted">Checking current audience and rules…</p>';}try{const type=selectedCampaignType(),segment=$("camp-seg")?.value||"all_active",body={name:($("camp-name")?.value||"Campaign preview").trim()||"Campaign preview",segment,message_text:$("camp-msg")?.value||"",creative_file:window.CAMPAIGN_CUSTOM_IMAGE||null,campaign_type:type,respect_frequency:Boolean($("camp-rule-frequency")?.checked),skip_complaints:Boolean($("camp-rule-complaints")?.checked),skip_blocked:true,include_opted_out:false,selected_customer_ids:segment==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.map(x=>x.ref):[]};const d=await api("/admin/api/campaigns/preview",{method:"POST",body});window.CAMPAIGN_PREVIEW_DATA=d;const b=$("camp-recipient-breakdown");if(b){b.innerHTML='<div class="camp-breakdown-row"><span>Total in audience</span><b>'+d.total_in_audience+'</b></div><div class="camp-breakdown-row"><span>✅ Will receive</span><b>'+d.will_receive+'</b></div>'+Object.entries(d.skipped||{}).filter(([,n])=>n>0).map(([reason,n])=>'<div class="camp-breakdown-row"><span>⏭ Skipped — '+esc(CampaignShared.reason(reason))+'</span><span><b>'+n+'</b> <button type="button" class="btn sm ghost camp-view-btn" onclick="showSkippedRecipients(\''+esc(reason)+'\')">View</button></span></div>').join("");}if(showList)renderCampaignPreviewRows(d.recipients||[],"Final recipients");const send=$("camp-start-btn");if(send)send.disabled=!Boolean(($("camp-name")?.value||"").trim())||!Boolean(($("camp-msg")?.value||"").trim()||window.CAMPAIGN_CUSTOM_IMAGE)||d.will_receive<=0;return d;}catch(e){if(showList)root.innerHTML='<p class="camp-inline-note">Could not preview recipients: '+esc(e.message||"Try again.")+'</p>';setCampaignNote("Recipient eligibility preview failed. Retry the preview before sending.","error");return null;}}
function renderCampaignPreviewRows(rows,title){const root=$("camp-recipient-preview");if(!root)return;root.hidden=false;root.innerHTML='<b>'+esc(title||"Recipients")+'</b><input type="search" placeholder="Search name or number…" oninput="filterCampaignPreview(this.value)"><div id="camp-preview-rows">'+(rows||[]).map(x=>'<div class="camp-recipient-row" data-search="'+esc((x.name+" "+x.phone+" "+(x.reason||"")).toLowerCase())+'"><span><b>'+esc(x.name)+'</b><br>'+esc(x.phone||"")+'</span><span>'+esc(x.last_order_date||"Last order unavailable")+(x.reason?"<br>"+esc(CampaignShared.reason(x.reason)):"")+'</span></div>').join("")+'</div>';}
function showSkippedRecipients(reason){const d=window.CAMPAIGN_PREVIEW_DATA||{};renderCampaignPreviewRows((d.skipped_recipients||[]).filter(x=>x.reason===reason),"Skipped — "+reason.replaceAll("_"," "));}
function scheduleCampaignPreview(){clearTimeout(window.CAMPAIGN_PREVIEW_TIMER);const name=($("camp-name")?.value||"").trim(),content=Boolean(($("camp-msg")?.value||"").trim()||window.CAMPAIGN_CUSTOM_IMAGE),segment=$("camp-seg")?.value||"";if(!name||!content||!segment)return;window.CAMPAIGN_PREVIEW_TIMER=setTimeout(()=>previewCampaignRecipients(false),450);}
function filterCampaignPreview(q){const v=(q||"").toLowerCase();document.querySelectorAll("#camp-preview-rows [data-search]").forEach(e=>e.hidden=!e.dataset.search.includes(v));}
async function duplicateCampaign(id){campTab("create");try{const c=await api("/admin/api/campaigns/"+id);if($("camp-name"))$("camp-name").value=(c.name||"Campaign")+" copy";if($("camp-msg"))$("camp-msg").value=c.message_text||"";const t=document.querySelector('input[name="camp-type"][value="'+(c.campaign_type||"promotion")+'"]');if(t)t.checked=true;if($("camp-rule-frequency"))$("camp-rule-frequency").checked=c.campaign_type!=="wish";if($("camp-rule-complaints"))$("camp-rule-complaints").checked=true;if(c.creative_file){window.CAMPAIGN_CUSTOM_IMAGE=c.creative_file;const url="/admin/media/"+encodeURIComponent(c.creative_file);if($("camp-image-preview"))$("camp-image-preview").innerHTML='<div class="camp-image-card"><img src="'+url+'" alt="Campaign image preview"><button type="button" class="btn ghost sm" onclick="removeCampaignImage()">Remove image</button></div>';if($("camp-preview-image"))$("camp-preview-image").innerHTML='<img src="'+url+'" alt="Campaign image">';}if(c.segment==="selected"){const d=await api("/admin/api/campaigns/"+id+"/recipients");CAMPAIGN_SELECTED_CUSTOMERS=d.recipients.filter(x=>x.status!=="skipped").map(x=>({ref:x.customer_id,name:x.name,phone:x.phone}));renderCampaignSelectedCustomers();selectCampaignAudience("selected",false);}else{selectCampaignAudience(c.segment,false);}campaignTypeChanged();updateCampaignMsgCount();updateCampaignPreview();window.scrollTo({top:0,behavior:"smooth"});toast("Campaign copied into the editor. Review recipients before sending.");}catch(e){toast("Could not duplicate campaign: "+(e.message||"retry"),true);}}
function updateCampaignMsgCount() {
  const el = $("camp-msg"), count = $("camp-msg-count");
  if (el && count) count.textContent = el.value.length + "/4000";
  updateCampaignPreview();
}
// Network gaya ya page reload: likha hua message na jaaye. Bheje jaane par saaf.
function saveCampaignDraft(){try{const name=$("camp-name")?.value||"",msg=$("camp-msg")?.value||"";if(name||msg)sessionStorage.setItem("kk_camp_draft",JSON.stringify({name,msg}));else sessionStorage.removeItem("kk_camp_draft");}catch(_){}}
function restoreCampaignDraft(){try{const d=JSON.parse(sessionStorage.getItem("kk_camp_draft")||"null");if(!d||$("camp-name")?.value||$("camp-msg")?.value)return;if($("camp-name"))$("camp-name").value=d.name||"";if($("camp-msg"))$("camp-msg").value=d.msg||"";}catch(_){}}
function updateCampaignPreview() {
  saveCampaignDraft();
  const raw=$("camp-msg")?.value||"",msg=fillCampaignSample(raw).trim();
  if ($("camp-preview-text")) $("camp-preview-text").textContent = msg || (window.CAMPAIGN_CUSTOM_IMAGE?"Image-only campaign":"Your campaign message will appear here…");
  if ($("camp-summary-name")) $("camp-summary-name").textContent = $("camp-name")?.value.trim() || "—";
  if ($("camp-summary-image")) $("camp-summary-image").textContent = window.CAMPAIGN_CUSTOM_IMAGE ? "1 image attached" : "No image";
  if ($("camp-preview-time")) $("camp-preview-time").textContent = new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  if ($("camp-summary-start")) { const later=document.querySelector('input[name="camp-send-mode"]:checked')?.value==="later",sv=$("camp-scheduled-at")?.value; $("camp-summary-start").textContent = later ? (sv ? new Date(sv).toLocaleString([], {day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) : "Schedule for later") : "Send now"; }
  updateCampaignAudienceCount();
  const n=$("camp-seg")?.value==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.length:Number(window.CAMPAIGN_SEG_COUNTS?.[$("camp-seg")?.value||"all_active"]||0),est=$("camp-send-estimate");if(est)est.textContent="~"+n+" messages · about "+Math.ceil(n*45/60)+" minutes";
  const name=Boolean(($("camp-name")?.value||"").trim()),content=Boolean(($("camp-msg")?.value||"").trim()||window.CAMPAIGN_CUSTOM_IMAGE),aud=n>0,send=$("camp-start-btn");if(send)send.disabled=!(name&&content&&aud);if(!name)setCampaignNote("Enter a campaign name.","warn");else if(!content)setCampaignNote("Add message text or a supported image.","warn");else if(!aud)setCampaignNote("Choose an audience with at least one customer.","warn");else setCampaignNote("Ready to review. The server re-checks eligibility, opt-outs and frequency limits before anything is sent.","ok");scheduleCampaignPreview();
}
function resetCampaignForm() {
  campTab("create");
  CAMPAIGN_SELECTED_CUSTOMERS = [];
  CAMPAIGN_CUSTOMER_CACHE = {};
  CAMPAIGN_PICKER_ROWS = [];
  window.CAMPAIGN_CUSTOM_IMAGE = null;
  if ($("camp-name")) $("camp-name").value = "";
  if ($("camp-msg")) $("camp-msg").value = "";
  const promo=document.querySelector('input[name="camp-type"][value="promotion"]');if(promo)promo.checked=true;if($("camp-rule-frequency"))$("camp-rule-frequency").checked=true;if($("camp-rule-complaints"))$("camp-rule-complaints").checked=true;
  if ($("camp-image")) $("camp-image").value = "";
  if ($("camp-image-preview")) $("camp-image-preview").innerHTML = "";
  if ($("camp-preview-image")) $("camp-preview-image").innerHTML = "";
  if ($("camp-selected-list")) $("camp-selected-list").innerHTML = "";
  if ($("camp-selected-count")) $("camp-selected-count").textContent = "0 selected";
  updateCampaignMsgCount();
  selectCampaignAudience("all_active", false);
  updateCampaignPreview();
  $("camp-name")?.focus();
  window.scrollTo({top:0,behavior:"smooth"});
}
function scrollCampaignHistory() { campTab("overview"); $("camp-history")?.scrollIntoView({behavior:"smooth",block:"start"}); }

/* Campaigns page tabs: Overview (numbers + history), New campaign (the
   3-step composer), Leads (phone-call handoff). The choice is remembered
   per browser; anything that opens the composer switches to its tab. */
function campTab(tab) {
  const sec = $("sec-campaigns");
  if (!sec) return;
  if (!["overview", "create", "leads"].includes(tab)) tab = "overview";
  sec.dataset.tab = tab;
  sec.querySelectorAll("[data-camp-tab-btn]").forEach((b) => {
    const on = b.dataset.campTabBtn === tab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  });
  try { localStorage.setItem("kk_camp_tab", tab); } catch (e) { /* private mode */ }
}
function campTabRestore() {
  let tab = "overview";
  try { tab = localStorage.getItem("kk_camp_tab") || tab; } catch (e) { /* private mode */ }
  campTab(tab);
}
async function uploadCampaignImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { input.value=""; toast("Choose JPG, PNG or WEBP", true); return; }
  if (file.size > 8 * 1024 * 1024) { input.value=""; toast("Image is too large (8MB max)", true); return; }
  if (window.CAMPAIGN_PREVIEW_URL) URL.revokeObjectURL(window.CAMPAIGN_PREVIEW_URL);
  window.CAMPAIGN_PREVIEW_URL = URL.createObjectURL(file);
  const localUrl = window.CAMPAIGN_PREVIEW_URL;
  $("camp-image-preview").innerHTML = '<div class="camp-image-card"><img src="' + localUrl + '" alt="Campaign image preview"><button type="button" class="btn ghost sm" onclick="removeCampaignImage()">Remove image</button></div>';
  $("camp-preview-image").innerHTML = '<img src="' + localUrl + '" alt="Campaign image">';
  updateCampaignPreview();
  try {
    const fd = new FormData(); fd.append("file", file);
    const d = await api("/admin/api/campaigns/upload-image", {method:"POST",body:fd});
    window.CAMPAIGN_CUSTOM_IMAGE = d.creative_file;
    const url = "/admin/media/" + encodeURIComponent(d.creative_file);
    // Keep the local object URL as a visual fallback if the authenticated media
    // GET is briefly rejected by a stale session/proxy. The uploaded file remains
    // the canonical creative used for preview/send after this editor session.
    const localFallback = window.CAMPAIGN_PREVIEW_URL
      ? ' onerror="if(window.CAMPAIGN_PREVIEW_URL){this.onerror=null;this.src=window.CAMPAIGN_PREVIEW_URL;}"'
      : "";
    $("camp-image-preview").innerHTML = '<div class="camp-image-card"><img src="' + url + '" alt="Campaign image preview"' + localFallback + '><button type="button" class="btn ghost sm" onclick="removeCampaignImage()">Remove image</button></div>';
    $("camp-preview-image").innerHTML = '<img src="' + url + '" alt="Campaign image"' + localFallback + '>';
    updateCampaignPreview(); toast("Campaign image uploaded");
  } catch(e) {
    input.value=""; window.CAMPAIGN_CUSTOM_IMAGE=null;
    $("camp-image-preview").innerHTML=""; $("camp-preview-image").innerHTML="";
    if(window.CAMPAIGN_PREVIEW_URL){URL.revokeObjectURL(window.CAMPAIGN_PREVIEW_URL);window.CAMPAIGN_PREVIEW_URL=null;}
    updateCampaignPreview(); toast(e.message,true);
  }
}
function removeCampaignImage() {
  window.CAMPAIGN_CUSTOM_IMAGE=null;
  if($("camp-image")) $("camp-image").value="";
  if($("camp-image-preview")) $("camp-image-preview").innerHTML="";
  if($("camp-preview-image")) $("camp-preview-image").innerHTML="";
  if(window.CAMPAIGN_PREVIEW_URL){URL.revokeObjectURL(window.CAMPAIGN_PREVIEW_URL);window.CAMPAIGN_PREVIEW_URL=null;}
  updateCampaignPreview();
}
async function testCampaignSend(btn){const name=($("camp-name")?.value||"Test campaign").trim(),message=$("camp-msg")?.value||"",segment=$("camp-seg")?.value||"all_active",creative=window.CAMPAIGN_CUSTOM_IMAGE||null;if(!message.trim()&&!creative){setCampaignNote("Add message text or an image before test sending.","error");return;}confirmDialog("Send this message"+(creative?" and image":"")+" to the saved admin WhatsApp number? Variables are filled with sample values (e.g. {name} → "+fillCampaignSample("{name}")+"). Only one test message is sent.",async()=>{await busy(btn,async()=>{try{const result=await api("/admin/api/campaigns/test-send",{method:"POST",body:{name,segment,message_text:message,creative_file:creative,campaign_type:selectedCampaignType()}});setCampaignNote("Test send accepted by provider for "+(result.destination||"the saved admin number")+"; delivery is not confirmed.","info");toast("Test send accepted; delivery not confirmed.");}catch(e){setCampaignNote("Test send failed: "+(e.message||"Check the saved admin number and retry."),"error");}});});}
async function createCampaign(btn) {
  const name=$("camp-name").value.trim(),message=$("camp-msg").value,segment=$("camp-seg").value,campaignType=selectedCampaignType();
  if(!name){setCampaignNote("Give the campaign a name.","error");return;}
  if(!message.trim()&&!window.CAMPAIGN_CUSTOM_IMAGE){setCampaignNote("Add message text or upload an image; empty text-only campaigns cannot be sent.","error");return;}
  if(!segment){setCampaignNote("Select an audience.","error");return;}
  const count=segment==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.length:(window.CAMPAIGN_SEG_COUNTS?.[segment]||0);
  if(!count){toast(segment==="selected"?"Select at least one customer":"No customers are available in this audience",true);return;}
  const later=document.querySelector('input[name="camp-send-mode"]:checked')?.value==="later",sv=$("camp-scheduled-at")?.value||"";if(later&&(!sv||new Date(sv)<=new Date())){setCampaignNote("Choose a future date and time.","error");return;}
  // Snapshot what is reviewed: the Confirm button sends exactly this, even if
  // the form or a background refresh changes underneath the open dialog.
  const body={name,segment,message_text:message,selected_customer_ids:segment==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.map(x=>x.ref):[],coupon_code:null,creative_file:window.CAMPAIGN_CUSTOM_IMAGE||null,campaign_type:campaignType,respect_frequency:Boolean($("camp-rule-frequency")?.checked),skip_complaints:Boolean($("camp-rule-complaints")?.checked),skip_blocked:true,include_opted_out:false,scheduled_at:later?new Date(sv).toISOString():null};
  await busy(btn,async()=>{
    const preview=await previewCampaignRecipients(true);if(!preview){toast("Recipient preview failed; campaign was not started. Retry the preview.",true);return;}const eligible=Number(preview.will_receive||0);if(eligible<=0){toast("No eligible recipients after applying campaign rules. Nothing was sent.",true);return;}
    window.CAMPAIGN_REVIEW={body,later,when:sv,eligible};
    openModal(campaignReviewHtml(preview,window.CAMPAIGN_REVIEW));
  });
}
const CAMPAIGN_TYPE_LABELS={wish:"🎉 Wish / Greeting",promotion:"📢 Promotion / Offer",payment_reminder:"💰 Payment reminder"};
function campaignReviewHtml(d,r){
  const b=r.body,eligible=r.eligible,skipped=Math.max(0,Number(d.total_in_audience||0)-eligible),recips=d.recipients||[];
  const when=r.later?new Date(r.when).toLocaleString([], {day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}):"Now · about "+Math.max(1,Math.ceil(eligible*45/60))+" min (30–60 sec gap)";
  const skipRows=Object.entries(d.skipped||{}).filter(([,n])=>n>0).map(([k,n])=>'<div class="camp-rv-row"><span>⏭ '+esc(CampaignShared.reason(k))+'</span><b>'+n+'</b></div>').join("");
  const samples=(d.sample_messages||[]).map(x=>'<div class="camp-rv-sample"><small>To <b>'+esc(x.name)+'</b> · '+esc(x.phone)+'</small>'+(b.creative_file?'<span class="camp-rv-img">🖼 Image attached</span>':"")+'<div class="camp-rv-bubble">'+esc(x.message||"(image only)")+'</div></div>').join("");
  const list=recips.slice(0,50).map(x=>'<div class="camp-rv-row"><span>'+esc(x.name||"Customer")+'</span><small>'+esc(x.phone||"")+'</small></div>').join("")+(recips.length>50?'<p class="muted">+ '+(recips.length-50)+' more</p>':"");
  return '<div class="camp-review-modal"><h3>Review &amp; Send</h3><p class="muted">'+esc(b.name)+'</p>'+
    '<div class="camp-rv-stats"><div><b>'+eligible+'</b><small>will receive</small></div><div><b>'+skipped+'</b><small>skipped</small></div><div><b>'+Number(d.total_in_audience||0)+'</b><small>in audience</small></div></div>'+
    '<p class="camp-rv-fresh">Fresh preview: '+eligible+' eligible customer(s), '+skipped+' skipped. Opt-outs are always skipped.</p>'+
    '<div class="camp-rv-row"><span>Type</span><b>'+esc(CAMPAIGN_TYPE_LABELS[b.campaign_type]||b.campaign_type)+'</b></div>'+
    '<div class="camp-rv-row"><span>Audience</span><b>'+esc(SEGMENT_LABEL[d.segment||b.segment]||b.segment)+'</b></div>'+
    '<div class="camp-rv-row"><span>'+(r.later?"Scheduled for":"Sending")+'</span><b>'+esc(when)+'</b></div>'+
    (skipRows?'<h4>Skipped</h4>'+skipRows:"")+
    (samples?'<h4>How customers will see it</h4>'+samples:"")+
    '<details class="camp-rv-list"><summary>Recipients ('+recips.length+')</summary><div class="camp-rv-scroll">'+list+'</div></details>'+
    '<div class="btnrow camp-modal-footer"><button type="button" class="btn ghost" onclick="window.CAMPAIGN_REVIEW=null;closeModal()">Back to edit</button><button type="button" class="btn" onclick="confirmCampaignSend(this)">'+(r.later?"✓ Schedule for ":"✓ Confirm &amp; send to ")+eligible+'</button></div></div>';
}
async function confirmCampaignSend(btn){
  const r=window.CAMPAIGN_REVIEW;if(!r){closeModal();return;}
  await busy(btn,async()=>{
    let draft;
    try{draft=await api("/admin/api/campaigns",{method:"POST",body:r.body});}
    catch(e){toast("Campaign could not be saved: "+e.message,true);return;}
    window.CAMPAIGN_REVIEW=null;closeModal();
    try{
      if(r.later){toast("Campaign scheduled; no messages sent yet.");resetCampaignForm();campTab("overview");loadCampaigns();return;}
      const result=await api("/admin/api/campaigns/"+draft.id+"/approve",{method:"POST"});
      if(result.status==="failed"){toast(result.message||"No eligible recipients. Nothing was sent.",true);loadCampaigns();return;}
      toast("Campaign started successfully — "+result.queued+" customers queued");
      resetCampaignForm(); campTab("overview"); loadCampaigns();  // sent: watch it go out
    }catch(e){
      toast("Draft saved, but sending could not be started: "+e.message,true);
      loadCampaigns();
    }
  });
}
async function pauseCampaign(id) {
  try{await campaignRemote().pause(id);toast("Campaign paused. Messages already sent stay sent.");loadCampaigns();}
  catch(e){toast(e.message,true);}
}
async function resumeCampaign(id) {
  try{await campaignRemote().resume(id);toast("Campaign resumed. Only customers still waiting will get it.");loadCampaigns();}
  catch(e){toast(e.message,true);}
}
function approveCampaign(id) {
  confirmDialog("Start this campaign now? Only eligible customers will be messaged.",async()=>{
    try{const r=await api("/admin/api/campaigns/"+id+"/approve",{method:"POST"});toast("Campaign started successfully — "+r.queued+" queued");loadCampaigns();}
    catch(e){toast(e.message,true);}
  });
}
async function cancelCampaign(id) {
  confirmDialog("Cancel this campaign? Sending will stop after the current message.",async()=>{
    try{await campaignRemote().cancel(id);toast("Campaign cancelled");loadCampaigns();}
    catch(e){toast(e.message,true);}
  });
}
async function deleteCampaign(id) {
  confirmDialog("Delete this campaign? Campaign history and its associated recipient records may be permanently removed. Sent WhatsApp/customer conversation history is not deleted.",async()=>{
    try{await api("/admin/api/campaigns/"+id,{method:"DELETE"});toast("Campaign deleted");loadCampaigns();}
    catch(e){toast(e.message,true);}
  });
}
function renderCampaignSelectedCustomers() {
  const box=$("camp-selected-list"), count=$("camp-selected-count");
  if(count) count.textContent=CAMPAIGN_SELECTED_CUSTOMERS.length+" selected";
  if(box) box.innerHTML=CAMPAIGN_SELECTED_CUSTOMERS.length?CAMPAIGN_SELECTED_CUSTOMERS.map(x=>
    '<button type="button" class="camp-selected-chip" onclick="toggleCampaignCustomer(\''+esc(x.ref)+'\')"><span>✓</span><b>'+esc(x.name||"Customer")+'</b><small>'+esc(x.phone||"")+'</small><i>×</i></button>'
  ).join(""):'<span class="muted">No customers selected yet.</span>';
  updateCampaignAudienceCount();
}
function campaignCustomerRowHtml(x) {
  const selected=CAMPAIGN_SELECTED_CUSTOMERS.some(c=>c.ref===x.ref);
  const orders=x.order_count!=null?'<small>'+x.order_count+' order'+(x.order_count===1?"":"s")+(x.last_order_at?' · Last '+fmtDate(x.last_order_at):"")+'</small>':"";
  return '<label class="camp-customer-row '+(selected?"selected":"")+'"><input class="camp-customer-check" type="checkbox" '+(selected?"checked":"")+
    ' onchange="toggleCampaignCustomer(\''+esc(x.ref)+'\')"><span class="camp-customer-avatar">'+esc((x.name||"?").slice(0,1).toUpperCase())+
    '</span><span class="camp-customer-info"><b>'+esc(x.name||"Customer")+'</b><small>'+esc(x.phone||"")+'</small>'+orders+'</span></label>';
}
function renderCampaignCustomerPickerRows(rows) {
  CAMPAIGN_PICKER_ROWS=rows||[];
  CAMPAIGN_PICKER_ROWS.forEach(x=>CAMPAIGN_CUSTOMER_CACHE[x.ref]=x);
  const box=$("camp-customer-results");
  if(!box)return;
  box.innerHTML=CAMPAIGN_PICKER_ROWS.length?CAMPAIGN_PICKER_ROWS.map(campaignCustomerRowHtml).join(""):'<div class="muted camp-picker-empty">No matching active customer found.</div>';
}
async function loadCampaignCustomerPicker(value="") {
  const q=String(value||"").trim();
  clearTimeout(CAMPAIGN_SEARCH_TIMER);
  CAMPAIGN_SEARCH_TIMER=setTimeout(async()=>{
    try{
      const url="/admin/api/customers/search?limit=25"+(q?"&q="+encodeURIComponent(q):"");
      const rows=await api(url); renderCampaignCustomerPickerRows(rows);
      const meta=$("camp-picker-result-count"); if(meta)meta.textContent=rows.length+" customers shown";
    }catch(e){const box=$("camp-customer-results");if(box)box.innerHTML=errBox(e.message,"customer search");}
  },q?180:0);
}
async function openCampaignCustomerPicker() {
  openModal('<div class="camp-modal-head"><div><h3>👥 Select customers</h3><p class="muted">Search the existing customer database by name or phone.</p></div><b id="camp-picker-result-count" class="pill">Loading…</b></div>'+
    '<input id="camp-customer-search" class="camp-modal-search" type="search" placeholder="Search customers by name or mobile number…" oninput="loadCampaignCustomerPicker(this.value)">'+
    '<div class="camp-picker-actions"><button type="button" class="btn ghost sm" onclick="selectAllVisibleCampaignCustomers()">Select all visible</button><button type="button" class="btn ghost sm" onclick="clearCampaignSelection()">Clear all</button></div>'+
    '<div id="camp-customer-results" class="camp-customer-results camp-modal-results"><div class="muted camp-picker-empty">Loading customers…</div></div>'+
    '<div class="btnrow camp-modal-footer"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="closeModal();renderCampaignSelectedCustomers()">Done — <span id="camp-picker-selected-count">'+CAMPAIGN_SELECTED_CUSTOMERS.length+'</span> selected</button></div>');
  await loadCampaignCustomerPicker("");
  $("camp-customer-search")?.focus();
}
function selectAllVisibleCampaignCustomers() {
  const selected=new Set(CAMPAIGN_SELECTED_CUSTOMERS.map(x=>x.ref));
  CAMPAIGN_PICKER_ROWS.forEach(x=>{if(!selected.has(x.ref))CAMPAIGN_SELECTED_CUSTOMERS.push(x);});
  renderCampaignCustomerPickerRows(CAMPAIGN_PICKER_ROWS); renderCampaignSelectedCustomers();
  const count=$("camp-picker-selected-count");if(count)count.textContent=CAMPAIGN_SELECTED_CUSTOMERS.length;
}
function clearCampaignSelection() {
  CAMPAIGN_SELECTED_CUSTOMERS=[]; renderCampaignCustomerPickerRows(CAMPAIGN_PICKER_ROWS); renderCampaignSelectedCustomers();
  const count=$("camp-picker-selected-count");if(count)count.textContent="0";
}
function toggleCampaignCustomer(ref) {
  const i=CAMPAIGN_SELECTED_CUSTOMERS.findIndex(x=>x.ref===ref);
  if(i>=0)CAMPAIGN_SELECTED_CUSTOMERS.splice(i,1);
  else if(CAMPAIGN_CUSTOMER_CACHE[ref])CAMPAIGN_SELECTED_CUSTOMERS.push(CAMPAIGN_CUSTOMER_CACHE[ref]);
  renderCampaignCustomerPickerRows(CAMPAIGN_PICKER_ROWS); renderCampaignSelectedCustomers();
  const count=$("camp-picker-selected-count");if(count)count.textContent=CAMPAIGN_SELECTED_CUSTOMERS.length;
}
function selectCampaignAudience(segment, doPreview=true) {
  // Same rule as the server: picked customers always win; otherwise a
  // greeting goes to everyone active and a payment reminder to debtors.
  const type=selectedCampaignType();
  if(segment!=="active_orders"){
    if(segment!=="selected"&&type==="wish")segment="all_active";
    if(segment!=="selected"&&type==="payment_reminder")segment="outstanding_dues";
  }
  const sel=$("camp-seg");if(sel){if(![...sel.options].some(o=>o.value===segment))sel.add(new Option(SEGMENT_LABEL[segment]||segment,segment));sel.value=segment;}
  document.querySelectorAll(".camp-audience").forEach(b=>b.classList.toggle("active",b.dataset.segment===segment));
  const picker=$("camp-selected-picker");if(picker)picker.hidden=segment!=="selected";
  const label=segment==="selected"?"Selected Customers":(SEGMENT_LABEL[segment]||segment);
  const count=segment==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.length:window.CAMPAIGN_SEG_COUNTS?.[segment];
  if($("camp-audience-count"))$("camp-audience-count").textContent=count==null?"Audience unavailable":count+" customer"+(count===1?"":"s")+(segment==="selected"?" selected":" in audience");
  if($("camp-summary-audience"))$("camp-summary-audience").textContent=label;
  if(doPreview)updateCampaignPreview();
}
function updateCampaignAudienceCount() {
  const segment=$("camp-seg")?.value||"all_active";
  selectCampaignAudience(segment,false);
  const count=segment==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.length:window.CAMPAIGN_SEG_COUNTS?.[segment];
  if($("camp-summary-count-label"))$("camp-summary-count-label").textContent=segment==="selected"?"Selected customers":"Recipients";
  if($("camp-summary-count"))$("camp-summary-count").textContent=count==null?"—":segment==="selected"?String(count):"~ "+count+" customers";
  document.querySelectorAll(".camp-audience[data-segment]").forEach(card=>{const k=card.dataset.segment,n=k==="selected"?CAMPAIGN_SELECTED_CUSTOMERS.length:Number(window.CAMPAIGN_SEG_COUNTS?.[k]||0);let badge=card.querySelector(".camp-live-count");if(!badge){badge=document.createElement("span");badge.className="camp-live-count";card.appendChild(badge)}badge.textContent=String(n);});
}
function prefillCampaign(seg) {
  campTab("create");
  selectCampaignAudience(seg,false);
  if($("camp-name"))$("camp-name").value=(SEGMENT_LABEL[seg]||seg)+" - "+new Date().toISOString().slice(0,10);
  updateCampaignPreview();
  $("camp-name")?.scrollIntoView({behavior:"smooth",block:"center"});
}
async function openCampaignDetail(id) {
  try {
    const c=await campaignRemote().detail(id);
    const s=c.stats||{};
    const total=campaignRecipientTotal(s);
    const processed=total-Number(s.queued||0)-Number(s.holdout||0);
    const pct=total?Math.round(processed*100/total):0;
    const recipientRows=(c.recipients||[]).map(r=>
      '<tr><td data-label="Customer">'+esc(r.customer)+'</td><td data-label="Phone">'+esc(r.phone)+'</td><td data-label="Status"><span class="camp-badge '+(r.status==="failed"?"failed":r.status==="replied"?"replied":r.status==="skipped"?"skipped":r.status==="uncertain"||r.status==="queued"?"paused":"completed")+'">'+esc(r.status)+'</span></td><td data-label="Reason">'+esc(r.detail?CampaignShared.reason(r.detail):"—")+'</td><td data-label="Status time">'+esc(r.status_at?fmtWhen(r.status_at):"—")+'</td><td data-label="Reply">'+(r.reply?'<span class="camp-reply-badge">Replied</span><div class="camp-reply-text">'+esc(r.reply.text||"")+'</div>':"—")+'</td></tr>'
    ).join("") || '<tr><td colspan="6" class="muted">No recipient records.</td></tr>';
    openModal('<div class="camp-detail-head"><div><h3>'+esc(c.name)+'</h3><p class="muted">'+esc(SEGMENT_LABEL[c.segment]||c.segment)+' · '+esc(c.status)+'</p></div><span class="camp-badge '+campaignStatusClass(c.status,s)+'">'+esc(campaignStatusLabel(c.status,s))+'</span></div>'+
      campaignPauseNote(c)+campaignIssueNote(s)+
      '<div class="camp-detail-meta"><div><span>Created</span><b>'+fmtWhen(c.created_at)+'</b></div><div><span>Started</span><b>—</b></div><div><span>Completed</span><b>'+fmtWhen(c.sent_at)+'</b></div></div>'+
      CampaignShared.funnelHtml(CampaignShared.tenantFunnel(c,s))+
      (c.missing_selected?'<p class="cs-pause">'+c.missing_selected+' selected customer(s) no longer exist.</p>':"")+
      '<div class="camp-detail-progress"><div><span style="width:'+pct+'%"></span></div><b>'+pct+'% processed</b></div>'+
      '<div class="camp-detail-message"><b>Message</b><p>'+esc(c.message_text)+'</p></div>'+
      '<div class="camp-detail-table-wrap"><table class="camp-detail-table"><thead><tr><th>Customer</th><th>Phone</th><th>Status</th><th>Reason / detail</th><th>Status time</th><th>Reply</th></tr></thead><tbody>'+recipientRows+'</tbody></table></div>'+
      '<div class="btnrow camp-modal-footer">'+(c.status==="paused"?'<button class="btn" onclick="closeModal();resumeCampaign(\''+c.id+'\')">Resume</button>':["approved","sending"].includes(c.status)?'<button class="btn ghost" onclick="closeModal();pauseCampaign(\''+c.id+'\')">Pause</button>':"")+'<button class="btn" onclick="closeModal()">Close</button></div>');
  }catch(e){toast(e.message,true);}
}
async function openFailedCampaignMessages() {
  try {
    const rows=await api("/admin/api/campaigns/failed");
    const body=rows.length?rows.map(r=>'<div class="camp-failed-row"><div><b>'+esc(r.customer)+'</b><small>'+esc(r.phone)+'</small></div><div><b>'+esc(r.campaign)+'</b><small>'+esc(r.error)+'</small></div><time>'+esc(r.time?fmtWhen(r.time):"—")+'</time></div>').join(""):'<div class="camp-picker-empty">No failed campaign messages.</div>';
    openModal('<div class="camp-detail-head"><div><h3>⚠ Failed Messages</h3><p class="muted">Actual failed recipient records from campaign sending.</p></div></div><div class="camp-failed-list">'+body+'</div><div class="btnrow camp-modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>');
  }catch(e){toast(e.message,true);}
}
/* ============================= template studio ============================= */
let TPL_BTNS = [];
function tplAddBtn() {
  if (TPL_BTNS.length >= 3) { toast("Meta allows at most 3 buttons", true); return; }
  TPL_BTNS.push({ type: "QUICK_REPLY", text: "", url: "", phone_number: "" });
  tplRenderBtns();
}
function tplRenderBtns() {
  $("tpl-btns").innerHTML = TPL_BTNS.map((b, i) => `
    <div class="filters" style="margin-bottom:6px">
      <select style="min-width:120px" onchange="TPL_BTNS[${i}].type=this.value;tplRenderBtns()">
        <option value="QUICK_REPLY" ${b.type === "QUICK_REPLY" ? "selected" : ""}>Quick reply</option>
        <option value="URL" ${b.type === "URL" ? "selected" : ""}>Open link</option>
        <option value="PHONE_NUMBER" ${b.type === "PHONE_NUMBER" ? "selected" : ""}>Call</option>
      </select>
      <input placeholder="Button text (max 25)" maxlength="25" value="${esc(b.text)}" oninput="TPL_BTNS[${i}].text=this.value;tplPreview()" style="min-width:130px">
      ${b.type === "URL" ? `<input placeholder="https://wa.me/…" value="${esc(b.url)}" oninput="TPL_BTNS[${i}].url=this.value" style="min-width:150px">` : ""}
      ${b.type === "PHONE_NUMBER" ? `<input placeholder="+919696856069" value="${esc(b.phone_number)}" oninput="TPL_BTNS[${i}].phone_number=this.value" style="min-width:130px">` : ""}
      <button class="btn sm danger" onclick="TPL_BTNS.splice(${i},1);tplRenderBtns();tplPreview()">✕</button>
    </div>`).join("");
  tplPreview();
}
function tplPreview() {
  const body = $("tpl-body").value || "…";
  $("tpl-count").textContent = `${body.length}/1024`;
  const samples = $("tpl-samples").value.split(",").map((s) => s.trim());
  let rendered = body;
  (body.match(/\{\{(\d+)\}\}/g) || []).forEach((m) => {
    const n = parseInt(m.replace(/\D/g, ""));
    rendered = rendered.replace(m, samples[n - 1] || `[${n}]`);
  });
  $("tplp-body").textContent = rendered;
  $("tplp-footer").textContent = $("tpl-footer").value;
  $("tplp-btns").innerHTML = TPL_BTNS.filter((b) => b.text).map((b) =>
    `<div style="border-top:1px solid #eee;margin-top:8px;padding-top:8px;text-align:center;color:#00a5f4;font-weight:600">${b.type === "PHONE_NUMBER" ? "📞 " : b.type === "URL" ? "🔗 " : ""}${esc(b.text)}</div>`).join("");
}
async function tplSubmit(btn) {
  await busy(btn, async () => {
    const r = await api("/admin/api/templates", { method: "POST", body: {
      name: $("tpl-name").value.trim(), category: $("tpl-cat").value,
      body: $("tpl-body").value, footer: $("tpl-footer").value.trim() || null,
      buttons: TPL_BTNS.filter((b) => b.text),
      samples: $("tpl-samples").value.split(",").map((s) => s.trim()).filter(Boolean),
    }});
    toast(`Submitted — '${r.name}' is ${r.status} at Meta`);
    $("tpl-body").value = ""; TPL_BTNS = []; tplRenderBtns(); tplLoad();
  });
}
async function tplLoad() {
  try {
    const rows = await api("/admin/api/templates");
    $("tpl-list").innerHTML = rows.length ? rows.map((t) => `
      <div class="sumrow" style="align-items:flex-start">
        <span style="flex:1"><b>${esc(t.name)}</b> <span class="tag">${t.category}</span>
          <span class="pill ${t.status === "APPROVED" ? "PAID" : t.status === "REJECTED" ? "UNPAID" : "PARTIAL"}">${t.status}</span>
          ${t.rejected_reason ? `<div class="muted" style="color:var(--danger)">Reason: ${esc(t.rejected_reason)}</div>` : ""}
          <div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px">${esc(t.body)}</div></span>
        <button class="btn sm danger" data-action="tplDelete" data-name="${esc(t.name)}">✕</button>
      </div>`).join("") : `<p class="muted">No templates yet.</p>`;
  } catch (e) { $("tpl-list").innerHTML = errBox(e.message, "tplLoad"); }
}
function tplDelete(name) {
  confirmDialog(`Delete template "${name}" from Meta? This cannot be undone.`, async () => {
    try { await api(`/admin/api/templates/${encodeURIComponent(name)}`, { method: "DELETE" }); toast(T.deleted); tplLoad(); }
    catch (e) { toast(e.message, true); }
  });
}

/* ============================= agents control room ============================= */
async function loadAgents() {
  $("agents-body").innerHTML = skeleton(5);
  let d;
  try { d = await api("/admin/api/agents/overview"); }
  catch (e) { $("agents-body").innerHTML = errBox(e.message, "loadAgents"); return; }
  const sv = d.service, mk = d.marketing;
  const segTop = Object.entries(mk.segments).filter(([, v]) => v > 0)
    .map(([k, v]) => `${SEGMENT_LABEL[k] || k}: <b>${v}</b>`).join(" · ") || "no segments yet";
  const budgetPct = Math.min(100, Math.round((mk.month.messages_used / Math.max(1, mk.month.budget)) * 100));
  $("agents-body").innerHTML = `
    <div class="split2">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <b style="font-size:16px">🛎️ Service agent</b>
          <label style="display:flex;align-items:center;gap:8px;margin:0;font-size:13px">
            <input type="checkbox" ${sv.enabled ? "checked" : ""} style="width:auto"
              onchange="quickSet('agent_enabled', this.checked, 'Service agent ' + (this.checked ? 'on' : 'off'))"> Active
          </label>
        </div>
        <div class="grid kpis" style="grid-template-columns:repeat(2,1fr);margin:12px 0">
          ${kpi("Replies today", sv.today.replies, "", "go('activity')")}
          ${kpi("Owner commands", sv.today.commands, "bills, status, relay…", "go('activity')")}
          ${kpi("Escalations", sv.today.escalations, "needed you", "go('activity')")}
          ${kpi("FYIs sent", sv.today.fyis, "handled + informed", "go('activity')")}
        </div>
        <div class="sumrow"><span>📚 Knowledge</span><span><b>${sv.knowledge.faqs}</b> FAQs · <b>${sv.knowledge.corrections}</b> corrections · <b>${sv.knowledge.docs}</b> documents</span></div>
        <div class="sumrow"><span>🙋 Teach-me queue</span><span style="color:${sv.teachme_open ? "var(--danger)" : "var(--ok)"}"><b>${sv.teachme_open}</b> pending</span></div>
        <div class="act" style="margin-top:10px">
          <button class="btn sm" onclick="go('training')">🎓 Train</button>
          <button class="btn sm ghost" onclick="go('activity')">🛰 Activity</button>
        </div>
        <p class="muted" style="margin-top:8px">Train from WhatsApp: <b>test customer</b> → ask a question → <b>sikhao: the right answer</b> → <b>test band</b></p>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <b style="font-size:16px">📣 Marketing agent</b>
          <select style="width:auto" onchange="quickSet('marketing_autonomy', this.value, 'Marketing: ' + this.value)">
            <option value="auto" ${mk.autonomy === "auto" ? "selected" : ""}>Full auto</option>
            <option value="suggest" ${mk.autonomy === "suggest" ? "selected" : ""}>Suggest only</option>
            <option value="off" ${mk.autonomy === "off" ? "selected" : ""}>Off</option>
          </select>
        </div>
        <div class="grid kpis" style="grid-template-columns:repeat(2,1fr);margin:12px 0">
          ${kpi("Campaigns this month", mk.month.campaigns_sent, "", "go('campaigns')")}
          ${kpi("Orders from campaigns", mk.month.orders_attributed, money(mk.month.revenue_attributed) + " revenue", "go('campaigns')")}
        </div>
        <div class="sumrow"><span>🎯 Segments</span><span style="text-align:right">${segTop}</span></div>
        <div class="sumrow"><span>💬 Message budget</span><span><b>${mk.month.messages_used}</b> / ${mk.month.budget} (${budgetPct}%)</span></div>
        <div class="sumrow"><span>📸 Daily social</span><span>${mk.social.enabled ? `On, ${mk.social.hour}:00 IST` : "Off"} · Instagram ${mk.social.instagram_linked ? "✅ linked" : "❌ not linked"}</span></div>
        <div class="act" style="margin-top:10px">
          <button class="btn sm" onclick="go('campaigns')">📣 Campaigns</button>
          <button class="btn sm ghost" onclick="go('settings')">⚙️ Limits</button>
        </div>
        <p class="muted" style="margin-top:8px">From WhatsApp: <b>test marketing</b> (preview) · <b>social bhejo</b> (today's poster) · <b>campaign nahi</b> (stop)</p>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <b>🩺 System health</b>
      <div class="filters" style="margin-top:8px">
        <span class="tag">LLM: ${esc(d.health.llm_provider)}</span>
        <span class="tag">Public URL: ${d.health.public_url_set ? "✅ set" : "❌ missing"}</span>
        <span class="tag">Standup: ${d.health.standup_hour}:00 IST</span>
        <span class="tag">Turnaround: ${d.health.turnaround_days} days</span>
      </div>
    </div>`;
}
async function quickSet(key, value, msg) {
  try { await api("/admin/api/settings", { method: "PUT", body: { key, value } }); toast(msg); }
  catch (e) { toast(e.message, true); }
}

/* ============================= training ============================= */
async function loadTraining() {
  $("faq-list").innerHTML = skeleton(3);
  try {
    const [settings, faqs, corr, teach, docs] = await Promise.all([
      api("/admin/api/settings"), api("/admin/api/training/faq"),
      api("/admin/api/training/corrections"), api("/admin/api/training/teachme"),
      api("/admin/api/training/docs"),
    ]);
    $("agent-toggle").checked = !!settings.agent_enabled;
    if ($("tr-takeover-h")) $("tr-takeover-h").value = settings.human_takeover_hours ?? 12;
    $("tr-cust-inst").value = settings.customer_instructions || "";
    $("tr-staff-inst").value = settings.staff_instructions || "";
    $("tr-mkt-inst").value = settings.marketing_instructions || "";
    renderFaqs(faqs); renderCorrections(corr); renderTeachme(teach); renderDocs(docs);
  } catch (e) { $("faq-list").innerHTML = errBox(e.message, "loadTraining"); }
}
let DOCS_CACHE = [];
function renderDocs(docs) {
  DOCS_CACHE = docs;
  $("doc-list").innerHTML = docs.length ? docs.map((d, i) => `
    <div class="sumrow"><span>📄 <b>${esc(d.document)}</b> <span class="tag">${d.chunks} parts</span>
      <span class="muted">${fmtWhen(d.uploaded_at)}</span></span>
      <button class="btn sm danger" aria-label="Delete document" onclick="delDocAt(${i})">✕</button></div>`).join("")
    : `<p class="muted">No documents yet.</p>`;
}
async function uploadDoc(input) {
  if (!input.files || !input.files[0]) return;
  const fd = new FormData();
  fd.append("file", input.files[0]);
  $("doc-status").textContent = "Reading " + input.files[0].name + "…";
  try {
    const r = await api("/admin/api/training/upload", { method: "POST", body: fd });
    toast(`${r.document} learned — ${r.chunks} parts, live now`);
    $("doc-status").textContent = "Tap to choose a file";
    loadTraining();
  } catch (e) { toast(e.message, true); $("doc-status").textContent = "Tap to choose a file"; }
  input.value = "";
}
function delDocAt(i) {
  const d = DOCS_CACHE[i];
  if (d) delDoc(d.document);
}
function delDoc(name) {
  confirmDialog(`Remove "${name}" from the agent's knowledge?`, async () => {
    try { await api(`/admin/api/training/docs/${encodeURIComponent(name)}`, { method: "DELETE" }); toast(T.deleted); loadTraining(); }
    catch (e) { toast(e.message, true); }
  });
}
/* The FAQ store can hold 1000+ rows (mostly duplicates). Rendering them all
   into #sec-training left thousands of DOM nodes alive app-wide — every
   layout/paint (composer, template modal) crawled. Fix: de-duplicate, then
   render a page at a time. */
let FAQ_ALL = [], FAQ_SHOWN = 0;
const FAQ_PAGE = 30;
function renderFaqs(faqs) {
  const seen = new Set();
  FAQ_ALL = (faqs || []).filter((f) => {
    const k = `${(f.question || "").trim().toLowerCase()}|${(f.answer || "").trim().toLowerCase()}|${f.audience}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  FAQ_SHOWN = FAQ_PAGE;
  paintFaqs();
}
function faqMore() { FAQ_SHOWN += 50; paintFaqs(); }
function paintFaqs() {
  if (!FAQ_ALL.length) {
    $("faq-list").innerHTML = `<p class="muted">No FAQ entries yet — add shop timings, prices policy, delivery areas…</p>`;
    return;
  }
  const rows = FAQ_ALL.slice(0, FAQ_SHOWN);
  $("faq-list").innerHTML = rows.map((f) => `
    <div class="sumrow" style="align-items:flex-start;gap:8px">
      <span style="flex:1"><b>Q:</b> ${esc(f.question)}<br><b>A:</b> ${esc(f.answer)} <span class="tag">${f.audience}</span></span>
      <button class="btn sm ghost danger-ic" aria-label="Delete FAQ" title="Delete" onclick="delFaq('${f.id}')">🗑</button></div>`).join("")
    + (FAQ_ALL.length > rows.length
        ? `<div style="text-align:center;padding:10px"><button class="btn ghost sm" onclick="faqMore()">Show more (${rows.length}/${FAQ_ALL.length})</button></div>`
        : `<div class="muted" style="text-align:center;padding:8px;font-size:11.5px">${FAQ_ALL.length} unique ${FAQ_ALL.length === 1 ? "entry" : "entries"}</div>`);
}
async function addFaq(btn) {
  await busy(btn, async () => {
    await api("/admin/api/training/faq", { method: "POST", body: { question: $("faq-q").value.trim(), answer: $("faq-a").value.trim(), audience: $("faq-aud").value } });
    $("faq-q").value = ""; $("faq-a").value = "";
    toast("Saved — the agent uses this immediately"); loadTraining();
  });
}
function delFaq(id) {
  confirmDialog(T.confirmDelete, async () => {
    await api(`/admin/api/training/faq/${id}`, { method: "DELETE" }); toast(T.deleted); loadTraining();
  });
}
function renderCorrections(corr) {
  $("corr-list").innerHTML = corr.length ? corr.map((c) => `
    <div class="sumrow" style="align-items:flex-start;gap:8px">
      <span style="flex:1"><b>When asked:</b> ${esc(c.question)}<br><b>Reply like:</b> ${esc(c.correct_reply)}</span>
      <button class="btn sm danger" onclick="delCorr('${c.id}')">✕</button></div>`).join("")
    : `<p class="muted">No corrections yet.</p>`;
}
async function addCorr(btn) {
  await busy(btn, async () => {
    await api("/admin/api/training/corrections", { method: "POST", body: { question: $("corr-q").value.trim(), correct_reply: $("corr-a").value.trim() } });
    $("corr-q").value = ""; $("corr-a").value = "";
    toast("Saved — used from the next reply"); loadTraining();
  });
}
function delCorr(id) {
  confirmDialog(T.confirmDelete, async () => {
    await api(`/admin/api/training/corrections/${id}`, { method: "DELETE" }); toast(T.deleted); loadTraining();
  });
}
function renderTeachme(teach) {
  $("teach-count").textContent = teach.length;
  $("teach-list").innerHTML = teach.length ? teach.map((q) => `
    <div class="card" style="margin-bottom:8px">
      <div class="muted">${esc(q.customer)} · ${fmtWhen(q.asked_at)}</div>
      <p style="margin:5px 0"><b>${esc(q.question)}</b></p>
      <div class="frm"><textarea id="ta-${q.id}" rows="2" placeholder="Write the answer once — it becomes permanent knowledge"></textarea></div>
      <div class="act" style="margin-top:6px">
        <button class="btn sm" onclick="answerTeach('${q.id}', true)">Answer + send to customer</button>
        <button class="btn sm ghost" onclick="answerTeach('${q.id}', false)">Save answer only</button>
      </div></div>`).join("")
    : `<p class="muted">Queue is empty — the agent knew everything it was asked. 🎉</p>`;
}
async function answerTeach(id, send) {
  const ans = $("ta-" + id).value.trim();
  if (!ans) { toast("Write an answer first", true); return; }
  try {
    const r = await api(`/admin/api/training/teachme/${id}/answer`, { method: "POST", body: { answer: ans, save_as_faq: true, send_to_customer: send } });
    toast(r.sent_to_customer ? "Answered + sent to the customer" : "Answered — saved to knowledge");
    loadTraining();
  } catch (e) { toast(e.message, true); }
}

async function saveAgentSettings(btn) {
  await busy(btn, async () => {
    await api("/admin/api/settings", { method: "PUT", body: { key: "agent_enabled", value: $("agent-toggle").checked } });
    if ($("tr-takeover-h")) {
      const h = Number($("tr-takeover-h").value);
      if (!Number.isFinite(h) || h < 0 || h > 72) throw new Error("Quiet hours must be 0 to 72");
      await api("/admin/api/settings", { method: "PUT", body: { key: "human_takeover_hours", value: Math.round(h) } });
    }
    await api("/admin/api/settings", { method: "PUT", body: { key: "customer_instructions", value: $("tr-cust-inst").value } });
    await api("/admin/api/settings", { method: "PUT", body: { key: "staff_instructions", value: $("tr-staff-inst").value } });
    await api("/admin/api/settings", { method: "PUT", body: { key: "marketing_instructions", value: $("tr-mkt-inst").value } });
    toast("Saved — live immediately, no restart");
  });
}

/* ============================= activity =============================
   One event = one block. The log used to print raw JSON next to a raw
   action name ({"code":"T-3","staff":"Taskram"}), which is a developer's
   view of the shop. Same rows, told as sentences. */
const ACT_META = {
  new_bill: ["🧾", "Bill drafted"],
  create_bill: ["🧾", "Bill created"],
  order_edited: ["✏️", "Bill edited"],
  order_deleted: ["🗑", "Bill deleted"],
  customer_edited: ["✏️", "Customer edited"],
  customer_deleted: ["🗑", "Customer deleted"],
  relay: ["📨", "Message relayed"],
  task_created: ["📋", "Task assigned"],
  task_completed: ["✅", "Task completed"],
  pickup_task_created: ["🛺", "Pickup scheduled"],
  status_update: ["🔄", "Status changed"],
  delay_update: ["⏳", "Delivery pushed back"],
  assign_staff: ["👷", "Assigned to staff"],
  done_command: ["✅", "Staff said done"],
  standup: ["📣", "Morning standup"],
  payment_reminders: ["💰", "Payment reminder"],
  delivery_nudges: ["🔔", "Delivery nudge"],
  ai_reply: ["🤖", "Replied to customer"],
  escalated: ["🔔", "Escalated to you"],
  complaint_escalated: ["😞", "Complaint received"],
  admin_fyi: ["ℹ️", "FYI to you"],
  rating: ["⭐", "Rating received"],
  lead_created: ["🌱", "New inquiry"],
  hot_lead_digest: ["🌱", "Lead digest"],
  campaign_sent: ["📢", "Campaign sent"],
  campaign_approved: ["👍", "Campaign approved"],
  daily_social: ["📸", "Daily post"],
  taught_via_whatsapp: ["🎓", "Taught via WhatsApp"],
  training_doc_uploaded: ["📄", "Training file uploaded"],
  message_format_edited: ["💬", "Message format edited"],
  message_format_reset: ["↩️", "Message format reset"],
  template_submitted: ["📑", "Template sent to Meta"],
  agent_paused: ["⏸", "Agent paused"],
  agent_resumed: ["▶️", "Agent resumed"],
  tunnel_heal: ["🔧", "Tunnel repaired"],
};
// args worth showing as chips, in the order they read best
const ACT_CHIPS = ["order", "order_number", "code", "staff", "staff_name", "relay_to",
  "customer", "customer_name", "new_status", "new_date", "total", "rating",
  "campaign", "theme", "key", "document", "name", "date", "open", "orders", "items"];

function actMeta(action) {
  return ACT_META[action] || ["🔹", action.replace(/_/g, " ")];
}
function actChips(args) {
  if (!args || typeof args !== "object") return "";
  const out = [];
  for (const k of ACT_CHIPS) {
    const v = args[k];
    if (v === undefined || v === null || v === "" || typeof v === "object") continue;
    out.push(`<span class="actchip"><i>${esc(k.replace(/_/g, " "))}</i>${esc(String(v)).slice(0, 40)}</span>`);
  }
  if (args.urgent === true) out.push('<span class="actchip urgent">urgent</span>');
  return out.length ? `<div class="actchips">${out.join("")}</div>` : "";
}

/* First screen = 60 events (was the server default 100 in one shot);
   "Aur dikhao" grows the window via the API's ?limit= up to its 500 cap. */
let ACT_LIMIT = 60;
const ACT_MAX = 500;
function actMore(btn) { btn.disabled = true; ACT_LIMIT = Math.min(ACT_LIMIT + 100, ACT_MAX); loadActivity(false); }
async function loadActivity(reset = true) {
  if (reset) { ACT_LIMIT = 60; $("act-list").innerHTML = skeleton(6); }
  try {
    const role = $("act-role").value;
    const p = new URLSearchParams({ limit: ACT_LIMIT });
    if (role) p.set("role", role);
    const rows = await api("/admin/api/activity?" + p);
    if (!rows.length) { $("act-list").innerHTML = emptyBox("No agent activity yet.", "🤖"); return; }
    const moreBtn = rows.length >= ACT_LIMIT && ACT_LIMIT < ACT_MAX
      ? `<div style="padding:12px;text-align:center"><button class="btn ghost sm" onclick="actMore(this)">⬇ Show more (${rows.length} shown)</button></div>`
      : "";
    let lastDay = "";
    $("act-list").innerHTML = rows.map((r) => {
      const [icon, label] = actMeta(r.action);
      const a = r.args || {};
      // the customer's own words matter more than any label we invent
      const quote = a.text || a.question || a.relay_message || "";
      let head = "";
      const day = new Date(r.at).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        head = `<div class="actday">${dayName(r.at) || fmtDate(r.at)}</div>`;
      }
      return `${head}
        <div class="actrow${r.ok === false ? " bad" : ""}">
          <div class="actico">${icon}</div>
          <div class="actbody">
            <div class="acthead">
              <span class="actwho"><b>${esc(label)}</b>
                <span class="tag">${esc(r.role || "")}</span>
                ${r.actor ? `<span class="muted">${esc(r.actor)}</span>` : ""}</span>
              <span class="acttime">${fmtClock(r.at)}</span></div>
            ${r.result ? `<div class="actres">${esc(String(r.result)).slice(0, 400)}</div>` : ""}
            ${quote ? `<div class="actquote">${esc(String(quote)).slice(0, 220)}</div>` : ""}
            ${actChips(a)}
          </div>
        </div>`;
    }).join("") + moreBtn;
  } catch (e) { $("act-list").innerHTML = errBox(e.message, "loadActivity"); }
}

/* ============================= settings ============================= */
let STAFF = [], SETTINGS_CACHE = {}, RM_RATES = [], RM_EXTRA_G = [], RM_EXTRA_S = [];

function stTab(t) {
  if (t === "rewards") loadRewards();
  if (t === "pricing" && !COSTING && !LOCKED_TABS.costing) costingLoad();
  ["profile", "pricing", "messages", "ops", "rewards"].forEach((x) => {
    const el = $("st-" + x); if (el) el.style.display = x === t ? "" : "none";
  });
  document.querySelectorAll("[data-st]").forEach((el) => el.classList.toggle("on", el.dataset.st === t));
}

async function loadWahaConnection() {
  const box = $("waha-connection-body");
  if (!box) return;
  try {
    const s = await api("/admin/api/whatsapp/waha/status");
    // status (WORKING, SCAN_QR_CODE, PASSKEY_REQUIRED…) har engine mein ek jaisa;
    // engine.state har engine ka apna hota hai, isliye wo sirf peeche ka sahara
    const state = String(s.status || s.state || "").toUpperCase();
    clearTimeout(WAHA_WATCH);
    if (state === "WORKING" || state === "CONNECTED") {
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="chip on">🟢 Connected</span>
          <b>${esc(s.push_name || s.number_masked || "WhatsApp")}</b>
        </div>
        <small class="muted" style="display:block;margin-top:6px">Session: ${esc(s.session || "default")} · WAHA/${esc(s.engine || "NOWEB")}</small>
        <div class="filters" style="margin-top:10px">
          <button class="btn ghost sm" onclick="syncWahaWebhook(this)">↻ Sync inbox settings</button>
          <small class="muted">Do this once after an update so replies you type on the shop phone appear in the Inbox.</small>
        </div>`;
      return;
    }
    // QR scan ho gaya, WhatsApp ab passkey maang raha hai (kk-passkey.js)
    if (window.KKPasskey && KKPasskey.isPasskey(state)) {
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="chip">🟡 Almost connected</span>
          <span class="muted">Status: ${esc(state)}</span>
        </div>
        <div id="waha-passkey-wrap" style="margin-top:12px"></div>`;
      KKPasskey.mount($("waha-passkey-wrap"), {
        api, base: "/admin/api/whatsapp/waha/passkey", lang: "en",
        onDone: () => { toast("WhatsApp connected"); loadWahaConnection(); },
        onRestart: () => loadWahaConnection(),
      });
      return;
    }
    const started = state === "SCAN_QR_CODE" || state === "STARTING" || state === "INITIALIZING" || state === "AUTHENTICATING";
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="chip">${started ? "🟡 Waiting for scan" : "⚪ Not connected"}</span>
        <span class="muted">Status: ${esc(state || "NOT_CREATED")}</span>
      </div>
      <div class="filters" style="margin-top:10px">
        <button class="btn" onclick="startWahaConnection()">📲 ${started ? "Refresh QR" : "Connect WhatsApp"}</button>
      </div>
      <div id="waha-qr-wrap" style="margin-top:12px"></div>`;
    if (started) { await showWahaQr(); wahaWatch(Date.now() + 5 * 60 * 1000); }
  } catch (e) {
    box.innerHTML = `<div class="errbox">⚠️ ${esc(e.message)}<br><br><button class="btn ghost" onclick="loadWahaConnection()">Try again</button></div>`;
  }
}

/* QR dikh raha ho to har 5s haal dekho: scan ke baad juda (WORKING) ya
   passkey maanga — dono par card apne aap badle. 5 minute baad band. */
var WAHA_WATCH = 0;   // var: loadWahaConnection ise upar padhta hai
function wahaWatch(until) {
  clearTimeout(WAHA_WATCH);
  WAHA_WATCH = setTimeout(async () => {
    if (!$("waha-qr-wrap") || Date.now() > until) return;
    if (document.hidden) return wahaWatch(until);
    try {
      const s = await api("/admin/api/whatsapp/waha/status");
      const st = String(s.status || s.state || "").toUpperCase();
      if (st === "WORKING" || (window.KKPasskey && KKPasskey.isPasskey(st))) return loadWahaConnection();
    } catch (e) { /* agli baar */ }
    wahaWatch(until);
  }, 5000);
}

/* Re-sends the webhook subscription to WAHA. Needed once after the update
   that added "message.any" — without it the shop phone's own replies never
   reach the Inbox. WAHA restarts the session briefly to apply it. */
async function syncWahaWebhook(btn) {
  await busy(btn, async () => {
    await api("/admin/api/whatsapp/waha/configure-webhook", { method: "POST" });
    toast("Inbox settings synced — replies from your phone will now show up");
  });
}

async function startWahaConnection() {
  const box = $("waha-connection-body");
  if (box) box.innerHTML = '<span class="muted">Starting WhatsApp connection…</span>';
  try {
    await api("/admin/api/whatsapp/waha/start", { method: "POST" });
    toast("WhatsApp connection started");
    await new Promise(r => setTimeout(r, 1200));
    await loadWahaConnection();
  } catch (e) {
    if (box) box.innerHTML = `<div class="errbox">⚠️ ${esc(e.message)}<br><br><button class="btn ghost" onclick="loadWahaConnection()">Try again</button></div>`;
  }
}

async function showWahaQr() {
  const wrap = $("waha-qr-wrap");
  if (!wrap) return;
  try {
    const r = await fetch("/admin/api/whatsapp/waha/qr?ts=" + Date.now(), {
      headers: { "Cache-Control": "no-cache" }
    });
    if (!r.ok) throw new Error("QR code is not available yet");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    wrap.innerHTML = `
      <div style="display:inline-flex;flex-direction:column;align-items:center;gap:8px;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;background:#fff">
        <img src="${url}" alt="WhatsApp QR code" style="width:280px;height:280px;image-rendering:auto;border-radius:8px">
        <b>WhatsApp → Linked Devices → Link a device</b>
        <small class="muted">QR expires periodically. Refresh if it stops scanning.</small>
        <button class="btn ghost sm" onclick="showWahaQr()">↻ Refresh QR</button>
      </div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="muted">${esc(e.message)} · <button class="btn ghost sm" onclick="showWahaQr()">Refresh QR</button></div>`;
  }
}

async function loadSettings() {
  paintPlanRing();
  mfLoad();
  try {
    const [rates, staff, s] = await Promise.all([
      api("/admin/api/rates"), api("/admin/api/staff"), api("/admin/api/settings"),
    ]);
    STAFF = staff; SETTINGS_CACHE = s; RM_RATES = rates;
    renderRateMatrix(); renderStaff(); renderPresets();
    if (window.KKTags) KKTags.refresh();
    $("set-standup").value = s.standup_hour;
    $("set-route").value = String(!!s.staff_show_route);
    $("set-autoassign").value = String(s.agent_auto_assign !== false);
    $("set-pts-good").value = s.staff_points_good ?? 5;
    $("set-pts-mid").value = s.staff_points_mid ?? 2;
    $("set-reward").value = String(!!s.staff_reward_enabled);
    $("set-reward-note").value = s.staff_reward_note || "";
    $("set-staffnames").value = String(s.rating_show_staff_names !== false);
    $("set-nudges").value = String(s.staff_nudges_enabled !== false);
    $("set-nudge-hours").value = (s.staff_nudge_hours || []).join(", ");
    const lim = s.stage_limit_hours || {};
    $("set-stagelimits").innerHTML = STAGE_LIMIT_KEYS.map(([k, label]) => `
      <div class="setfield"><label for="sl-${k}">${label}</label>
        <input id="sl-${k}" type="number" min="1" max="720" inputmode="numeric" value="${esc(lim[k] ?? "")}"></div>`).join("");
    $("set-urg-type").value = s.urgent_charge_type === "flat" ? "flat" : "percent";
    $("set-urg-value").value = s.urgent_charge_value ?? 50;
    $("set-urg-days").value = s.urgent_delivery_days ?? 1;
    $("set-turnaround").value = s.turnaround_days;
    $("set-freqcap").value = s.marketing_freq_cap_per_month;
    $("set-budget").value = s.marketing_monthly_msg_budget;
    $("set-ai-budget").value = s.llm_monthly_budget_usd ?? 0;
    $("set-autonomy").value = s.marketing_autonomy;
    $("set-social").value = String(!!s.social_daily_enabled);
    $("set-socialhour").value = s.social_post_hour;
    // token kabhi browser tak nahi aata (mask) — yahan sirf juda/nahi
    igState(!!(s.ig_user_id && s.ig_access_token));
    const staffOpts = (sel) => '<option value="">— none —</option>' +
      staff.filter((x) => x.is_active).map((x) => `<option value="${x.phone}" ${sel === x.phone ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    $("set-washer").innerHTML = staffOpts(s.default_washer_phone);
    $("set-delivery").innerHTML = staffOpts(s.default_delivery_phone);
    // business profile
    // Tenant se, hardcoded nahi — ye har dukaan ka apna naam hai.
    $("bp-name").value =
      (SIGNED_IN_AS && SIGNED_IN_AS.tenant && SIGNED_IN_AS.tenant.shop_name) || "";
    $("bp-gstin").value = s.shop_gstin || "";
    $("bp-phone").value = s.shop_contact_phone || "";
    $("bp-hours").value = s.shop_hours || "";
    $("bp-address").value = s.shop_address || "";
    $("bp-upi").value = s.upi_vpa || "";
    $("bp-payee").value = s.upi_payee || "";
    $("bp-review").value = s.google_review_link || "";
    $("bp-review2").value = s.google_review_link_2 || "";
    // grahak ko jaane wali choti link — dikhao taaki owner khud chala kar dekh le
    const slug = SIGNED_IN_AS?.tenant?.slug;
    $("bp-review-short").innerHTML = s.public_base_url && slug
      ? `Customers get the short link: <b>${esc(s.public_base_url.replace(/\/$/, ""))}/r/${esc(slug)}</b>`
      : "Customers get this link in the “Please review us” message.";
    orderLinkLoad();
    $("bp-footer").value = s.invoice_footer || "";
    $("bp-terms").value = s.invoice_terms || "";
    $("bp-paper").value = String(s.receipt_paper_mm || 58);
    renderShopLogo(s.shop_logo_file || "");
    $("bp-gstpct").value = s.gst_percent;
    $("bp-gstdef").checked = !!s.gst_default_on;
    gbpLoad();
    loadWahaConnection();
  } catch (e) { toast(e.message, true); }
}

/* ---- dukaan ka logo: bill page + thermal receipt dono par ---- */
function renderShopLogo(file) {
  const prev = $("bp-logo-preview"), rm = $("bp-logo-remove");
  if (!prev) return;
  if (file) {
    const url = "/admin/media/" + encodeURIComponent(file);
    prev.innerHTML = `<img src="${url}" alt="Shop logo" style="width:56px;height:56px;object-fit:contain;background:#fff;border-radius:10px;border:1px solid var(--line,#ddd)">`;
    rm.hidden = false;
  } else {
    prev.textContent = "No logo yet";
    rm.hidden = true;
  }
  window.SHOP_LOGO_FILE = file || "";
}
async function removeShopLogo(btn) {
  await busy(btn, async () => {
    await api("/admin/api/settings/logo", { method: "DELETE" });
    renderShopLogo("");
    toast("Logo removed");
  });
}
document.addEventListener("change", async (ev) => {
  if (ev.target && ev.target.id === "bp-logo-file") {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const fd = new FormData(); fd.append("file", file);
      const d = await api("/admin/api/settings/logo", { method: "POST", body: fd });
      renderShopLogo(d.logo_file);
      toast("Logo saved — it now prints on receipts");
    } catch (e) { toast(e.message, true); }
  }
});

/* Grahak ka apna order page (/billcreation) — owner copy karke share kare */
async function orderLinkLoad() {
  const box = $("bp-orderlink");
  if (!box) return;
  let url = "";
  try { url = (await api("/admin/api/order-link")).url || ""; } catch (e) { url = ""; }
  box.value = url || "Set the public website address first (Settings)";
  $("bp-orderlink-open").href = url || "#";
  $("bp-orderlink-open").hidden = !url;
  $("bp-orderlink-copy").disabled = !url;
  $("bp-orderlink-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast("Order link copied — paste it in WhatsApp"); }
    catch (e) { box.select(); toast("Copy did not work — select the link and copy it", true); }
  };
}

/* Google Business Profile — saare Google reviews website par */
async function gbpLoad() {
  const box = $("gbp-body");
  if (!box) return;
  let s;
  try { s = await api("/admin/api/google-business/status"); }
  catch (e) { box.textContent = e.message; return; }
  const err = s.last_error ? `<p style="color:#be123c;margin:8px 0">⚠️ ${esc(s.last_error)}</p>` : "";
  if (!s.connected || (s.choices && s.choices.length)) {
    box.innerHTML = `${err}<p>Not connected yet — ask the Kwik Klin team to connect your Google Business Profile.</p>`;
    return;
  }
  const when = s.synced_at ? new Date(s.synced_at).toLocaleString("en-IN") : "not yet";
  const stat = s.rating ? `<b>${Number(s.rating).toFixed(1)} ★</b> · ${s.count} reviews on Google · ${s.stored} shown on website` : "No reviews synced yet";
  const postLocations = s.auto_post_locations || [];
  const postRows = postLocations.map((p) => {
    const published = p.status === "published";
    const failed = p.status === "failed";
    const label = published ? "Published" : (failed ? "Failed" : "Not posted yet");
    const color = published ? "#15803d" : (failed ? "#b91c1c" : "var(--muted,#64748b)");
    const detail = p.date ? ` · ${esc(p.date)}` : "";
    const error = failed && p.error ? `<small style="display:block;color:#b91c1c;margin-top:3px">${esc(p.error)}</small>` : "";
    const poster = published ? (p.poster_attached ? " · poster attached" : (p.poster_issue ? " · poster not attached" : "")) : "";
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border,#e5e7eb)"><b>${esc(p.title || "Google location")}</b><span style="float:right;color:${color};font-weight:600">${label}</span><small class="muted" style="display:block">${esc(p.address || p.location || "")}${detail}${poster ? esc(poster) : ""}</small>${error}</div>`;
  }).join("");
  const postStatus = `<section style="margin-top:14px;padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:10px"><b>📣 Daily Google posts</b><p class="muted" style="margin:4px 0 8px">${postLocations.length} location(s) selected · ${s.auto_post?.enabled === false ? "posting paused" : "daily posting enabled"}</p>${postRows || '<p class="muted">No Google locations selected yet.</p>'}</section>`;
  const locs = s.review_locations || [];
  const srcPicker = locs.length > 1 ? `
    <div class="rev-src">
      <label for="gbp-review-source">Reviews shown on your website</label>
      <select id="gbp-review-source" onchange="gbpSetReviewSource(this)">
        <option value="" ${!s.review_source ? "selected" : ""}>Main listing — ${esc((locs[0] || {}).title || "Google listing")}</option>
        ${locs.slice(1).map((l) => `<option value="${esc(l.location)}" ${s.review_source === l.location ? "selected" : ""}>${esc(l.title || l.location)}${l.address ? " — " + esc(l.address) : ""}</option>`).join("")}
        <option value="all" ${s.review_source === "all" ? "selected" : ""}>All ${locs.length} listings combined</option>
      </select>
      <small class="muted">Combined shows every listing's reviews, newest first, with a rating weighted by review count.</small>
    </div>` : "";
  box.innerHTML = `${err}<p style="color:var(--ink,#131820)">✅ Connected: <b>${esc(s.title || "Google listing")}</b></p>
    <p style="margin:4px 0">${stat}</p><small class="muted">Last sync: ${esc(when)} · refreshes every 6 hours</small>
    ${srcPicker}
    <div class="rev-src">
      <label for="gbp-review-stars">Which reviews to show on your website</label>
      <select id="gbp-review-stars" onchange="gbpSetReviewStars(this)">
        <option value="0" ${!s.review_min_stars ? "selected" : ""}>All reviews</option>
        <option value="4" ${s.review_min_stars === 4 ? "selected" : ""}>Only 4★ and 5★</option>
        <option value="5" ${s.review_min_stars === 5 ? "selected" : ""}>Only 5★</option>
      </select>
      <small class="muted">The overall rating and review count stay exactly as on Google; only the review cards are filtered.</small>
    </div>
    ${postStatus}
    <div class="filters" style="margin-top:10px">
      <a class="btn ghost" href="/#reviews" target="_blank" rel="noopener">View on website</a>
    </div>`;
}

async function gbpSetReviewStars(sel) {
  sel.disabled = true;
  try {
    await api("/admin/api/google-business/review-filter", { method: "PUT", body: { min_stars: parseInt(sel.value, 10) || 0 } });
    toast("Website reviews updated");
    gbpLoad();
  } catch (e) { toast(e.message, true); sel.disabled = false; }
}
async function gbpSetReviewSource(sel) {
  sel.disabled = true;
  try {
    const r = await api("/admin/api/google-business/review-source", { method: "PUT", body: { source: sel.value } });
    toast(r.synced ? "Website reviews updated" : "Saved — reviews will refresh on the next sync", !r.synced);
    gbpLoad();
  } catch (e) { toast(e.message, true); sel.disabled = false; }
}

async function saveProfile(btn) {
  await busy(btn, async () => {
    const pairs = [
      ["shop_gstin", $("bp-gstin").value.trim()],
      ["shop_contact_phone", $("bp-phone").value.trim()],
      ["shop_hours", $("bp-hours").value.trim()],
      ["shop_address", $("bp-address").value.trim()],
      ["upi_vpa", $("bp-upi").value.trim()],
      ["upi_payee", $("bp-payee").value.trim()],
      ["google_review_link", $("bp-review").value.trim()],
      ["google_review_link_2", $("bp-review2").value.trim()],
      ["invoice_footer", $("bp-footer").value.trim()],
      ["invoice_terms", $("bp-terms").value.trim()],
      ["receipt_paper_mm", parseInt($("bp-paper").value) || 58],
      ["gst_percent", parseFloat($("bp-gstpct").value) || 18],
      ["gst_default_on", $("bp-gstdef").checked],
      ["default_delivery_phone", $("set-delivery").value],
    ];
    for (const [key, value] of pairs) await api("/admin/api/settings", { method: "PUT", body: { key, value } });
    toast("Profile saved — receipts & bills use it now");
    loadSettings();
  });
}

/* discount presets */
function renderPresets() {
  const list = SETTINGS_CACHE.discount_presets || [];
  $("dp-list").innerHTML = list.length ? list.map((p, i) => `
    <div class="sumrow"><span><b>${esc(p.name)}</b> — ${p.type === "percent" ? p.value + "%" : money(p.value)} off</span>
      <button class="btn sm danger" onclick="delPreset(${i})">✕</button></div>`).join("")
    : `<p class="muted">No offers yet — they appear in New Bill's discount dropdown.</p>`;
}
async function addPreset(btn) {
  await busy(btn, async () => {
    const name = $("dp-name").value.trim(), val = parseFloat($("dp-val").value);
    if (!name || !(val > 0)) throw new Error("Offer name and value required");
    const list = [...(SETTINGS_CACHE.discount_presets || []), { name, type: $("dp-type").value, value: val }];
    await api("/admin/api/settings", { method: "PUT", body: { key: "discount_presets", value: list } });
    $("dp-name").value = ""; $("dp-val").value = "";
    toast("Offer added"); loadSettings();
  });
}
async function delPreset(i) {
  const list = [...(SETTINGS_CACHE.discount_presets || [])];
  list.splice(i, 1);
  await api("/admin/api/settings", { method: "PUT", body: { key: "discount_presets", value: list } });
  loadSettings();
}

/* pricing matrix (legacy-style: garment rows x service columns) */
function renderRateMatrix() {
  const pc = RM_RATES.filter((r) => r.unit === "pc");
  const kg = RM_RATES.filter((r) => r.unit === "kg");
  const services = [...new Set([...pc.map((r) => r.service), ...RM_EXTRA_S])];
  const garments = [...new Set([...pc.map((r) => r.garment), ...RM_EXTRA_G])].filter(Boolean).sort();
  const cell = (g, s) => {
    const r = pc.find((x) => x.garment === g && x.service === s);
    return `<td><input inputmode="decimal" aria-label="${esc(g)} ${esc(s)} selling rate" title="Customer selling rate (₹/unit)" type="number" step="0.5" style="max-width:100px" value="${r ? r.rate : ""}"
        placeholder="₹" data-change="rmCell" data-garment="${esc(g)}" data-service="${esc(s)}" data-id="${r ? r.id : ""}"></td>`;
  };
  const x = (fn, arg, title) => `<button type="button" class="rm-x" title="${esc(title)}" aria-label="${esc(title)}" data-action="${fn}" data-name="${esc(arg)}">✕</button>`;
  // Sirf saved naam badle ja sakte hain — naya (bina daam) abhi DB mein hai hi nahi
  const saved = (kind, name) => RM_RATES.some((r) => r[kind] === name);
  const pen = (kind, name) => saved(kind, name)
    ? `<button type="button" class="rm-x" title="Rename ${esc(name)}" aria-label="Rename ${esc(name)}" data-action="rmRename" data-kind="${kind}" data-name="${esc(name)}">✏️</button>` : "";
  // Kapde ka icon — wahi jo New Bill ke tiles par (kk-bill.js)
  const K = window.KKBill;
  const ic = (g) => (K ? K.icon(g, "pc") : "");
  // 📋 Industry list: jo kapde abhi rate card mein nahi, category ke hisaab se
  // khaali khaanon ke saath — daam bharte hi upar shop ki list mein aa jaate
  const have = new Set(garments.map((g) => g.toLowerCase()));
  const std = RM_SHOW_STD && K ? K.GARMENTS.map(([c, names]) => [c, names.filter((n) => !have.has(n.toLowerCase()))]).filter(([, n]) => n.length) : [];
  const catName = Object.fromEntries(K ? K.CATS : []);
  const row = (g, own) => `<tr${own ? "" : ' class="rm-std"'}><td><span class="rm-h">${ic(g)}<b style="font-size:13px;text-transform:none;letter-spacing:0">${esc(g)}</b>${own ? pen("garment", g) + x("rmDeleteGarment", g, `Remove ${g}`) : ""}</span></td>${services.map((s) => cell(g, s)).join("")}</tr>`;
  if ($("rm-std-btn")) $("rm-std-btn").textContent = RM_SHOW_STD ? "✕ Hide industry list" : "📋 Industry garment list";
  $("rate-matrix").innerHTML = `
    <p class="muted" style="margin:0 0 8px">Under each service, tap Wash / Dry / Iron to choose the stages its clothes go through. An iron-only service skips washing and drying.</p>
    <table class="tbl keep" style="min-width:${180 + services.length * 125}px"><thead><tr>
      <th>Laundry garment name</th>${services.map((s) => `<th><span class="rm-h">${esc(s)}${pen("service", s)}${x("rmDeleteService", s, `Remove service ${s}`)}</span>${stageChips(s)}</th>`).join("")}
    </tr></thead><tbody>
      ${garments.map((g) => row(g, true)).join("")}
      ${std.length ? `<tr class="rm-std-h"><td colspan="${services.length + 1}"><b>📋 Industry garment list</b> <span class="muted">— type a rate to start offering it; blank items never show on a bill</span></td></tr>`
        + std.map(([c, names]) => `<tr class="rm-std-cat"><td colspan="${services.length + 1}">${esc(catName[c] || c)}</td></tr>` + names.map((g) => row(g, false)).join("")).join("") : ""}
    </tbody></table>`;
  $("rate-kg").innerHTML = kg.map((r) => `
    <div class="sumrow"><span><span class="rm-h">${esc(r.service)}<button type="button" class="rm-x" title="Rename ${esc(r.service)}" aria-label="Rename ${esc(r.service)}" data-action="rmRename" data-kind="service" data-name="${esc(r.service)}">✏️</button></span>${stageChips(r.service)}</span>
      <span style="max-width:120px"><input inputmode="decimal" aria-label="${esc(r.service)} selling rate per kg" title="Selling rate per kg" type="number" step="0.5" value="${r.rate}" onchange="updRate('${r.id}', this.value, null)"></span></div>`).join("")
    || `<p class="muted">No per-kg services yet.</p>`;
}

/* Service ke stages (Wash / Dry / Iron). Owner ne tay na kiya ho to naam
   se andaaza — server ka services/service_stages.py bhi yahi karta hai. */
// Dukaan ka kram: Wash -> Iron -> Ready. Drying alag stage nahi (dhulai ka hissa)
const STAGE_KEYS = [["IN_WASH", "Wash"], ["IN_IRON", "Iron"]];
function defaultStages(service) {
  const n = String(service || "").toLowerCase();
  const washy = ["wash", "dhulai", "laundry", "dry clean", "dryclean", "clean"].some((w) => n.includes(w));
  const pressy = ["iron", "press", "istri", "isteri", "steam", "polish", "roll"].some((w) => n.includes(w));
  if (!washy && pressy) return ["IN_IRON"];
  if (n.includes("wash") && n.includes("fold") && !pressy) return ["IN_WASH"];
  return ["IN_WASH", "IN_IRON"];
}
function stagesOf(service) {
  const cfg = SETTINGS_CACHE.service_stages || {};
  // purane saved config mein IN_DRY ho sakta hai — wo ab stage nahi
  return (Array.isArray(cfg[service]) ? cfg[service] : defaultStages(service)).filter((k) => k !== "IN_DRY");
}
function stageChips(service) {
  const on = stagesOf(service);
  return `<span class="rm-stages" role="group" aria-label="${esc(service)} stages">${STAGE_KEYS.map(([k, label]) =>
    `<button type="button" class="rm-stage${on.includes(k) ? " on" : ""}" aria-pressed="${on.includes(k)}"
      data-action="toggleStage" data-service="${esc(service)}" data-stage="${k}">${label}</button>`).join("")}</span>`;
}
async function saveStages(service, stages) {
  const value = { ...(SETTINGS_CACHE.service_stages || {}), [service]: stages };
  await api("/admin/api/settings", { method: "PUT", body: { key: "service_stages", value } });
  SETTINGS_CACHE.service_stages = value;
}
async function toggleStage(service, key) {
  const cur = stagesOf(service);
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  try {
    await saveStages(service, STAGE_KEYS.map(([k]) => k).filter((k) => next.includes(k)));
    renderRateMatrix();
    toast(next.length ? `${service}: stages saved — new and running orders follow them` : `${service}: no stages — goes straight to Ready`);
  } catch (e) { toast(e.message, true); }
}
async function rmCell(garment, service, value, id) {
  const v = parseFloat(value);
  try {
    if (id) {
      if (!(v > 0)) { await api(`/admin/api/rates/${id}`, { method: "PUT", body: { is_active: false } }); toast("Rate disabled"); }
      else { await api(`/admin/api/rates/${id}`, { method: "PUT", body: { rate: v, is_active: true } }); toast("Selling rate saved — new bills only"); }
    } else if (v > 0) {
      await api("/admin/api/rates", { method: "POST", body: { service, garment, unit: "pc", rate: v } });
      toast("Rate added");
    }
    RM_RATES = await api("/admin/api/rates");
    renderRateMatrix();
  } catch (e) { toast(e.message, true); }
}
/* ✏️ Naam badlo — daam wahi rehte hain, DB mein saari rows ek saath */
function rmRename(kind, name) {
  const what = kind === "service" ? "service" : "item";
  openModal(`<h3>Rename ${what}</h3>
    <div class="frm"><div class="setfield"><label for="rn-name">New name</label>
      <input id="rn-name" maxlength="60" value="${esc(name)}">
      <small class="fielderr" id="rn-err"></small></div></div>
    <p class="muted">Rates stay the same. Old bills keep the old name.</p>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="rn-save">Save</button>
    </div>`);
  $("rn-save").onclick = (e) => busy(e.target, async () => {
    const neu = $("rn-name").value.trim();
    if (!neu) { $("rn-err").textContent = "Name cannot be empty."; return; }
    if (neu === name) { closeModal(); return; }
    try {
      await api("/admin/api/rates/rename", { method: "POST", body: { kind, old: name, new: neu } });
    } catch (err) { $("rn-err").textContent = err.message; return; }
    const st = SETTINGS_CACHE.service_stages;
    if (kind === "service" && st && st[name]) { st[neu] = st[name]; delete st[name]; }
    closeModal();
    RM_RATES = await api("/admin/api/rates");
    renderRateMatrix();
    toast(`${name} → ${neu} saved`);
  });
}
async function rmDeleteGroup(kind, name) {
  const saved = RM_RATES.filter((r) => r.unit === "pc" && r[kind] === name).length;
  const what = kind === "service" ? "service" : "item";
  if (!confirm(saved
    ? `Remove ${what} "${name}" and its ${saved} saved rate${saved > 1 ? "s" : ""}? Old bills are not affected.`
    : `Remove ${what} "${name}"?`)) return;
  try {
    if (saved) await api(`/admin/api/rates?${kind}=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (kind === "service") RM_EXTRA_S = RM_EXTRA_S.filter((s) => s !== name);
    else RM_EXTRA_G = RM_EXTRA_G.filter((g) => g !== name);
    RM_RATES = await api("/admin/api/rates");
    renderRateMatrix();
    toast(`${name} removed`);
  } catch (e) { toast(e.message, true); }
}
const rmDeleteService = (s) => rmDeleteGroup("service", s);
const rmDeleteGarment = (g) => rmDeleteGroup("garment", g);
/* Industry ke aam kapde dikhao / chhupao — pasand is browser mein yaad */
let RM_SHOW_STD = (() => { try { return localStorage.getItem("rm_std") === "1"; } catch (_) { return false; } })();
function rmToggleStd() {
  RM_SHOW_STD = !RM_SHOW_STD;
  try { localStorage.setItem("rm_std", RM_SHOW_STD ? "1" : "0"); } catch (_) { /* private mode */ }
  renderRateMatrix();
}
function rmAddGarment() {
  const g = $("rm-garment").value.trim();
  if (!g) return;
  RM_EXTRA_G.push(g); $("rm-garment").value = "";
  renderRateMatrix();
  toast("Now type a rate in any service cell — it saves automatically");
}
async function rmAddService() {
  const s = $("rm-service").value.trim();
  if (!s) return;
  // Service banate hi uske stages — jo box tick hain
  const stages = STAGE_KEYS.map(([k]) => k).filter((k) => $(`rm-st-${k}`) && $(`rm-st-${k}`).checked);
  try { await saveStages(s, stages); } catch (e) { toast(e.message, true); return; }
  RM_EXTRA_S.push(s); $("rm-service").value = "";
  renderRateMatrix();
  toast(`${s} added — now type its rates`);
}
let rateTimer = {};
function updRate(id, rate, active) {
  clearTimeout(rateTimer[id]);
  rateTimer[id] = setTimeout(async () => {
    try {
      const body = {};
      if (rate !== null) body.rate = parseFloat(rate);
      if (active !== null) body.is_active = active;
      await api(`/admin/api/rates/${id}`, { method: "PUT", body });
      toast("Rate saved — applies to new bills only");
    } catch (e) { toast(e.message, true); }
  }, 500);
}
/* 📊 Cost per garment — hisaab server par (services/garment_cost.py).
   Owner cost nahi type karta; sirf effort units badalta hai aur Apply dabata hai. */
let COSTING = null;
/* Period: "30"/"60"/"90" din, ya "m:this"/"m:last" = calendar mahina (hisaab se milana aasan) */
function costingPeriod() {
  const v = $("cst-days") ? $("cst-days").value : "30";
  if (!v.startsWith("m:")) return { days: Number(v) || 30 };
  const d = new Date(); if (v === "m:last") d.setMonth(d.getMonth() - 1);
  return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
}
const costingQuery = () => { const p = costingPeriod(); return p.month ? `month=${p.month}` : `days=${p.days}`; };
/* Wapas lena (16 Nov 2026): Apply ka Undo, bills se purane rate, lagat hatao */
async function costingUndoPaint() {
  let u;
  try { u = await api("/admin/api/rates/costing/undo"); } catch (e) { return; }
  const b = $("cst-undo"), r = $("cst-restore");
  if (b) {
    b.hidden = !u.undo;
    if (u.undo) b.textContent = `↶ Undo last apply (${fmtDate(String(u.undo.at).slice(0, 10))})`;
  }
  // Snapshot nahi (pehle ka Apply) par lagat ka din hai: bills se purane rate
  if (r) r.hidden = !!u.undo || !u.applied_at;
}
async function costingUndo(btn) {
  if (!confirm("Put back the rates and costs from before the last Apply?")) return;
  await busy(btn, async () => {
    const r = await api("/admin/api/rates/costing/undo", { method: "POST", body: {} });
    toast(`Undone — ${r.restored} items back to their old rate and cost`);
    RM_RATES = await api("/admin/api/rates"); RATES = RM_RATES; renderRateMatrix();
    await costingLoad();
  });
}
async function costingRestore(btn) {
  let prev;
  try { prev = await api("/admin/api/rates/costing/restore-from-bills", { method: "POST", body: { dry_run: true } }); }
  catch (e) { toast(e.message, true); return; }
  if (!prev.changes.length) { toast("Every rate is already at (or below) what your bills before " + fmtDate(prev.before) + " used"); return; }
  openModal(`<h3>Put back ${prev.changes.length} old rate${prev.changes.length === 1 ? "" : "s"}?</h3>
    <p class="muted">The rate each item had on your last bill before ${esc(fmtDate(prev.before))}.</p>
    <div class="cst-raise-l">${prev.changes.map((ch) => `<div class="sumrow"><span>${esc(ch.label)}</span>
      <span><s class="muted">${money(ch.from)}</s> → <b>${money(ch.to)}</b></span></div>`).join("")}</div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn orange" id="cst-restore-go">Put back old rates</button></div>`);
  $("cst-restore-go").onclick = (e) => busy(e.target, async () => {
    const r = await api("/admin/api/rates/costing/restore-from-bills", { method: "POST", body: { dry_run: false, before: prev.before } });
    closeModal();
    toast(`${r.updated} rate${r.updated === 1 ? "" : "s"} back — bills work at these rates now`);
    RM_RATES = await api("/admin/api/rates"); RATES = RM_RATES; renderRateMatrix();
    await costingLoad();
  });
}
async function costingClear(btn) {
  if (!confirm("Clear every saved cost? The loss check stops until you Apply costs again. (You can Undo this.)")) return;
  await busy(btn, async () => {
    const r = await api("/admin/api/rates/costing/clear-costs", { method: "POST", body: {} });
    toast(`Saved costs cleared on ${r.cleared} items — billing has no loss check now`);
    RM_RATES = await api("/admin/api/rates"); RATES = RM_RATES;
    await costingLoad();
  });
}
async function costingLoad() {
  costingUndoPaint();
  const box = $("rate-costing"); if (!box) return;
  box.innerHTML = `<p class="muted">Calculating…</p>`;
  try { COSTING = await api(`/admin/api/rates/costing?${costingQuery()}`); }
  catch (e) { COSTING = null; box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  renderCosting();
}
function renderCosting() {
  const c = COSTING, box = $("rate-costing"); if (!c || !box) return;
  const pct = (v) => v == null ? "—" : v.toFixed(0) + "%";
  const cls = (v) => v == null ? "" : v < 15 ? "cst-bad" : v < c.target_margin_pct ? "cst-mid" : "cst-ok";
  const sum = `<div class="cst-sum">
    <span><small>Expenses (${c.period.month ? esc(fmtDate(c.period.from)) + " – " + esc(fmtDate(c.period.to)) : c.period.days + " days"})</small><b>${money(c.expenses_total)}</b>${c.expenses_recorded != null && Math.abs(c.expenses_recorded - c.expenses_total) >= 1 ? `<small>counted · ${money(c.expenses_recorded)} recorded</small>` : ""}</span>
    <span><small>Bills</small><b>${c.orders}</b></span>
    <span><small>Effort units billed</small><b>${c.weighted_units}</b></span>
    <span><small>Cost per unit</small><b>${c.unit_cost == null ? "—" : money(c.unit_cost)}</b></span></div>`;
  // AI ka note AI wale card mein dikhta hai, yahan dobara nahi
  const wl = (c.warnings || []).filter((w) => !(c.expense_ai && c.expense_ai.kinds && c.expense_ai.kinds.length && w === c.expense_ai.note));
  const stop = (c.raise_blockers || []).length ? [`Raise rates is off: ${c.raise_blockers.join(" ")}`] : [];
  const warn = wl.length + stop.length ? `<p class="muted" style="margin:6px 0">${wl.concat(stop).map((w) => "⚠️ " + esc(w)).join("<br>")}</p>` : "";
  // Kharche ke heads: jo is period mein nahi likha, wo laal — cost utni kam dikh rahi hai
  const chk = (c.expense_checklist || []).length ? `<div class="cst-chk" aria-label="Expense heads in this period">
    ${c.expense_checklist.map((h) => `<span class="${h.found ? "ok" : h.must ? "miss" : "none"}" title="${h.found ? money(h.amount) + " in this period" : "Not in Expenses this period"}">${h.found ? "✓" : "✗"} ${esc(h.head)}</span>`).join("")}
    <small class="muted">${c.applied_at ? `Costs last applied ${esc(fmtDate(c.applied_at))}.` : "Costs not applied yet."} Add missing heads in Expenses, then recalculate.</small></div>` : "";
  const rows = c.rows.map((r) => `<tr>
      <td>${esc(r.service)}</td><td>${esc(r.garment || (r.unit === "kg" ? "per kg" : ""))}</td>
      <td>${r.sold_qty ? r.sold_qty + (r.unit === "kg" ? " kg" : "") : ""}</td>
      <td><input inputmode="decimal" type="number" step="0.1" min="0.1" max="99" class="cst-w${r.weight_is_default ? " cst-def" : ""}" value="${r.weight_unit}"
        title="${r.weight_is_default ? "Suggested from the name — change it if this item takes more or less work" : "Your value"}"
        aria-label="${esc(r.service)} ${esc(r.garment)} effort units" onchange="costingWeight('${r.id}', this.value)">${
        r.measured_weight != null ? `<small class="cst-meas" title="From the scan station: minutes in Wash + Iron, relative to a shirt">scans say ${r.measured_weight} <i>(${r.measured_samples})</i>${Math.abs(r.measured_weight - r.weight_unit) >= 0.05 ? ` <a href="#" onclick="costingWeight('${r.id}', ${r.measured_weight});return false">use</a>` : ""}</small>` : ""}</td>
      <td>${money(r.rate)}</td>
      <td>${r.suggested_cost == null ? "—" : money(r.suggested_cost)}${r.cost_rate != null && r.cost_rate !== r.suggested_cost ? `<small class="muted"> (saved ${money(r.cost_rate)})</small>` : ""}</td>
      <td class="${cls(r.suggested_margin_pct)}">${pct(r.suggested_margin_pct)}</td>
      <td>${r.suggested_rate == null ? "—" : `<span class="${r.suggested_rate > r.rate + 0.5 ? "cst-up" : "cst-okr"}">${money(r.suggested_rate)}</span>`}</td>
      <td>${r.floor_rate == null ? "—" : r.rate < r.floor_rate ? `<span class="cst-bad" title="Selling below cost + minimum profit">${money(r.floor_rate)} · loss</span>` : money(r.floor_rate)}</td></tr>`).join("");
  // Kharcha kis service par lage: solvent sirf dry clean, detergent sirf wash. Default sab par.
  const svcOpts = (sel) => `<option value="">All services</option>` + (c.services || []).map((sv) => `<option value="${esc(sv)}" ${sel && sel.toLowerCase() === sv.toLowerCase() ? "selected" : ""}>${esc(sv)}</option>`).join("");
  const alloc = (c.expenses_by_category || []).length ? `<details class="cst-alloc"><summary>Which service does each expense belong to? <small class="muted">(${(c.expenses_by_category || []).filter((x) => x.service && x.service !== "all").length} assigned)</small></summary>
    <p class="muted" style="margin:6px 0">Most costs are shared by every service. Something spent on one service only (solvent for dry clean, starch for ironing) should be charged to that service alone — its items get dearer, the rest get cheaper.</p>
    <div class="cst-alloc-g">${c.expenses_by_category.map((x) => `<label><span>${esc(x.category)} <small class="muted">${money(x.amount)}</small></span>
      <select aria-label="Service for ${esc(x.category)}" data-change="costingAlloc" data-category="${esc(x.category)}">${svcOpts(x.service && x.service !== "all" ? x.service : "")}</select></label>`).join("")}</div>
    ${Object.values(c.unit_cost_by_service || {}).some((v) => c.unit_cost != null && Math.abs(v - c.unit_cost) >= 0.01) ? `<p class="muted" style="margin:6px 0 0">Cost per unit by service: ${Object.entries(c.unit_cost_by_service).map(([k, v]) => `${esc(k)} ${money(v)}`).join(" · ")}</p>` : ""}
  </details>` : "";
  box.innerHTML = sum + chk + warn + costingAIBox(c) + alloc + (c.rows.length
    ? `<table class="tbl keep" style="margin-top:8px"><thead><tr><th>Service</th><th>Item</th><th>Sold</th><th>Effort units</th><th>Selling</th><th>Cost</th><th>Profit</th><th title="Selling rate that leaves the target profit on this cost, rounded up to a clean number. Cost already includes rent, salary and other expenses.">Rate for ${Number(c.target_margin_pct).toFixed(0)}%</th><th title="Cost + minimum profit. Nobody can bill or set a rate below this.">Lowest rate</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="muted">No active rates yet.</p>`);
  if ($("cst-apply")) $("cst-apply").disabled = c.unit_cost == null;
  const mb = $("cst-measured");
  if (mb) { mb.hidden = !c.measured_items; mb.textContent = `📏 Use measured effort (${c.measured_items})`; }
  if ($("cst-target") && document.activeElement !== $("cst-target")) $("cst-target").value = Number(c.target_margin_pct).toFixed(0);
  if ($("cst-min") && document.activeElement !== $("cst-min") && c.min_margin_pct != null) $("cst-min").value = Number(c.min_margin_pct).toFixed(0);
  const up = c.rows.filter((r) => r.raise_to != null && r.sold_qty > 0 && r.raise_to > r.rate + 0.5).length;
  const held = (c.raise_blockers || []).length > 0;
  const rb = $("cst-raise");
  if (rb) { rb.hidden = !up || held; rb.textContent = `⬆ Raise ${up} rate${up === 1 ? "" : "s"} towards ${Number(c.target_margin_pct).toFixed(0)}%`; }
}
/* 🤖 AI ne har kism ka kharcha padha (expense_ai.py). Patti = gina gaya kharcha kis
   kaam mein; tiles = ek-baar ki kharid, ghar ka (bahar), har pickup ka kharcha;
   list mein owner kism badal sakta hai — owner ka hamesha upar. */
const CST_BK = {
  wash: { i: "🧴", c: "#0284c7" }, dryclean: { i: "🧪", c: "#7c3aed" }, iron: { i: "♨️", c: "#d97706" },
  delivery: { i: "🛵", c: "#16a34a" }, shared: { i: "🏠", c: "#64748b" }, one_time: { i: "🧾", c: "#e11d48" },
  exclude: { i: "🚫", c: "#9ca3af" },
};
function costingAIBox(c) {
  const x = c.expense_ai || {}, bl = x.buckets || {}, kinds = x.kinds || [];
  if (!kinds.length) return "";
  const bk = (b) => CST_BK[b] || { i: "•", c: "#94a3b8" };
  const nAI = kinds.filter((k) => k.by === "ai").length, nYou = kinds.filter((k) => k.by === "owner").length;
  const nLeft = kinds.length - nAI - nYou;
  const state = nLeft ? `<span class="cst-ai-pill warn">${nLeft} not sorted</span>` : `<span class="cst-ai-pill ok">✓ All sorted</span>`;
  const parts = Object.entries(x.by_bucket || {}), tot = parts.reduce((s, [, v]) => s + v, 0);
  const bar = tot > 0 ? `<div class="cst-ai-bar" role="img" aria-label="${esc(parts.map(([b, v]) => `${bl[b] || b} ${Math.round(v / tot * 100)}%`).join(", "))}">${
      parts.map(([b, v]) => `<i style="flex:${v};background:${bk(b).c}" title="${esc(bl[b] || b)}: ${money(v)}"></i>`).join("")}</div>
    <div class="cst-ai-legend">${parts.map(([b, v]) => `<span><i style="background:${bk(b).c}"></i>${esc(bl[b] || b)} <b>${money(v)}</b> <small>${Math.round(v / tot * 100)}%</small></span>`).join("")}</div>` : "";
  const tiles = [
    (x.one_time || []).length ? { t: "one_time", v: money(x.one_time_share), l: "One-time · this period",
      s: x.one_time.slice(0, 2).map((o) => `${esc(o.description || o.category)} ${money(o.amount)} → spread over 12 months`).join("<br>") } : null,
    x.excluded ? { t: "exclude", v: money(x.excluded), l: "Left out", s: "Not a shop expense — home, loan, transfers" } : null,
    x.delivery ? { t: "delivery", v: money(x.delivery.per_order), l: "Cost per pickup",
      s: `${money(x.delivery.amount)} over ${x.delivery.orders} pickup order${x.delivery.orders === 1 ? "" : "s"} — a lower pickup charge loses the difference` } : null,
  ].filter(Boolean);
  const tileHtml = tiles.length ? `<div class="cst-ai-tiles">${tiles.map((t) => `<div class="cst-ai-tile" style="--bk:${bk(t.t).c}">
    <span class="cst-ai-ic">${bk(t.t).i}</span><div><small>${t.l}</small><b>${t.v}</b><em>${t.s}</em></div></div>`).join("")}</div>` : "";
  const opts = (k) => (k.by === "owner" ? `<option value="">↺ Let AI decide</option>` : "")
    + Object.entries(bl).map(([b, label]) => `<option value="${b}" ${b === k.bucket ? "selected" : ""}>${bk(b).i} ${esc(label)}</option>`).join("");
  const who = (k) => k.by === "ai" ? `<span class="cst-ai-by">AI</span>${k.reason ? " " + esc(k.reason) : ""}`
    : k.by === "owner" ? `<span class="cst-ai-by you">You</span>` : "Not sorted yet — counted as shared";
  const row = (k) => `<div class="cst-ai-row${k.by ? "" : " unsorted"}">
    <span class="cst-ai-ic sm" style="--bk:${bk(k.bucket).c}">${bk(k.bucket).i}</span>
    <div class="cst-ai-txt"><b>${esc(k.description || k.category)}</b><small>${esc(k.category)}${k.count > 1 ? ` · ${k.count}×` : ""} · ${who(k)}</small></div>
    <span class="cst-ai-amt">${k.amount ? money(k.amount) : "—"}</span>
    <select class="cst-bk" data-key="${esc(k.key)}" aria-label="Kind of expense: ${esc(k.description || k.category)}" onchange="costingBucket(this)">${opts(k)}</select></div>`;
  const SHOW = 6;
  return `<section class="cst-ai-card" aria-label="AI expense sorting">
    <header><span class="cst-ai-ic lg">🤖</span><div><b>AI sorted your expenses</b><small>${nAI} by AI · ${nYou} by you — each kind lands only on the clothes that use it</small></div>${state}</header>
    ${x.note ? `<p class="cst-ai-warn">⚠️ ${esc(x.note)}</p>` : ""}
    ${bar}${tileHtml}
    <div class="cst-ai-list">${kinds.slice(0, SHOW).map(row).join("")}${kinds.length > SHOW
      ? `<details class="cst-ai-more"><summary>Show all ${kinds.length} kinds</summary>${kinds.slice(SHOW).map(row).join("")}</details>` : ""}</div>
    <p class="cst-ai-foot">Wrong kind? Pick the right one — your choice always wins. 🧴 washing material → washed clothes · 🧪 solvent → dry clean · 🛵 petrol → pickup orders · 🏠 rent &amp; salary → everything.</p>
  </section>`;
}
/* Target: har item ka "is cost par itna bechna chahiye" rate. Raise sirf bike hue
   items badhata hai, thoda-thoda — ghatana owner khud kare (competition, grahak), hisaab se nahi. */
async function costingTarget(value) {
  const v = parseFloat(value);
  if (!(v >= 0 && v <= 90)) { toast("Net profit target must be between 0 and 90%", true); return; }
  try { await api("/admin/api/rates/costing/target", { method: "PUT", body: { target_margin_pct: v } }); await costingLoad(); }
  catch (e) { toast(e.message, true); }
}
async function costingRaise(btn) {
  const period = costingPeriod();
  let prev;
  try { prev = await api("/admin/api/rates/costing/apply-rates", { method: "POST", body: { ...period, only_increase: true, dry_run: true } }); }
  catch (e) { toast(e.message, true); return; }
  if ((prev.blocked || []).length) { toast(prev.blocked.join(" "), true); return; }
  if (!prev.changes.length) { toast("Every rate already meets the target"); return; }
  openModal(`<h3>Raise ${prev.changes.length} rate${prev.changes.length === 1 ? "" : "s"} towards ${Number(prev.target_margin_pct).toFixed(0)}% profit?</h3>
    <div class="cst-raise-l">${prev.changes.map((ch) => `<div class="sumrow"><span>${esc(ch.label)}${ch.sold_qty ? ` <small class="muted">sold ${ch.sold_qty}</small>` : ""}</span>
      <span><s class="muted">${money(ch.from)}</s> → <b>${money(ch.to)}</b></span></div>`).join("")}</div>
    <p class="muted">Only items that sold, by at most ${Number(COSTING && COSTING.max_raise_pct || 15).toFixed(0)}% at a time. New bills use the new rates; old bills don't change. You can edit any cell in the matrix above afterwards.</p>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn orange" id="cst-raise-go">Raise rates</button></div>`);
  $("cst-raise-go").onclick = (e) => busy(e.target, async () => {
    const r = await api("/admin/api/rates/costing/apply-rates", { method: "POST", body: { ...period, only_increase: true } });
    closeModal();
    toast(`${r.updated} rate${r.updated === 1 ? "" : "s"} raised — new bills only`);
    RM_RATES = await api("/admin/api/rates"); RATES = RM_RATES;
    renderRateMatrix(); await costingLoad();
  });
}
/* Garment tags on hon to scan station har kapde ka Wash/Iron time deta hai —
   usse effort units napte hain, andaaza nahi (20+ kapde chahiye per item). */
async function costingBucket(sel) {
  try {
    await api("/admin/api/rates/costing/expense-bucket", { method: "PUT", body: { key: sel.dataset.key, bucket: sel.value || null } });
    toast(sel.value ? "Saved — costs recalculated" : "Back to AI's choice");
    await costingLoad();
  } catch (e) { toast(e.message, true); }
}
/* AI Costing page se seedha Settings → Pricing → Cost per garment */
function openGarmentCost() {
  go("settings"); stTab("pricing");
  setTimeout(() => { const el = $("rate-costing"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 200);
}
async function costingAlloc(category, service) {
  try {
    await api("/admin/api/rates/costing/allocation", { method: "PUT", body: { category, service: service || null } });
    toast(service ? `${category} → ${service} only` : `${category} → all services`);
    await costingLoad();
  } catch (e) { toast(e.message, true); }
}
async function costingUseMeasured(btn) {
  await busy(btn, async () => {
    const r = await api("/admin/api/rates/costing/use-measured", { method: "POST", body: {} });
    toast(r.updated ? `Effort units set from scans on ${r.updated} items` : "Nothing to change — measured values already in use");
    await costingLoad();
  });
}
async function costingWeight(id, value) {
  const v = parseFloat(value);
  if (!(v > 0)) { toast("Effort units must be more than 0", true); return; }
  try { await api(`/admin/api/rates/${id}`, { method: "PUT", body: { weight_unit: v } }); await costingLoad(); }
  catch (e) { toast(e.message, true); }
}
/* Loss ki rok: lagat + itna % se neeche koi daam / chhoot nahi (services/rate_floor.py) */
async function costingMinMargin(value) {
  const v = parseFloat(value);
  if (!(v >= 0 && v <= 90)) { toast("Minimum profit must be between 0 and 90%", true); return; }
  try { await api("/admin/api/rates/costing/min-margin", { method: "PUT", body: { min_margin_pct: v } }); await costingLoad(); }
  catch (e) { toast(e.message, true); }
}
/* Apply = (1) lagat har item par save, (2) suggested rate rate card par — preview
   ke baad. Pehle Apply sirf lagat likhta tha aur owner sochta rate card badal gaya
   (15 Nov 2026). Rate sirf badhte hain; ghatana owner matrix mein khud kare. */
async function costingApply(btn) {
  const period = costingPeriod();
  await busy(btn, async () => {
    const r = await api("/admin/api/rates/costing/apply", { method: "POST", body: period });
    if (!r.updated) throw new Error((r.warnings || [])[0] || "Nothing to apply yet");
    RM_RATES = await api("/admin/api/rates");
    const prev = await api("/admin/api/rates/costing/apply-rates", { method: "POST", body: { ...period, full: true, dry_run: true } });
    await costingLoad();
    if ((prev.blocked || []).length) {
      toast(`Costs saved on ${r.updated} items. Rates not changed: ${prev.blocked.join(" ")}`, true, 9000);
      return;
    }
    if (!prev.changes.length) { toast(`Costs saved on ${r.updated} items — every rate already meets ${Number(prev.target_margin_pct).toFixed(0)}% profit`); return; }
    openModal(`<h3>Put ${prev.changes.length} suggested rate${prev.changes.length === 1 ? "" : "s"} on the rate card?</h3>
      <p class="muted">Costs are saved. These rates give ${Number(prev.target_margin_pct).toFixed(0)}% net profit on today's cost (rent, salary and other expenses included).</p>
      <div class="cst-raise-l">${prev.changes.map((ch) => `<div class="sumrow"><span>${esc(ch.label)}${ch.sold_qty ? ` <small class="muted">sold ${ch.sold_qty}</small>` : ""}</span>
        <span><s class="muted">${money(ch.from)}</s> → <b>${money(ch.to)}</b></span></div>`).join("")}</div>
      <p class="muted">Only raises — lowering a rate stays your call in the rate matrix. New bills use the new rates; old bills don't change.</p>
      <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Not now</button><button class="btn orange" id="cst-apply-go">Update rate card</button></div>`);
    $("cst-apply-go").onclick = (e) => busy(e.target, async () => {
      const done = await api("/admin/api/rates/costing/apply-rates", { method: "POST", body: { ...period, full: true } });
      closeModal();
      toast(`Rate card updated — ${done.updated} rate${done.updated === 1 ? "" : "s"} (new bills only)`);
      RM_RATES = await api("/admin/api/rates"); RATES = RM_RATES;
      renderRateMatrix(); await costingLoad();
    });
  });
}
const ROLE_LABEL = {
  WASHER: "Washer", IRONER: "Ironing / Press", DELIVERY: "Delivery",
  // Senior aadmi ko sirf "Washer" likhna uske kaam ko chhota dikhata hai
  SUPERVISOR: "Washerman / Manager", MANAGER: "Manager", ADMIN: "Owner",
};

/** +918707093136 -> +91 87070 93136 (never wraps mid-number, see .ph) */
function fmtPhone(p) {
  const m = String(p || "").match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p || "";
}

/* Staff ke WhatsApp par AI kitna — server ka ai_mode (full / half / none) */
const STAFF_AI_MODES = {
  full: { label: "Full — sab kuch (AI zyada)", short: "Full",
    help: "Kaam ke commands + aam baat-cheet ka bhi AI jawab. Sabse zyada AI kharcha." },
  half: { label: "Half — sirf kaam", short: "Half",
    help: "Sirf kaam ke commands (status, delay, bill, task). Faltu baat par koi jawab nahi." },
  none: { label: "None — band", short: "OFF",
    help: "AI band: na automatic message, na auto assign, na unke message par AI. Message Inbox mein dikhega." },
};
const staffAiMode = (s) => s.ai_mode || (s.ai_agent_enabled ? "full" : "none");

function renderStaff() {
  if (!STAFF.length) {
    $("staff-list").innerHTML =
      `<div class="emptystate">No staff added yet. Add your first team member above.</div>`;
    return;
  }
  $("staff-list").innerHTML = `<div class="stafflist">` + STAFF.map((s) => `
    <div class="staffrow ${s.is_active ? "" : "off"}">
      <div class="who">
        <div class="nm">${esc(s.name)}</div>
        <div class="meta">
          <span class="ph">${fmtPhone(s.phone)}</span>
          <span class="badge role">${ROLE_LABEL[s.role] || esc(s.role)}</span>
          <span class="statuspill ${s.is_active ? "on" : "off"}">${s.is_active ? "Active" : "Inactive"}</span>
          ${s.is_default ? `<span class="badge">Default</span>` : ""}
          ${s.also_customer ? `<span class="badge warn" title="Yeh number customer list mein bhi hai. Is number se aane wale message STAFF ke maane jayenge — customer wala AI jawab nahi milega.">Customer bhi</span>` : ""}
          ${s.active_orders ? `<span class="badge">${s.active_orders} active order${s.active_orders > 1 ? "s" : ""}</span>` : ""}
        </div>
      </div>
      <div class="acts">
        ${SIGNED_IN_AS?.user?.role === "OWNER" && s.is_active && s.role !== "ADMIN" ? `<button class="btn sm" onclick="loginAsStaff('${s.id}')">Login as</button>` : ""}
        <button class="btn sm ghost" onclick="editStaffModal('${s.id}')">Edit</button>
        <details class="staff-more"><summary class="btn sm ghost">More</summary><div class="staff-menu">
          <button class="btn sm ghost" onclick="panelAccess('${s.id}')">${s.has_login ? "🔑 New password" : "🔑 Panel login"}</button>
          ${s.is_active
            ? `<button class="btn sm ghost" onclick="deactivateStaff('${s.id}')">Deactivate</button>`
            : `<button class="btn sm ghost" onclick="updStaff('${s.id}', {is_active: true})">Reactivate</button>`}
          <button class="btn sm danger" onclick="deleteStaffModal('${s.id}')">Delete</button>
        </div></details>
      </div>
      <div class="staff-ctl">
        <label class="ai-mode-pick" title="${esc(STAFF_AI_MODES[staffAiMode(s)].help)}">AI WhatsApp
          <select aria-label="AI WhatsApp for ${esc(s.name)}" onchange="updStaff('${s.id}', {ai_mode: this.value})">
            ${Object.entries(STAFF_AI_MODES).map(([v, m]) =>
              `<option value="${v}" ${staffAiMode(s) === v ? "selected" : ""}>${m.label}</option>`).join("")}
          </select></label>
        <label class="staff-auto"><input type="checkbox" ${s.agent_enabled !== false ? "checked" : ""} onchange="updStaff('${s.id}', {agent_enabled: this.checked})"> Auto assign</label>
      </div>
    </div>`).join("") + `</div>`;
}

function staffById(id) { return STAFF.find((s) => s.id === id); }

/* More menu bahar dabane par band */
document.addEventListener("click", (e) => {
  document.querySelectorAll(".staff-more[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

/* Staff ka app naye tab mein, uski jagah. Tab pehle kholna zaroori hai: await ke baad browser popup rok deta hai. */
async function loginAsStaff(id) {
  const tab = window.open("", "_blank");
  try {
    const r = await api(`/admin/api/staff/${id}/login-as`, { method: "POST" });
    if (tab) tab.location.href = r.url; else toast("Allow pop-ups for this site, then try again", true);
  } catch (e) { if (tab) tab.close(); toast(e.message, true); }
}

/* Staff ko /staff panel ka login dena.
 *
 * Password sirf EK BAAR dikhta hai — DB mein uska hash hi jata hai, isliye
 * baad mein "wo password kya tha" kahin se nikala nahi ja sakta. Bhool jaye
 * to yahi button dobara dabaiye, naya ban jayega (purane phone ke session
 * apne aap kat jate hain). */
function panelAccess(id) {
  const s = staffById(id);
  if (!s) return;
  // Owner ka apna row: koi role dropdown nahi. Wo koi "role" nahi hai, wo
  // maalik hai — aur is dropdown mein ADMIN hai hi nahi, isliye dikhane par
  // owner khud ko chup-chaap MANAGER bana baithta tha.
  const roleSel = s.role === "ADMIN" ? `
    <p class="muted" style="font-size:13px;margin:0 0 10px">
      This is the owner's own login. Their access stays as it is.</p>` : `
    <label>What will they do</label>
    <select id="pa-role">
      <option value="WASHER"${s.role === "WASHER" ? " selected" : ""}>Washerman — washing/pressing</option>
      <option value="IRONER"${s.role === "IRONER" ? " selected" : ""}>Ironing / Press — gets clothes after washing</option>
      <option value="DELIVERY"${s.role === "DELIVERY" ? " selected" : ""}>Delivery — pickup and delivery</option>
      <option value="SUPERVISOR"${s.role === "SUPERVISOR" ? " selected" : ""}>Washerman / Manager — works, and oversees everyone</option>
      <option value="MANAGER"${s.role === "MANAGER" ? " selected" : ""}>Manager — oversees only, does not work orders</option>
    </select>`;
  openModal(`
    <h3>Give ${esc(s.name)} a panel login</h3>
    <p class="muted" style="font-size:13px;margin:0 0 10px">
      They sign in at <b>${location.origin}/staff</b> with their own number and this
      password. It is shown once, and you can send it to them on WhatsApp.</p>
    ${roleSel}
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      ${s.has_login ? `<button class="btn danger" id="pa-revoke">Remove access</button>` : ""}
      <button class="btn" id="pa-go">${s.has_login ? "New password" : "Create login"}</button>
    </div>`);
  $("pa-go").onclick = (e) => busy(e.target, async () => {
    try {
      const sel = $("pa-role");
      const r = await api(`/admin/api/staff/${id}/access`, {
        method: "POST", body: sel ? { role: sel.value } : {},
      });
      // Local list ko TURANT sach bana do. Sirf loadSettings() par chhodne
      // se, agar refetch dhima ho, dobara khulne par wahi purana "Login
      // banayein" dikh jata tha — jaise login bana hi na ho.
      s.has_login = true;
      s.role = r.role;
      showPanelPassword(s, r);
      loadSettings();
    } catch (err) { toast(err.message, true, 9000); }
  });
  if (s.has_login) {
    $("pa-revoke").onclick = () => confirmDialog(
      `Remove ${s.name}'s panel access? All their logins stop immediately.`,
      async () => {
        try {
          const r = await api(`/admin/api/staff/${id}/access/revoke`, { method: "POST" });
          closeModal(); toast(`Access removed (${r.sessions_killed} login${r.sessions_killed === 1 ? "" : "s"} closed)`); loadSettings();
        } catch (err) { toast(err.message, true); }
      });
  }
}

/* Password ek hi baar dikhta hai, isliye yahin se bhej bhi dijiye.
 *
 * "Send on WhatsApp" server se jata hai — owner ka message app kholna,
 * password type karna, galat number chun lena, sab hat gaya. Password
 * server ko wapas jata hai kyunki DB mein sirf hash hai; server use hash
 * se milata hai, isliye ye endpoint "staff ko kuch bhi bhej do" nahi ban
 * sakta. Hamare apne message log mein password nahi likha jata.
 * Copy button rehta hai — kabhi WhatsApp na jaye to haath ka rasta. */
function showPanelPassword(s, r) {
  const name = s.name;
  const url = `${location.origin}/staff`;
  const msg = `${name}, your work panel: ${url}\nNumber: ${s.phone || "your WhatsApp number"}\nPassword: ${r.temp_password}\n(Log in and change the password the first time)`;
  openModal(`
    <h3>✅ ${esc(name)}'s login is ready</h3>
    <div class="dtl">
      <div class="dt-row"><span>Panel</span><b>${esc(url)}</b></div>
      <div class="dt-row"><span>Role</span><b>${esc(r.role)}</b></div>
      <div class="dt-row"><span>Password</span><b style="font-size:1.1rem">${esc(r.temp_password)}</b></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">
      This password is shown only once — send it now. They will set their own
      on first login.</p>
    <div class="btnrow">
      <button class="btn ghost" id="pw-copy">📋 Copy</button>
      <button class="btn" id="pw-share">📤 Send on WhatsApp</button>
    </div>
    <div class="btnrow" style="margin-top:6px">
      <button class="btn ghost" onclick="closeModal()">Done</button>
    </div>`);
  $("pw-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(msg); toast("Copied — paste it in WhatsApp"); }
    catch (e) { toast("Could not copy — write the password down", true); }
  };
  // busy() apna purana label wapas laga deta hai, isliye yahan haath se —
  // bhej dene ke baad button ko jawab hi bane rehna chahiye.
  $("pw-share").onclick = async (e) => {
    const btn = e.currentTarget;
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      const out = await api(`/admin/api/staff/${s.id}/access/share`, {
        method: "POST", body: { password: r.temp_password },
      });
      btn.innerHTML = `✅ Sent to ${esc(fmtPhone(out.to))}`;
      toast(`Login sent to ${s.name} on WhatsApp`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = old;
      toast(err.message, true, 9000);
    }
  };
}

async function updStaff(id, body) {
  try { await api(`/admin/api/staff/${id}`, { method: "PUT", body }); toast(T.saved); loadSettings(); }
  catch (e) { toast(e.message, true); }
}

// Staff edit ka poora dropdown — pehle sirf Washer/Delivery tha, aur
// Supervisor/Manager ko edit karke save karte hi wo Washer ban jaata tha
const EDIT_ROLES = [
  ["WASHER", "Washerman — washing &amp; ironing"],
  ["IRONER", "Ironing / Press — gets clothes after washing"],
  ["DELIVERY", "Delivery — pickup and delivery"],
  ["SUPERVISOR", "Washerman / Manager — works, and oversees everyone"],
  ["MANAGER", "Manager — oversees only"],
];
function editStaffModal(id) {
  const s = staffById(id);
  if (!s) return;
  const digits = String(s.phone || "").replace(/^\+91/, "");
  openModal(`<h3>Edit ${esc(s.name)}</h3>
    <div class="frm">
      <div class="setfield"><label for="es-name">Name</label>
        <input id="es-name" value="${esc(s.name)}">
        <small class="fielderr" id="es-name-err"></small></div>
      <div class="setfield"><label for="es-phone">Phone</label>
        <input id="es-phone" inputmode="numeric" value="${esc(digits)}">
        <small class="fielderr" id="es-phone-err"></small></div>
      ${s.role === "ADMIN" ? `<div class="setfield"><label>Role</label>
        <p class="muted" style="margin:0">Owner — full access (does not change here)</p></div>` : `
      <div class="setfield"><label for="es-role">Role</label>
        <select id="es-role">
          ${EDIT_ROLES.map(([v, label]) => `<option value="${v}" ${s.role === v ? "selected" : ""}>${label}</option>`).join("")}
        </select></div>`}
    </div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="es-save">Save changes</button>
    </div>`);
  $("es-save").onclick = (e) => busy(e.target, async () => {
    const name = $("es-name").value.trim();
    const phone = $("es-phone").value.replace(/\D/g, "");
    $("es-name-err").textContent = ""; $("es-phone-err").textContent = "";
    let bad = false;
    if (name.length < 2) { $("es-name-err").textContent = "Name must be at least 2 characters."; bad = true; }
    if (phone.length !== 10) { $("es-phone-err").textContent = "Phone must be exactly 10 digits."; bad = true; }
    if (bad) return;
    // Owner ka darja yahan se kabhi nahi badalta — role bhejte hi nahi
    const body = { name, phone };
    if ($("es-role")) body.role = $("es-role").value;
    const res = await api(`/admin/api/staff/${id}`, { method: "PUT", body });
    closeModal();
    // save ke turant baad batao ki agent ab kya karega — aur agar wo number
    // customer ka bhi hai to chetavni, jo chhupani nahi chahiye
    toast((res && res.ready) || "Staff updated", false, 7000);
    if (res && res.warning) toast(res.warning, true, 12000);
    loadSettings();
  });
}

function deactivateStaff(id) {
  const s = staffById(id);
  if (!s) return;
  confirmDialog(
    `Deactivate ${s.name}? They'll stop receiving order assignments. You can reactivate them later.`,
    async () => {
      try { await api(`/admin/api/staff/${id}`, { method: "DELETE" }); toast(`${s.name} deactivated`); loadSettings(); }
      catch (e) { toast(e.message, true); }
    });
}

function deleteStaffModal(id) {
  const s = staffById(id);
  if (!s) return;
  // Blocked cases are explained up front — deactivate stays available.
  const blocker = s.active_orders
    ? `${esc(s.name)} is assigned to ${s.active_orders} active order${s.active_orders > 1 ? "s" : ""}. Reassign or complete those orders first.`
    : s.is_default
      ? `${esc(s.name)} is set as the default washer or delivery person. Pick someone else in Daily operations first.`
      : "";
  if (blocker) {
    openModal(`<h3>Can't delete ${esc(s.name)}</h3>
      <p class="muted">${blocker}</p>
      <div class="btnrow">
        <button class="btn ghost" onclick="closeModal()">Close</button>
        ${s.is_active ? `<button class="btn" onclick="closeModal();deactivateStaff('${id}')">Deactivate instead</button>` : ""}
      </div>`);
    return;
  }
  openModal(`<h3>Delete ${esc(s.name)}</h3>
    <p class="muted">This removes them and their chat history for good. Type <b>${esc(s.name)}</b> to confirm.</p>
    <div class="frm">
      <div class="setfield">
        <input id="ds-confirm" placeholder="${esc(s.name)}" autofocus>
        <small class="fielderr" id="ds-err"></small>
      </div>
    </div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn danger" id="ds-go">Delete staff</button>
    </div>`);
  $("ds-go").onclick = (e) => busy(e.target, async () => {
    if ($("ds-confirm").value.trim() !== s.name) {
      $("ds-err").textContent = `Type the name exactly: ${s.name}`;
      return;
    }
    await api(`/admin/api/staff/${id}/permanent`, { method: "DELETE" });
    closeModal(); toast(`${s.name} deleted`); loadSettings();
  });
}

async function addStaff(btn) {
  await busy(btn, async () => {
    const name = $("sf-name").value.trim();
    const phone = $("sf-phone").value.replace(/\D/g, "");
    $("sf-name-err").textContent = ""; $("sf-phone-err").textContent = "";
    let bad = false;
    if (name.length < 2) { $("sf-name-err").textContent = "Name must be at least 2 characters."; bad = true; }
    if (phone.length !== 10) {
      $("sf-phone-err").textContent = "Phone must be exactly 10 digits.";
      bad = true;
    } else if (STAFF.some((s) => s.phone.replace(/^\+91/, "") === phone)) {
      $("sf-phone-err").textContent = "This number is already a staff member.";
      bad = true;
    }
    if (bad) return;
    const res = await api("/admin/api/staff", { method: "POST", body: { name, phone, role: $("sf-role").value } });
    toast((res && res.ready) || `${name} added`, false, 7000);
    if (res && res.warning) toast(res.warning, true, 12000);
    $("sf-name").value = ""; $("sf-phone").value = "";
    loadSettings();
  });
}

/* Instagram: say plainly whether it's actually connected. */
function igState(linked) {
  const el = $("ig-status");
  if (!el) return;
  el.className = "connstate" + (linked ? " on" : "");
  el.innerHTML = linked
    ? `<span class="dot"></span>Instagram connected`
    : "Instagram not connected — daily posters will only be sent to you on WhatsApp.";
}
async function saveOps(btn) {
  await busy(btn, async () => {
    const pairs = [
      ["standup_hour", parseInt($("set-standup").value)],
      ["turnaround_days", parseInt($("set-turnaround").value)],
      ["default_washer_phone", $("set-washer").value],
      ["staff_show_route", $("set-route").value === "true"],
      ["agent_auto_assign", $("set-autoassign").value === "true"],
      ["staff_points_good", Math.max(0, Math.min(100, parseInt($("set-pts-good").value, 10) || 0))],
      ["staff_points_mid", Math.max(0, Math.min(100, parseInt($("set-pts-mid").value, 10) || 0))],
      ["staff_reward_enabled", $("set-reward").value === "true"],
      ["staff_reward_note", $("set-reward-note").value.trim().slice(0, 150)],
      ["rating_show_staff_names", $("set-staffnames").value === "true"],
      ["staff_nudges_enabled", $("set-nudges").value === "true"],
      ["staff_nudge_hours", [...new Set($("set-nudge-hours").value.split(/[,\s]+/)
        .map((h) => parseInt(h, 10)).filter((h) => h >= 0 && h <= 23))].sort((a, b) => a - b)],
      ["stage_limit_hours", Object.fromEntries(STAGE_LIMIT_KEYS.map(([k]) =>
        [k, Math.max(1, Math.min(720, parseInt($(`sl-${k}`).value, 10) || 24))]))],
      ["urgent_charge_type", $("set-urg-type").value],
      ["urgent_charge_value", Math.max(0, parseFloat($("set-urg-value").value) || 0)],
      ["urgent_delivery_days", Math.max(0, Math.min(14, parseInt($("set-urg-days").value) || 0))],
      ["marketing_freq_cap_per_month", parseInt($("set-freqcap").value)],
      ["marketing_monthly_msg_budget", parseInt($("set-budget").value)],
      ["marketing_autonomy", $("set-autonomy").value],
      ["social_daily_enabled", $("set-social").value === "true"],
      ["social_post_hour", parseInt($("set-socialhour").value) || 11],
    ];
    for (const [key, value] of pairs) await api("/admin/api/settings", { method: "PUT", body: { key, value } });
    toast("Settings saved — live immediately");
  });
}
async function saveAiBudget(btn) {
  await busy(btn, async () => {
    const value = Math.max(0, parseFloat($("set-ai-budget").value) || 0);
    await api("/admin/api/settings", { method: "PUT", body: { key: "llm_monthly_budget_usd", value } });
    toast("AI budget saved — budget checks use this value");
    await loadUsage();
  });
}
async function testStandup(btn) {
  await busy(btn, async () => {
    const r = await api("/admin/api/jobs/standup", { method: "POST" });
    toast(`Standup sent to ${r.sent_to} staff member(s)`);
  });
}

/* ============================= message formats ============================= */
let MSG_FORMATS = [];
function paintCustomerLang(lang) {
  document.querySelectorAll(".lang-pick [data-lang]").forEach((b) => {
    const on = b.dataset.lang === lang;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
}
async function setCustomerLang(lang, btn) {
  await busy(btn, async () => {
    await api("/admin/api/settings", { method: "PUT", body: { key: "customer_language", value: lang } });
    if (SETTINGS_CACHE) SETTINGS_CACHE.customer_language = lang;
    paintCustomerLang(lang);
    toast(lang === "hi" ? "Customers will now get Hinglish messages" : "Customers will now get English messages");
    mfLoad();   // the editor shows the new language's default text
  });
}

async function mfLoad() {
  try {
    const s = (SETTINGS_CACHE && "customer_language" in SETTINGS_CACHE) ? SETTINGS_CACHE : await api("/admin/api/settings");
    paintCustomerLang((s && s.customer_language) || "en");
  } catch (e) { /* the picker just stays unselected */ }
  try {
    MSG_FORMATS = await api("/admin/api/message-formats");
    $("mf-key").innerHTML = MSG_FORMATS.map((m, i) =>
      `<option value="${i}">${m.overridden ? "✏️ " : ""}${esc(m.label)}</option>`).join("");
    mfPick();
  } catch (e) { toast(e.message, true); }
}
function mfPick() {
  const m = MSG_FORMATS[parseInt($("mf-key").value) || 0];
  if (!m) return;
  $("mf-text").value = m.current;
  $("mf-ph").textContent = "Placeholders: " + m.placeholders.map((p) => `{${p}}`).join("  ");
  $("mf-flag").innerHTML = m.overridden ? '<span class="tag">customised</span>' : '<span class="tag">default</span>';
}
async function mfSave(btn) {
  const m = MSG_FORMATS[parseInt($("mf-key").value) || 0];
  await busy(btn, async () => {
    await api("/admin/api/message-formats", { method: "PUT", body: { key: m.key, text: $("mf-text").value } });
    toast("Saved — live immediately"); mfLoad();
  });
}
async function mfReset(btn) {
  const m = MSG_FORMATS[parseInt($("mf-key").value) || 0];
  await busy(btn, async () => {
    await api("/admin/api/message-formats", { method: "PUT", body: { key: m.key, text: "" } });
    toast("Back to default"); mfLoad();
  });
}

/* ============================= inbox ============================= */
let THREADS = [], OPEN_PHONE = null, OPEN_THREAD = null, inboxTimer = null;
let LAST_HEAD_SIG = "", LAST_CHAT_PHONE = null, LAST_CHAT_HTML = "";
const EMOJIS = ["😀","😄","😊","🙏","👍","👌","✅","❤️","🎉","😅","😂","🤝","🧺","👔","🧼","⏰","📅","💰","🛵","⚠️","❓","🌟"];
/* The list is PAGED: 50 at a time as you scroll. A shop with 500+ imported
   contacts must open as fast as one with five. Search runs on the server so
   it reaches every contact, including ones who never messaged. */
const TH_PAGE = 50;
let TH_QUERY = "", TH_MORE = false, TH_TOTAL = 0, TH_LOADING = false;
let TH_FILTER = "all";
let CHAT_SEARCH_OPEN = false;
let REACTIONS_BY_WAMID = {};

async function fetchThreads(offset = 0) {
  const p = new URLSearchParams({ limit: TH_PAGE, offset, q: TH_QUERY });
  return api(`/admin/api/inbox/threads?${p}`);
}
async function loadThreads() {
  try {
    // the 12s auto-refresh must not yank a scrolled list back to page one
    const keep = TH_FILTER === "unread" ? 500 : Math.max(TH_PAGE, THREADS.length || 0);
    const r = await api(`/admin/api/inbox/threads?${new URLSearchParams(
      { limit: Math.min(keep, 500), offset: 0, q: TH_QUERY })}`);
    THREADS = r.threads; TH_MORE = r.has_more; TH_TOTAL = r.total;
  } catch (e) { $("th-list").innerHTML = errBox(e.message, "loadThreads"); return; }
  loadTplPreview();  // fire-and-forget: makes template bubbles readable
  renderThreads(); updateUnreadBadge();
  if (OPEN_PHONE) openThread(OPEN_PHONE, true, false);
  clearTimeout(inboxTimer);
  if (CURRENT === "inbox" && !document.hidden) inboxTimer = setTimeout(loadThreads, 12000);
}
/* Screen band / doosra app khula = polling band. Wapas aate hi taaza list.
   Phone ki battery aur data dono bachte hain, aur wapas aane par 12s ka
   intezaar nahi karna padta. */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { clearTimeout(inboxTimer); return; }
  if (CURRENT === "inbox") loadThreads();
});
async function loadMoreThreads() {
  if (!TH_MORE || TH_LOADING) return;
  TH_LOADING = true;
  try {
    const r = await fetchThreads(THREADS.length);
    THREADS = THREADS.concat(r.threads);
    TH_MORE = r.has_more; TH_TOTAL = r.total;
    renderThreads();
  } catch (e) { toast(e.message, true); }
  finally { TH_LOADING = false; }
}
/* server-side search, debounced — typing must not fire a query per keystroke */
let _thSearchTimer = null;
function threadSearch(value) {
  clearTimeout(_thSearchTimer);
  _thSearchTimer = setTimeout(() => {
    TH_QUERY = (value || "").trim();
    loadThreads();
  }, 300);
}
function onThreadScroll(el) {
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 220) loadMoreThreads();
}
const avatar = (n) => `<div class="avatar">${esc((n || "?").trim()[0] || "?").toUpperCase()}</div>`;
/* Read-marker keys. Pehle "kk_seen_+919876543210" — yani customer ke
   NUMBER localStorage mein plain pade rehte the (device chori/shared PC =
   PII leak). Ab sirf ek non-reversible short hash. Purane plaintext keys
   pehli load par saaf ho jaate hain. */
const hashPhone = (p) => {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = ((h * 33) ^ p.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const seenKey = (p) => "kk_seen_" + hashPhone(String(p || ""));
(function purgeLegacySeenKeys() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("kk_seen_") && /[+0-9]{6,}/.test(k)) localStorage.removeItem(k);
    }
  } catch (e) {}
})();
const isUnread = (t) =>
  t.last_direction === "INBOUND" && t.last_at > (localStorage.getItem(seenKey(t.phone)) || "");
function updateUnreadBadge() {
  const n = THREADS.filter(isUnread).length;
  const b = $("unread-badge");
  if (b) { b.textContent = n; b.classList.toggle("show", n > 0); }
}
/* Phone ka asli jank yahi tha: har 12s poori list ka innerHTML replace —
   scroll upar kood jaata tha aur ungli ke neeche ka DOM gayab ho jaata tha.
   Ab: kuch badla hi nahi to DOM ko chhoo bhi nahi; badla to scroll wapas
   wahi rakho jahan tha. */
let LAST_TH_HTML = "";
function setThreadFilter(filter) {
  TH_FILTER = ["all", "unread", "customers", "staff"].includes(filter) ? filter : "all";
  document.querySelectorAll("[data-th-filter]").forEach((b) => {
    const active = b.dataset.thFilter === TH_FILTER;
    b.classList.toggle("on", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  LAST_TH_HTML = "";
  if (TH_FILTER === "unread") { loadThreads(); return; }
  renderThreads();
}
function renderThreads() {
  const rows = THREADS.filter((t) => {
    if (TH_FILTER === "unread") return isUnread(t);
    if (TH_FILTER === "customers") return t.kind === "customer";
    if (TH_FILTER === "staff") return t.kind === "staff" || t.kind === "admin";
    return true;
  });
  const items = rows.map((t) => {
    const chip = t.kind === "staff" ? '<span class="staff-chip">staff</span>' : t.kind === "admin" ? '<span class="staff-chip">👑 you</span>' : "";
    const preview = t.no_messages
      ? `<span class="pv-none">No messages yet — tap to start</span>`
      : `${isUnread(t) ? '<b style="color:#00A884">● </b>' : ""}${
          t.last_direction === "OUTBOUND" ? "✓✓ " : ""}${esc(previewText(t.last_text))}`;
    return `<div class="thread-item ${t.phone === OPEN_PHONE ? "on" : ""}"
      onclick="openThread('${t.phone}')" ontouchstart="thTouchStart(event,'${t.phone}')" ontouchend="thTouchEnd(event,'${t.phone}')">
      <div style="display:flex;gap:10px;align-items:center">
        ${avatar(displayName(t.name, t.phone))}
        <div style="flex:1;min-width:0">
          <div class="nm"><span>${esc(displayName(t.name, t.phone))}${chip}</span><span class="t">${fmtWhen(t.last_at)}</span></div>
          <div class="pv">${preview}</div>
        </div>
      </div></div>`;
  }).join("");
  const footer = TH_MORE
    ? `<div class="th-more" onclick="loadMoreThreads()">⬇ Show more (${THREADS.length}/${TH_TOTAL})</div>`
    : rows.length
      ? `<div class="th-end">${rows.length} ${TH_QUERY ? "found" : "loaded chats"}</div>`
      : "";
  const html = (items || `<div class="thread-item">${
    TH_QUERY ? "No matches" : T.noData}</div>`) + footer;
  if (html === LAST_TH_HTML) return;          // data wahi ka wahi — repaint kyun?
  const el = $("th-list");
  const keep = el.scrollTop;
  el.innerHTML = html;
  el.scrollTop = keep;                        // scroll jahan tha wahin rahe
  LAST_TH_HTML = html;
}

/* swipe (left = mark read, right = agent toggle) + long-press menu fallback */
let _thTouch = null, _thTimer = null;
function thTouchStart(e, phone) {
  _thTouch = { x: e.touches[0].clientX, t: Date.now(), phone };
  clearTimeout(_thTimer);
  _thTimer = setTimeout(() => { _thTouch = null; threadMenu(phone); }, 550);
}
function thTouchEnd(e, phone) {
  clearTimeout(_thTimer);
  if (!_thTouch || _thTouch.phone !== phone) return;
  const dx = e.changedTouches[0].clientX - _thTouch.x;
  _thTouch = null;
  if (dx < -60) { markRead(phone); e.preventDefault(); }
  else if (dx > 60) { OPEN_PHONE = phone; toggleAgentPause(); e.preventDefault(); }
}
function markRead(phone) {
  localStorage.setItem(seenKey(phone), new Date().toISOString());
  renderThreads(); updateUnreadBadge(); toast("Marked read");
}

async function deleteThread(phone) {
  const t = THREADS.find((x) => x.phone === phone) || {};
  const name = displayName(t.name, phone);
  openModal(`<h3>🗑️ Delete chat?</h3>
    <p class="muted">This permanently removes the WhatsApp conversation history for <b>${esc(name)}</b>. Customer/staff profile, orders and payments stay.</p>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn danger" id="delete-chat-go">Delete chat</button></div>`);
  $("delete-chat-go").onclick = (e) => busy(e.target, async () => {
    await api(`/admin/api/inbox/thread?phone=${encodeURIComponent(phone)}`, { method: "DELETE" });
    closeModal();
    sessionStorage.removeItem("kk_thread_" + phone);
    localStorage.removeItem(seenKey(phone));
    if (OPEN_PHONE === phone) {
      OPEN_PHONE = null; OPEN_THREAD = null; LAST_CHAT_PHONE = null; LAST_CHAT_HTML = "";
      LAST_HEAD_SIG = ""; $("chat-head").innerHTML = '<span class="muted">Pick a conversation on the left…</span>';
      $("chat-log").innerHTML = emptyBox("Chat appears here", "💬");
      closeThreadMobile(false);
      if (location.hash.startsWith("#inbox/")) history.replaceState(null, "", "#inbox");
    }
    LAST_TH_HTML = "";
    await loadThreads();
    updateUnreadBadge();
    toast("Chat deleted");
  });
}
function threadMenu(phone) {
  const t = THREADS.find((x) => x.phone === phone) || {};
  openModal(`<h3>${esc(displayName(t.name, phone))}</h3>
    <div class="frm">
      <button class="btn" onclick="closeModal();openThread('${phone}')">💬 Open chat</button>
      <button class="btn ghost" onclick="closeModal();markRead('${phone}')">✓ Mark read</button>
      <button class="btn ghost danger" onclick="closeModal();deleteThread('${phone}')">🗑️ Delete chat</button>
      ${t.kind === "customer" ? `<button class="btn ghost" onclick="closeModal();OPEN_PHONE='${phone}';toggleAgentPause()">🤖 Agent on/off (take over)</button>` : ""}
    </div>`);
}

const svgIcon = (id) => `<svg class="ic" aria-hidden="true"><use href="/admin/static/icons.svg?v=ui2#${id}"/></svg>`;

function closeThreadMobile(push = true) {
  // Responsive inbox reset: both panes return on desktop/tablet after resize.
  document.body.classList.remove("chat-open");
  const pane = document.querySelector(".chatpane");
  if (pane) pane.removeAttribute("style");
  // Phone par chat band = sach mein band. OPEN_PHONE saaf kiye bina 12s ka
  // refresh (loadThreads -> openThread) wahi chat dobara khol deta tha —
  // back button ka koi matlab hi nahi rehta tha.
  if (window.innerWidth <= 768 && OPEN_PHONE) {
    OPEN_PHONE = null;
    if (THREADS.length) renderThreads();   // list ki active highlight bhi hatao
  }
  if (push && location.hash.startsWith("#inbox/")) {
    NAVIGATING = true; location.hash = "inbox"; setTimeout(() => (NAVIGATING = false), 0);
  }
}
function scrollChatBottom() {
  const log = $("chat-log");
  log.scrollTop = log.scrollHeight;
  $("newmsg-pill").classList.remove("show");
}

/* Responsive inbox: resize between mobile and tablet/desktop must never leave
   the full-screen chat overlay active after its mobile breakpoint disappears. */
let _inboxWasMobile = window.matchMedia("(max-width: 768px)").matches;
window.addEventListener("resize", () => {
  const mobileNow = window.matchMedia("(max-width: 768px)").matches;
  if (_inboxWasMobile && !mobileNow && document.body.classList.contains("chat-open")) {
    closeThreadMobile(false);
  }
  _inboxWasMobile = mobileNow;
});

/* One chat bubble — shared by the full render and the optimistic append on
   send, so a sent message can appear instantly without rebuilding the whole
   log (the old openThread() innerHTML rebuild was the freeze on send). */
/* WhatsApp jaisa formatting: *bold*, _italic_, ~strike~ (escape ke BAAD, aur
   sirf shabd ki seema par — link ke beech ka "_" italic na bane). */
function waFormat(html) {
  const edge = "(^|[\\s(])";
  return html
    .replace(new RegExp(edge + "\\*([^*\\n]+?)\\*(?=[\\s.,!?)]|$)", "gm"), "$1<b>$2</b>")
    .replace(new RegExp(edge + "_([^_\\n]+?)_(?=[\\s.,!?)]|$)", "gm"), "$1<i>$2</i>")
    .replace(new RegExp(edge + "~([^~\\n]+?)~(?=[\\s.,!?)]|$)", "gm"), "$1<s>$2</s>");
}
function oneBubble(m, threadName) {
  let body = waFormat(esc(m.text || ""));
  const raw = m.text || "";
  const img = raw.match(/^\[image:(\/admin\/media\/[\w.\-]+)\]\s*(.*)$/s);
  const tpl = raw.match(/^\[template:([\w]+)\]\s*(.*)$/s);
  const btn = raw.match(/^\[button:([^\]]+)\]\s*(.*)$/s);
  const med = raw.match(/^\[(audio|voice|video|document)\:(\/admin\/media\/[\w.\-]+)\]\s*(.*)$/s);
  const loc = raw.match(/^\[location:([-\d.]+),([-\d.]+)\]\s*(.*)$/s);
  if (img) {
    // Purani photo server se hat chuki ho (media_retention) to tooti image nahi, saaf likha
    body = `<img src="${mediaUrl(img[1])}" loading="lazy" width="280" height="210" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'muted',textContent:'🖼 Photo removed from server (old)'}))">${esc(img[2] || "")}`;
  } else if (med) {
    const url = mediaUrl(med[2]);
    const label = esc(med[3] || "");
    if (med[1] === "audio" || med[1] === "voice") {
      // WhatsApp ki voice note Ogg/Opus hoti hai — Safari aur iPhone use
      // baja hi nahi sakte, wahan player khali dabba dikhta tha. Isliye
      // saath mein hamesha ek link, jo har jagah kaam karta hai. Aur jab
      // awaaz ke shabd nikle hi na ho, wo bhi saaf likh dete hain — warna
      // owner ko lagta hai ki message khali aaya.
      body = `<audio controls preload="none" src="${url}" style="max-width:250px"></audio>`
        + `<a class="filechip" href="${url}" target="_blank" rel="noopener">🎧 Voice note kholein</a>`
        + (label ? `<div class="vtext">${label}</div>`
                 : `<div class="vtext muted">(awaaz ke shabd nahi mile)</div>`);
    } else if (med[1] === "video") {
      body = `<video controls preload="metadata" src="${url}" width="260" style="border-radius:8px"></video>${label}`;
    } else {
      body = `<a class="filechip" href="${url}" target="_blank" rel="noopener">📄 ${label || "Open file"}</a>`;
    }
  } else if (loc) {
    body = `<a class="filechip" target="_blank" rel="noopener"
      href="https://www.google.com/maps/search/?api=1&query=${loc[1]},${loc[2]}">📍 ${esc(loc[3] || "Location")}</a>`;
  } else if (tpl) {
    const t = TPL_PREVIEW[tpl[1]];
    const params = (tpl[2] || "").split(" | ").filter((p) => p !== "");
    let shown = tpl[2] || "";
    if (t && t.body) {
      shown = params.length
        ? t.body.replace(/\{\{(\d+)\}\}/g, (m0, n) => params[n - 1] ?? m0)
        : t.body;
    }
    // NOTE: keep this markup on ONE line — the bubble is pre-wrap, a newline
    // in the source rendered as a real blank line under every template.
    const btns = (t && t.buttons || []).filter(Boolean)
      .map((b) => `<div class="tplbtn">${esc(b)}</div>`).join("");
    body = `<div class="tplmsg"><span class="tpltxt">${esc(tidy(shown) || tpl[1])}</span><div class="tplname">📑 ${esc(tpl[1])}</div>${btns}</div>`;
  } else if (btn) {
    body = `<span class="tapped">👆 ${esc(btn[1])}</span>`;
  } else {
    // Bheje gaye message ka log "…text [buttons: A, B, C]" hota hai. Wo
    // kachra text ki tarah dikh raha tha — button WhatsApp par dabta hai,
    // yahan sirf ye dikhna chahiye ki kaunse option bheje the.
    const withBtns = (m.text || "").match(/^([\s\S]*?)\s*\[(buttons|list): ([^\]]+)\]\s*$/);
    if (withBtns) {
      const chips = withBtns[3].split(",").map((b) => b.trim()).filter(Boolean)
        .map((b) => `<div class="tplbtn">${esc(b)}</div>`).join("");
      body = `${esc(tidy(withBtns[1]))}<div class="sentbtns">${chips}</div>`;
    } else {
      body = esc(tidy(m.text || ""));
    }
  }
  const quoted = m.reply_to && BY_WAMID[m.reply_to];
  const quote = quoted
    ? `<div class="quoted"><span>${quoted.direction === "INBOUND" ? esc(threadName) : "You"}</span>${esc(oneLine(quoted.text)).slice(0, 90)}</div>`
    : "";
  const meta = `<span class="bt">${fmtClock(m.at)}${
    m.direction === "OUTBOUND" ? " · " + esc(m.sent_by || "bot") + ticks(m.status) : ""
  }</span>`;
  const reaction = m.wamid && REACTIONS_BY_WAMID[m.wamid]
    ? `<button class="reaction-chip" title="Change reaction" onclick="openReactionPicker('${m.wamid}')">${esc(REACTIONS_BY_WAMID[m.wamid])}</button>`
    : "";
  const actions = m.wamid
    ? `<div class="bubble-actions">
        <button class="breply" title="Reply to message" aria-label="Reply to message" onclick="replyTo('${m.wamid}')">↩</button>
        <button class="breact" title="React to message" aria-label="React to message" onclick="openReactionPicker('${m.wamid}')">☺</button>
      </div>`
    : "";
  return `<div class="bubble ${m.direction === "INBOUND" ? "in" : "out"}">${quote}${body}${meta}${actions}${reaction}</div>`;
}

/* Optimistic append: drop ONE outbound bubble into the open log and scroll,
   instead of re-fetching + rebuilding the whole thread. The 12s poll later
   replaces the log with server truth (real wamid, delivery ticks), which
   reconciles this bubble — no duplicate, because that is a full replace.
   `bodyHtml` overrides the parsed body (used for a local image preview). */
function appendBubble(m, bodyHtml) {
  const log = $("chat-log");
  if (!log || OPEN_PHONE == null) return;
  if (log.querySelector(".empty")) log.innerHTML = "";   // was the empty state
  let html;
  if (bodyHtml != null) {
    const meta = `<span class="bt">${fmtClock(m.at)} · you <span class="tick">✓</span></span>`;
    html = `<div class="bubble out">${bodyHtml}${meta}</div>`;
  } else {
    html = oneBubble(m, OPEN_THREAD && OPEN_THREAD.name);
    if (m.wamid) BY_WAMID[m.wamid] = m;
  }
  log.insertAdjacentHTML("beforeend", html);
  // keep the poll's dedup cache honest so it does not instantly rebuild;
  // skip the blob-url image case (its cache would be stale on reload)
  if (bodyHtml == null) {
    LAST_CHAT_PHONE = OPEN_PHONE; LAST_CHAT_HTML = log.innerHTML;
    sessionStorage.setItem("kk_thread_" + OPEN_PHONE, log.innerHTML);
  } else {
    LAST_CHAT_HTML = "";   // force the next poll to paint the real image
  }
  scrollChatBottom();
}
const nowIso = () => new Date().toISOString();

/* Close every composer popover (emoji panel) — call after each send, and on
   a tap anywhere outside the panel (wired in init). */
function closePickers() {
  const pal = $("emoji-pal");
  if (pal) pal.classList.remove("open");
  const vp = $("var-pal");
  if (vp) vp.classList.remove("open");
}

/* { } — campaign wale variables Inbox mein bhi: {name}, {due_amount}...
   Server is chat ke grahak ke liye bharta hai (/admin/api/inbox/render, send).
   Likhte waqt neeche "Will send:" mein asli message dikhta hai. */
let INBOX_VARS = null;
async function toggleVarPicker() {
  const pal = $("var-pal");
  if (!pal) return;
  if (pal.classList.contains("open")) { pal.classList.remove("open"); return; }
  $("emoji-pal")?.classList.remove("open");
  if (!INBOX_VARS) {
    try { INBOX_VARS = await api("/admin/api/inbox/variables"); }
    catch (e) { toast(e.message, true); return; }
  }
  pal.innerHTML = '<div class="var-pal-h">Insert variable</div>' + INBOX_VARS.map((v) =>
    `<button type="button" role="menuitem" data-var="${esc(v.key)}"><code>{${esc(v.key)}}</code><span>${esc(v.label)}</span></button>`).join("");
  // Inline onclick mein text nahi (test_panel_security): ek delegated click
  pal.onclick = (e) => { const b = e.target.closest("[data-var]"); if (b) insertVar(b.dataset.var); };
  pal.classList.add("open");
}
function insertVar(key) {
  const ta = $("chat-input");
  const tok = "{" + key + "}";
  const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
  ta.value = ta.value.slice(0, a) + tok + ta.value.slice(b);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = a + tok.length;
  $("var-pal").classList.remove("open");
  ta.dispatchEvent(new Event("input"));
}
let VAR_PREV_TIMER = null, VAR_PREV_SEQ = 0;
function varPreviewSoon() {
  clearTimeout(VAR_PREV_TIMER);
  VAR_PREV_TIMER = setTimeout(varPreview, 400);
}
async function varPreview() {
  const box = $("chat-varprev");
  const text = ($("chat-input")?.value || "").trim();
  if (!box) return;
  if (!OPEN_PHONE || !/\{\{?\s*\w+\s*\}\}?/.test(text)) { box.hidden = true; box.innerHTML = ""; return; }
  const seq = ++VAR_PREV_SEQ;
  try {
    const r = await api("/admin/api/inbox/render", { method: "POST", body: { phone: OPEN_PHONE, text } });
    if (seq !== VAR_PREV_SEQ) return;
    box.className = "var-prev";
    box.innerHTML = '<b>Will send:</b> ' + waFormat(esc(r.text)).replace(/\n/g, "<br>");
  } catch (e) {
    if (seq !== VAR_PREV_SEQ) return;
    box.className = "var-prev bad";
    box.textContent = e.message;
  }
  box.hidden = false;
}

/* ✨ AI reply suggestions: Gemini reads the whole chat + the customer's
   orders and proposes replies. A tap only fills the box — the owner
   still reads, edits and sends. Nothing goes out from here. */
let AI_SUGG_FOR = "";
function aiSuggestClose() {
  const p = $("ai-sugg");
  if (p) { p.hidden = true; p.innerHTML = ""; }
  AI_SUGG_FOR = "";
}
async function aiSuggest() {
  const p = $("ai-sugg");
  if (!p || !OPEN_PHONE) return;
  if (!p.hidden && AI_SUGG_FOR === OPEN_PHONE) { aiSuggestClose(); return; }
  const phone = OPEN_PHONE;
  AI_SUGG_FOR = phone;
  p.hidden = false;
  p.innerHTML = `<div class="ai-sugg-head"><b>✨ AI suggestions</b><button class="th-ico" onclick="aiSuggestClose()" aria-label="Close suggestions">✕</button></div>
    <div class="muted ai-sugg-wait"><span class="spin dark"></span> Reading the whole chat…</div>`;
  const btn = $("ai-sugg-btn");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/admin/api/inbox/suggest", { method: "POST", body: { phone } });
    if (AI_SUGG_FOR !== phone || OPEN_PHONE !== phone) return;   // chat badal gayi
    const list = r.suggestions || [];
    p.innerHTML = `<div class="ai-sugg-head"><b>✨ AI suggestions</b><button class="th-ico" onclick="aiSuggestClose()" aria-label="Close suggestions">✕</button></div>
      ${r.situation ? `<p class="ai-sugg-sit">${esc(r.situation)}</p>` : ""}
      ${list.length ? list.map((s, i) => `<button type="button" class="ai-sugg-item" data-i="${i}">
          <small>${esc(s.label || "Suggestion")}</small><span>${esc(s.text)}</span></button>`).join("")
        : `<p class="muted">No suggestion for this chat yet.</p>`}
      <p class="muted ai-sugg-note">Tap one to put it in the box — edit it, then send.</p>`;
    p.querySelectorAll(".ai-sugg-item").forEach((el) => el.addEventListener("click", () => {
      const input = $("chat-input");
      input.value = list[Number(el.dataset.i)].text;
      input.style.height = "44px";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
      aiSuggestClose();
      input.focus();
    }));
  } catch (e) {
    if (AI_SUGG_FOR === phone) aiSuggestClose();
    toast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function openThread(phone, silent = false, push = true) {
  // Doosri chat khuli: purani chat ka "Will send" preview na dikhe
  if (!silent && phone !== OPEN_PHONE) { const vp = $("chat-varprev"); if (vp) { vp.hidden = true; vp.innerHTML = ""; } }
  if (phone !== OPEN_PHONE) aiSuggestClose();
  OPEN_PHONE = phone;
  localStorage.setItem(seenKey(phone), new Date().toISOString());
  updateUnreadBadge();
  // !silent zaroori hai: 12s wala background refresh bhi yahan se guzarta
  // hai — wo sirf content taaza kare, band ki hui chat WAPAS na khole
  if (window.innerWidth <= 767 && !silent) {
    document.body.classList.add("chat-open");
    // belt + braces: inline styles guarantee the full-screen push even if
    // a stylesheet hiccups on some browser
    const pane = document.querySelector(".chatpane");
    if (pane) Object.assign(pane.style, {
      display: "flex", position: "fixed", top: "0", left: "0", right: "0",
      bottom: "0", zIndex: "70", background: "#fff", height: "100dvh",
    });
    if (push) {
      NAVIGATING = true;
      location.hash = "inbox/" + encodeURIComponent(phone);  // Android back closes chat
      setTimeout(() => (NAVIGATING = false), 0);
    }
  } else if (window.innerWidth > 767 && CURRENT === "inbox") {
    // WhatsApp Web jaisa: bade screen par khuli chat URL mein rahe, taaki
    // refresh par wahi chat khule. replaceState — har chat badalne par
    // history nahi bharti, aur hashchange bhi nahi chalta.
    const want = "#inbox/" + encodeURIComponent(phone);
    if (location.hash !== want) history.replaceState(null, "", want);
  }
  const log = $("chat-log");
  const cached = sessionStorage.getItem("kk_thread_" + phone);
  if (!silent) {
    log.innerHTML = cached || skeleton(3);  // instant back-navigation
    renderThreads();
  }
  const prevCount = (OPEN_THREAD?.messages || []).length;
  try { OPEN_THREAD = await api(`/admin/api/inbox/thread?phone=${encodeURIComponent(phone)}`); }
  catch (e) { log.innerHTML = errBox(e.message, "loadThreads"); return; }
  const d = OPEN_THREAD;
  try {
    REACTIONS_BY_WAMID = JSON.parse(localStorage.getItem("kk_reactions_" + hashPhone(phone)) || "{}") || {};
  } catch (e) { REACTIONS_BY_WAMID = {}; }
  // header sirf tab bane jab uska CONTENT badla — warna har 12s Ping/Agent
  // button ungli ke neeche se recreate ho jaate the
  const headSig = `${d.phone}|${d.name}|${d.kind}|${d.window.open}|${JSON.stringify(d.ai || null)}`;
  if (!silent || headSig !== LAST_HEAD_SIG) {
    $("chat-head").innerHTML = `
    <button class="chat-back" onclick="closeThreadMobile()" aria-label="Back">←</button>
    ${avatar(displayName(d.name, d.phone))}
    <div style="flex:1;min-width:0"><b>${esc(displayName(d.name, d.phone))}</b>
      <div class="muted">${d.phone} · ${d.kind === "staff" ? "Staff 🧑‍🔧" : d.kind === "admin" ? "You 👑" : "Customer"}</div></div>
    <span class="winchip ${d.window.open ? "open" : "closed"}">${d.window.open ? "window open" : "window closed"}</span>
    <div class="ch-acts">
      <button class="ch-btn" title="Find in conversation" aria-label="Find in conversation" onclick="toggleChatSearch()">${svgIcon("i-search")}</button>
      <button class="ch-btn" title="Remind them" aria-label="Send a reminder" onclick="pingThread(this)">${svgIcon("i-bell")}<span class="lbl">Ping</span></button>
      ${d.kind === "customer" ? aiChatBtn(d.ai) : ""}
      <button class="ch-btn danger" title="Delete chat" aria-label="Delete chat" onclick="deleteThread('${phone}')">${svgIcon("i-trash")}</button>
    </div>`;
    refreshPauseBtn();
    LAST_HEAD_SIG = headSig;
  }
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  let lastDay = "";
  // quoted replies point at a wamid — keep a lookup so we can show the words
  BY_WAMID = {};
  (d.messages || []).forEach((m) => { if (m.wamid) BY_WAMID[m.wamid] = m; });
  const html = (d.messages || []).map((m) => {
    let chip = "";
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      chip = `<div class="daychip">${dayName(m.at) || fmtDate(m.at)}</div>`;
    }
    return chip + oneBubble(m, d.name);
  }).join("") || emptyBox("Chat appears here", "💬");
  // wahi 12s wali baat: message log tabhi repaint ho jab sach mein naya
  // message/status aaya ho — warna bubbles + images har tick par flicker
  // karte the aur phone ka scroll atak jaata tha
  const same = silent && phone === LAST_CHAT_PHONE && html === LAST_CHAT_HTML;
  const newCount = (d.messages || []).length;
  if (!same) {
    log.innerHTML = html;
    sessionStorage.setItem("kk_thread_" + phone, html);
    LAST_CHAT_PHONE = phone; LAST_CHAT_HTML = html;
    if (nearBottom || !silent) scrollChatBottom();
    else if (newCount > prevCount) $("newmsg-pill").classList.add("show");
  } else if (!silent) scrollChatBottom();
  filterChatMessages();
}
async function refreshPauseBtn() {
  const btn = $("agent-pause-btn");
  if (!btn || !OPEN_PHONE) return;
  btn.onclick = toggleAgentPause;
}
// Chat ka AI button asli haal se (thread API ka `ai`): band / insaan ke reply
// ke baad kab tak chup / chal raha. Pehle haal sirf browser ki yaad mein tha,
// to refresh ke baad button ulta kaam karta tha.
function aiChatOff(ai) { return !!(ai && (ai.paused || ai.quiet_until)); }
function aiChatBtn(ai) {
  const off = aiChatOff(ai);
  const until = ai && !ai.paused && ai.quiet_until
    ? new Date(ai.quiet_until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const tip = !off ? "Bot is replying on this chat — tap to stop it"
    : ai.paused ? "Bot is off on this chat until you turn it on — tap to resume"
    : `You replied, so the bot is quiet here until ${until} — tap to resume now`;
  const lbl = !off ? "Bot on" : ai.paused ? "Bot off" : `Quiet till ${until}`;
  return `<button class="ch-btn${off ? " off" : ""}" id="agent-pause-btn" title="${esc(tip)}" aria-label="${esc(tip)}" onclick="toggleAgentPause()">${svgIcon("i-agent")}<span class="lbl">${esc(lbl)}</span></button>`;
}
let PAUSED_SET = new Set();
async function toggleAgentPause() {
  const nowPaused = OPEN_THREAD && OPEN_THREAD.phone === OPEN_PHONE && OPEN_THREAD.ai
    ? !aiChatOff(OPEN_THREAD.ai) : !PAUSED_SET.has(OPEN_PHONE);
  try {
    await api("/admin/api/inbox/toggle-agent", { method: "POST", body: { phone: OPEN_PHONE, paused: nowPaused } });
    if (nowPaused) PAUSED_SET.add(OPEN_PHONE); else PAUSED_SET.delete(OPEN_PHONE);
    toast(nowPaused ? "You took over — the bot stays silent on this chat until you turn it on" : "Bot is back on this chat");
    openThread(OPEN_PHONE, true, false);
  } catch (e) { toast(e.message, true); }
}
/* Install as an app (PWA). Chrome/Edge/Samsung fire beforeinstallprompt;
   Safari on iPhone never does, so there the bar says which two taps to make.
   "✕" hides the bar on this phone; the sidebar button stays for later.
   Runs at load (not after sign-in) — the prompt event fires early. */
const INSTALL_HIDE_KEY = "kk_install_bar_off";
function setupInstall() {
  const bar = $("install-bar"), side = $("side-install");
  if (!bar || !side) return;
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) return;
  let evt = null, barOff = false;
  try { barOff = localStorage.getItem(INSTALL_HIDE_KEY) === "1"; } catch (e) { /* private mode */ }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS "desktop" UA
  const IOS_STEPS = "On iPhone: tap Share ⬆ then “Add to Home Screen”";
  const show = () => { side.hidden = false; if (!barOff) bar.hidden = false; };
  const done = () => { evt = null; bar.hidden = true; side.hidden = true; };
  const install = async () => {
    if (!evt) { toast(IOS_STEPS, false, 6000); return; }
    // A prompt can be used once. Accepted or dismissed, hide until the browser
    // offers a fresh one (it fires beforeinstallprompt again later).
    evt.prompt();
    await evt.userChoice.catch(() => null);
    done();
  };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); evt = e; show(); });
  window.addEventListener("appinstalled", done);
  if (isIOS) {
    $("install-msg").textContent = IOS_STEPS;
    $("install-go").hidden = true;
    show();
  }
  $("install-go").addEventListener("click", install);
  side.addEventListener("click", install);
  $("install-x").addEventListener("click", () => {
    bar.hidden = true; barOff = true;
    try { localStorage.setItem(INSTALL_HIDE_KEY, "1"); } catch (e) { /* private mode */ }
  });
}
setupInstall();

/* offline outbox: queued locally, flushed when the connection returns */
const outbox = () => JSON.parse(localStorage.getItem("kk_outbox") || "[]");
const saveOutbox = (q) => localStorage.setItem("kk_outbox", JSON.stringify(q));
async function flushOutbox() {
  const q = outbox();
  if (!q.length) return;
  const rest = [];
  for (const m of q) {
    try { await api("/admin/api/inbox/send", { method: "POST", body: m }); }
    catch (e) { rest.push(m); }
  }
  saveOutbox(rest);
  if (q.length !== rest.length) {
    toast(`${q.length - rest.length} queued message(s) sent`);
    if (OPEN_PHONE) openThread(OPEN_PHONE, true, false);
  }
}
/* Native WhatsApp reactions (not a text-message imitation). */
const REACTION_CHOICES = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];
function openReactionPicker(wamid) {
  if (!wamid || !BY_WAMID[wamid]) return;
  const current = REACTIONS_BY_WAMID[wamid] || "";
  openModal(`<h3>React to message</h3>
    <p class="muted">Reaction WhatsApp par bheji jayegi.</p>
    <div class="reaction-picker">${REACTION_CHOICES.map((emoji) =>
      `<button class="reaction-choice ${current === emoji ? "selected" : ""}" onclick="sendMessageReaction('${wamid}','${emoji}')">${emoji}</button>`
    ).join("")}</div>
    ${current ? `<button class="btn ghost" style="margin-top:12px" onclick="sendMessageReaction('${wamid}','')">Remove my reaction</button>` : ""}
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
}
async function sendMessageReaction(wamid, emoji) {
  if (!OPEN_PHONE || !wamid) return;
  try {
    await api("/admin/api/inbox/react", { method: "POST", body: { phone: OPEN_PHONE, wamid, reaction: emoji } });
    if (emoji) REACTIONS_BY_WAMID[wamid] = emoji;
    else delete REACTIONS_BY_WAMID[wamid];
    localStorage.setItem("kk_reactions_" + hashPhone(OPEN_PHONE), JSON.stringify(REACTIONS_BY_WAMID));
    closeModal();
    openThread(OPEN_PHONE, true, false);
    toast(emoji ? "WhatsApp reaction sent " + emoji : "Reaction removed");
  } catch (e) { toast(e.message, true); }
}
function toggleChatSearch() {
  CHAT_SEARCH_OPEN = !CHAT_SEARCH_OPEN;
  const bar = $("chat-searchbar");
  if (!bar) return;
  bar.classList.toggle("show", CHAT_SEARCH_OPEN);
  if (CHAT_SEARCH_OPEN) $("chat-search-input").focus();
  else { $("chat-search-input").value = ""; filterChatMessages(); }
}
function filterChatMessages() {
  const input = $("chat-search-input"), log = $("chat-log");
  if (!input || !log) return;
  const term = input.value.trim().toLocaleLowerCase();
  let visible = 0;
  log.querySelectorAll(".bubble").forEach((bubble) => {
    const match = !term || bubble.textContent.toLocaleLowerCase().includes(term);
    bubble.hidden = !match;
    if (match) visible++;
  });
  if (term) {
    log.querySelectorAll(".daychip").forEach((chip) => { chip.hidden = true; });
    log.querySelectorAll(".bubble:not([hidden])").forEach((bubble) => {
      let node = bubble.previousElementSibling;
      while (node && !node.classList.contains("daychip")) node = node.previousElementSibling;
      if (node) node.hidden = false;
    });
  } else {
    log.querySelectorAll(".daychip").forEach((chip) => { chip.hidden = false; });
  }
  const count = $("chat-search-count");
  if (count) count.textContent = term ? visible + " match" + (visible === 1 ? "" : "es") : "";
}

/* ---- reply to one message (WhatsApp's swipe-to-reply) ---- */
let REPLY_TO = null;
function replyTo(wamid) {
  const m = BY_WAMID[wamid];
  if (!m) return;
  REPLY_TO = wamid;
  const bar = $("reply-bar");
  bar.innerHTML = `<div class="rq"><span>${m.direction === "INBOUND" ? esc(OPEN_THREAD?.name || "They") : "You"}</span>
      ${esc(oneLine(m.text)).slice(0, 110)}</div>
    <button class="rx" onclick="cancelReply()" aria-label="Cancel reply">✕</button>`;
  bar.classList.add("show");
  $("chat-input").focus();
}
function cancelReply() {
  REPLY_TO = null;
  const bar = $("reply-bar");
  bar.classList.remove("show");
  bar.innerHTML = "";
}

async function pingThread(btn) {
  if (!OPEN_PHONE) return;
  await busy(btn, async () => {
    const r = await api("/admin/api/inbox/ping", { method: "POST", body: { phone: OPEN_PHONE } });
    toast("🔔 Ping sent: " + oneLine(r.text).slice(0, 60));
    openThread(OPEN_PHONE, true, false);
  });
}

async function sendChat() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text || !OPEN_PHONE) return;
  const replyTo = REPLY_TO;
  // Inbox replies are service messages (the owner answering a customer);
  // promotions go through Campaigns with their consent checks.
  const intent = $("chat-intent")?.value || "transactional";
  const outboundKind = intent === "promotional" ? "manual_marketing" : intent === "transactional" ? "order_status" : null;
  input.value = "";              // clear input
  input.style.height = "";       // lamba message bhejne ke baad box wapas chhota
  const vp = $("chat-varprev"); if (vp) { vp.hidden = true; vp.innerHTML = ""; }
  cancelReply();
  closePickers();                // emoji panel closes on send
  if (!navigator.onLine) {
    saveOutbox([...outbox(), { phone: OPEN_PHONE, text, reply_to: replyTo, intent, outbound_kind: outboundKind }]);
    toast("Offline — message is queued, it will send once you're back online");
    return;
  }
  try {
    const r = await api("/admin/api/inbox/send", {
      method: "POST", body: { phone: OPEN_PHONE, text, reply_to: replyTo, intent, outbound_kind: outboundKind },
    });
    // show it instantly — no full-thread rebuild; the 12s poll reconciles.
    // Server ne {variables} bhar diye: wahi dikhao jo grahak ko gaya
    appendBubble({ direction: "OUTBOUND", text: (r && r.text) || text, at: nowIso(), sent_by: "you", status: "sent", reply_to: replyTo });
  } catch (e) { toast(e.message, true); input.value = text; input.dispatchEvent(new Event("input")); }
}
/* new chat with any number */
function newChatModal() {
  openModal(`<h3>➕ New chat</h3>
    <div class="frm">
      <div><label>Mobile number</label><input id="nc-phone" type="tel" inputmode="numeric" placeholder="98765 43210" autofocus></div>
      <div><label>Name (optional)</label><input id="nc-name" placeholder="Customer name"></div>
    </div>
    <p class="muted">For a brand-new number the first message can only be an <b>approved template</b> (WhatsApp's rule) — use the 📑 button once the chat opens.</p>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" id="nc-go">Open chat</button></div>`);
  $("nc-go").onclick = (e) => busy(e.target, async () => {
    const r = await api("/admin/api/inbox/new-chat", { method: "POST",
      body: { phone: $("nc-phone").value.trim(), name: $("nc-name").value.trim() || null } });
    closeModal();
    await loadThreads();
    openThread(r.phone);
  });
}

/* template picker send (works outside the 24h window) */
let TPL_CACHE = [];
async function tplSendModal() {
  if (!OPEN_PHONE) { toast("Open a chat first", true); return; }
  openModal(`<h3>📑 Send template</h3><div class="frm" id="tps-body">${skeleton(2)}</div>`);
  let note = "";
  try {
    TPL_CACHE = (await api("/admin/api/templates")).filter((t) => t.status === "APPROVED");
    if (!TPL_CACHE.length) note = "⚠️ No template is APPROVED at Meta yet — sending may fail.";
    if (!TPL_CACHE.length) TPL_CACHE = await api("/admin/api/templates/registry");
  } catch (e) {
    // Meta down/blocked -> local registry, honest warning
    try { TPL_CACHE = await api("/admin/api/templates/registry"); } catch (e2) { TPL_CACHE = []; }
    note = "⚠️ Meta API is unreachable — this list is from the local registry; sending may fail.";
  }
  if (!TPL_CACHE.length) {
    $("tps-body").innerHTML = `<p class="muted">No templates found.</p>
      <div class="btnrow"><button class="btn ghost" onclick="closeModal()">OK</button></div>`;
    return;
  }
  if (note) note = `<p class="muted" style="color:var(--warn)">${note}</p>`;
  $("tps-body").innerHTML = `
    ${note}
    <div><label>Template</label><select id="tps-name" onchange="tplSendPick()">
      ${TPL_CACHE.map((t, i) => `<option value="${i}">${esc(t.name)} (${t.category})</option>`).join("")}
    </select></div>
    <div id="tps-params"></div>
    <div style="background:#e5ddd5;border-radius:10px;padding:10px"><div id="tps-preview" style="background:#fff;border-radius:8px;padding:8px 10px;font-size:13px;white-space:pre-wrap"></div></div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="tps-go">Send template</button></div>`;
  tplSendPick();
  $("tps-go").onclick = (e) => busy(e.target, async () => {
    const t = TPL_CACHE[parseInt($("tps-name").value)];
    const n = (t.body.match(/\{\{\d+\}\}/g) || []).length;
    const params = [];
    for (let i = 1; i <= n; i++) params.push($("tps-p" + i).value.trim());
    if (params.some((p) => !p)) throw new Error("Fill in all the variables");
    const templateCategory = String(t.category || "").toLowerCase();
    const intent = templateCategory.includes("marketing") ? "promotional" : "transactional";
    const outboundKind = t.name.toLowerCase().includes("payment") ? "payment_reminder"
      : t.name.toLowerCase().includes("bill") ? "bill" : "order_status";
    await api("/admin/api/inbox/send-template", { method: "POST",
      body: { phone: OPEN_PHONE, template_name: t.name, params, intent, outbound_kind: outboundKind } });
    closeModal(); closePickers(); toast(T.sent);
    // show the sent template bubble immediately (oneBubble renders the marker)
    appendBubble({ direction: "OUTBOUND", at: nowIso(), sent_by: "you", status: "sent",
      text: `[template:${t.name}] ${params.join(" | ")}` });
  });
}
function tplSendPick() {
  const t = TPL_CACHE[parseInt($("tps-name").value) || 0];
  if (!t) return;
  const n = (t.body.match(/\{\{\d+\}\}/g) || []).length;
  $("tps-params").innerHTML = Array.from({ length: n }, (_, i) =>
    `<div><label>Variable {{${i + 1}}}</label><input id="tps-p${i + 1}" oninput="tplSendPrev()"></div>`).join("");
  tplSendPrev();
}
function tplSendPrev() {
  const t = TPL_CACHE[parseInt($("tps-name").value) || 0];
  if (!t) return;
  let body = t.body;
  (body.match(/\{\{(\d+)\}\}/g) || []).forEach((m) => {
    const i = m.replace(/\D/g, "");
    body = body.replace(m, $("tps-p" + i)?.value || `[${i}]`);
  });
  $("tps-preview").textContent = body;
}

/* bulk customer numbers */
function bulkImportModal() {
  openModal(`<h3>📥 Contacts import</h3>
    <div class="tabs2">
      <button class="tab2 on" id="bi-tab-file" onclick="biTab('file')">📄 Excel / CSV</button>
      <button class="tab2" id="bi-tab-text" onclick="biTab('text')">⌨️ Type / paste</button>
    </div>
    <div id="bi-pane-file">
      <label class="dropzone" id="bi-drop">
        <input type="file" id="bi-file" accept=".csv,.tsv,.xlsx,.xlsm,text/csv" style="display:none">
        <div class="dz-in"><b>📄 Choose a file or drop it here</b>
          <span class="muted">.xlsx or .csv — up to 5MB</span></div>
      </label>
      <div id="bi-file-name" class="muted" style="margin-top:8px"></div>
      <p class="muted" style="margin-top:10px">Columns named <b>phone / mobile / number</b>, <b>name</b>, <b>address</b>
        are detected automatically. No headings? Also fine — any cell that looks like a number is treated as one.
        Existing contacts are <b>never overwritten</b> — only their blank fields are filled in.</p>
    </div>
    <div id="bi-pane-text" style="display:none">
      <div class="frm">
        <textarea id="bi-text" rows="8" placeholder="One number per line:\n9876543210\nSharma ji, 9812345678\nSeema Mam, 98111 22333"></textarea>
      </div>
      <p class="muted">Format: just the number, or 'name, number'.</p>
    </div>
    <div id="bi-result"></div>
    <div class="btnrow"><button class="btn ghost" onclick="closeModal()">Cancel</button>
    <button class="btn" id="bi-go">Import</button></div>`);

  const drop = $("bi-drop"), fileIn = $("bi-file");
  const showName = () => {
    $("bi-file-name").textContent = fileIn.files?.[0] ? "✅ " + fileIn.files[0].name : "";
  };
  fileIn.onchange = showName;
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer.files?.[0]) { fileIn.files = e.dataTransfer.files; showName(); }
  });

  $("bi-go").onclick = (e) => busy(e.target, async () => {
    let r;
    if (BI_MODE === "file") {
      const f = fileIn.files?.[0];
      if (!f) { toast("Choose a file first", true); return; }
      const fd = new FormData();
      fd.append("file", f);
      r = await api("/admin/api/customers/import-file", { method: "POST", body: fd });
    } else {
      r = await api("/admin/api/customers/bulk", { method: "POST", body: { text: $("bi-text").value } });
    }
    // A row that did not import is the owner's problem to fix — show it,
    // don't bury it in a toast that disappears.
    const badTotal = r.invalid_total ?? (r.invalid || []).length;
    $("bi-result").innerHTML = `<div class="imp-res">
      <div class="imp-row"><b>${r.added}</b> new contacts added</div>
      ${r.updated ? `<div class="imp-row"><b>${r.updated}</b> had blanks filled in</div>` : ""}
      <div class="imp-row muted">${r.skipped_existing} already existed</div>
      ${badTotal ? `<div class="imp-row bad"><b>${badTotal}</b> line(s) could not be read:
        <ul>${(r.invalid || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${badTotal > (r.invalid || []).length ? `<span class="muted">…and ${badTotal - r.invalid.length} more</span>` : ""}</div>` : ""}
    </div>`;
    toast(`${r.added} new contacts added`);
    if (CURRENT === "customers") loadCustomers();
    if (CURRENT === "inbox") loadThreads();
  });
}
let BI_MODE = "file";
function biTab(mode) {
  BI_MODE = mode;
  $("bi-pane-file").style.display = mode === "file" ? "" : "none";
  $("bi-pane-text").style.display = mode === "text" ? "" : "none";
  $("bi-tab-file").classList.toggle("on", mode === "file");
  $("bi-tab-text").classList.toggle("on", mode === "text");
}

function toggleEmojis() { $("emoji-pal").classList.toggle("open"); }
function addEmoji(e) { $("chat-input").value += e; $("chat-input").focus(); }
async function sendMedia(input) {
  if (!input.files || !input.files[0] || !OPEN_PHONE) return;
  const file = input.files[0];
  closePickers();                // emoji panel closes on send
  const fd = new FormData();
  fd.append("phone", OPEN_PHONE);
  fd.append("file", file);
  fd.append("caption", "");
  const intent = $("chat-intent")?.value || "transactional";
  if (intent) {
    fd.append("intent", intent);
    fd.append("outbound_kind", intent === "promotional" ? "manual_marketing" : "order_status");
  }
  // local preview URL so the image shows the moment it uploads
  const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
  try {
    await api("/admin/api/inbox/send-media", { method: "POST", body: fd });
    toast(T.sent);
    if (preview) {
      appendBubble({ direction: "OUTBOUND", at: nowIso() },
        `<img src="${preview}" width="280" height="210" style="object-fit:cover;border-radius:10px;display:block">`);
    } else {
      openThread(OPEN_PHONE, true, false);   // non-image: let the poll paint it
    }
  } catch (e) { toast(e.message, true); }
  input.value = "";              // reset the file input so re-picking the same file fires change
}


/* ================= mobile UI probe ==================
   Screen main dekh nahi sakta, isliye phone khud naap kar bhejta hai:
   kya viewport se bahar nikla hua hai, kaunsa tap-target chhota hai, kya
   JS error aaya. `?probe=1` lagao, ek baar scroll karo, bas. */
function _uiOffenders() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = [];
  // Neeche chipki hui cheezein (tabbar) content ko dhak leti hain — unki
  // ooncha-i nikaal lo taaki "kya chhup gaya" bataya ja sake.
  let coverBottom = 0;
  for (const f of document.querySelectorAll("*")) {
    const st = getComputedStyle(f);
    if (st.position !== "fixed" || st.display === "none") continue;
    const r = f.getBoundingClientRect();
    if (r.bottom >= vh - 2 && r.height > 0 && r.height < vh / 2) {
      coverBottom = Math.max(coverBottom, r.height);
    }
  }

  for (const e of document.querySelectorAll("body *")) {
    const st = getComputedStyle(e);
    if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // Poori tarah baayein parked cheez = chhupa hua drawer (sidebar), bug
    // nahi. Pehle isi ne saari report bhar di thi.
    if (r.right <= 0 || r.left >= vw) continue;
    if (st.position === "fixed") continue;

    // 1. dayein se bahar = side scroll / kata hua content
    if (r.right > vw + 1) {
      out.push({ why: "right", el: _elName(e), left: Math.round(r.left),
                 right: Math.round(r.right), w: Math.round(r.width),
                 text: (e.textContent || "").trim().slice(0, 40) });
      continue;
    }
    // 2. text apne dabbe mein nahi sama raha (kat raha hai)
    // "…" se katna design hai, bug nahi — usse chhodo
    if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && st.overflowX !== "auto"
        && st.overflowX !== "scroll" && st.textOverflow !== "ellipsis"
        && (e.textContent || "").trim()) {
      out.push({ why: "clipped", el: _elName(e), w: Math.round(r.width),
                 need: e.scrollWidth, has: e.clientWidth,
                 text: (e.textContent || "").trim().slice(0, 40) });
      continue;
    }
    // 3. neeche ki fixed patti ke peeche chhup gaya
    if (coverBottom && r.top < vh && r.bottom > vh - coverBottom && r.height < 200
        && (e.textContent || "").trim() && e.children.length === 0) {
      out.push({ why: "under_tabbar", el: _elName(e), bottom: Math.round(r.bottom),
                 covered_from: Math.round(vh - coverBottom),
                 text: (e.textContent || "").trim().slice(0, 40) });
      continue;
    }
    // 4. padhne layak nahi
    const fs = parseFloat(st.fontSize);
    if (fs && fs < 11 && (e.textContent || "").trim() && e.children.length === 0) {
      out.push({ why: "tiny_text", el: _elName(e), font: fs,
                 text: (e.textContent || "").trim().slice(0, 40) });
    }
  }
  return out.slice(0, 30);
}

function _elName(e) {
  const cls = String(e.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
  return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (cls ? "." + cls : "");
}

let _uiErrors = [];
function startUiProbe() {
  window.addEventListener("error", (e) =>
    _uiErrors.push(`${e.message} @ ${String(e.filename || "").split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) =>
    _uiErrors.push("promise: " + String(e.reason).slice(0, 120)));

  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;background:#111B21;color:#fff;" +
    "padding:10px 12px;border-radius:10px;font:600 13px/1.4 system-ui;text-align:center";
  banner.textContent = "🔎 UI probe running…";
  document.body.appendChild(banner);

  const send = async (label) => {
    const body = {
      label, section: CURRENT, url: location.href,
      ua: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      page: { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
      side_scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflow: _uiOffenders(),
      tiny_taps: _uiTinyTaps(),
      errors: _uiErrors.slice(0, 10),
    };
    try {
      await fetch("/admin/api/ui-report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), credentials: "same-origin",
      });
      const by = {};
      body.overflow.forEach((o) => (by[o.why] = (by[o.why] || 0) + 1));
      const bits = Object.entries(by).map(([k, v]) => `${v} ${k}`);
      banner.textContent =
        `✅ ${label}: ` + (bits.join(", ") || "layout ok") +
        `, ${body.tiny_taps.length} small buttons, ${body.errors.length} errors`;
    } catch (e) {
      banner.textContent = "⚠️ Could not send report: " + e.message;
    }
  };

  setTimeout(() => send("load"), 1500);
  // har section badalne par dobara — "sara UI" ka matlab har screen
  let last = CURRENT;
  setInterval(() => {
    if (CURRENT !== last) { last = CURRENT; setTimeout(() => send(CURRENT), 800); }
  }, 1000);
  banner.onclick = () => send("manual");
}

/* ============================= init ============================= */
window.addEventListener("DOMContentLoaded", () => {
  // ?probe=1 -> phone khud batata hai ki kya toota hai.
  // Purana version findings <title> mein likhta tha — mobile par title
  // dikhta hi nahi. Ab report server par chali jaati hai.
  if (qs.get("probe")) {  // qs captured before replaceState strips the query
    startUiProbe();
  }
  $("emoji-pal").innerHTML = EMOJIS.map((e) => `<span onclick="addEmoji('${e}')">${e}</span>`).join("");
  // Ab do raste hain: asli login (session cookie) ya purani admin key.
  // Session hai to key maangna bilkul galat hai — isliye pehle poochho.
  // Live updates SIRF sign-in ke baad. Bina iske EventSource 401 par
  // baar-baar dobara judne ki koshish karta rehta — har teen second ek
  // request, login page par baithe rehne bhar ke liye.
  // Sign-in ke baad WAHI page jo URL mein hai. Pehle yahan go("dashboard")
  // tha — har refresh owner ko Customers/Expenses se uthakar Dashboard par
  // phenk deta tha.
  ensureSignedIn().then((ok) => {
    if (ok) {
      routeFromHash();
      startLiveUpdates();
    }
  });
  const h = (location.hash || "#dashboard").slice(1);
  if (h.startsWith("customers/")) {
    openCustomerRoute(h.slice(10));
  } else if (h.startsWith("inbox/")) {
    go("inbox", false);
    // Phone par chat kholte hi URL mein "#inbox/<number>" chipak jaata hai.
    // Us hash ke saath agli baar page khulne par seedha CHAT khul jaata tha —
    // user ne "Inbox" socha tha, list dikhni chahiye thi. Aur us waqt
    // history mein list ka koi kadam hota hi nahi, isliye phone ka BACK
    // button poori site se bahar phenk deta tha.
    if (window.matchMedia("(max-width: 767px)").matches) {
      history.replaceState(null, "", "#inbox");
    } else {
      // Bade screen par dono pane ek saath dikhte hain — wahan deep link
      // se chat kholna sahi hai, list gayab nahi hoti.
      setTimeout(() => openThread(decodeURIComponent(h.slice(6)), false, false), 300);
    }
  } else if (h.startsWith("settings/")) {
    go("settings", false);
    stTab(h.slice(9));
  } else {
    go(h, false);
  }

  watchCardActions();

  // keyboard access: the nav / tab bar / sheet items are divs — give them
  // focus + Enter/Space so the app is usable without a touchscreen or mouse
  document.querySelectorAll(".nav div[data-s], .nav .nav-action, .tabbar div, .sheet-grid div, .logout")
    .forEach((el) => { el.setAttribute("tabindex", "0"); el.setAttribute("role", "button"); });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") &&
        e.target.matches?.(".nav div[data-s], .nav .nav-action, .tabbar div, .sheet-grid div, .logout")) {
      e.preventDefault(); e.target.click();
    }
  });

  // tap anywhere outside the emoji panel (and not on its toggle) closes it
  document.addEventListener("click", (e) => {
    const pal = $("emoji-pal");
    if (!pal || !pal.classList.contains("open")) return;
    if (e.target.closest("#emoji-pal")) return;                       // picking an emoji
    if (e.target.closest("[onclick*='toggleEmojis']")) return;        // the toggle itself
    pal.classList.remove("open");
  });

  // PWA: app-shell cache -> instant repeat loads, shell survives offline blips
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin" }).catch(() => {});
  }

  // offline awareness
  const setNet = () => {
    $("offline-bar").classList.toggle("show", !navigator.onLine);
    if (navigator.onLine) flushOutbox();
  };
  window.addEventListener("online", setNet);
  window.addEventListener("offline", setNet);
  setNet();

  // keyboard-safe composer: visualViewport shrinks -> chat pane follows,
  // so the input is never hidden behind the on-screen keyboard
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => {
      const pane = document.querySelector("body.chat-open .chatpane");
      if (!pane) return;
      pane.style.height = vv.height + "px";
      scrollChatBottom();
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
  }

  // "new messages" pill hides once the user reaches the bottom themselves
  $("chat-log").addEventListener("scroll", () => {
    const log = $("chat-log");
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 40)
      $("newmsg-pill").classList.remove("show");
  });
});


/* ================= External saree polisher ledger ================= */
function polMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
}
function polToday() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
/* Polisher page: one action card with three tabs, a polisher list with
   each one's pending sarees and balance, batches with a returned/sent bar
   and an inline return stepper, and the payment history. */
let POL_DATA = null;
function polTab(tab) {
  document.querySelectorAll("[data-pol-tab]").forEach((b) => b.classList.toggle("on", b.dataset.polTab === tab));
  document.querySelectorAll("[data-pol-pane]").forEach((p) => { p.hidden = p.dataset.polPane !== tab; });
}
function polStep(id, by) {
  const el = $(id);
  if (!el) return;
  el.value = String(polClamp(el, (parseInt(el.value, 10) || 0) + by));
}
/* Keeps a stepper inside its min/max, so a return can never exceed what was sent. */
function polClamp(el, value) {
  const max = el.max === "" ? Infinity : Number(el.max);
  return Math.min(max, Math.max(Number(el.min || 0), value));
}
function polSay(text, isError = false) {
  if ($("pol-message")) { $("pol-message").textContent = text; $("pol-message").classList.toggle("err", isError); }
  if (text) toast(text, isError);
}
function polVendorStats(data) {
  const by = {};
  (data.vendors || []).forEach((v) => { by[v.id] = { pending: 0, accrued: 0, paid: 0 }; });
  (data.batches || []).forEach((b) => {
    const s = by[b.vendor_id]; if (!s) return;
    s.pending += b.quantity_pending;
    s.accrued += b.rate_per_saree * b.quantity_returned;   // cost accrues on returned sarees
  });
  (data.payments || []).forEach((p) => { const s = by[p.vendor_id]; if (s) s.paid += p.amount; });
  return by;
}
function polPayFull() {
  const id = $("pol-pay-vendor").value;
  if (!id || !POL_DATA) { polSay("Choose the polisher first.", true); return; }
  const st = polVendorStats(POL_DATA)[id] || { accrued: 0, paid: 0 };
  const due = Math.max(0, st.accrued - st.paid);
  $("pol-pay-amount").value = due ? due.toFixed(2).replace(/\.00$/, "") : "";
  if (!due) polSay("Nothing due to this polisher right now.");
}
const polWa = (st) => {
  const s = String(st || "").toLowerCase();
  const cls = /sent|deliver|read|ok/.test(s) ? "PAID" : /fail|error/.test(s) ? "UNPAID" : "PARTIAL";
  return `<span class="pill ${cls}" title="WhatsApp">${esc(st || "not sent")}</span>`;
};
async function loadPolisher() {
  if (!$("pol-batches")) return;
  ["pol-date", "pol-pay-date"].forEach(id => { const el = $(id); if (el && !el.value) el.value = polToday(); });
  try {
    const data = await api("/admin/api/polisher/summary");
    POL_DATA = data;
    const t = data.totals || {};
    const names = Object.fromEntries((data.vendors || []).map((v) => [v.id, v.name]));
    $("pol-kpis").innerHTML =
      kpi("Balance due", polMoney(t.outstanding), "owed to polishers", "polTab('pay')", "i-expense", Number(t.outstanding) > 0 ? "red" : "green") +
      kpi("Out for polish", t.sarees_pending || 0, "sarees not back yet", "", "i-receipt", "amber") +
      kpi("Sent", t.sarees_sent || 0, `${t.sarees_returned || 0} returned`, "", "i-upload", "blue") +
      kpi("Paid so far", polMoney(t.amount_paid), `of ${polMoney(t.amount_accrued)} cost`, "", "i-ledger", "teal");
    const options = data.vendors.map(v => '<option value="' + esc(v.id) + '">' + esc(v.name) + ' · ₹' + esc(v.rate_per_saree) + '/saree</option>').join("");
    ["pol-vendor","pol-pay-vendor"].forEach(id => {
      const el = $(id); if (!el) return;
      const prior = el.value;
      el.innerHTML = (data.vendors.length ? '<option value="">Select polisher</option>' : '<option value="">Add a polisher first</option>') + options;
      if (prior) el.value = prior;
      else if (data.vendors.length === 1) el.value = data.vendors[0].id;   // one polisher: no choice to make
    });
    const stats = polVendorStats(data);
    $("pol-vendors").innerHTML = data.vendors.length ? data.vendors.map((v) => {
      const s = stats[v.id] || { pending: 0, accrued: 0, paid: 0 };
      const due = Math.max(0, s.accrued - s.paid);
      return `<div class="pol-vendor">
        <span class="avatar">${esc(initials(v.name, v.phone))}</span>
        <div class="pv-who"><b>${esc(v.name)}</b><span class="muted">${esc(v.phone)} · ${polMoney(v.rate_per_saree)}/saree</span></div>
        <div class="pv-num"><b class="${due > 0 ? "late-t" : ""}">${polMoney(due)}</b><span class="muted">${s.pending} out</span></div>
      </div>`;
    }).join("") : `<div class="empty"><div class="ico">🧵</div>No polisher yet — add one to start sending sarees.<div style="margin-top:10px"><button class="btn sm" onclick="polTab('vendor')">Add polisher</button></div></div>`;
    $("pol-batch-count").textContent = data.batches.length ? `${data.batches.length} batches` : "";
    $("pol-batches").innerHTML = data.batches.length ? `<div class="pol-batches">${data.batches.map((b) => {
      const pct = b.quantity_sent ? Math.round((b.quantity_returned / b.quantity_sent) * 100) : 0;
      const done = b.quantity_pending === 0;
      return `<div class="pol-batch${done ? " done" : ""}">
        <div class="pb-top">
          <div><b>${esc(b.batch_code)}</b><span class="muted">${esc(names[b.vendor_id] || "Polisher")} · sent ${esc(fmtDate(b.sent_on))}</span></div>
          <span class="pill ${done ? "PAID" : "PARTIAL"}">${done ? "All back" : `${b.quantity_pending} pending`}</span>
        </div>
        <div class="pb-bar" aria-label="${b.quantity_returned} of ${b.quantity_sent} returned"><i style="width:${pct}%"></i></div>
        <div class="pb-meta"><span>${b.quantity_returned} / ${b.quantity_sent} returned · ${polMoney(b.rate_per_saree)}/saree</span>${polWa(b.notification_status)}</div>
        ${b.notes ? `<div class="pb-notes muted">${esc(b.notes)}</div>` : ""}
        ${done ? "" : `<div class="pb-ret"><span>Returned so far</span>
          <div class="pol-step"><button type="button" onclick="polStep('pol-ret-${esc(b.id)}',-1)" aria-label="One less">−</button><input aria-label="Returned quantity" id="pol-ret-${esc(b.id)}" type="number" min="0" max="${b.quantity_sent}" value="${b.quantity_returned}" inputmode="numeric" oninput="if(this.value!=='')this.value=polClamp(this,parseInt(this.value,10)||0)"><button type="button" onclick="polStep('pol-ret-${esc(b.id)}',1)" aria-label="One more">+</button></div>
          <button class="btn sm" onclick="updatePolisherReturn('${esc(b.id)}',${b.quantity_sent},this)">Save</button></div>`}
      </div>`;
    }).join("")}</div>` : '<div class="empty"><div class="ico">📦</div>No batches yet — send sarees from the card above.</div>';
    $("pol-pay-count").textContent = data.payments.length ? `${data.payments.length} payments` : "";
    $("pol-payments").innerHTML = data.payments.length ? `<div class="pol-pays">${data.payments.slice().reverse().map((p) => `
      <div class="pol-pay"><div><b>${polMoney(p.amount)}</b><span class="muted">${esc(names[p.vendor_id] || "Polisher")} · ${esc(fmtDate(p.paid_on))} · ${esc(String(p.method || "").toUpperCase())}${p.reference ? " · " + esc(p.reference) : ""}</span></div>${polWa(p.notification_status)}</div>`).join("")}</div>`
      : '<div class="empty" style="padding:24px">No payments recorded yet.</div>';
  } catch (e) { polSay(e.message || "Could not load polisher ledger", true); }
}
async function createPolisherVendor(btn) {
  const name = $("pol-name").value.trim(), phone = $("pol-phone").value.trim(), rate = Number($("pol-rate").value || 25);
  if (!name || !phone || !(rate > 0)) { polSay("Name, WhatsApp number and valid rate are required.", true); return; }
  btn.disabled = true;
  try {
    await api("/admin/api/polisher/vendors", { method:"POST", body:{name,phone,rate_per_saree:rate} });
    $("pol-name").value = ""; $("pol-phone").value = ""; polSay("Polisher saved."); polTab("send");
    await loadPolisher();
  } catch(e) { polSay(e.message || "Polisher could not be saved", true); }
  finally { btn.disabled = false; }
}
async function createPolisherBatch(btn) {
  const vendor_id = $("pol-vendor").value, quantity_sent = Number($("pol-qty").value), sent_on = $("pol-date").value;
  if (!vendor_id || !Number.isInteger(quantity_sent) || quantity_sent < 1 || !sent_on) { polSay("Select the polisher, quantity and date.", true); return; }
  if (!confirm("Create polish batch for " + quantity_sent + " sarees? WhatsApp message will be attempted.")) return;
  btn.disabled = true;
  try {
    const result = await api("/admin/api/polisher/batches", {method:"POST", body:{vendor_id,quantity_sent,sent_on,notes:$("pol-notes").value.trim() || null}});
    polSay("Batch " + result.batch_code + " saved · WhatsApp: " + result.notification_status + " · " + polMoney(result.amount) + " when all are back.");
    $("pol-notes").value = ""; await loadPolisher();
  } catch(e) { polSay(e.message || "Batch could not be saved", true); }
  finally { btn.disabled = false; }
}
async function updatePolisherReturn(id, max, btn) {
  const quantity_returned = Number($("pol-ret-" + id).value);
  if (!Number.isInteger(quantity_returned) || quantity_returned < 0 || quantity_returned > max) { polSay("Returned quantity must be between 0 and " + max, true); return; }
  btn.disabled = true;
  try { const r = await api("/admin/api/polisher/batches/" + encodeURIComponent(id) + "/return", {method:"PATCH", body:{quantity_returned}}); polSay(r.notification_status === "not_sent" ? "Return saved." : "Return saved · WhatsApp: " + r.notification_status); await loadPolisher(); }
  catch(e) { polSay(e.message || "Return quantity could not be saved", true); }
  finally { btn.disabled = false; }
}
async function recordPolisherPayment(btn) {
  const vendor_id = $("pol-pay-vendor").value, amount = Number($("pol-pay-amount").value), paid_on = $("pol-pay-date").value, method = $("pol-pay-method").value, reference = $("pol-pay-ref").value.trim() || null;
  if (!vendor_id || !(amount > 0) || !paid_on) { polSay("Select the polisher, amount and payment date.", true); return; }
  if (!confirm("Record payment of " + polMoney(amount) + "? Vendor WhatsApp confirmation will be attempted.")) return;
  btn.disabled = true;
  try { const result = await api("/admin/api/polisher/payments", {method:"POST", body:{vendor_id,amount,paid_on,method,reference}}); polSay("Payment saved · WhatsApp: " + result.notification_status); $("pol-pay-amount").value = ""; $("pol-pay-ref").value = ""; await loadPolisher(); }
  catch(e) { polSay(e.message || "Payment could not be saved", true); }
  finally { btn.disabled = false; }
}
window.loadPolisher = loadPolisher;
window.polTab = polTab;
window.polStep = polStep;
window.polClamp = polClamp;
window.polPayFull = polPayFull;
window.createPolisherVendor = createPolisherVendor;
window.createPolisherBatch = createPolisherBatch;
window.updatePolisherReturn = updatePolisherReturn;
window.recordPolisherPayment = recordPolisherPayment;
