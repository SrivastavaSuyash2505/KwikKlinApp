/* Growth Control Center + owner's daily actions + customer "next action".
 *
 *   loadGrowth()                     "Growth" section (nav)
 *   KKGrowth.customerCard(phone, el) customer page ka suggestion card
 *
 * Har number server se aata hai, uski paribhasha ke saath
 * (services/growth.py). Yahan kuch ginti nahi hoti — sirf dikhana.
 * Markup mein koi inline handler/style nahi (CSP): `data-gr` + ek
 * delegated listener; bar ki chaudai data-w se.
 */
(function () {
  "use strict";

  const G = { days: 30, data: null, actions: null, busy: false };
  const enc = encodeURIComponent;
  const num = (v) => new Intl.NumberFormat("en-IN").format(Number(v || 0));
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  function skel(n) { return Array.from({ length: n }, () => `<div class="gr-skel"></div>`).join(""); }

  async function loadGrowth() {
    const root = $("growth-root");
    if (!root) return;
    if (!root.dataset.ready) {
      root.dataset.ready = "1";
      root.innerHTML = `
        <section class="gr-actions card" aria-labelledby="gr-act-h">
          <div class="gr-head"><div><h3 id="gr-act-h">Today: do these next</h3><p class="muted">Each card is a fact from your records. It disappears when the number hits zero.</p></div>
            <button type="button" class="btn ghost sm" data-gr="refresh">↻ Refresh</button></div>
          <div id="gr-actions" class="gr-cards">${skel(3)}</div>
        </section>
        <section class="gr-metrics">
          <div class="gr-head">
            <div><h3>Growth Control Center</h3><p class="muted">Tracked facts, not estimates. Tap ⓘ for what each number means.</p></div>
            <div class="gr-period" role="group" aria-label="Period">
              ${[7, 30, 90].map((d) => `<button type="button" data-gr="days" data-v="${d}" class="${G.days === d ? "on" : ""}">${d} days</button>`).join("")}
            </div>
          </div>
          <div id="gr-kpis" class="gr-kpis">${skel(4)}</div>
          <div class="gr-grid">
            <div class="card gr-funnel"><div class="gr-card-h"><b>Enquiry → order funnel</b><button type="button" class="gr-info" data-gr="defs" aria-label="Definitions">ⓘ</button></div><div id="gr-funnel"></div></div>
            <div class="card gr-roi"><div class="gr-card-h"><b>Campaign ROI</b><span class="muted" id="gr-roi-note"></span></div><div id="gr-roi" class="gr-table-wrap"></div></div>
          </div>
          <div id="gr-defs" class="card gr-defs" hidden></div>
        </section>`;
    }
    await Promise.all([loadActions(), loadMetrics()]);
  }

  /* ---------- daily actions (wireframe I) ---------- */
  async function loadActions() {
    const el = $("gr-actions");
    if (!el) return;
    try { G.actions = await api("/admin/api/growth/actions"); }
    catch (e) { el.innerHTML = `<div class="gr-empty err">${esc(e.message)} <button class="btn ghost sm" data-gr="refresh">Retry</button></div>`; return; }
    const items = G.actions.items || [];
    if (!items.length) { el.innerHTML = `<div class="gr-empty">✅ Nothing waiting on you right now.</div>`; return; }
    el.innerHTML = items.map((i) => `<article class="gr-card pr-${i.priority} ${i.snoozed ? "snoozed" : ""}">
        <div class="gr-card-top"><span class="gr-pri">${i.priority === "high" ? "HIGH" : i.priority === "medium" ? "MED" : "LOW"}</span>
          ${i.snoozed ? `<span class="gr-snz">hidden for today</span>` : `<button type="button" class="gr-x" data-gr="snooze" data-v="${esc(i.key)}" aria-label="Hide for today">✕</button>`}</div>
        <b>${esc(i.title)}</b>
        <p>${esc(i.evidence)}</p>
        ${i.customers ? `<div class="gr-chips">${i.customers.slice(0, 5).map((c) => `<button type="button" class="gr-chip" data-gr="customer" data-v="${esc(c.phone)}">${esc(c.name)} <small>+${c.days_overdue}d</small></button>`).join("")}</div>` : ""}
        <button type="button" class="gr-go" data-gr="open" data-section="${esc(i.action.section)}" data-tab="${esc(i.action.tab || "")}" data-filter="${esc(i.action.filter || "")}">${esc(i.action.label)} ›</button>
      </article>`).join("");
  }

  /* ---------- metrics (wireframe G) ---------- */
  async function loadMetrics() {
    const k = $("gr-kpis");
    if (!k) return;
    try { G.data = await api(`/admin/api/growth/overview?days=${G.days}`); }
    catch (e) { k.innerHTML = `<div class="gr-empty err">${esc(e.message)}</div>`; $("gr-funnel").innerHTML = ""; $("gr-roi").innerHTML = ""; return; }
    const d = G.data, f = d.funnel, r = d.repeat;
    const campCollected = (d.campaigns || []).reduce((n, c) => n + c.collected, 0);
    const tile = (label, value, sub, cls = "") => `<div class="gr-kpi ${cls}"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
    k.innerHTML =
      tile("New leads", num(f.enquiries), `last ${d.days} days`) +
      tile("Lead → order", `${pct(f.booked, f.enquiries)}%`, `${num(f.booked)} booked · ${num(f.delivered)} delivered`) +
      tile("Repeat order revenue", money(r.repeat_collected), `${num(r.repeat_orders)} repeat orders · ${r.repeat_share_pct}% of orders`, "ok") +
      tile("Collected from campaigns", money(campCollected), "received payments, not just bills", "ok");

    const steps = [["Enquiries", f.enquiries], ["Replied", f.replied], ["Order booked", f.booked], ["Delivered", f.delivered]];
    const max = Math.max(1, ...steps.map((s) => s[1]));
    $("gr-funnel").innerHTML = steps.map(([l, v], i) => `<div class="gr-bar s${i}"><i data-w="${Math.max(6, Math.round((v / max) * 100))}"></i><span>${l}</span><b>${num(v)}</b></div>`).join("") +
      `<div class="gr-foot">Collected from this cohort: <b>${money(f.collected)}</b>${Object.keys(f.by_source || {}).length ? ` · sources: ${Object.entries(f.by_source).map(([s, n]) => `${esc(s)} ${n}`).join(", ")}` : ""}</div>`;
    bars($("gr-funnel"));

    const rows = d.campaigns || [];
    $("gr-roi-note").textContent = rows.length ? `orders within ${d.attribution_days} days of the message` : "";
    $("gr-roi").innerHTML = rows.length ? `<table class="gr-table"><thead><tr><th>Campaign</th><th>Sent</th><th>Replies</th><th>Orders</th><th>Collected</th><th>Offer cost</th><th>Net</th></tr></thead><tbody>${rows.map((c) => `<tr><td><b>${esc(c.name)}</b><small>${esc(c.segment || "")}${c.coupon ? ` · ${esc(c.coupon)}` : ""}</small></td><td>${num(c.sent)}</td><td>${num(c.replies)}</td><td>${num(c.orders)}</td><td>${money(c.collected)}</td><td>${c.offer_cost ? money(c.offer_cost) : "—"}</td><td class="${c.net < 0 ? "neg" : ""}">${money(c.net)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="gr-empty">No campaigns sent in this period.</div>`;
    const defs = $("gr-defs");
    if (defs) defs.innerHTML = `<div class="gr-card-h"><b>What these numbers mean</b><button type="button" class="gr-info" data-gr="defs" aria-label="Close">✕</button></div><dl>${Object.entries(d.definitions).map(([k2, v]) => `<dt>${esc(k2.replace(/_/g, " "))}</dt><dd>${esc(v)}</dd>`).join("")}</dl><p class="muted">Window: ${esc(d.from)} to ${esc(d.to)} (IST). Attribution window: ${d.attribution_days} days.</p>`;
  }

  /* ---------- customer page card (wireframe F) ---------- */
  async function customerCard(phone, el) {
    if (!el) return;
    el.innerHTML = `<div class="gr-next"><div class="gr-skel"></div></div>`;
    let n;
    try { n = await api(`/admin/api/customers/${enc(phone)}/next-action`); }
    catch (e) { el.innerHTML = ""; return; }   // plan ke bahar ya galti: chup
    const meta = n.usual_gap_days
      ? `Usually every ~${n.usual_gap_days} days · last order ${n.days_since_last} days ago${n.usual_items && n.usual_items.length ? ` · usually ${esc(n.usual_items.slice(0, 3).join(", "))}` : ""}`
      : esc(n.why);
    let body;
    if (n.kind === "repeat_reminder" && n.eligible) {
      body = `<p class="gr-why"><b>Why:</b> ${esc(n.why)} No outstanding risk flagged.</p>
        <p class="gr-why"><b>Next action:</b> send a polite pickup reminder. Opt-out, monthly cap, active order and bad-rating checks pass now and are re-checked on send.</p>
        ${n.quiet_hours ? `<p class="gr-quiet">🌙 Quiet hours now — the message will wait until morning.</p>` : ""}
        <div class="gr-preview" hidden id="gr-prev-${esc(phone)}">${esc(n.preview)}</div>
        <div class="gr-next-act"><button type="button" class="btn ghost sm" data-gr="preview" data-v="${esc(phone)}">Preview reminder</button>
          <button type="button" class="btn sm" data-gr="send" data-v="${esc(phone)}">Send reminder</button></div>`;
    } else if (n.kind === "repeat_reminder") {
      body = `<p class="gr-why"><b>Due for a repeat</b>, but no reminder: ${esc(reasonText(n.blocked_reason))}.</p>`;
    } else {
      body = `<p class="gr-why">${esc(n.why)}</p>`;
    }
    el.innerHTML = `<div class="gr-next"><div class="gr-next-h"><span class="os-eyebrow">AI suggestion</span><span class="muted">${meta}</span></div>${body}</div>`;
  }

  function reasonText(r) {
    return ({ name_not_saved: "name not saved — save it in Customers first", opted_out: "customer opted out of marketing", active_order: "there is an active order", frequency_cap: "monthly message cap reached",
      recent_bad_rating: "a recent bad rating — talk to them first", monthly_cap: "monthly message cap reached" })[r] || (r || "blocked by the marketing gate");
  }

  async function sendReminder(phone, btn) {
    if (G.busy) return;
    G.busy = true;
    const old = btn.textContent; btn.disabled = true; btn.textContent = "Sending…";
    try {
      await api(`/admin/api/customers/${enc(phone)}/next-action/send`, { method: "POST", body: { sent_by: "dashboard" } });
      toast("Reminder sent");
      btn.textContent = "Sent ✓";
    } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = old; }
    G.busy = false;
  }

  function bars(root) {
    (root || document).querySelectorAll("[data-w]").forEach((el) => { el.style.width = (+el.dataset.w || 0) + "%"; });
  }

  async function openAction(b) {
    const sec = b.dataset.section, tab = b.dataset.tab, filter = b.dataset.filter;
    if (sec === "bills" && filter) {
      // Bills ka payment filter: "unpaid" option ko naam se dhoondho — value kuch bhi ho
      const sel = document.querySelector('#sec-bills select[aria-label="Payment filter"]');
      if (sel) {
        const opt = [...sel.options].find((o) => /unpaid|due|pending/i.test(o.textContent + " " + o.value));
        if (opt && typeof billFilter !== "undefined") { billFilter.pay = opt.value; sel.value = opt.value; }
      }
    }
    go(sec);
    if (sec === "settings" && tab && typeof stTab === "function") stTab(tab);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gr]");
    if (!b) return;
    const v = b.dataset.v;
    switch (b.dataset.gr) {
      case "refresh": {
        // Number wahi rahen to bhi dikhe ki taaza hua
        const old = b.innerHTML;
        b.disabled = true; b.textContent = "Refreshing…";
        loadGrowth().then(() => toast("Growth updated")).catch((err) => toast(err.message, true))
          .finally(() => { b.disabled = false; b.innerHTML = old; });
        break;
      }
      case "days": G.days = +v; document.querySelectorAll('[data-gr="days"]').forEach((x) => x.classList.toggle("on", +x.dataset.v === G.days)); loadMetrics(); break;
      case "defs": { const d = $("gr-defs"); if (d) { d.hidden = !d.hidden; if (!d.hidden) d.scrollIntoView({ block: "nearest", behavior: "smooth" }); } break; }
      case "snooze": api(`/admin/api/growth/actions/${enc(v)}/snooze`, { method: "POST", body: {} }).then(loadActions).catch((err) => toast(err.message, true)); break;
      case "open": openAction(b); break;
      case "customer": go("customers"); setTimeout(() => openCustomerDetail(v), 250); break;
      case "preview": { const p = $(`gr-prev-${v}`); if (p) p.hidden = !p.hidden; break; }
      case "send": sendReminder(v, b); break;
      default: return;
    }
    e.preventDefault();
  });

  window.loadGrowth = loadGrowth;
  window.KKGrowth = { customerCard, loadActions };
})();
