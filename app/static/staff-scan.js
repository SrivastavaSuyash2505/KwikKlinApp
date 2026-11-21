/* Staff app: kapde ka tag scan karo, agle stage par bhejo.
 *
 * Phone par: upar station chun lo (jaise "Wash"), camera kholo aur ek ke
 * baad ek tag dikhate jao — har scan seedha Wash mein. Station "Off" ho to
 * scan sirf dikhata hai, stage tum chunte ho. USB/Bluetooth scanner bhi
 * chalta hai: wo keyboard ki tarah input mein likh kar Enter dabata hai.
 *
 * Kaun kya kar sakta hai, ye server tay karta hai (routers/garments.py):
 * delivery wala sirf apne order ka tag dekh sakta hai, stage nahi badal
 * sakta. Yahan bas wahi dikhate hain jo server ne `can_scan` mein kaha.
 *
 * Staff page ka CSP sakht hai — koi inline onclick/style nahi; sab
 * delegated listener aur classes se.
 */
(function () {
  "use strict";

  const LABEL = { RECEIVED: "Received", WASH: "Wash", IRON: "Iron", QC: "QC", PACKED: "Packed" };
  const ICON = { RECEIVED: "📥", WASH: "🫧", IRON: "♨️", QC: "🔍", PACKED: "📦" };
  const PROCESSING = ["WASHER", "IRONER", "SUPERVISOR", "MANAGER", "ADMIN"];
  const S = { station: "", cur: null, log: [], cam: null, busy: false, board: null, tab: "RECEIVED" };
  const canMove = () => typeof ME !== "undefined" && ME && PROCESSING.includes(ME.role);
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };
  const short = (code) => String(code || "").split("-").pop();

  function showStaffScan() {
    NAV = "scan";
    $("chips").innerHTML = "";
    $("today").hidden = true;
    const stations = canMove()
      ? `<div class="ss-stations" role="group" aria-label="Station">
          ${["", "WASH", "IRON", ...(ME.garment_qc === false ? [] : ["QC"]), "PACKED"].map((s) => `<button type="button" data-ss="station" data-v="${s}" class="${S.station === s ? "on" : ""}">${s ? ICON[s] + " " + LABEL[s] : "Off"}</button>`).join("")}
        </div>
        <p class="ss-hint" id="ss-hint"></p>`
      : `<p class="ss-hint">You can look up tags for your own pickups and deliveries.</p>`;
    $("list").innerHTML = `<div class="ss">
      <div class="ss-grid">
        <section class="ss-left">
          ${stations}
          <div class="ss-cam" id="ss-cam">
            <video playsinline muted hidden></video>
            <div class="ss-cam-off" id="ss-cam-off">
              <span class="ss-cam-ic" aria-hidden="true">▥</span>
              <b>Scan with camera</b>
              <small>Point at the barcode on the tag</small>
              <button type="button" class="btn go" data-ss="cam">📷 Start camera</button>
            </div>
            <button type="button" class="ss-cam-x" data-ss="camstop" aria-label="Stop camera" hidden>✕</button>
          </div>
          <form class="ss-input" id="ss-form" autocomplete="off">
            <input id="ss-code" autocapitalize="characters" spellcheck="false" placeholder="Type or scan tag code" aria-label="Tag code">
            <button class="btn go" type="submit">Find</button>
          </form>
        </section>
        <section class="ss-right">
          <div id="ss-result" aria-live="polite"></div>
          <div id="ss-log"></div>
        </section>
      </div>
      ${canMove() ? `<section class="ss-board"><div class="ss-board-h"><b>Today's work</b><button type="button" class="linkbtn" data-ss="board">↻</button></div>
        <div class="ss-tabs" id="ss-tabs"></div><div class="ss-items" id="ss-items"></div></section>` : ""}
    </div>`;
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices) {
      $("ss-cam").classList.add("nocam");
      $("ss-cam-off").innerHTML = `<span class="ss-cam-ic" aria-hidden="true">⌨</span><b>Type the code</b>
        <small>This phone's browser can't read barcodes with the camera. A USB/Bluetooth scanner works in the box below.</small>`;
    }
    $("ss-form").addEventListener("submit", (e) => { e.preventDefault(); find($("ss-code").value, "scanner"); });
    hint();
    paint();
    if (canMove()) loadBoard();
  }

  function hint() {
    const h = $("ss-hint");
    if (!h) return;
    h.innerHTML = S.station
      ? `Every scan goes straight to <b>${LABEL[S.station]}</b>.`
      : `Scan shows the garment — then tap where it goes.`;
  }

  async function find(raw, method, lookOnly) {
    const code = String(raw || "").trim();
    if (!code || S.busy) return;
    S.busy = true;
    if ($("ss-code")) $("ss-code").value = "";
    try {
      let out;
      if (S.station && canMove() && !lookOnly) {
        out = await api("/garments/scan", { method: "POST", body: { code, to_stage: S.station, method } });
      } else {
        out = await api(`/garments/lookup?code=${encodeURIComponent(code)}`);
      }
      S.cur = out;
      note(out.result === "already" ? "same" : out.result === "moved" ? "ok" : "look", out);
      if (out.result === "moved") loadBoard();
    } catch (e) {
      S.cur = null;
      note("err", null, e.message);
    }
    S.busy = false;
    paint();
  }

  async function move(stage) {
    if (!S.cur || S.busy) return;
    S.busy = true;
    try {
      const out = await api("/garments/scan", { method: "POST", body: { code: S.cur.unit.code, to_stage: stage, method: "manual" } });
      S.cur = out;
      note(out.result === "already" ? "same" : "ok", out);
      loadBoard();
    } catch (e) { note("err", null, e.message); toast(e.message, true); }
    S.busy = false;
    paint();
  }

  function note(kind, out, msg) {
    buzz(kind === "err" ? [90, 60, 90] : 40);
    if (kind === "look") return;
    S.log = [{ kind, code: out ? out.unit.code : "", g: out ? out.unit.garment : "", st: out ? out.unit.stage : "", msg, at: new Date() }, ...S.log].slice(0, 6);
    if (kind === "err") S.errMsg = msg; else S.errMsg = "";
  }

  function paint() {
    const r = $("ss-result");
    if (!r) return;
    if (S.errMsg && !S.cur) {
      r.innerHTML = `<div class="ss-card ss-err" role="alert"><b>Can't do that</b><p>${esc(S.errMsg)}</p></div>`;
    } else if (!S.cur) {
      r.innerHTML = `<div class="ss-card ss-idle">Scan a tag — the garment and its next step show up here.</div>`;
    } else {
      const u = S.cur.unit, o = S.cur.order;
      const at = u.path.indexOf(u.stage);
      const steps = u.path.map((s, i) => `<li class="${i < at ? "done" : i === at ? "cur" : ""}"><span>${ICON[s]}</span>${LABEL[s]}</li>`).join("");
      const can = S.cur.can_scan !== false && canMove();
      const fwd = can ? u.next.filter((s) => u.path.indexOf(s) > at) : [];
      const back = can ? u.next.filter((s) => u.path.indexOf(s) < at) : [];
      const sib = S.cur.siblings || [];
      const packed = sib.filter((x) => x.stage === "PACKED").length;
      const head = S.cur.result === "moved" ? "Moved ✓" : S.cur.result === "already" ? "Already here" : "Found";
      r.innerHTML = `<div class="ss-card ss-hit ${S.cur.result === "moved" ? "pulse" : ""}">
        <div class="ss-top"><span class="ss-eyebrow">${head}</span><span class="ss-pill st-${u.stage}">${LABEL[u.stage]}</span></div>
        <div class="ss-what">${esc(u.garment)}</div>
        <div class="ss-meta">${esc(u.service || "")} · <b>${esc(short(u.code))}</b> · ${esc(u.position)}${o.priority === "urgent" ? ` · <b class="ss-urg">URGENT</b>` : ""}</div>
        <ol class="ss-steps">${steps}</ol>
        ${fwd.length ? `<div class="ss-moves">${fwd.map((s, i) => `<button type="button" class="ss-move ${i === 0 ? "pri" : ""}" data-ss="move" data-v="${s}">${ICON[s]} ${LABEL[s]}</button>`).join("")}</div>` : ""}
        ${back.length ? `<div class="ss-moves">${back.map((s) => `<button type="button" class="ss-move back" data-ss="move" data-v="${s}">↩ Back to ${LABEL[s]}</button>`).join("")}</div>` : ""}
        <div class="ss-order"><span>${esc(o.order_number)}${o.customer_first_name ? " · " + esc(o.customer_first_name) : ""}</span><b>${packed}/${sib.length} packed</b></div>
        <div class="ss-sibs">${sib.map((x) => `<button type="button" data-ss="look" data-v="${esc(x.code)}" class="st-${x.stage} ${x.code === u.code ? "me" : ""}" title="${esc(x.garment)} — ${LABEL[x.stage]}">${esc(short(x.code))}</button>`).join("")}</div>
        ${S.cur.order_all_packed ? `<p class="ss-done">✅ Every garment of this order is packed. Tell the manager it's ready.</p>` : ""}
      </div>`;
    }
    const lg = $("ss-log");
    if (lg) lg.innerHTML = S.log.map((l) => `<div class="ss-log ${l.kind}"><i>${l.kind === "err" ? "✕" : l.kind === "same" ? "=" : "✓"}</i>
      <span>${l.kind === "err" ? esc(l.msg) : `<b>${esc(short(l.code))}</b> ${esc(l.g)} → ${LABEL[l.st] || ""}`}</span>
      <time>${l.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</time></div>`).join("");
  }

  async function loadBoard() {
    if (!canMove() || !$("ss-items")) return;
    try { S.board = await api("/garments/board"); } catch (e) { $("ss-items").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    paintBoard();
  }
  function paintBoard() {
    const b = S.board;
    if (!b || !$("ss-tabs")) return;
    $("ss-tabs").innerHTML = b.stages.map((s) => `<button type="button" data-ss="tab" data-v="${s.key}" class="${S.tab === s.key ? "on" : ""}">${LABEL[s.key]} <b>${s.count}</b></button>`).join("");
    const col = b.stages.find((s) => s.key === S.tab) || b.stages[0];
    $("ss-items").innerHTML = col.items.length
      ? col.items.slice(0, 40).map((i) => `<button type="button" class="ss-item ${i.urgent ? "urg" : ""}" data-ss="look" data-v="${esc(i.code)}">
          <b>${esc(i.garment)}</b><span>${esc(short(i.code))} · ${esc(i.order_number)}</span></button>`).join("")
        + (col.items.length > 40 ? `<p class="ss-hint">+${col.items.length - 40} more</p>` : "")
      : `<p class="ss-hint">Nothing in ${LABEL[col.key]} right now.</p>`;
  }

  async function startCam() {
    const box = $("ss-cam"), video = box.querySelector("video");
    try {
      const det = new window.BarcodeDetector({ formats: ["code_128"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      $("ss-cam-off").hidden = true;
      box.querySelector(".ss-cam-x").hidden = false;
      box.classList.add("live");
      S.cam = { stream, last: "", at: 0 };
      const tick = async () => {
        if (!S.cam) return;
        try {
          const hit = await det.detect(video);
          const v = hit[0] && hit[0].rawValue, now = Date.now();
          if (v && (v !== S.cam.last || now - S.cam.at > 2500)) { S.cam.last = v; S.cam.at = now; await find(v, "camera"); }
        } catch (_) {}
        if (S.cam) setTimeout(tick, 250);
      };
      tick();
    } catch (e) {
      toast("Camera didn't open — allow camera access, or type the code", true);
      stopStaffScan();
    }
  }

  function stopStaffScan() {
    if (S.cam) { S.cam.stream.getTracks().forEach((t) => t.stop()); S.cam = null; }
    const box = $("ss-cam");
    if (!box) return;
    box.classList.remove("live");
    const v = box.querySelector("video"); if (v) { v.hidden = true; v.srcObject = null; }
    const off = $("ss-cam-off"); if (off) off.hidden = false;
    const x = box.querySelector(".ss-cam-x"); if (x) x.hidden = true;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ss]");
    if (!b) return;
    const v = b.dataset.v;
    switch (b.dataset.ss) {
      case "station":
        S.station = v;
        document.querySelectorAll('[data-ss="station"]').forEach((x) => x.classList.toggle("on", x.dataset.v === v));
        hint();
        break;
      case "cam": startCam(); break;
      case "camstop": stopStaffScan(); break;
      case "move": move(v); break;
      case "look": find(v, "manual", true); window.scrollTo({ top: 0, behavior: "smooth" }); break;
      case "tab": S.tab = v; paintBoard(); break;
      case "board": loadBoard(); break;
      default: return;
    }
  });

  window.showStaffScan = showStaffScan;
  window.stopStaffScan = stopStaffScan;
})();
