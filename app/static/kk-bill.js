/* Kwik Klin — New Bill ka saanjha UI (dashboard + staff app).
 *
 * Sirf dikhawat aur chhote helper. Bill ka hisaab, save, coupon, urgent —
 * sab har app ka APNA purana code karta hai; ye file use chhoti nahi karti.
 *
 *   KKBill.icon(garment, unit)     kapde ka icon (garments.svg)
 *   KKBill.cat(garment, unit)      top | bottom | ethnic | winter | home | kg | other
 *   KKBill.CATS                    category chips ka kram
 *   KKBill.steps(active, done, tags)  1-2-3-4 ki patti (tags band = step 4 "Receipt")
 *   KKBill.custTag(count, last)    New / Regular / VIP
 *   KKBill.done(el, cfg)           step 4: labels (sirf tags on) + receipt + status
 *   KKBill.combo(cfg)              kapda dhoondhne ka dropdown (list, teer, Enter, Esc)
 *   KKBill.rateOptions(...)        rate card se dropdown ki rows
 *   KKBill.usual(box, cfg)         "Usually given": chips, har chip par ×, ＋ Add
 *   KKBill.keep(el, fn)            fn ke baad bhi el screen par wahin rahe
 *   KKBill.dropFocus()             phone ka keyboard band
 *
 * Koi library nahi, koi inline style/handler nahi (staff app ki CSP).
 */
(function (global) {
  "use strict";

  const SPRITE = "/admin/static/garments.svg?v=1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "₹" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  /* ---------------- kapda -> icon + category ---------------- */
  // Pehla milne wala jeetta hai: "t-shirt" ko "shirt" se pehle dekhna hai.
  const ICONS = [
    [/t-?shirt|\btee\b|polo|\btop\b/, "g-tshirt"],
    [/jeans|denim/, "g-jeans"],
    [/sherwani|achkan|bandhgala/, "g-sherwani"],
    [/lehenga|ghagra|chaniya|skirt|dress|gown|frock/, "g-dress"],
    [/saree|sari\b/, "g-saree"],
    [/blanket|razai|quilt|kambal|duvet|comforter/, "g-blanket"],
    [/curtain|parda/, "g-curtain"],
    [/bed ?sheet|pillow|cushion|sofa|cover|carpet|rug|mat\b/, "g-pillow"],
    [/towel|napkin/, "g-towel"],
    [/shawl|dupatta|stole|scarf|muffler/, "g-shawl"],
    [/sweater|cardigan|pullover|sweatshirt|woolen|woollen/, "g-sweater"],
    [/jacket|coat|hoodie|parka/, "g-jacket"],
    [/blazer|suit|waistcoat|tuxedo/, "g-blazer"],
    [/pant|trouser|pyjama|pajama|shorts|track|legging|salwar|dhoti|lungi/, "g-trouser"],
    [/kurta|kurti|tunic|anarkali/, "g-kurta"],
    [/shirt|blouse|choli/, "g-shirt"],
  ];
  const CAT_RULES = [
    ["ethnic", /saree|sari\b|lehenga|ghagra|chaniya|sherwani|achkan|bandhgala|kurta|kurti|anarkali|dupatta|dhoti|salwar|choli|pagdi|turban/],
    ["winter", /blazer|suit|waistcoat|jacket|coat|hoodie|sweater|cardigan|pullover|sweatshirt|shawl|muffler|woolen|woollen|stole/],
    ["home", /blanket|razai|quilt|kambal|duvet|curtain|parda|bed ?sheet|pillow|cushion|sofa|carpet|rug|towel|table ?cloth|mat\b|cover/],
    ["bottom", /pant|trouser|jeans|shorts|skirt|pyjama|pajama|legging|track/],
    ["top", /shirt|tee\b|top\b|blouse|polo/],
  ];
  const low = (s) => String(s || "").toLowerCase();
  function icon(garment, unit) {
    const g = low(garment);
    let id = unit === "kg" ? "g-basket" : "g-hanger";
    if (unit !== "kg") for (const [re, v] of ICONS) if (re.test(g)) { id = v; break; }
    return `<svg class="kb-gi" aria-hidden="true"><use href="${SPRITE}#${id}"/></svg>`;
  }
  function cat(garment, unit) {
    if (unit === "kg") return "kg";
    const g = low(garment);
    for (const [k, re] of CAT_RULES) if (re.test(g)) return k;
    return "other";
  }
  /* Service ka rang-parivaar (kk-bill.css: [data-fam]) — chips, tiles, lines
     sab ek hi rang mein: wash teal · fold blue · iron amber · dry violet · home pink.
     Naam se andaaza, services/service_stages.py jaisa. */
  function fam(service) {
    const s = low(service);
    if (/dry ?clean|perc|solvent|premium/.test(s)) return "dry";
    if (/blanket|curtain|carpet|sofa|home|bed ?sheet|linen|shoe|bag/.test(s)) return "home";
    const washy = /wash|dhulai|laundry|clean/.test(s);
    const pressy = /iron|press|istri|isteri|steam|roll/.test(s);
    if (!washy && pressy) return "iron";
    if (washy && /fold/.test(s) && !pressy) return "fold";
    if (/kg|weight|kilo/.test(s) && !pressy) return "fold";
    return "wash";
  }
  const CATS = [["all", "All"], ["top", "Top wear"], ["bottom", "Bottom wear"], ["ethnic", "Ethnic"],
    ["winter", "Winter wear"], ["home", "Home linen"], ["kg", "By weight"], ["other", "Other"]];
  /* Laundry / dry clean industry ke aam kapde — Settings → Rate card mein
     poori list; owner jiska daam bharta hai wahi New Bill mein dikhta hai.
     Naam aise rakhe hain ki icon() aur cat() unhe pehchanein. */
  const GARMENTS = [
    ["top", ["Shirt", "T-shirt", "Polo T-shirt", "Top", "Blouse"]],
    ["bottom", ["Pant", "Trouser", "Jeans", "Shorts", "Skirt", "Pyjama", "Track pant", "Leggings"]],
    ["ethnic", ["Kurta", "Kurti", "Kurta pyjama", "Salwar", "Salwar suit", "Anarkali", "Saree (cotton)",
      "Saree (silk)", "Saree (heavy work)", "Lehenga", "Sherwani", "Dhoti", "Dupatta", "Choli"]],
    ["winter", ["Blazer", "Suit 2pc", "Suit 3pc", "Waistcoat", "Coat", "Overcoat", "Jacket", "Leather jacket",
      "Sweater", "Sweatshirt", "Cardigan", "Hoodie", "Shawl", "Muffler"]],
    ["home", ["Bed sheet (single)", "Bed sheet (double)", "Pillow cover", "Blanket (single)", "Blanket (double)",
      "Razai / Quilt", "Duvet cover", "Curtain (per panel)", "Sofa cover", "Cushion cover", "Table cloth",
      "Towel", "Bath towel", "Carpet / Rug", "Door mat"]],
    ["other", ["Gown", "Dress", "Frock", "Kids wear", "School uniform", "Tie", "Cap", "Soft toy", "Bag"]],
  ];

  /* ---------------- patti 1-2-3-4 ---------------- */
  const STEPS = [["Customer", "Select or add"], ["Add clothes", "Select services"],
    ["Review & pay", "Check & confirm"]];
  // Garment tags band = label ka kaam hi nahi; aakhri kadam sirf receipt
  function steps(active, done, tags) {
    const all = STEPS.concat([tags ? ["Labels & receipt", "Print & complete"] : ["Receipt", "Sent on WhatsApp"]]);
    return `<ol class="kb-steps" aria-label="Bill steps">${all.map(([t, s], i) => {
      const n = i + 1;
      const st = n === active ? "on" : n < active || (done || []).includes(n) ? "ok" : "";
      return `<li class="kb-step ${st}"><button type="button" data-kb-step="${n}" ${n === 4 ? "disabled" : ""}
          aria-current="${n === active ? "step" : "false"}"><i>${st === "ok" && n !== active ? "✓" : n}</i>
          <span><b>${t}</b><small>${s}</small></span></button></li>`;
    }).join("")}</ol>`;
  }

  /* ---------------- phone: keyboard aur scroll ---------------- */
  const touch = () => !!(global.matchMedia && global.matchMedia("(pointer: coarse)").matches);
  function dropFocus() {
    const a = document.activeElement;
    if (a && a.matches && a.matches("input, textarea, select")) a.blur();
  }
  /* DOM badalne se pehle aur baad el ki jagah naapo, farq scroll se bharo.
     Chrome khud karta hai (scroll anchoring), iPhone Safari nahi. */
  function keep(el, fn) {
    // Search khula ho to aankh usi par hai: use tikao, neeche ki list ko nahi
    const a = document.activeElement;
    const pin = a && a.matches && a.matches('input[type="search"]') ? a : el;
    const y = pin ? pin.getBoundingClientRect().top : 0;
    fn();
    if (!pin || !pin.isConnected) return;
    const d = pin.getBoundingClientRect().top - y;
    if (Math.abs(d) > 1) global.scrollBy({ top: d, behavior: "instant" });
  }

  /* ---------------- kapda dhoondho: dropdown ----------------
     Pehle search neeche ke tiles ko hi chhota karta tha: chunte hi list phir
     badal jaati, page uchhalta aur chuna hua kapda nazar se nikal jaata. Ab
     nateeje upar dropdown mein; tiles aur page apni jagah rehte hain.
     cfg: { input, panel, items(q) -> [{title, sub, price, on, value, fam, icon}],
            onPick(value), create(raw)?, multi?, empty?(q) }
     multi = chunne ke baad bhi khula (＋ Add mein kai kapde ek saath). */
  function combo(cfg) {
    const { input, panel } = cfg;
    let rows = [], at = -1, isOpen = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    panel.setAttribute("role", "listbox");
    if (panel.id) input.setAttribute("aria-controls", panel.id);
    const text = () => input.value.trim().replace(/\s+/g, " ");
    // Keyboard aur neeche ki patti ke upar jitni jagah hai, utni hi lambi list
    function fit() {
      if (getComputedStyle(panel).position !== "absolute") return;
      const vv = global.visualViewport;
      let bottom = vv ? vv.offsetTop + vv.height : global.innerHeight;
      const bar = document.querySelector(".nbw-bar:not([hidden]), .kb-bar");
      if (bar && bar.offsetParent) bottom = Math.min(bottom, bar.getBoundingClientRect().top);
      const room = bottom - panel.getBoundingClientRect().top - 8;
      panel.style.maxHeight = `${Math.max(140, Math.min(340, room))}px`;
    }
    function mark() {
      [...panel.querySelectorAll("[data-opt]")].forEach((r, i) => {
        r.setAttribute("aria-selected", String(i === at));
        r.classList.toggle("at", i === at);
        if (i === at) r.scrollIntoView({ block: "nearest" });
      });
    }
    function paint() {
      const raw = text();
      rows = cfg.items(raw);
      at = raw && rows.length ? 0 : -1;
      panel.innerHTML = rows.map((r, i) => `<div class="kb-opt${r.on ? " on" : ""}" role="option" aria-selected="false" data-opt="${i}"${r.fam ? ` data-fam="${esc(r.fam)}"` : ""}>
          ${r.icon || ""}<span class="kb-opt-t"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>
          <em>${esc(r.price || "")}</em>${r.on ? `<i aria-hidden="true">✓</i>` : ""}</div>`).join("")
        || (raw && cfg.create ? `<div class="kb-opt" role="option" aria-selected="false" data-opt-new="1"><span class="kb-opt-t"><b>＋ Add “${esc(raw)}”</b><small>New item on the rate card</small></span></div>`
          : `<div class="none">${esc(cfg.empty ? cfg.empty(raw) : "Nothing found")}</div>`);
      isOpen = true;
      input.setAttribute("aria-expanded", "true");
      panel.hidden = false;
      fit();
    }
    function close() {
      isOpen = false;
      input.setAttribute("aria-expanded", "false");
      panel.innerHTML = "";
      if (cfg.multi) panel.hidden = true;
    }
    function pick(i) {
      const r = rows[i];
      if (!r) return;
      cfg.onPick(r.value);
      if (cfg.multi) { paint(); return; }
      input.value = "";
      close();
      // Phone: kaam ho gaya, keyboard band. Desktop: agla naam seedha likho.
      if (touch()) input.blur();
    }
    function createNew() {
      const raw = text();
      input.value = "";
      close();
      input.blur();
      cfg.create(raw);
    }
    input.addEventListener("input", paint);
    input.addEventListener("focus", () => { if (!isOpen) paint(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) paint();
        if (rows.length) { at = (at + (e.key === "ArrowDown" ? 1 : rows.length - 1) + (at < 0 && e.key === "ArrowUp" ? 1 : 0)) % rows.length; mark(); }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (rows.length) pick(Math.max(0, at));
        else if (text() && cfg.create) createNew();
        else input.blur();
      }
    });
    // List dabate waqt input ka focus na chhoote — keyboard band hokar dobara
    // khulta aur poori screen uchhalti (staff.js bag sheet wala hi tareeka)
    panel.addEventListener("mousedown", (e) => e.preventDefault());
    panel.addEventListener("click", (e) => {
      const row = e.target.closest("[data-opt], [data-opt-new]");
      if (!row) return;
      if (row.dataset.optNew) createNew();
      else pick(Number(row.dataset.opt));
    });
    // Har naye bill par naya combo banta hai: purane input ke listener
    // khud hat jaayein, warna din bhar jamaa hote rehte.
    const vv = global.visualViewport;
    function onResize() {
      if (!input.isConnected) { vv.removeEventListener("resize", onResize); return; }
      if (isOpen) fit();
    }
    function away(e) {
      if (!input.isConnected) {
        document.removeEventListener("click", away);
        if (vv) vv.removeEventListener("resize", onResize);
        return;
      }
      if (isOpen && !cfg.multi && !input.contains(e.target) && !panel.contains(e.target)) close();
    }
    document.addEventListener("click", away);
    if (vv) vv.addEventListener("resize", onResize);
    return { open: paint, close, refresh: () => { if (isOpen) paint(); } };
  }

  /* Dropdown ki rows. Bina likhe: dukaan ke sabse zyada lagne wale kapde
     (uses = pichhle 90 din). Likha to naam se milne wale pehle. */
  function rateOptions(rates, q, inBill) {
    const s = low(q).trim();
    const name = (r) => r.garment || "By weight";
    let list = (rates || []).slice().sort((a, b) => (b.uses || 0) - (a.uses || 0));
    if (s) {
      const rank = (r) => (low(name(r)).startsWith(s) ? 0 : low(name(r)).includes(s) ? 1 : 2);
      list = list.filter((r) => low(`${name(r)} ${r.service}`).includes(s)).sort((a, b) => rank(a) - rank(b));
    }
    return list.slice(0, s ? 30 : 12).map((r) => ({
      title: name(r), sub: r.service, price: money(r.rate) + (r.unit === "kg" ? "/kg" : ""), on: !!(inBill && inBill(r)),
      value: r, fam: fam(r.service), icon: icon(r.garment, r.unit),
    }));
  }

  /* ⭐ Usually given: multi-select. Bill hi asli list hai — chip chuna = kapda
     bill mein (1 ke saath, ginti − + se), × = bill se hata. Kabhi khud nahi
     judta: ginti har baar alag hoti hai.
     cfg: { list: [{title, sub, on, qty}], options(q), hint,
            onSelect(item), onRemove(item), onPickRate(rate), onAll(), onCreate? } */
  function usual(box, cfg) {
    let s = box.kbUsual;
    if (!s) {
      box.innerHTML = `<div class="kb-uh"><span class="kb-uh-t">Usually given</span>
          <span class="kb-uh-b"><button type="button" class="kb-btn ghost sm" data-uc="all" hidden></button>
          <button type="button" class="kb-btn ghost sm" data-uc="add" aria-expanded="false">＋ Add</button></span></div>
        <div class="kb-ucs" data-uc-list></div>
        <div class="kb-uadd" hidden>
          <div class="kb-search"><input type="search" placeholder="Search clothes" aria-label="Search clothes to add" autocomplete="off" enterkeyhint="done"></div>
          <div class="kb-acp" hidden></div>
          <button type="button" class="kb-btn ghost sm wide" data-uc="close">Done</button>
        </div>`;
      s = box.kbUsual = { cfg };
      const addBox = box.querySelector(".kb-uadd"), addBtn = box.querySelector('[data-uc="add"]');
      s.combo = combo({ input: addBox.querySelector("input"), panel: addBox.querySelector(".kb-acp"), multi: true,
        items: (q) => s.cfg.options(q), onPick: (r) => s.cfg.onPickRate(r), empty: () => "Not on the rate card" });
      const toggle = (open) => {
        addBox.hidden = !open;
        addBtn.setAttribute("aria-expanded", String(open));
        addBtn.textContent = open ? "Close" : "＋ Add";
        // Keyboard tabhi jab khud search par tap ho: pehle list hi dikhe
        if (open) { s.combo.open(); addBox.scrollIntoView({ block: "center", behavior: "instant" }); } else { addBox.querySelector("input").value = ""; s.combo.close(); dropFocus(); }
      };
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-uc], [data-uc-on], [data-uc-x]");
        if (!b) return;
        const c = s.cfg;
        if (b.dataset.uc === "add") return toggle(addBox.hidden);
        if (b.dataset.uc === "close") return toggle(false);
        if (b.dataset.uc === "all") return c.onAll();
        if (b.dataset.ucOn) return c.onSelect(c.list[Number(b.dataset.ucOn) - 1]);
        if (b.dataset.ucX) c.onRemove(c.list[Number(b.dataset.ucX) - 1]);
      });
    }
    s.cfg = cfg;
    const label = (u) => `<span class="kb-uc-t"><b>${esc(u.title)}</b><small>${esc(u.sub)}${u.on && u.qty ? ` · ${esc(u.qty)}` : ""}</small></span>`;
    box.querySelector("[data-uc-list]").innerHTML = cfg.list.length ? cfg.list.map((u, i) => (u.on
      ? `<span class="kb-uc on">${label(u)}<button type="button" class="kb-uc-x" data-uc-x="${i + 1}" aria-label="Remove ${esc(u.title)} from the bill">×</button></span>`
      : `<button type="button" class="kb-uc" data-uc-on="${i + 1}" aria-label="Add ${esc(u.title)} to the bill"><i aria-hidden="true">＋</i>${label(u)}</button>`)).join("")
      : `<p class="kb-hint">${esc(cfg.hint || "Tap ＋ Add for the clothes this customer gave.")}</p>`;
    const left = cfg.list.filter((u) => !u.on).length, all = box.querySelector('[data-uc="all"]');
    all.hidden = left < 2;
    all.textContent = `Add all ${left}`;
    s.combo.refresh();
  }

  /* ---------------- grahak ---------------- */
  function custTag(count, last) {
    const n = Number(count) || 0;
    if (!n) return { key: "new", label: "New" };
    if (n >= 10) return { key: "vip", label: "VIP" };
    return { key: "regular", label: "Regular" };
  }
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  const shortDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  function time12(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    if (!m) return "";
    const h = +m[1];
    return `${(h % 12) || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
  }
  function timeOptions(sel) {
    let out = `<option value="">Any time</option>`;
    for (let h = 9; h <= 21; h++) {
      const v = String(h).padStart(2, "0") + ":00";
      out += `<option value="${v}"${v === sel ? " selected" : ""}>${time12(v)}</option>`;
    }
    return out;
  }

  /* ================= step 4: labels + receipt + status ================= */
  /* cfg: { order:{number, customer, total, paid, due, items, delivery, delivery_time,
            fulfilment, urgent, status}, tagsOn, qcOn, api(path, opts),
            paths:{labels(n), printEvent(n), receipt(n)}, printedBy, saveSize(size),
            whatsapp, waConnected, onPrintReceipt(n), onShare(n, url), onTrack(n), onNew() }
     whatsapp = server ka jawab (sent | queued | failed | skipped | null).
     Tags band: na labels, na tabs — seedha receipt, jo grahak ko jaa chuki. */
  const WA_NOTE = {
    sent: ["info", "📲 Receipt sent to the customer on WhatsApp."],
    queued: ["info", "📲 Receipt saved — it goes automatically once WhatsApp is back, or from \"To send\" in the owner app."],
    failed: ["", "The receipt could not be sent on WhatsApp. Use <b>Share</b> to send it from this device."],
    skipped: ["", "This customer has stopped WhatsApp messages — the receipt was <b>not</b> sent. Print it or use <b>Share</b>."],
  };
  function waNote(cfg) {
    const n = WA_NOTE[cfg.whatsapp] || (cfg.waConnected === false
      ? ["", "WhatsApp is not connected — the customer was <b>not</b> messaged. Use <b>Share</b>."] : null);
    return n ? `<p class="kb-note ${n[0]}">${n[1]}</p>` : "";
  }
  function done(el, cfg) {
    const o = cfg.order;
    const st = { tab: cfg.tagsOn ? "labels" : "receipt", labels: null, receipt: null, mode: "garment",
      size: "", picked: null, pending: null, lerr: "", rerr: "" };
    const n = o.number;

    function head() {
      const pcs = (o.items || []).filter((it) => it && !it.kind && String(it.unit || "pc") !== "kg")
        .reduce((s, it) => s + Math.max(0, Math.floor(Number(it.qty) || 0)), 0);
      return `<div class="kb-done-head">
        <span class="kb-done-ok" aria-hidden="true">✓</span>
        <div><div class="kb-eyebrow">Bill created</div><h3>${esc(n)}</h3>
          <p>${esc(o.customer || "Customer")}${pcs ? ` · ${pcs} pc${pcs === 1 ? "" : "s"}` : ""} · Total <b>${money(o.total)}</b>${o.paid ? ` · Paid ${money(o.paid)}` : ""} · Due <b class="${o.due > 0 ? "kb-red" : ""}">${money(o.due)}</b></p></div>
      </div>${waNote(cfg)}`;
    }
    function tabs() {
      const t = cfg.tagsOn ? [["labels", "Garment labels"], ["receipt", "Customer receipt"], ["status", "Status"]]
        : [["receipt", "Receipt"], ["status", "Status"]];
      return `<div class="kb-tabs" role="tablist">${t.map(([k, l]) =>
        `<button type="button" role="tab" class="${st.tab === k ? "on" : ""}" aria-selected="${st.tab === k}" data-kb-tab="${k}">${l}</button>`).join("")}</div>`;
    }

    /* ---- labels ---- */
    function groups(d) {
      const g = new Map();
      d.garments.forEach((x) => {
        const k = `${x.garment}|${x.service || ""}`;
        if (!g.has(k)) g.set(k, { garment: x.garment, service: x.service || "", codes: [] });
        g.get(k).codes.push(x.code);
      });
      return [...g.values()];
    }
    function labelsPane() {
      if (st.lerr) return `<p class="kb-note err">${esc(st.lerr)}</p><button type="button" class="kb-btn ghost" data-kb="lretry">Try again</button>`;
      const d = st.labels;
      if (!d) return `<div class="kb-skel"></div><div class="kb-skel"></div>`;
      const L = global.KKLabels;
      const modes = [d.garments.length && ["garment", "Per item"], ["bag", "Bag label"], (d.bags.length + d.bundle.length) && ["bundle", "Count labels"]].filter(Boolean);
      const codes = st.mode === "garment" ? [...st.picked] : null;
      const labels = L ? L.render(d, st.mode, codes) : [];
      const list = st.mode === "garment" ? `<div class="kb-sub">Select labels to print</div>
        <div class="kb-lab-list">${groups(d).map((g, i) => {
          const on = g.codes.filter((c) => st.picked.has(c)).length;
          return `<label class="kb-lab-row"><input type="checkbox" data-kb="lgroup" data-i="${i}" ${on === g.codes.length ? "checked" : ""}>
            <span>${icon(g.garment)}<b>${esc(g.garment)}</b> <small>(${g.codes.length} pc${g.codes.length > 1 ? "s" : ""}${g.service ? " · " + esc(g.service) : ""})</small></span>
            <em>${on} label${on === 1 ? "" : "s"}</em></label>`;
        }).join("")}</div>` : `<p class="kb-hint">${st.mode === "bag" ? "One label for the whole order bag." : "One count label per bag / group — checked at return."}</p>`;
      const sizes = (d.sizes || ["40x30", "50x30", "a4"]).map((s) =>
        `<button type="button" class="${st.size === s ? "on" : ""}" data-kb="lsize" data-v="${s}">${s === "a4" ? "A4" : s.replace("x", "×")}</button>`).join("");
      const printed = d.printed && d.printed[st.mode];
      return `<div class="kb-sub">Label type</div>
        <div class="kb-seg">${modes.map(([k, l]) => `<button type="button" class="${st.mode === k ? "on" : ""}" data-kb="lmode" data-v="${k}">${l}</button>`).join("")}</div>
        ${list}
        <div class="kb-lab-foot">
          <div class="kb-sub">Preview ${labels.length > 1 ? `<small>1 of ${labels.length}</small>` : ""}</div>
          <div class="kb-lab-prev kkl-${esc(st.size)}">${labels[0] || `<p class="kb-hint">Nothing selected.</p>`}</div>
          <div class="kb-sub">Size</div><div class="kb-seg sm">${sizes}</div>
          <p class="kb-hint">No phone number, name or address is printed.${printed ? ` Printed ${printed.times}× before — reprint keeps the same IDs.` : ""}</p>
        </div>
        <div class="kb-done-act">
          <button type="button" class="kb-btn go" data-kb="lprint" ${labels.length ? "" : "disabled"}>🖨 Print labels (${labels.length})</button>
        </div>
        <div class="kb-confirm" ${st.pending ? "" : "hidden"}>
          <b>Did the labels print correctly?</b>
          <div class="kb-row"><button type="button" class="kb-btn go sm" data-kb="llog" data-v="printed">Yes, printed</button>
          <button type="button" class="kb-btn ghost sm" data-kb="llog" data-v="failed">No — failed</button></div>
        </div>`;
    }
    async function loadLabels() {
      st.lerr = "";
      try {
        const d = await cfg.api(cfg.paths.labels(n));
        st.labels = d;
        st.size = d.size || "40x30";
        st.picked = new Set(d.garments.map((g) => g.code));
        st.mode = d.garments.length ? "garment" : d.default_mode || "bag";
      } catch (e) { st.lerr = e.message || "Could not load labels"; }
      paint();
    }

    /* ---- receipt ---- */
    function receiptPane() {
      if (st.rerr) return `<p class="kb-note err">${esc(st.rerr)}</p><button type="button" class="kb-btn ghost" data-kb="rretry">Try again</button>`;
      const r = st.receipt && st.receipt.bill;
      if (!r) return `<div class="kb-skel"></div><div class="kb-skel tall"></div>`;
      const rows = r.items.map((it) => `<tr><td>${esc(it.title)}${it.pieces && it.pieces.length ? `<small>${esc(it.pieces.map((p) => p[0] + " " + p[1]).join(", "))}</small>` : ""}</td>
        <td>${esc(it.kg ? it.qty + " kg" : it.qty)}</td><td>${it.rate == null ? "" : (it.saved ? `<s>${money(it.list_rate)}</s> ` : "") + money(it.rate)}</td><td>${it.amount == null ? "" : money(it.amount)}</td></tr>`).join("");
      const line = (l, v, cls = "") => `<div class="kb-rc-sum ${cls}"><span>${l}</span><span>${v}</span></div>`;
      return `<div class="kb-rc" id="kb-rc">
          <div class="kb-rc-shop"><b>${esc(r.shop)}</b>${r.address ? `<small>${esc(r.address)}</small>` : ""}${r.phone ? `<small>${esc(r.phone)}</small>` : ""}${r.gstin ? `<small>GSTIN ${esc(r.gstin)}</small>` : ""}</div>
          <div class="kb-rc-meta"><span>Bill no: <b>${esc(r.number)}</b></span><span>Date: ${esc(r.date)}</span><span>Customer: <b>${esc(r.customer)}</b></span></div>
          <table class="kb-rc-t"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
          ${r.has_total ? line("Subtotal", money(r.subtotal)) : ""}
          ${r.discount ? line("Discount", "−" + money(r.discount)) : ""}
          ${r.urgent_charge ? line("Urgent charge", money(r.urgent_charge)) : ""}
          ${r.gst ? line("GST", money(r.gst)) : ""}
          ${r.has_total ? line("Grand total", money(r.total), "big") : ""}
          ${r.paid ? line("Advance / paid", money(r.paid)) : ""}
          ${r.has_total ? line("Due", money(r.due), r.due > 0 ? "due" : "") : ""}
          ${r.saved ? line("You saved", money(r.saved), "saved") : ""}
          ${r.prev_due ? line(`Previous due (${r.prev_bills})`, money(r.prev_due), "due") : ""}
          ${r.delivery ? `<p class="kb-rc-when">Expected delivery: <b>${esc(r.delivery)}${r.delivery_time ? ", " + esc(r.delivery_time) : ""}</b></p>` : ""}
          ${global.KKLabels ? `<div class="kb-rc-bar">${global.KKLabels.barcodeSvg(r.number, { height: 34 })}</div>` : ""}
          <p class="kb-rc-foot">${esc(r.footer || "Thank you!")}</p>
        </div>
        <div class="kb-done-act">
          <button type="button" class="kb-btn go" data-kb="rprint">🖨 Print</button>
          <button type="button" class="kb-btn ghost" data-kb="rshare">💬 Share</button>
          <button type="button" class="kb-btn ghost" data-kb="rpdf">⬇ Download</button>
        </div>`;
    }
    async function loadReceipt() {
      st.rerr = "";
      try { st.receipt = await cfg.api(cfg.paths.receipt(n)); }
      catch (e) { st.rerr = e.message || "Could not load the receipt"; }
      paint();
    }

    /* ---- status ---- */
    function statusPane() {
      const created = o.created_at ? new Date(o.created_at) : new Date();
      const when = created.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      const st0 = o.status === "PICKUP_ASSIGNED"
        ? [["Pickup scheduled", "Delivery staff will collect the clothes", true, when]]
        : o.status === "PICKED_UP"
        ? [["Picked up", "Clothes collected from the customer", true, when]]
        : [["Received", "Clothes at the shop", true, when]];
      const rest = [["Washing", ""], ["Ironing", ""], cfg.qcOn && cfg.tagsOn && ["Quality check", ""], cfg.tagsOn && ["Packed", ""],
        ["Ready", o.fulfilment === "walkin" ? "Customer collects from the shop" : "Delivery staff is asked when they'll go"],
        [o.fulfilment === "walkin" ? "Collected" : "Delivered", o.delivery ? `Promised ${shortDate(o.delivery)}${o.delivery_time ? ", " + time12(o.delivery_time) : ""}` : ""]]
        .filter(Boolean).map(([t, s]) => [t, s, false, "Pending"]);
      return `<ol class="kb-tl">${st0.concat(rest).map(([t, s, ok, w]) =>
        `<li class="${ok ? "ok" : ""}"><i aria-hidden="true">${ok ? "✓" : ""}</i><div><b>${t}</b><small>${esc(w)}${s ? " · " + esc(s) : ""}</small></div></li>`).join("")}</ol>
        ${cfg.onTrack ? `<div class="kb-done-act"><button type="button" class="kb-btn ghost" data-kb="track">Open order</button></div>` : ""}`;
    }

    function paint() {
      const body = st.tab === "labels" ? labelsPane() : st.tab === "receipt" ? receiptPane() : statusPane();
      el.innerHTML = `<div class="kb-done">${head()}${tabs()}<div class="kb-done-body">${body}</div>
        <div class="kb-done-foot"><button type="button" class="kb-btn go wide" data-kb="new">＋ New bill</button></div></div>`;
    }
    function show(tab) {
      st.tab = tab;
      paint();
      if (tab === "labels" && !st.labels && !st.lerr) loadLabels();
      if (tab === "receipt" && !st.receipt && !st.rerr) loadReceipt();
    }

    el.onclick = async (e) => {
      const t = e.target.closest("[data-kb-tab],[data-kb]");
      if (!t || !el.contains(t)) return;
      if (t.dataset.kbTab) return show(t.dataset.kbTab);
      const a = t.dataset.kb, d = st.labels;
      if (a === "new") return cfg.onNew && cfg.onNew();
      if (a === "track") return cfg.onTrack && cfg.onTrack(n);
      if (a === "lretry") { st.labels = null; return show("labels"); }
      if (a === "rretry") { st.receipt = null; return show("receipt"); }
      if (a === "lmode") { st.mode = t.dataset.v; st.pending = null; return paint(); }
      if (a === "lsize") {
        st.size = t.dataset.v; paint();
        if (cfg.saveSize) { try { await cfg.saveSize(st.size); } catch (_) { /* sirf pasand */ } }
        return;
      }
      if (a === "lprint" && d && global.KKLabels) {
        const codes = st.mode === "garment" ? [...st.picked] : [];
        const labels = global.KKLabels.render(d, st.mode, st.mode === "garment" ? codes : null);
        if (!labels.length) return;
        st.pending = { kind: st.mode, codes, size: st.size };
        global.KKLabels.print(labels, st.size, () => paint());
        return;
      }
      if (a === "llog" && st.pending) {
        const p = st.pending;
        try {
          await cfg.api(cfg.paths.printEvent(n), { method: "POST", body: { kind: p.kind, codes: p.codes, size: p.size,
            status: t.dataset.v, error: t.dataset.v === "failed" ? "reported by user" : null, printed_by: cfg.printedBy } });
          if (t.dataset.v === "printed") d.printed[p.kind] = { times: ((d.printed[p.kind] || {}).times || 0) + 1 };
          st.pending = t.dataset.v === "printed" ? null : st.pending;
        } catch (err) { st.lerr = ""; }
        return paint();
      }
      if (a === "rprint") return cfg.onPrintReceipt && cfg.onPrintReceipt(n);
      if (a === "rshare") return cfg.onShare && cfg.onShare(n, st.receipt && st.receipt.bill_url);
      if (a === "rpdf") {
        // Browser ka print -> "Save as PDF". app.css / staff.css print mein body
        // ke seedhe bachchon mein sirf #receipt bachta hai, isliye card ki
        // nakal body ke neeche #kb-print mein (kk-labels.js wala tareeka);
        // print ke baad hata dete hain.
        const src = el.querySelector("#kb-rc");
        if (!src) return;
        let root = document.getElementById("kb-print");
        if (!root) { root = document.createElement("div"); root.id = "kb-print"; document.body.appendChild(root); }
        const copy = src.cloneNode(true);
        copy.removeAttribute("id");
        root.innerHTML = "";
        root.appendChild(copy);
        document.body.classList.add("kb-printing-rc");
        let finished = false;
        const off = () => {
          if (finished) return;
          finished = true;
          document.body.classList.remove("kb-printing-rc");
          root.remove();
          window.removeEventListener("afterprint", off);
        };
        window.addEventListener("afterprint", off);
        setTimeout(() => { window.print(); setTimeout(off, 600); }, 30);
      }
    };
    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.kb !== "lgroup" || !st.labels) return;
      const g = groups(st.labels)[+t.dataset.i];
      if (!g) return;
      g.codes.forEach((c) => (t.checked ? st.picked.add(c) : st.picked.delete(c)));
      paint();
    };
    show(st.tab);
  }

  /* ================= thermal receipt (services/thermal.py ki lines) =================
     Wahi design jo Bluetooth printer par chhapta hai: logo, bada naam, bada
     TOTAL, ulti "PAID" patti, UPI QR. Yahan preview aur browser print ke liye.
     Lines server par hi kati-bhari aati hain — yahan sirf roop. */
  function thermal(lines, opts) {
    const o = opts || {};
    const body = (lines || []).map((ln) => {
      if (ln.t === "logo") return o.logo ? `<div class="kt-img"><img class="kt-logo" src="${esc(o.logo)}" alt=""></div>` : "";
      if (ln.t === "qr") return ln.png ? `<div class="kt-img"><img class="kt-qr" src="${esc(ln.png)}" alt="QR code"></div>` : "";
      if (ln.t === "rule") return `<div class="kt-l">${esc(ln.s)}</div>`;
      const cls = ["kt-l", ln.a === "c" ? "kt-c" : ln.a === "r" ? "kt-r" : "", ln.b ? "kt-b" : "",
        ln.big === 2 ? "kt-x2" : ln.big === 1 ? "kt-h2" : "", ln.small ? "kt-sm" : "", ln.inv ? "kt-inv" : ""].filter(Boolean).join(" ");
      return `<div class="${cls}"><span>${esc(ln.s)}</span></div>`;
    }).join("");
    return `<div class="kt kt-${o.mm === 80 ? 80 : 58}">${body}</div>`;
  }
  /* RawBT (Android) ko printer ke bytes. Server ke ESC/POS (logo, QR, bold)
     na hon to purana saada text — wahi jo pehle jaata tha. */
  function rawbt(r) {
    let b64 = r && r.escpos_b64;
    if (!b64) {
      const body = "\x1b@" + String((r && r.print_text) || "").replace(/[^\x0a\x20-\x7e]/g, "") + "\n\n\n\n" + "\x1dVB\x00";
      b64 = btoa(body);
    }
    return `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  }
  /* Browser print (PC printer / phone ki print service): #receipt mein wahi
     design, logo aur QR load hone ke baad print */
  function printReceipt(el, r, logo) {
    if (r.print_lines) el.innerHTML = thermal(r.print_lines, { logo, mm: r.paper_mm });
    else el.innerHTML = (logo ? `<img class="rcpt-logo" src="${esc(logo)}" alt="">` : "") + `<span>${esc(r.print_text)}</span>`;
    el.className = r.paper_mm === 80 ? "paper-80" : "paper-58";
    const imgs = [...el.querySelectorAll("img")].filter((i) => !i.complete);
    if (!imgs.length) { global.print(); return; }
    let left = imgs.length;
    const one = () => { if (--left === 0) global.print(); };
    imgs.forEach((i) => { i.onload = i.onerror = one; });
  }

  global.KKBill = { icon, cat, fam, CATS, GARMENTS, steps, custTag, initials, shortDate, time12, timeOptions, done, money, esc,
    thermal, rawbt, printReceipt, combo, rateOptions, usual, keep, dropFocus, touch };
})(window);
