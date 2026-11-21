/* Plan ki muddat ka gol ring: Solo, staff app, dashboard Settings.
 * Din yahin ginte hain (IST ki aaj ki tareekh se), isliye app khula rahe to bhi
 * aadhi raat ko aur wapas aane par ring khud naya ho jaata hai — server call nahi.
 * Style markup mein nahi (staff app ka CSP); ring ka hissa SVG attribute se. */
(function () {
  "use strict";

  const WORDS = {
    hi: { left: "दिन बाकी", until: "तक", today: "आज ख़त्म", over: "ख़त्म", trial: "ट्रायल", on: "चालू", refill: "AI और WhatsApp फिर भरेंगे" },
    en: { left: "days left", until: "until", today: "Ends today", over: "Ended", trial: "Trial", on: "Active", refill: "AI and WhatsApp refill on" },
  };
  const C = 2 * Math.PI * 44;
  const todayIST = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const date = (iso, lang) => new Date(iso + "T00:00:00").toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });

  function state(starts, ends) {
    const left = days(todayIST(), ends);
    const pct = left <= 0 ? 0 : Math.min(100, left / Math.max(1, days(starts, ends)) * 100);
    return { left: Math.max(0, left), pct, over: left < 0, cls: left <= 3 ? "hot" : pct <= 30 ? "warm" : "ok" };
  }
  const label = (s, w) => (s.over ? w.over : s.left === 0 ? w.today : w.left);
  const dash = (pct) => `${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}`;

  function html(v, lang) {
    if (!v) return "";
    const w = WORDS[lang] || WORDS.en;
    const name = `<b class="kkpr-name">${esc(v.plan)}${v.trial ? ` <em>${w.trial}</em>` : ""}</b>`;
    if (!v.ends_on) return `<div class="kkpr"><div class="kkpr-text">${name}<small>${w.on}</small></div></div>`;
    const s = state(v.starts_on, v.ends_on);
    return `<div class="kkpr ${s.cls}" data-starts="${esc(v.starts_on)}" data-ends="${esc(v.ends_on)}" data-lang="${lang}">
      <svg class="kkpr-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44"/><circle class="on" cx="50" cy="50" r="44" stroke-dasharray="${dash(s.pct)}"/></svg>
      <div class="kkpr-mid"><b>${s.left}</b><small>${label(s, w)}</small></div>
      <div class="kkpr-text">${name}
        <span>${w === WORDS.hi ? `${date(v.ends_on, lang)} ${w.until}` : `${w.until} ${date(v.ends_on, lang)}`}</span>
        ${v.refills_on ? `<small>${w.refill}: ${date(v.refills_on, lang)}</small>` : ""}</div></div>`;
  }

  function refresh() {
    document.querySelectorAll(".kkpr[data-ends]").forEach((el) => {
      const s = state(el.dataset.starts, el.dataset.ends), w = WORDS[el.dataset.lang] || WORDS.en;
      el.classList.remove("ok", "warm", "hot");
      el.classList.add(s.cls);
      el.querySelector("circle.on").setAttribute("stroke-dasharray", dash(s.pct));
      el.querySelector(".kkpr-mid b").textContent = s.left;
      el.querySelector(".kkpr-mid small").textContent = label(s, w);
    });
  }
  function atMidnight() {
    const ms = 864e5 - ((Date.now() + 5.5 * 36e5) % 864e5);
    setTimeout(() => { refresh(); atMidnight(); }, ms + 1000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  atMidnight();

  window.KKPlanRing = { html, refresh };
})();
