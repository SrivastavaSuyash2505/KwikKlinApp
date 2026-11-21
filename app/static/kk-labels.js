/* Kwik Klin labels — garment tag, order bag label, bundle/count label.
 *
 * Dashboard aur staff app dono isi file se chhaapte hain, taaki sticker
 * har jagah ek jaisa bane. Koi library nahi: Code128 neeche hai — har
 * USB/Bluetooth scanner aur phone camera (BarcodeDetector) isse padh leta hai.
 *
 * Barcode mein tag_no (sirf ank) jaata hai, Code128-C mein: do ank = ek
 * symbol. "KK-20261027-03-G01" Code128-B mein ~250 module banta — 40mm
 * label par 203dpi printer ke ~1 dot/lakeer, jo scanner nahi padhta. 6 ank
 * ka tag_no ~90 module: ~3 dot/lakeer.
 *
 * Label par kya NAHI hota: phone, naam, pata. Sirf dukaan ka naam, order
 * number aur kapde ka code (services/garments.py).
 *
 * Print: browser ka apna print. Thermal sticker printer (40x30 / 50x30)
 * ka driver/app page size wahi le leta hai; A4 par sheet ka grid. Kaunsa
 * printer sach mein chala, ye hum nahi jaante — isliye print ke baad
 * poochte hain "theek chhapa?" aur jawab hi print-event banta hai.
 */
(function (global) {
  "use strict";

  const PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
  ];
  const START_B = 104, START_C = 105, STOP = 106;

  /* text -> module widths (bar, space, bar, ...). Sirf ank aur joda ginti
     ho to Code128-C (aadha lamba), warna Code128-B. */
  function code128(text) {
    const s = String(text || "").replace(/[^\x20-\x7e]/g, "");
    const numeric = /^(\d\d)+$/.test(s);
    const values = [numeric ? START_C : START_B];
    if (numeric) for (let i = 0; i < s.length; i += 2) values.push(+s.slice(i, i + 2));
    else for (const ch of s) values.push(ch.charCodeAt(0) - 32);
    let sum = values[0];
    for (let i = 1; i < values.length; i++) sum += values[i] * i;
    values.push(sum % 103, STOP);
    return values.map((v) => PATTERNS[v]).join("");
  }

  /* SVG: har module 1 unit chauda; CSS se chaudai fit hoti hai. Quiet zone
     dono taraf 10 module — iske bina sasta scanner pehli bar chhod deta hai. */
  function barcodeSvg(text, opts) {
    const o = Object.assign({ height: 40, quiet: 10 }, opts || {});
    const widths = code128(text);
    let x = o.quiet, bars = "";
    for (let i = 0; i < widths.length; i++) {
      const w = +widths[i];
      if (i % 2 === 0) bars += `M${x} 0h${w}v${o.height}h-${w}z`;
      x += w;
    }
    const total = x + o.quiet;
    return `<svg class="kkl-bc" viewBox="0 0 ${total} ${o.height}" preserveAspectRatio="none" role="img" aria-label="Barcode ${esc(text)}"><path d="${bars}" fill="#000"/></svg>`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  const shortDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  /* ---------- the three label kinds ---------- */

  function garmentTag(d, g) {
    return `<div class="kkl kkl-tag">
      <div class="kkl-top"><b>${esc(d.shop_name)}</b>${d.urgent ? `<i class="kkl-urg">URGENT</i>` : ""}</div>
      <div class="kkl-no">${esc(d.order_number)}</div>
      <div class="kkl-what">${esc(g.garment)}${g.service ? ` · ${esc(g.service)}` : ""}</div>
      ${barcodeSvg(g.barcode)}
      <div class="kkl-foot"><span>${esc(g.code.split("-").pop())} · ${esc(g.position)}</span>${d.expected_delivery ? `<span>${esc(shortDate(d.expected_delivery))}</span>` : ""}</div>
    </div>`;
  }

  function orderBag(d) {
    const b = d.order_bag;
    const lines = b.by_service.map((s) => `<div class="kkl-row"><span>${esc(s.service)}</span><b>${pad2(s.count)}</b></div>`).join("") +
      (b.bags ? `<div class="kkl-row"><span>${b.bags} bag${b.bags > 1 ? "s" : ""} (kg)</span><b>${esc(b.kg_total)} kg</b></div>` : "");
    return `<div class="kkl kkl-bag">
      <div class="kkl-top"><b>ORDER BAG</b>${d.urgent ? `<i class="kkl-urg">URGENT</i>` : ""}</div>
      <div class="kkl-no">${esc(d.order_number)}</div>
      <div class="kkl-total">TOTAL: ${pad2(b.total_pieces)} PIECES</div>
      <div class="kkl-rows">${lines}</div>
      ${d.expected_delivery ? `<div class="kkl-foot"><span>Delivery ${esc(shortDate(d.expected_delivery))}</span></div>` : ""}
    </div>`;
  }

  function bundleLabels(d) {
    const out = [];
    for (const g of d.bundle) {
      out.push(`<div class="kkl kkl-bundle">
        <div class="kkl-top"><b>BUNDLE / COUNT</b></div>
        <div class="kkl-no">${esc(d.order_number)}</div>
        <div class="kkl-what">${esc(g.garment)} · ${esc(g.service)}</div>
        <div class="kkl-count">${pad2(g.count)} pcs</div>
        <div class="kkl-foot"><span>Count at return: <b>${pad2(g.count)}</b></span></div>
      </div>`);
    }
    for (const bag of d.bags) {
      const pcs = bag.pieces.reduce((n, p) => n + (p.qty || 0), 0);
      const list = bag.pieces.map((p) => `${esc(p.type)} ×${p.qty}`).join(", ");
      out.push(`<div class="kkl kkl-bundle">
        <div class="kkl-top"><b>${esc(bag.service || "KG BAG")}</b><span>${esc(bag.kg)} kg</span></div>
        <div class="kkl-no">${esc(d.order_number)}</div>
        ${list ? `<div class="kkl-what kkl-clip">${list}</div>` : `<div class="kkl-what">Weighed bag</div>`}
        ${barcodeSvg(bag.barcode, { height: 26 })}
        <div class="kkl-foot"><span>${esc(bag.code.split("-").pop())}</span><span>${pcs ? `Count at return: <b>${pad2(pcs)}</b>` : "Bag"}</span></div>
      </div>`);
    }
    return out;
  }

  /* mode + selected codes -> list of label HTML strings */
  function render(d, mode, codes) {
    if (mode === "bag") return [orderBag(d)];
    if (mode === "bundle") return bundleLabels(d);
    const pick = codes ? new Set(codes) : null;
    return d.garments.filter((g) => !pick || pick.has(g.code)).map((g) => garmentTag(d, g));
  }

  /* ---------- print ---------- */
  const SIZE = {
    "40x30": { w: 40, h: 30 },
    "50x30": { w: 50, h: 30 },
  };

  function print(labels, size, done) {
    let root = document.getElementById("kkl-print");
    if (!root) {
      root = document.createElement("div");
      root.id = "kkl-print";
      document.body.appendChild(root);
    }
    let css;
    if (size === "a4") {
      css = "@page{size:A4;margin:8mm}";
      root.className = "kkl-sheet";
    } else {
      const s = SIZE[size] || SIZE["40x30"];
      css = `@page{size:${s.w}mm ${s.h}mm;margin:0}#kkl-print .kkl{width:${s.w}mm;height:${s.h}mm}`;
      root.className = "kkl-roll kkl-" + (size || "40x30");
    }
    root.innerHTML = labels.join("");
    // Staff app ki CSP (style-src 'self') inline <style> gira deti hai — wahan
    // label galat kaagaz par chhapta. Constructable stylesheet CSP se nahi
    // rukti; purane browser par <style> hi.
    let style;
    if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in document) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      style = { remove: () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== sheet); } };
    } else {
      style = document.createElement("style");
      style.id = "kkl-page";
      style.textContent = css;
      document.head.appendChild(style);
    }
    document.body.classList.add("kkl-printing");
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove("kkl-printing");
      style.remove();
      root.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
      if (done) setTimeout(done, 50);
    };
    window.addEventListener("afterprint", cleanup);
    // Kuch Android browser afterprint nahi bhejte — print() lautne par bhi saaf karo
    setTimeout(() => { window.print(); setTimeout(cleanup, 400); }, 30);
  }

  global.KKLabels = { code128, barcodeSvg, render, print, esc };
})(window);
