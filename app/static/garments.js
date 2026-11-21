/* Garment tags + scan station — dashboard (owner/manager).
 *
 *   KKTags.success(order)      bill save ke baad: print / labels / share
 *   KKTags.openLabels(number)  label studio: garment tag, bag, bundle
 *   loadScanStation()          "Scan station" section: scanner + work board
 *
 * Layout do alag hain, ek hi data: desktop (>=1024px) par scanner + board
 * saath-saath; phone/tablet par scanner pehle, board stage-tabs mein.
 * Server hi sach hai (services/garments.py) — yahan sirf dikhana aur poochna.
 *
 * Kab dikhta hai: /admin/api/garments/status — plan (Premium/Business) +
 * owner ka Settings switch. Plan na ho to Scan station 🔒 (upgrade); plan
 * ho par switch band ho to ye kadam kahin nahi dikhte (nav, bill ke baad
 * labels, bill menu). QC switch band ho to QC station/kadam bhi nahi.
 *
 * Markup mein koi inline handler/style attribute nahi: dashboard ka CSP abhi
 * report-only hai par enforce hone wala hai (routers/admin.py). Har button
 * `data-kk="<action>"` rakhta hai aur neeche ek hi delegated listener sab
 * sambhalta hai; bar ki chaudai `data-w` se JS lagata hai.
 */
(function () {
  "use strict";

  const L = window.KKLabels;
  const enc = encodeURIComponent;
  const STAGE_LABEL = { RECEIVED: "Received", WASH: "Wash", IRON: "Iron", QC: "QC", PACKED: "Packed" };
  const STAGE_ICON = { RECEIVED: "📥", WASH: "🫧", IRON: "♨️", QC: "🔍", PACKED: "📦" };

  let GS = null;   // { plan_ok, enabled, qc, active }
  const tagsOn = () => !!(GS && GS.active);

  async function refresh() {
    try { GS = await api("/admin/api/garments/status"); } catch (_) { GS = null; }
    // Plan ho par owner ne band rakha ho to menu mein bhi nahi (plan na ho
    // to app.js ka feature-lock 🔒 dikhata hai — upgrade ka rasta)
    document.querySelectorAll('[data-s="scan"]').forEach((el) => { el.hidden = !!(GS && GS.plan_ok && !GS.enabled); });
    const root = $("scan-root");
    if (root) root.dataset.ready = "";   // station buttons QC ke hisaab se dobara bane
    paintSettings();
    return GS;
  }

  /* Settings -> Operations card */
  function paintSettings() {
    const on = $("gt-on"), qc = $("gt-qc");
    if (!on || !GS) return;
    on.checked = !!GS.enabled;
    qc.checked = !!GS.qc;
    on.disabled = qc.disabled = !GS.plan_ok;
    $("gt-lock").hidden = !!GS.plan_ok;
    $("gt-card").classList.toggle("gt-off", !GS.plan_ok || !GS.enabled);
  }

  async function toggleSetting(input) {
    const key = input.dataset.key, value = input.checked;
    input.disabled = true;
    try {
      await api("/admin/api/settings", { method: "PUT", body: { key, value } });
      await refresh();
      toast(key === "garment_tags_enabled"
        ? (value ? "Garment tags on — new bills get a tag per piece" : "Garment tags off — no tag or scan steps")
        : (value ? "QC step on — garments need QC before Packed" : "QC step off — Iron goes straight to Packed"));
    } catch (e) {
      input.checked = !value;
      toast(e.message, true);
    }
    input.disabled = !(GS && GS.plan_ok);
  }
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };

  /* ================================================================
     1. Order created — wireframe C
     ================================================================ */
  function unitCounts(items) {
    let pcs = 0, bags = 0;
    for (const it of items || []) {
      if (!it || it.kind === "urgent_charge" || it.kind === "extra_charge" || it.kind === "due_charge") continue;
      const kg = String(it.unit || "").toLowerCase() === "kg" || (!it.unit && Number(it.qty) % 1 !== 0);
      if (kg) bags += 1; else pcs += Math.max(0, Math.floor(Number(it.qty) || 0));
    }
    return { pcs, bags };
  }

  function success(o) {
    const n = esc(o.order_number);
    const wa = typeof waConnected === "function" ? waConnected() : false;
    const { pcs, bags } = unitCounts(o.items);
    const paid = Number(o.amount_paid || 0), total = Number(o.total_amount || 0);
    const due = Math.max(0, total - paid);
    const tags = tagsOn();
    const row = (icon, title, sub, act, cls = "") =>
      `<button type="button" class="os-act ${cls}" ${act}>
        <span class="os-ic" aria-hidden="true">${icon}</span>
        <span class="os-tx"><b>${title}</b><small>${sub}</small></span>
        <span class="os-chev" aria-hidden="true">›</span></button>`;
    openModal(`<div class="os">
      <div class="os-head">
        <div class="os-eyebrow">Order created</div>
        <div class="os-no">${n}</div>
        <div class="os-chips">
          <span class="os-chip ok">✓ Saved</span>
          ${wa ? `<span class="os-chip info">WhatsApp: auto-message queued</span>`
               : `<span class="os-chip warn">WhatsApp: not sent</span>`}
        </div>
        <p class="os-sum">${esc(displayName(o.customer_name, o.customer_phone))}
          · ${pcs} pc${pcs === 1 ? "" : "s"}${bags ? ` + ${bags} kg bag${bags > 1 ? "s" : ""}` : ""}
          · Total <b>${total ? money(total) : "—"}</b>${paid ? ` · Advance ${money(paid)}` : ""}
          · Due <b class="${due ? "os-due" : ""}">${money(due)}</b></p>
      </div>
      <div class="os-list">
        ${row("🧾", "Print bill receipt", "58/80 mm thermal or browser print", `data-kk="receipt" data-n="${n}"`)}
        ${tags && pcs ? row("🏷️", "Print garment labels", `${pcs} unique tag${pcs === 1 ? "" : "s"} — one per piece`, `data-kk="labels" data-n="${n}" data-mode="garment"`, "os-primary") : ""}
        ${tags ? row("🛍️", "Print bag / bundle label", bags ? `Order bag + ${bags} kg bag count label${bags > 1 ? "s" : ""}` : "One order-level label with item count", `data-kk="labels" data-n="${n}" data-mode="${bags && !pcs ? "bundle" : "bag"}"`) : ""}
        ${wa ? row("📲", "Send bill from shop number", "WhatsApp API — only if the customer's 24h window is open", `data-kk="wabill" data-n="${n}"`) : ""}
        ${row("💬", "Share bill on WhatsApp", "Opens WhatsApp on this device (wa.me)", `data-kk="share" data-n="${n}"`)}
        ${row("📋", "Open order detail", "Staff tasks, garments and status timeline", `data-kk="detail" data-n="${n}"`)}
      </div>
      ${!wa ? `<p class="os-note">WhatsApp is not connected, so the customer has <b>not</b> been messaged. Use “Share bill on WhatsApp”.</p>` : ""}
      <div class="os-foot"><button class="btn" data-kk="close">Done — next bill</button></div>
    </div>`);
  }

  /* ================================================================
     2. Label studio — wireframe D
     ================================================================ */
  let LS = null;   // { d, mode, size, codes:Set }

  async function openLabels(number, mode) {
    if (!tagsOn()) {
      if (GS && !GS.plan_ok && typeof showUpgrade === "function") showUpgrade("barcode_tracking");
      else toast("Garment tags are off — turn them on in Settings → Operations", true);
      return;
    }
    openModal(`<div class="ls ls-loading"><div class="ls-skel"></div><p class="muted">Preparing labels for ${esc(number)}…</p></div>`);
    let d;
    try { d = await api(`/admin/api/orders/${enc(number)}/labels`); }
    catch (e) {
      openModal(`<div class="ls"><h3>🏷️ Labels — ${esc(number)}</h3>
        <p class="os-note err">${esc(e.message)}</p>
        <div class="btnrow"><button class="btn" data-kk="labels" data-n="${esc(number)}" data-mode="${esc(mode || "")}">Try again</button>
        <button class="btn ghost" data-kk="close">Close</button></div></div>`);
      return;
    }
    const valid = { garment: d.garments.length > 0, bag: true, bundle: d.bundle.length + d.bags.length > 0 };
    LS = { d, mode: valid[mode] ? mode : d.default_mode, size: d.size, codes: new Set(d.garments.map((g) => g.code)) };
    paintStudio();
  }

  function studioCounts() {
    const d = LS.d;
    return {
      garment: LS.codes.size,
      bag: 1,
      bundle: d.bundle.length + d.bags.length,
    };
  }

  function paintStudio() {
    const d = LS.d, c = studioCounts();
    const printed = (k) => d.printed[k] ? `<em class="ls-printed">Printed ${d.printed[k].times}×</em>` : "";
    const modeCard = (k, title, sub, disabled) => `<label class="ls-mode ${LS.mode === k ? "on" : ""} ${disabled ? "off" : ""}">
        <input type="radio" name="ls-mode" value="${k}" data-kk="mode" ${LS.mode === k ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="ls-dot" aria-hidden="true"></span>
        <span class="ls-mtx"><b>${title} ${printed(k)}</b><small>${sub}</small></span></label>`;
    const sizes = d.sizes.map((s) => `<button type="button" class="ls-size ${LS.size === s ? "on" : ""}" aria-pressed="${LS.size === s}" data-kk="size" data-v="${s}">${s === "a4" ? "A4 sheet" : s.replace("x", " × ") + " mm"}</button>`).join("");
    const picker = LS.mode === "garment" && d.garments.length > 1 ? `<details class="ls-pick">
        <summary>Choose tags <span>${LS.codes.size} of ${d.garments.length}</span></summary>
        <div class="ls-pick-row"><button type="button" class="linkish" data-kk="all" data-v="1">Select all</button><button type="button" class="linkish" data-kk="all" data-v="">Clear</button></div>
        <div class="ls-pick-list">${d.garments.map((g) => `<label><input type="checkbox" data-kk="pick" data-v="${esc(g.code)}" ${LS.codes.has(g.code) ? "checked" : ""}>
          <span><b>${esc(g.code.split("-").pop())}</b> ${esc(g.garment)}</span></label>`).join("")}</div></details>` : "";
    const labels = L.render(d, LS.mode, LS.mode === "garment" ? [...LS.codes] : null);
    const n = labels.length;
    openModal(`<div class="ls">
      <div class="ls-bar">
        <div><div class="os-eyebrow">Labels</div><h3>${esc(d.order_number)}</h3></div>
        <button type="button" class="ls-x" aria-label="Close" data-kk="close">✕</button>
      </div>
      <div class="ls-grid">
        <aside class="ls-side">
          <div class="ls-sec">Label type</div>
          <div class="ls-modes" role="radiogroup">
            ${modeCard("garment", "Individual garment tags", `${d.garments.length} pieces · one unique barcode each`, !d.garments.length)}
            ${modeCard("bundle", "Bundle / count labels", d.bags.length ? `${d.bags.length} kg bag${d.bags.length > 1 ? "s" : ""}${d.bundle.length ? ` + ${d.bundle.length} groups` : ""} · count at return` : `${d.bundle.length} groups · count at return`, !(d.bundle.length + d.bags.length))}
            ${modeCard("bag", "Order bag label", `${d.order_bag.total_pieces} pieces${d.order_bag.bags ? ` + ${d.order_bag.kg_total} kg` : ""} · one per package`, false)}
          </div>
          ${picker}
          <div class="ls-sec">Label size</div>
          <div class="ls-sizes">${sizes}</div>
          <p class="ls-hint">${LS.size === "a4" ? "Prints a grid on A4 sticker sheets with any printer." : "For a thermal sticker printer — set the same size in its print dialog."}
            No phone number, name or address is printed.</p>
        </aside>
        <section class="ls-preview" aria-label="Print preview">
          <div class="ls-canvas ${LS.size === "a4" ? "a4" : "roll"} kkl-${LS.size}">${labels.join("") || `<p class="muted">Nothing selected.</p>`}</div>
        </section>
      </div>
      <div class="ls-actions">
        <span class="ls-count"><b>${n}</b> label${n === 1 ? "" : "s"}${d.printed[LS.mode] ? " · reprint (same IDs)" : ""}</span>
        <button class="btn ghost" data-kk="close">Close</button>
        <button class="btn ls-go" ${n ? "" : "disabled"} data-kk="print">🖨 Print ${n} label${n === 1 ? "" : "s"}</button>
      </div>
      <div id="ls-confirm" class="ls-confirm" hidden></div>
    </div>`);
  }

  async function saveSize(size) {
    LS.size = size;
    paintStudio();
    try { await api("/admin/api/settings", { method: "PUT", body: { key: "label_size", value: size } }); }
    catch (_) { /* preference only — printing still works */ }
  }

  function doPrint() {
    const codes = LS.mode === "garment" ? [...LS.codes] : [];
    const labels = L.render(LS.d, LS.mode, LS.mode === "garment" ? codes : null);
    if (!labels.length) return;
    const ask = () => {
      const box = $("ls-confirm");
      if (!box) return;
      box.hidden = false;
      box.innerHTML = `<b>Did the labels print correctly?</b>
        <div class="btnrow"><button class="btn" data-kk="log" data-v="printed">Yes, printed</button>
        <button class="btn ghost" data-kk="log" data-v="failed">No — failed</button></div>`;
      box.scrollIntoView({ block: "nearest" });
    };
    LS.pending = { kind: LS.mode, codes, size: LS.size };
    L.print(labels, LS.size, ask);
  }

  async function logPrint(status) {
    const p = LS && LS.pending;
    if (!p) return;
    try {
      const r = await api(`/admin/api/orders/${enc(LS.d.order_number)}/labels/print-event`, {
        method: "POST",
        body: { kind: p.kind, codes: p.codes, size: p.size, status, error: status === "failed" ? "reported by user" : null, printed_by: "dashboard" },
      });
      LS.pending = null;
      if (status === "printed") {
        toast(r.reprint ? "Reprint logged — same tag IDs" : "Labels logged as printed");
        const k = p.kind;
        LS.d.printed[k] = { times: ((LS.d.printed[k] || {}).times || 0) + 1 };
        paintStudio();
      } else {
        const box = $("ls-confirm");
        if (box) box.innerHTML = `<b>Logged as failed.</b> The order is safe — check the printer and press Print again. Tag IDs won't change.`;
      }
    } catch (e) { toast(e.message, true); }
  }

  /* ================================================================
     3. Order detail drawer: garment progress
     ================================================================ */
  async function drawerGarments(number, el) {
    if (!el || !tagsOn()) return;
    try {
      const d = await api(`/admin/api/orders/${enc(number)}/garments`);
      if (!d.units.length) { el.innerHTML = ""; return; }
      const total = d.units.length, packed = d.counts.PACKED || 0;
      el.innerHTML = `<hr class="hr"><div class="od-gar">
        <div class="od-gar-h"><b>Garments</b><span>${packed}/${total} packed</span></div>
        <div class="od-gar-bar"><i data-w="${Math.round(packed / total * 100)}"></i></div>
        <div class="od-gar-st">${Object.keys(STAGE_LABEL).map((s) => `<span class="${d.counts[s] ? "has" : ""}">${STAGE_LABEL[s]} <b>${d.counts[s] || 0}</b></span>`).join("")}</div>
        <button class="btn ghost sm" data-kk="labels" data-n="${esc(number)}">🏷️ Labels</button></div>`;
      bars(el);
    } catch (_) { el.innerHTML = ""; }
  }

  /* ================================================================
     4. Scan station — wireframe E
     ================================================================ */
  const ST = { station: "", current: null, recent: [], board: null, tab: "RECEIVED", camera: null, busy: false };

  function loadScanStation() {
    const root = $("scan-root");
    if (!root) return;
    if (!tagsOn()) {
      root.dataset.ready = "";
      root.innerHTML = GS && !GS.plan_ok
        ? `<div class="sc-empty"><b>🔒 Garment tags & scan</b><p>Available on the Premium and Business plans.</p>
            <button class="btn" data-kk="upgrade">See plans</button></div>`
        : `<div class="sc-empty"><b>Garment tags & scanner are off</b><p>Turn them on to tag every garment and track it through Wash, Iron${GS && GS.qc ? ", QC" : ""} and Packed.</p>
            <button class="btn" data-kk="gt-settings">Open Settings</button></div>`;
      return;
    }
    if (!root.dataset.ready) {
      root.dataset.ready = "1";
      root.innerHTML = `
        <div class="sc-layout">
          <section class="sc-scan card">
            <div class="sc-scan-head">
              <h3>Scan or type a tag</h3>
              <div class="sc-station" role="group" aria-label="Station mode">
                <span>Station</span>
                ${["", "WASH", "IRON", ...(GS.qc ? ["QC"] : []), "PACKED"].map((s) => `<button type="button" data-station="${s}" class="${ST.station === s ? "on" : ""}">${s ? STAGE_LABEL[s] : "Off"}</button>`).join("")}
              </div>
            </div>
            <form class="sc-input" id="sc-form" autocomplete="off">
              <span class="sc-bc" aria-hidden="true">▥</span>
              <input id="sc-code" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="Scan or type tag code" aria-label="Garment tag code">
              <button class="btn" type="submit">Find</button>
            </form>
            <div class="sc-tools">
              <button type="button" class="btn ghost sm" id="sc-cam" hidden>📷 Use camera</button>
              <span class="sc-hint" id="sc-hint">Station <b>Off</b>: scan shows the garment, you pick the stage.</span>
            </div>
            <div class="sc-video" id="sc-video" hidden><video playsinline muted></video><button type="button" class="sc-video-x" aria-label="Stop camera">✕</button></div>
            <div id="sc-result" class="sc-result" aria-live="polite"></div>
            <div class="sc-recent" id="sc-recent"></div>
          </section>
          <section class="sc-board card" aria-label="Today's work board">
            <div class="sc-board-head"><h3>Today's work board</h3><button type="button" class="btn ghost sm" id="sc-refresh">↻ Refresh</button></div>
            <div class="sc-tabs" id="sc-tabs" role="tablist"></div>
            <div class="sc-cols" id="sc-cols"></div>
          </section>
        </div>`;
      $("sc-form").addEventListener("submit", (e) => { e.preventDefault(); submitCode($("sc-code").value, "scanner"); });
      root.querySelectorAll("[data-station]").forEach((b) => b.addEventListener("click", () => setStation(b.dataset.station)));
      $("sc-refresh").addEventListener("click", loadBoard);
      if ("BarcodeDetector" in window && navigator.mediaDevices) {
        $("sc-cam").hidden = false;
        $("sc-cam").addEventListener("click", startCamera);
        $("sc-video").querySelector(".sc-video-x").addEventListener("click", stopCamera);
      }
      $("sc-cols").addEventListener("click", (e) => {
        const card = e.target.closest("[data-code]");
        if (card) submitCode(card.dataset.code, "manual", true);
      });
      $("sc-tabs").addEventListener("click", (e) => {
        const t = e.target.closest("[data-tab]");
        if (t) { ST.tab = t.dataset.tab; paintBoard(); }
      });
    }
    paintResult();
    loadBoard();
    setTimeout(() => { const i = $("sc-code"); if (i && window.matchMedia("(pointer:fine)").matches) i.focus(); }, 50);
  }

  function setStation(s) {
    ST.station = s;
    document.querySelectorAll("#scan-root [data-station]").forEach((b) => b.classList.toggle("on", b.dataset.station === s));
    $("sc-hint").innerHTML = s
      ? `Station <b>${STAGE_LABEL[s]}</b>: every scan moves the garment to ${STAGE_LABEL[s]} straight away.`
      : `Station <b>Off</b>: scan shows the garment, you pick the stage.`;
    $("sc-code").focus();
  }

  async function submitCode(raw, method, lookOnly) {
    const code = String(raw || "").trim();
    if (!code || ST.busy) return;
    ST.busy = true;
    $("sc-code").value = "";
    try {
      let out;
      if (ST.station && !lookOnly) {
        out = await api("/admin/api/garments/scan", { method: "POST", body: { code, to_stage: ST.station, method } });
        flash(out.result === "already" ? "same" : "ok", out);
      } else {
        out = await api(`/admin/api/garments/lookup?code=${enc(code)}`);
      }
      ST.current = out;
      paintResult();
      if (out.result === "moved") loadBoard();
    } catch (e) {
      // Bag label ka barcode = order number. Wo scan hua to order ke kapde dikhao.
      if (/not\s*found|No garment/i.test(e.message) && /^[A-Z]+-\d{6,8}-\d+$/i.test(code)) {
        try { await showOrderUnits(code.toUpperCase()); ST.busy = false; return; } catch (_) {}
      }
      flash("err", null, e.message);
    }
    ST.busy = false;
    const i = $("sc-code"); if (i) i.focus();
  }

  async function move(stage) {
    const c = ST.current;
    if (!c || ST.busy) return;
    ST.busy = true;
    try {
      const out = await api("/admin/api/garments/scan", { method: "POST", body: { code: c.unit.code, to_stage: stage, method: "manual" } });
      ST.current = out;
      flash(out.result === "already" ? "same" : "ok", out);
      paintResult();
      loadBoard();
    } catch (e) { flash("err", null, e.message); }
    ST.busy = false;
  }

  function flash(kind, out, msg) {
    if (kind === "err") vibrate([90, 60, 90]); else vibrate(40);
    const r = { at: new Date(), kind, code: out ? out.unit.code : "", garment: out ? out.unit.garment : "", stage: out ? out.unit.stage : "", msg };
    ST.recent = [r, ...ST.recent].slice(0, 8);
    if (kind === "err") {
      $("sc-result").innerHTML = `<div class="sc-card sc-err" role="alert"><b>Can't do that</b><p>${esc(msg)}</p></div>`;
      ST.current = null;
    }
    paintRecent();
  }

  function paintRecent() {
    const el = $("sc-recent");
    if (!el) return;
    el.innerHTML = ST.recent.length ? `<div class="sc-sec">This session</div>` + ST.recent.map((r) =>
      `<div class="sc-rec ${r.kind}"><span>${r.kind === "err" ? "✕" : r.kind === "same" ? "=" : "✓"}</span>
        <b>${esc(r.code ? r.code.split("-").slice(-1)[0] : "—")}</b>
        <em>${r.kind === "err" ? esc(r.msg) : `${esc(r.garment)} → ${STAGE_LABEL[r.stage] || ""}${r.kind === "same" ? " (already)" : ""}`}</em>
        <time>${r.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</time></div>`).join("") : "";
  }

  function paintResult() {
    const el = $("sc-result");
    if (!el) return;
    const c = ST.current;
    if (!c) {
      if (!el.innerHTML) el.innerHTML = `<div class="sc-card sc-idle"><span>▥</span><p>Scan a garment tag to see where it is and move it to the next stage.</p></div>`;
      return;
    }
    const u = c.unit, o = c.order;
    const stepper = u.path.map((s) => {
      const i = u.path.indexOf(s), cur = u.path.indexOf(u.stage);
      return `<li class="${s === u.stage ? "cur" : i < cur ? "done" : ""}"><span>${STAGE_ICON[s]}</span>${STAGE_LABEL[s]}</li>`;
    }).join("");
    const forward = u.next.filter((s) => u.path.indexOf(s) > u.path.indexOf(u.stage));
    const back = u.next.filter((s) => u.path.indexOf(s) < u.path.indexOf(u.stage));
    const sib = c.siblings || [];
    const packed = sib.filter((s) => s.stage === "PACKED").length;
    el.innerHTML = `<div class="sc-card sc-hit ${c.result === "moved" ? "pulse" : ""}">
      <div class="sc-hit-top">
        <div><div class="os-eyebrow">${c.result === "moved" ? "Moved" : c.result === "already" ? "Already here" : "Match found"}</div>
          <div class="sc-what">${esc(u.garment)} <span>· ${esc(u.service || "")}</span></div>
          <div class="sc-meta">${esc(u.code)} · ${esc(u.position)}${o.priority === "urgent" ? ` · <b class="sc-urg">URGENT</b>` : ""}${o.expected_delivery ? ` · due ${fmtDate(o.expected_delivery)}` : ""}</div></div>
        <span class="sc-stage st-${u.stage}">${STAGE_LABEL[u.stage]}</span>
      </div>
      <ol class="sc-steps">${stepper}</ol>
      ${forward.length ? `<div class="sc-sec">Move to</div><div class="sc-moves">${forward.map((s, i) => `<button type="button" class="sc-move ${i === 0 ? "primary" : ""}" data-kk="move" data-v="${s}">${STAGE_ICON[s]} ${STAGE_LABEL[s]}</button>`).join("")}</div>` : ""}
      ${back.length ? `<div class="sc-sec">Send back</div><div class="sc-moves">${back.map((s) => `<button type="button" class="sc-move back" data-kk="move" data-v="${s}">↩ ${STAGE_LABEL[s]}</button>`).join("")}</div>` : ""}
      <div class="sc-order">
        <div class="sc-order-h"><span>Order <b>${esc(o.order_number)}</b>${o.customer_first_name ? ` · ${esc(o.customer_first_name)}` : ""}</span><span>${packed}/${sib.length} packed</span></div>
        <div class="od-gar-bar"><i data-w="${sib.length ? Math.round(packed / sib.length * 100) : 0}"></i></div>
        <div class="sc-sibs">${sib.map((s) => `<span class="st-${s.stage} ${s.code === u.code ? "me" : ""}" title="${esc(s.garment)} — ${STAGE_LABEL[s.stage]}">${esc(s.code.split("-").pop())}</span>`).join("")}</div>
        ${c.order_all_packed && !["READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status) ? `<button class="btn sc-ready" data-kk="ready" data-n="${esc(o.order_number)}">✅ All packed — mark order Ready</button>
          <small class="muted">Marking Ready sends the customer the usual “ready” message.</small>` : ""}
      </div>
    </div>`;
    bars(el);
  }

  async function showOrderUnits(number) {
    const d = await api(`/admin/api/orders/${enc(number)}/garments`);
    const packed = d.counts.PACKED || 0;
    $("sc-result").innerHTML = `<div class="sc-card"><div class="os-eyebrow">Order bag</div>
      <div class="sc-what">${esc(number)} <span>· ${d.units.length} tags</span></div>
      <div class="od-gar-bar"><i data-w="${d.units.length ? Math.round(packed / d.units.length * 100) : 0}"></i></div>
      <div class="sc-unitlist">${d.units.map((u) => `<button type="button" data-kk="look" data-v="${esc(u.code)}"><b>${esc(u.code.split("-").pop())}</b> ${esc(u.garment)}<span class="sc-stage st-${u.stage}">${STAGE_LABEL[u.stage]}</span></button>`).join("")}</div></div>`;
    bars($("sc-result"));
    ST.current = null;
  }

  async function markReady(number) {
    try {
      await api(`/orders/${enc(number)}/status`, { method: "POST", body: { status: "READY", changed_by: "dashboard" } });
      toast(`${number} marked Ready`);
      if (ST.current) { ST.current.order.status = "READY"; paintResult(); }
    } catch (e) { toast(e.message, true); }
  }

  async function loadBoard() {
    const cols = $("sc-cols");
    if (!cols) return;
    if (!ST.board) cols.innerHTML = `<div class="sc-skel"></div><div class="sc-skel"></div><div class="sc-skel"></div>`;
    try {
      ST.board = await api("/admin/api/garments/board");
      paintBoard();
    } catch (e) {
      cols.innerHTML = `<div class="sc-card sc-err"><p>${esc(e.message)}</p><button class="btn ghost sm" data-kk="board">Retry</button></div>`;
    }
  }

  function paintBoard() {
    const b = ST.board;
    if (!b) return;
    $("sc-tabs").innerHTML = b.stages.map((s) => `<button type="button" role="tab" data-tab="${s.key}" aria-selected="${ST.tab === s.key}" class="${ST.tab === s.key ? "on" : ""}">${STAGE_LABEL[s.key]}<b>${s.count}</b></button>`).join("");
    // Desktop par column patle hain: "KK-2026" chhupta hai, "…1027-03" dikhta hai
    const orderNo = (n) => `<i class="sc-on-head">${esc(n.slice(0, -7))}</i><i class="sc-on-tail">${esc(n.slice(-7))}</i>`;
    const due = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const card = (i) => `<button type="button" class="sc-item ${i.urgent ? "urg" : ""}" data-code="${esc(i.code)}" title="${esc(i.garment)} · ${esc(i.code)}">
        <b><i class="sc-nm">${esc(i.garment)}</i><em>${esc(i.code.split("-").pop())}</em></b><span>${orderNo(i.order_number)}</span>${i.due ? `<small>due ${due(i.due)}</small>` : ""}</button>`;
    $("sc-cols").innerHTML = b.stages.map((s) => `<div class="sc-col ${ST.tab === s.key ? "on" : ""}" data-stage="${s.key}">
        <div class="sc-col-h"><span>${STAGE_ICON[s.key]} ${STAGE_LABEL[s.key]}</span><b>${s.count}</b></div>
        <div class="sc-col-b">${s.items.length ? s.items.slice(0, 60).map(card).join("") + (s.items.length > 60 ? `<p class="sc-more">+${s.items.length - 60} more</p>` : "") : `<p class="sc-none">Nothing here</p>`}</div>
      </div>`).join("") + (b.truncated ? `<p class="sc-more">Showing the first ${b.stages.reduce((n, s) => n + s.items.length, 0)} of ${b.total}.</p>` : "");
  }

  /* camera: BarcodeDetector (Chrome/Android). Na ho to button chhupa rehta hai. */
  async function startCamera() {
    const box = $("sc-video"), video = box.querySelector("video");
    try {
      const det = new window.BarcodeDetector({ formats: ["code_128"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      await video.play();
      box.hidden = false;
      ST.camera = { stream, det, last: "", lastAt: 0 };
      const tick = async () => {
        if (!ST.camera) return;
        try {
          const found = await det.detect(video);
          const v = found[0] && found[0].rawValue;
          const now = Date.now();
          if (v && (v !== ST.camera.last || now - ST.camera.lastAt > 2500)) {
            ST.camera.last = v; ST.camera.lastAt = now;
            await submitCode(v, "camera");
          }
        } catch (_) {}
        if (ST.camera) setTimeout(tick, 250);
      };
      tick();
    } catch (e) {
      toast("Camera not available — type the code or use a USB scanner", true);
      stopCamera();
    }
  }
  function stopCamera() {
    if (ST.camera) { ST.camera.stream.getTracks().forEach((t) => t.stop()); ST.camera = null; }
    const box = $("sc-video"); if (box) box.hidden = true;
  }

  /* bar ki chaudai — CSSOM se, style="" attribute se nahi (CSP) */
  function bars(root) {
    (root || document).querySelectorAll("[data-w]").forEach((el) => { el.style.width = (+el.dataset.w || 0) + "%"; });
  }

  /* ---------- ek hi delegated listener ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kk]");
    if (!b || b.disabled || b.tagName === "INPUT") return;
    const n = b.dataset.n, v = b.dataset.v;
    switch (b.dataset.kk) {
      case "close": closeModal(); break;
      case "receipt": printReceiptFromOrder(n); break;
      case "labels": openLabels(n, b.dataset.mode); break;
      case "wabill": waBill(n); break;
      case "share": closeModal(); shareBillFromOrder(n); break;
      case "detail": closeModal(); orderDetail(n); break;
      case "size": saveSize(v); break;
      case "all": LS.codes = new Set(v ? LS.d.garments.map((g) => g.code) : []); paintStudio(); break;
      case "print": doPrint(); break;
      case "log": logPrint(v); break;
      case "upgrade": showUpgrade("barcode_tracking"); break;
      case "gt-settings": go("settings"); if (typeof stTab === "function") stTab("ops"); break;
      case "move": move(v); break;
      case "ready": markReady(n); break;
      case "board": loadBoard(); break;
      case "look": submitCode(v, "manual", true); break;
      default: return;
    }
    e.preventDefault();
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.kk === "gt-toggle") { toggleSetting(t); return; }
    if (!t.dataset || !LS) return;
    if (t.dataset.kk === "mode") { LS.mode = t.value; paintStudio(); }
    else if (t.dataset.kk === "pick") { if (t.checked) LS.codes.add(t.dataset.v); else LS.codes.delete(t.dataset.v); paintStudio(); }
  });

  window.loadScanStation = loadScanStation;
  window.KKTags = { success, openLabels, drawerGarments, tagsOn, refresh, paintSettings, _stopCamera: stopCamera };
})();
