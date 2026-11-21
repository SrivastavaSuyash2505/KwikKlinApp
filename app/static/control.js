/* KwikKlin Control — vendor panel.
 *
 * Strict-CSP safe: no inline handlers/styles anywhere, everything wired
 * with addEventListener + event delegation (data-act attributes).
 * Auth: the master key never touches web storage — it is exchanged once
 * for an httpOnly cookie (POST /control/api/session); every later call is
 * just credentials:"same-origin".
 */
"use strict";

/* ---------- tiny i18n layer: one voice (English), swappable ------------- */
const STR = {
  en: {
    signedInAs: (l, lv) => `signed in as ${l} (${lv})`,
    signedOut: "not signed in",
    loadFail: "Could not load",
    retry: "Retry",
    empty: { tenants: ["🏪", "No tenants match", "Clear the filters or add your first client."],
             billing: ["💳", "No billing events yet", "Payments and reminders will show up here."],
             audit: ["🛰", "Nothing logged yet", "Actions you take will appear here."],
             keys: ["🔑", "No per-admin keys", "The .env master key is in use. Create scoped keys to rotate safely."] },
  },
};
const L = "en";
const t = (k) => STR[L][k];

/* ---------- dom helpers ------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString("en-IN",
  { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const announce = (msg) => { $("live").textContent = msg; };

function toast(msg, kind = "ok") {
  const box = el("div", `toast toast-${kind}`, msg);
  $("toasts").appendChild(box);
  setTimeout(() => box.remove(), kind === "err" ? 7000 : 4000);
  announce(msg);
}

/* ---------- API (cookie session; no key in storage) --------------------- */
let LEVEL = "read";
const can = (need) => ({ read: 0, write: 1, danger: 2 })[LEVEL] >= ({ read: 0, write: 1, danger: 2 })[need];

async function api(path, opts = {}) {
  const init = Object.assign({ credentials: "same-origin", headers: {} }, opts);
  if (init.body && typeof init.body !== "string") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  if (!init.signal && typeof AbortSignal !== "undefined" && AbortSignal.timeout) init.signal = AbortSignal.timeout(60000);
  let r;
  try { r = await fetch(path, init); }
  catch (e) {
    if (e && e.name === "TimeoutError") throw new Error("The server is taking too long. Check if it saved before you try again.");
    throw e;
  }
  if (r.status === 401) { showSignin(); throw new Error("Session expired — sign in again"); }
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { detail = (await r.json()).detail || detail; } catch (e) {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return r.status === 204 ? null : r.json();
}

/* Every mutating action goes through this: toast on both paths, never a
   silent failure, and the caller stays readable. */
async function act(fn, okMsg) {
  try {
    const out = await fn();
    if (okMsg) toast(okMsg, "ok");
    return out;
  } catch (e) {
    toast(e.message, "err");
    throw e;
  }
}

/* ---------- state / empty / skeleton renderers -------------------------- */
function skeletonRows(tbody, rows, cols) {
  tbody.replaceChildren();
  for (let i = 0; i < rows; i++) {
    const tr = el("tr"), td = el("td");
    td.colSpan = cols;
    td.appendChild(el("span", "skel skel-row"));
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}
function stateRow(tbody, cols, [ico, title, msg], action) {
  tbody.replaceChildren();
  const tr = el("tr"), td = el("td");
  td.colSpan = cols;
  const box = el("div", "state");
  box.appendChild(el("span", "ico", ico));
  box.appendChild(el("div", "title", title));
  box.appendChild(el("div", null, msg));
  if (action) {
    const b = el("button", "btn-primary", action.label);
    b.addEventListener("click", action.onClick);
    const wrap = el("div", "mt");
    wrap.appendChild(b);
    box.appendChild(wrap);
  }
  td.appendChild(box);
  tr.appendChild(td);
  tbody.appendChild(tr);
}
const errState = (tbody, cols, err, retry) =>
  stateRow(tbody, cols, ["⚠️", t("loadFail"), err.message], { label: t("retry"), onClick: retry });

/* ---------- URL-synced filter state (shareable views) ------------------- */
const T = { sort: "created_at", order: "desc", cursor: "", offset: 0, stack: [] };

function readUrl() {
  const p = new URLSearchParams(location.search);
  $("t-search").value = p.get("q") || "";
  $("t-status").value = p.get("status") || "";
  $("t-plan").value = p.get("plan") || "";
  $("show-deleted").checked = p.get("deleted") === "1";
  T.sort = p.get("sort") || "created_at";
  T.order = p.get("order") || "desc";
}
function writeUrl() {
  const p = new URLSearchParams();
  const q = $("t-search").value.trim(), st = $("t-status").value, pl = $("t-plan").value;
  if (q) p.set("q", q);
  if (st) p.set("status", st);
  if (pl) p.set("plan", pl);
  if ($("show-deleted").checked) p.set("deleted", "1");
  if (T.sort !== "created_at") p.set("sort", T.sort);
  if (T.order !== "desc") p.set("order", T.order);
  const qs = p.toString();
  history.replaceState(null, "", (qs ? `?${qs}` : location.pathname) + location.hash);
}

/* ---------- KPIs (drill-down + comparison tooltip) ---------------------- */
const KPI_FILTER = { Trial: "trial", "Past due": "past_due", Active: "active" };

async function loadKpis() {
  const box = $("summary");
  if (!box.children.length) {
    for (let i = 0; i < 8; i++) box.appendChild(el("span", "skel card"));
  }
  let k;
  try { k = await api("/control/api/kpis"); }
  catch (e) { box.replaceChildren(el("div", "state", `${t("loadFail")}: ${e.message}`)); return; }
  KPI_LAST = k;
  if (CURRENT_VIEW === "dashboard") paintAttention();
  const tr = k.trends || {};
  const since = tr._since ? `vs ${new Date(tr._since).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : "";
  const tiles = [
    ["Clients", k.clients, tr.clients], ["Active", k.active, tr.active],
    ["Trial", k.trial, null], ["Past due", k.past_due, tr.past_due],
    ["Churned", k.churned, null], ["New (mo)", k.new_this_month, null],
    ["MRR", inr(k.mrr_inr), tr.mrr_inr], ["ARR", inr(k.arr_inr), tr.mrr_inr],
  ];
  box.replaceChildren();
  for (const [label, value, trend] of tiles) {
    const filter = KPI_FILTER[label];
    const node = el(filter ? "button" : "div", "card");
    if (filter) {
      node.type = "button";
      node.dataset.filter = filter;
      node.setAttribute("aria-pressed", String($("t-status").value === filter));
      node.title = `Show only ${label.toLowerCase()} tenants`;
    }
    const b = el("b", null, String(value));
    if (trend != null) {
      const up = trend >= 0;
      // Never colour alone: the arrow AND a signed number carry the meaning,
      // and the exact comparison period lives in the tooltip.
      const chip = el("span", `trend ${up ? "trend-up" : "trend-down"}`,
        ` ${up ? "▲" : "▼"} ${Math.abs(trend)}%`);
      chip.title = `${up ? "Up" : "Down"} ${Math.abs(trend)}% ${since}`;
      b.appendChild(chip);
    }
    node.appendChild(b);
    node.appendChild(el("span", "muted", label));
    box.appendChild(node);
  }
  announce(`KPIs updated: ${k.clients} clients, ${k.active} active, MRR ${inr(k.mrr_inr)}`);
}

/* ---------- tenants ----------------------------------------------------- */
let ROWS = [], CURSOR_ROW = -1;
const COLS = 13;
const badge = (status) => {
  const s = el("span", `badge badge-${status}`, status.replace("_", " "));
  return s;
};
const useCell = (used, limit) => {
  const over = limit != null && used >= limit;
  const wrap = el("span", `use${over ? " use-over" : ""}`);
  wrap.appendChild(el("span", null, `${used}${limit != null ? " / " + limit : ""}`));
  if (limit) {
    const pct = Math.min(100, Math.round(used * 100 / limit));
    const b = el("span", "mbar" + (pct >= 90 ? " bad" : pct >= 70 ? " warn" : ""));
    const i = el("i");
    i.style.setProperty("--pct", pct + "%");     // CSSOM, CSP-safe
    b.appendChild(i);
    wrap.appendChild(b);
  }
  return wrap;
};
/* Plan ka chip: Solo alag rang mein, taaki list mein ek nazar mein dikhe */
const planChip = (code, name, cycle) => {
  const solo = isSolo(code);
  const c = el("span", `plan-chip${solo ? " solo" : ""}`, name || code);
  if (cycle && cycle !== "monthly") c.appendChild(el("small", null, ` · ${cycle}`));
  return c;
};
const cell = (label, child) => {
  const td = el("td");
  td.dataset.label = label;
  if (typeof child === "string") td.textContent = child; else if (child) td.appendChild(child);
  return td;
};

async function loadTenants() {
  const body = $("tenants-body");
  skeletonRows(body, 5, COLS);
  const p = new URLSearchParams({
    q: $("t-search").value.trim(), status: $("t-status").value,
    plan: $("t-plan").value, sort: T.sort, order: T.order, limit: "50",
  });
  if ($("show-deleted").checked) p.set("include_deleted", "true");
  if (T.sort === "created_at" && T.cursor) p.set("cursor", T.cursor);
  if (T.sort !== "created_at" && T.offset) p.set("offset", String(T.offset));

  let d;
  try { d = await api("/control/api/tenants?" + p); }
  catch (e) { errState(body, COLS, e, loadTenants); return; }

  ROWS = d.tenants; CURSOR_ROW = -1;
  T._next = d.next_cursor; T._nextOffset = d.next_offset;
  $("t-count").textContent = `${d.tenants.length} of ${d.total}`;
  $("t-next").disabled = !(d.next_cursor || d.next_offset != null);
  $("t-prev").disabled = !T.stack.length;
  document.querySelectorAll("#tenants th").forEach((th) => {
    const btn = th.querySelector("button.sort");
    th.setAttribute("aria-sort", btn && btn.dataset.sort === T.sort
      ? (T.order === "asc" ? "ascending" : "descending") : "none");
  });
  document.querySelectorAll("#summary button.card").forEach((c) =>
    c.setAttribute("aria-pressed", String(c.dataset.filter === $("t-status").value)));

  if (!d.tenants.length) {
    stateRow(body, COLS, t("empty").tenants,
      can("write") ? { label: "＋ Add Tenant", onClick: addTenantModal } : null);
    return;
  }
  body.replaceChildren();
  for (const row of d.tenants) body.appendChild(tenantRow(row));
  announce(`${d.tenants.length} tenants shown of ${d.total}`);
}

function tenantRow(x) {
  const u = x.usage || {}, del = !!x.deleted_at;
  const tr = el("tr");
  if (x.trial_warning && !del) tr.classList.add("is-warn");
  tr.dataset.slug = x.slug;
  tr.tabIndex = -1;

  const head = cell("Shop");
  head.className = "cell-head";
  const nameBtn = el("button", "link-cell",
    `${x.trial_warning && !del ? "⚠️ " : ""}${del ? "🗑 " : ""}${x.shop_name}`);
  nameBtn.type = "button";
  nameBtn.dataset.act = "profile";
  nameBtn.dataset.slug = x.slug;
  nameBtn.setAttribute("aria-label", `Open profile for ${x.shop_name}`);
  head.appendChild(nameBtn);
  head.appendChild(el("div", "muted",
    [x.slug, x.city, (x.tags || []).join(", ")].filter(Boolean).join(" · ")));
  tr.appendChild(head);

  tr.appendChild(cell("Plan", planChip(x.plan, x.plan_name, x.billing_cycle)));
  tr.appendChild(cell("Status", badge(x.status)));
  tr.appendChild(cell("Days left", x.days_left == null ? "—" : String(x.days_left)));
  tr.appendChild(cell("WhatsApp", x.wa_connected ? "Connected" : "—"));
  tr.appendChild(cell("Orders (mo)", useCell(u.orders_month ?? 0, u.orders_limit)));
  tr.appendChild(cell("WA msgs (mo)", useCell(u.wa_msgs_month ?? 0, u.wa_limit)));
  // Solo jaise plan AI JAWAB se bikte hain; calls (andar ka kharcha) sirf bina jawab-limit wale par
  tr.appendChild(cell("AI (mo)", u.ai_reply_limit != null
    ? useCell(u.ai_replies_month ?? 0, u.ai_reply_limit) : useCell(u.ai_calls_month ?? 0, u.ai_limit)));
  tr.appendChild(cell("Staff", useCell(u.staff ?? 0, u.staff_limit)));
  tr.appendChild(cell("Users", String(x.users)));
  tr.appendChild(cell("MRR", inr(x.mrr_inr)));
  const owner = cell("Owner", x.owner_name);
  owner.appendChild(el("div", "muted", x.owner_phone));
  tr.appendChild(owner);

  const acts = cell("Actions");
  acts.classList.add("cell-actions");
  const wrap = el("div", "actions");
  const add = (label, act, aria, danger) => {
    const b = el("button", `btn-sm${danger ? " btn-danger" : ""}`, label);
    b.type = "button"; b.dataset.act = act; b.dataset.slug = x.slug;
    if (aria) b.setAttribute("aria-label", aria);
    if ((act === "purge" || act === "soft-delete") && !can("danger")) b.disabled = true;
    else if (!can("write")) b.disabled = true;
    wrap.appendChild(b);
  };
  if (del) {
    add("♻ Restore", "restore", `Restore ${x.shop_name}`);
    add("Purge", "purge", `Permanently delete ${x.shop_name}`, true);
  } else {
    // Saat button ki jagah teen: Manage (poora profile), Plan, aur ⋯ (baaki sab)
    const open = el("button", "btn-sm btn-primary", "Manage");
    open.type = "button"; open.dataset.act = "profile"; open.dataset.slug = x.slug;
    open.setAttribute("aria-label", `Manage ${x.shop_name}`);
    wrap.appendChild(open);
    add("Plan", "plan", `Change plan of ${x.shop_name}`);
    add("⋯", "more", `More actions for ${x.shop_name}`);
  }
  acts.appendChild(wrap);
  tr.appendChild(acts);
  return tr;
}

/* ---------- billing / audit / keys (lazy, below the fold) --------------- */
async function loadBilling() {
  const body = $("billing-body");
  skeletonRows(body, 3, 4);
  let rows;
  try { rows = await api("/control/api/billing/events?limit=30"); }
  catch (e) { return errState(body, 4, e, loadBilling); }
  if (!rows.length) return stateRow(body, 4, t("empty").billing);
  body.replaceChildren();
  for (const e of rows) {
    const tr = el("tr");
    tr.appendChild(cell("When", fmtWhen(e.at)));
    tr.appendChild(cell("Tenant", e.tenant || "—"));
    tr.appendChild(cell("Event", e.type));
    tr.appendChild(cell("Amount", e.amount_inr ? inr(e.amount_inr) : "—"));
    body.appendChild(tr);
  }
}

/* --- Razorpay: chalu/band aur keys. Secret kabhi wapas nahi aata, sirf hai ya nahi --- */
async function loadRazorpay() {
  const box = $("rzp-box");
  if (!box) return;
  let d;
  try { d = await api("/control/api/razorpay"); }
  catch (e) { box.replaceChildren(el("p", "muted", "Could not load Razorpay: " + e.message)); return; }
  box.replaceChildren();
  const mode = d.mode === "live" ? "Live keys" : d.mode === "test" ? "Test keys" : "No keys";
  const top = el("div", "rzp-top");
  top.append(el("span", `rzp-pill ${d.mode === "live" ? "live" : ""}`, mode));
  top.append(el("span", "muted", d.key_id_hint ? `${d.key_id_hint} · from ${d.source === "panel" ? "this panel" : "server .env"}` : "Add your keys below"));
  box.appendChild(top);
  const save = async (body, ok) => {
    await act(() => api("/control/api/razorpay", { method: "PUT", body }), ok);
    loadRazorpay();
  };
  const pick = (label, upiHint, rzpHint, on, key) => {
    const row = el("div", "rzp-pick"), sel = el("select");
    sel.setAttribute("aria-label", label);
    sel.append(new Option("UPI", "upi"), new Option(d.ready ? "Razorpay" : "Razorpay (add keys first)", "razorpay"));
    sel.options[1].disabled = !d.ready && !on;
    sel.value = on ? "razorpay" : "upi";
    const t = el("span"); t.append(el("b", null, label), el("small", "muted", on ? rzpHint : upiHint));
    row.append(t, sel);
    sel.addEventListener("change", () => {
      const next = sel.value === "razorpay"; sel.value = next ? "upi" : "razorpay";
      confirmDialog({
        title: `${label}: use ${next ? "Razorpay" : "UPI"}?`,
        body: next ? rzpHint : `${upiHint} Payments already started on Razorpay still finish, and autopays keep charging until you cancel them there.`,
        confirmLabel: `Use ${next ? "Razorpay" : "UPI"}`,
        onConfirm: () => save({ [key]: next }, `${label}: ${next ? "Razorpay" : "UPI"}`),
      });
    });
    return row;
  };
  if (d.mode === "test") box.appendChild(el("p", "rzp-warn", "Test keys: no real money moves. Put in live keys before real customers pay."));
  box.append(pick("Plans and auto renewal", "You take the money by UPI and extend the plan from this panel.", "Shops buy on Razorpay. Plans renew every month by themselves.", d.subscriptions, "subscriptions"),
    pick("Recharge", "Shops pay your UPI and send a request. You approve it here.", "Shops pay online and the balance is added by itself.", d.recharge, "recharge"),
    pick("Kwik Klin customer bills", "Customers pay your UPI from Kwik Klin's shop settings. You mark the bill paid.", "Your own shop only. The bill turns paid by itself and both of you get a WhatsApp. If Razorpay fails, your UPI shows on the bill.", d.shop_bills, "shop_bills"));
  const upi = el("details", "rzp-keys");
  upi.open = !d.upi_id;
  upi.appendChild(el("summary", null, d.upi_id ? `Your UPI: ${d.upi_id}` : "Add your UPI"));
  const ug = el("div", "grid-2");
  const uid = field(ug, "rzp-upi-id", "UPI ID", d.upi_id), uname = field(ug, "rzp-upi-name", "Name on UPI", d.upi_name);
  uid.placeholder = "name@upi"; uid.autocomplete = uname.autocomplete = "off";
  upi.appendChild(ug);
  upi.appendChild(el("p", "muted", "Shops see this when they recharge by UPI. Check it before saving: money goes straight to this ID."));
  buttonRow(upi, [{ label: "Save UPI", cls: "btn-primary", onClick: () => confirmDialog({
    title: uid.value.trim() ? `Use ${uid.value.trim()}?` : "Remove your UPI?",
    body: "Shops will pay this ID from now on.", confirmLabel: "Save",
    onConfirm: () => save({ upi_id: uid.value.trim(), upi_name: uname.value.trim() }, "UPI saved") }) }]);
  box.appendChild(upi);
  const form = el("details", "rzp-keys");
  form.open = !d.ready;
  form.appendChild(el("summary", null, d.ready ? "Change keys" : "Add keys"));
  const grid = el("div", "grid-2");
  const kid = field(grid, "rzp-key-id", "Key ID", "");
  const sec = field(grid, "rzp-key-secret", `Key Secret${d.has_secret ? " (saved, blank = keep)" : ""}`, "", "password");
  const hook = field(grid, "rzp-hook-secret", `Webhook Secret${d.has_webhook_secret ? " (saved, blank = keep)" : ""}`, "", "password");
  kid.placeholder = "rzp_live_…"; kid.autocomplete = "off"; sec.autocomplete = hook.autocomplete = "new-password";
  form.appendChild(grid);
  buttonRow(form, [
    { label: "Save keys", cls: "btn-primary", onClick: () => save(
      { key_id: kid.value.trim() || null, key_secret: sec.value.trim() || null, webhook_secret: hook.value.trim() || null }, "Keys saved") },
    { label: "Test keys", onClick: () => act(() => api("/control/api/razorpay/test", { method: "POST" }), "Razorpay accepted the keys") },
    ...(d.source === "panel" ? [{ label: "Remove saved keys", onClick: () => confirmDialog({
      title: "Remove keys?", body: "Payments will use the server .env keys, or stop if there are none.", confirmLabel: "Remove",
      onConfirm: () => save({ clear_keys: true, subscriptions: false, recharge: false, shop_bills: false }, "Keys removed") }) }] : []),
  ]);
  const how = el("div", "rzp-hook");
  how.appendChild(el("b", null, "Webhook in Razorpay"));
  how.appendChild(el("p", "muted", "Razorpay Dashboard, Account & Settings, Webhooks, Add New Webhook. Test and live mode are set up separately, each with its own secret. Paste this URL, make a Webhook Secret of 16 or more characters, save the same secret here, and tick these events:"));
  how.appendChild(el("code", null, d.webhook_url));
  how.appendChild(el("p", "muted", d.webhook_events.join(", ")));
  form.appendChild(how);
  box.appendChild(form);
}

/* --- Hamare plan par GST: 0 = nahi lete. Website, join aur checkout isi se --- */
async function loadPlanGst() {
  const box = $("gst-box");
  if (!box) return;
  let d;
  try { d = await api("/control/api/plan-gst"); }
  catch (e) { box.replaceChildren(el("p", "muted", "Could not load GST: " + e.message)); return; }
  const sel = el("select"); sel.id = "gst-percent"; sel.setAttribute("aria-label", "GST on plans");
  for (const [v, t] of [[0, "No GST"], [5, "5%"], [12, "12%"], [18, "18%"], [28, "28%"]]) sel.appendChild(new Option(t, v));
  sel.value = d.percent;
  const save = el("button", "btn-primary", "Save"); save.type = "button";
  save.addEventListener("click", () => confirmDialog({
    title: Number(sel.value) ? `Charge ${sel.value}% GST?` : "Stop charging GST?",
    body: "New checkouts, the website and the owner app change within a minute. Razorpay subscriptions already running keep their old amount.",
    confirmLabel: "Yes, change it",
    onConfirm: async () => {
      await act(() => api("/control/api/plan-gst", { method: "PUT", body: { percent: Number(sel.value) } }), "GST saved");
      loadPlanGst();
    },
  }));
  const row = el("div", "gst-row"); row.append(sel, save);
  box.replaceChildren(row, el("p", "muted", d.percent
    ? `Shops pay plan price + ${d.percent}% GST. Choose No GST if you are not GST registered.`
    : "No GST is added. Shops pay the plan price only."));
}

/* --- AI cost guard: is mahine ₹, ₹/reply, plan margin, alerts (services/ai_cost.py) --- */
const inr2 = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
async function loadAiCost() {
  const box = $("aicost-box");
  if (!box) return;
  box.replaceChildren(el("span", "skel skel-row"));
  let d;
  try { d = await api("/control/api/ai-cost"); }
  catch (e) { box.replaceChildren(el("p", "muted", "Could not load AI cost: " + e.message)); return; }
  box.replaceChildren();
  const m = d.month, w = d.week, lm = d.last_month;
  const perReply = (x) => x.per_reply_inr == null ? "—" : "₹" + x.per_reply_inr.toFixed(2);
  const cards = el("div", "cards");
  const card = (label, value, sub) => {
    const c = el("div", "card"); c.appendChild(el("span", "muted", label)); c.appendChild(el("b", null, value));
    if (sub) c.appendChild(el("span", "muted", sub)); cards.appendChild(c);
  };
  card(`This month (${m.period})`, inr2(m.cost_inr), `${m.calls} calls · ${m.replies} replies · day ${m.days_done}/${m.days_total}`);
  card("Per reply", perReply(m), `last 7 days ${perReply(w)} · guard ₹${d.thresholds.per_reply_inr.toFixed(2)} · sells at ₹${(d.sell_per_reply_inr || 0).toFixed(2)}`);
  card("Month-end estimate", inr(m.projected_inr), `last month ${inr2(lm.cost_inr)} (${perReply(lm)}/reply)`);
  if (d.budget) card("Budget used", d.budget.used_pct + "%", `$${d.budget.usd} ≈ ${inr(d.budget.inr)}`);
  box.appendChild(cards);
  if (d.alerts.length) {
    const ul = el("div", "attn aicost-alerts");
    for (const a of d.alerts) ul.appendChild(el("div", a.level === "bad" ? "bad" : "warn", (a.level === "bad" ? "🔴 " : "🟠 ") + a.text));
    box.appendChild(ul);
  } else {
    box.appendChild(el("p", "muted", "✅ No alert — per-reply cost, plan margins and budget are all inside the guard."));
  }
  const wrap = el("div", "grid-2");
  const mkTable = (title, head, rows) => {
    const d2 = el("div"); d2.appendChild(el("b", null, title));
    const tbl = el("table", "stack"); const thead = el("thead"); const trh = el("tr");
    for (const h of head) trh.appendChild(el("th", null, h)); thead.appendChild(trh); tbl.appendChild(thead);
    const tb = el("tbody");
    if (!rows.length) { const tr = el("tr"); tr.appendChild(cell(head[0], "— nothing this month")); tb.appendChild(tr); }
    for (const r of rows) { const tr = el("tr"); r.forEach((v, i) => tr.appendChild(cell(head[i], String(v)))); tb.appendChild(tr); }
    tbl.appendChild(tb); d2.appendChild(tbl); wrap.appendChild(d2);
  };
  // Ab kya karein — numbers se seedhi baat (services/ai_cost._suggestions)
  if ((d.suggestions || []).length) {
    const sg = el("div", "aicost-todo");
    sg.appendChild(el("b", null, "What to do"));
    const ul = el("ul");
    for (const t of d.suggestions) ul.appendChild(el("li", null, t));
    sg.appendChild(ul);
    box.appendChild(sg);
  }
  // Server ka bill: har chalti dukaan par baant kar asli margin
  const srv = d.server || {};
  const sf = el("form", "aicost-srv");
  sf.appendChild(el("span", null, srv.assumed
    ? `Server: not set — counting ₹${Number(srv.per_shop_inr || 0).toFixed(0)} per shop.`
    : `Server ${inr(srv.month_inr)} a month ÷ ${srv.live_shops} live shop${srv.live_shops === 1 ? "" : "s"} = ${inr2(srv.per_shop_inr)} per shop.`));
  const si = el("input"); si.type = "number"; si.min = "0"; si.step = "1"; si.inputMode = "numeric";
  si.placeholder = "Monthly server bill ₹"; si.value = srv.month_inr || ""; si.setAttribute("aria-label", "Monthly server bill in rupees");
  const sb = el("button", "btn-ghost", "Save"); sb.type = "submit"; sb.disabled = !can("danger");
  sf.append(si, sb);
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    await act(() => api("/control/api/ai-cost/settings", { method: "PUT", body: { server_cost_inr_month: Number(si.value || 0) } }), "Server bill saved");
    loadAiCost();
  });
  box.appendChild(sf);

  const pct = (v) => v == null ? "—" : v + "%";
  mkTable("By plan — AI use and real margin", ["Plan", "Shops", "AI used", "Revenue", "AI", "Server + fee", "Real margin"],
    d.by_plan.map((p) => [p.name, `${p.paying} paying / ${p.shops}`,
      p.ai_limit == null || p.ai_limit < 0 ? `${p.replies_sent || 0} replies` :
        `avg ${pct(p.avg_used_pct)} of ${p.ai_limit} · ${p.at_limit || 0} at limit${p.near_limit ? ` · ${p.near_limit} near` : ""}`,
      inr(p.revenue_inr), inr2(p.cost_inr), inr2((p.server_inr || 0) + (p.fee_inr || 0)),
      pct(p.true_margin_pct)]));
  mkTable("Shops to watch", ["Shop", "Plan", "AI used", "AI cost", "Why"],
    (d.watch || []).map((s) => [s.shop, `${s.plan}${s.status === "trial" ? " (trial)" : ""}`,
      s.limit == null || s.limit < 0 ? String(s.used) : `${s.used} / ${s.limit}`, inr2(s.cost_inr), s.notes.join(" · ")]));
  box.appendChild(wrap);
  const rc = d.recharge;
  if (rc) {
    box.appendChild(el("p", "muted", `Recharge this month: ${rc.count} AI pack${rc.count === 1 ? "" : "s"} · ${inr(rc.amount_inr)} for ${rc.replies} replies`
      + ` · sells at ₹${(rc.sell_per_reply_inr || 0).toFixed(2)}/reply, costs ₹${(rc.cost_per_reply_inr || 0).toFixed(2)}`
      + (rc.margin_per_reply_pct == null ? "" : ` (${rc.margin_per_reply_pct}% profit)`)));
  }
  // Badalna yahin neeche: plan ki AI limit / band, aur recharge ke daam
  const jump = el("p", "aicost-jump");
  for (const [txt, id] of [["Change AI limits per plan ↓", "plans-h"], ["Change recharge prices ↓", "pricing-h"]]) {
    const b = el("button", "btn-ghost", txt); b.type = "button";
    b.addEventListener("click", () => { const t = $(id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    jump.appendChild(b);
  }
  box.appendChild(jump);
  if (d.by_purpose.length) {
    box.appendChild(el("p", "muted", "Where it goes: " + d.by_purpose.slice(0, 8)
      .map((p) => `${p.purpose} ${inr2(p.cost_inr)} (${p.calls})`).join(" · ")
      + ` · USD→INR ${d.usd_inr}`));
  }
}

/* --- Settings → AI usage: asli calls, tokens, $ aur ₹ (services/ai_usage.py) ---
   Andaza nahi: har call ke Google wale tokens × rate card. $1 mein kitni calls,
   ek call kitne ki, din / model / kaam / dukaan-wise, aur aakhri 20 calls. */
// Chuna hua period sirf is tab ke liye (memory) — panel web storage use nahi
// karta (tests/test_panel_security.py), refresh par phir 7 din
const AIU = { days: 7 };
const usd = (n, d = 4) => n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d });
const nfmt = (n) => n == null ? "—" : Number(n).toLocaleString("en-IN");
const AIU_PERIODS = [[1, "Today"], [7, "7 days"], [30, "30 days"]];

async function loadAiUsage() {
  const box = $("aiuse-box");
  if (!box) return;
  box.replaceChildren(el("span", "skel skel-row"));
  let d;
  try { d = await api(`/control/api/ai-usage?days=${AIU.days}`); }
  catch (e) { box.replaceChildren(el("p", "muted", "Could not load AI usage: " + e.message)); return; }
  box.replaceChildren();
  const fx = d.usd_inr, t = d.total;
  const label = (AIU_PERIODS.find(([n]) => n === d.days) || [0, `${d.days} days`])[1];

  const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Period");
  for (const [n, l] of AIU_PERIODS) {
    const b = el("button", n === d.days ? "on" : "", l); b.type = "button"; b.setAttribute("aria-pressed", String(n === d.days));
    b.addEventListener("click", () => {
      AIU.days = n;
      loadAiUsage();
    });
    seg.appendChild(b);
  }
  box.appendChild(seg);

  const cards = el("div", "cards");
  const card = (k, v, sub) => {
    const c = el("div", "card"); c.append(el("span", "muted", k), el("b", null, v));
    if (sub) c.appendChild(el("span", "muted", sub));
    cards.appendChild(c);
  };
  card(`Spent · ${label}`, usd(t.cost_usd, 4), `${inr2(t.cost_inr)} · ${nfmt(t.calls)} calls${t.failed ? ` · ${t.failed} failed` : ""}`);
  card("One call costs", usd(t.usd_per_call, 6), t.inr_per_call == null ? "no calls yet" : `₹${t.inr_per_call.toFixed(4)} on average`);
  card("Calls per $1", nfmt(t.calls_per_usd), t.calls_per_usd ? `₹100 ≈ ${nfmt(Math.round(t.calls_per_usd * 100 / fx))} calls` : "no paid calls yet");
  card(`This month so far (${d.month.period})`, usd(d.month.cost_usd, 2), `${inr2(d.month.cost_inr)} · ${nfmt(d.month.calls)} calls · already spent, not a forecast`);
  box.appendChild(cards);
  box.appendChild(el("p", "muted aiu-how",
    "How this is counted: every AI call is saved with Google's own token counts (input, and output including \"thinking\", which Google bills). " +
    `Cost = tokens × the rate card below ($ per 1M tokens). ₹ uses $1 = ₹${fx}. Failed calls use no tokens.`));
  if (d.unpriced_models.length) {
    box.appendChild(el("p", "sl-warn", `No rate for ${d.unpriced_models.join(", ")}: these calls are priced at the highest rate in the card. Add their real rate below.`));
  }

  const table = (title, head, rows, empty) => {
    const wrap = el("div", "aiu-tbl");
    wrap.appendChild(el("b", null, title));
    const tw = el("div", "tbl-wrap"), tbl = el("table", "stack"), thead = el("thead"), tr = el("tr");
    head.forEach((h) => tr.appendChild(el("th", null, h)));
    thead.appendChild(tr); tbl.appendChild(thead);
    const tb = el("tbody");
    if (!rows.length) { const r = el("tr"); r.appendChild(cell(head[0], empty || "Nothing in this period")); tb.appendChild(r); }
    rows.forEach((row) => { const r = el("tr"); row.forEach((v, i) => r.appendChild(cell(head[i], v == null ? "—" : String(v)))); tb.appendChild(r); });
    tbl.appendChild(tb); tw.appendChild(tbl); wrap.appendChild(tw); box.appendChild(wrap);
  };
  const dayName = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
  table("By day (IST)", ["Date", "Calls", "Cost $", "Cost ₹"],
    [...d.by_day].reverse().map((x) => [dayName(x.date), nfmt(x.calls), usd(x.cost_usd, 4), inr2(x.cost_inr)]));
  table("By model", ["Model", "Rate in / out per 1M", "Calls", "Tokens in / out", "Cost $", "Per call", "Calls per $1"],
    d.by_model.map((m) => [m.model + (m.priced ? "" : " ⚠"), m.priced ? `$${m.rate_in} / $${m.rate_out}` : "no rate",
      nfmt(m.calls) + (m.failed ? ` (+${m.failed} failed)` : ""), `${nfmt(m.input_tokens)} / ${nfmt(m.output_tokens)}`,
      usd(m.cost_usd, 4), usd(m.usd_per_call, 6), nfmt(m.calls_per_usd)]));
  table("By task", ["Task", "Calls", "Cost $", "Per call", "Calls per $1"],
    d.by_purpose.map((p) => [p.purpose, nfmt(p.calls), usd(p.cost_usd, 4), usd(p.usd_per_call, 6), nfmt(p.calls_per_usd)]));
  table("Shops", ["Shop", "Plan", `Calls (${label})`, `Cost (${label})`, "This month / plan AI budget"],
    d.top_shops.map((s) => [s.shop, s.plan, nfmt(s.calls), usd(s.cost_usd, 4),
      s.month_budget_usd ? `${usd(s.month_usd, 2)} of ${usd(s.month_budget_usd, 2)} (${s.month_used_pct}%)` : usd(s.month_usd, 2)]));
  table(`Last ${d.recent.length} calls`, ["Time", "Shop", "Task", "Model", "Tokens in → out", "Cost"],
    d.recent.map((r) => [fmtWhen(r.at), r.shop, r.purpose + (r.ok ? "" : " ✕ failed"), r.model,
      `${nfmt(r.input_tokens)} → ${nfmt(r.output_tokens)}`, `${usd(r.cost_usd, 6)} · ₹${r.cost_inr.toFixed(4)}`]), "No AI calls yet");

  // Rate card: Google ka daam badle to yahin. Isi se har dukaan ka AI budget bhi ginta hai.
  const ed = el("details", "panel aiu-rates");
  ed.appendChild(el("summary", null, `Rate card and $ → ₹ ($1 = ₹${fx})`));
  ed.appendChild(el("p", "muted", "Google's price per 1 million tokens. Output includes thinking tokens. Changing a rate re-prices history and every shop's AI budget."));
  const grid = el("div", "aiu-rate-grid");
  const rows = [];
  const addRow = (model, rin, rout, fixed) => {
    const m = el("input"); m.value = model; m.placeholder = "model name"; m.readOnly = fixed; m.setAttribute("aria-label", "Model");
    const i = el("input"); i.type = "number"; i.step = "0.01"; i.min = "0"; i.value = rin; i.setAttribute("aria-label", `${model || "New model"} input $ per 1M`);
    const o = el("input"); o.type = "number"; o.step = "0.01"; o.min = "0"; o.value = rout; o.setAttribute("aria-label", `${model || "New model"} output $ per 1M`);
    grid.append(m, i, o); rows.push([m, i, o]);
  };
  grid.append(el("span", "muted", "Model"), el("span", "muted", "Input $/1M"), el("span", "muted", "Output $/1M"));
  Object.entries(d.rates).forEach(([m, r]) => addRow(m, r.in, r.out, true));
  ed.appendChild(grid);
  const more = el("button", "btn-ghost btn-sm", "+ Add a model"); more.type = "button";
  more.addEventListener("click", () => addRow("", "", "", false));
  const fxl = el("label", null, "$1 in ₹"); const fxi = el("input"); fxi.type = "number"; fxi.step = "0.01"; fxi.value = fx; fxl.appendChild(fxi);
  const save = el("button", "btn-primary", "Save rates"); save.type = "button"; save.disabled = !can("danger");
  save.addEventListener("click", async () => {
    const rates = rows.filter(([m, i, o]) => m.value.trim() && i.value !== "" && o.value !== "")
      .map(([m, i, o]) => ({ model: m.value.trim().toLowerCase(), input_per_m: Number(i.value), output_per_m: Number(o.value) }));
    await act(() => api("/control/api/ai-usage/settings", { method: "PUT", body: { usd_inr: Number(fxi.value), rates } }), "Rates saved");
    loadAiUsage();
  });
  const bar = el("div", "row aiu-rate-bar"); bar.append(more, fxl, save);
  ed.appendChild(bar);
  if (!can("danger")) ed.appendChild(el("p", "muted", "Only a danger-level key can change rates."));
  box.appendChild(ed);
}

/* --- Solo plans: AI jawab ki limit bina deploy (routers/control.py plan-configs) --- */
async function loadPlanConfigs() {
  const box = $("plans-wrap");
  box.replaceChildren(el("p", "muted", "Loading…"));
  let d;
  try { d = await api("/control/api/plan-configs"); }
  catch (e) { box.replaceChildren(el("p", "muted", "Could not load plans: " + e.message)); return; }
  box.replaceChildren();
  box.appendChild(el("p", "muted",
    "Design every plan here — price, setup fee, trial, what it includes and its limits. Changes reach every shop on that plan " +
    "within a minute (no deploy) and are audited. Blank = keep; −1 = unlimited; “Reset” goes back to the default in code."));
  box.appendChild(el("p", "muted",
    `AI replies: counting period ${d.period} (IST), resets ${d.resets_on}. One AI reply = one AI-written answer actually sent on WhatsApp; ` +
    "at the limit AI replies stop, bills and the owner's own messages keep working. Per-shop override: open the shop → Usage."));
  // Naya plan: kisi plan ki copy — pehle chhupa, design pura karke "Show on website"
  const mk = el("details", "card plan-design");
  mk.appendChild(el("summary", null, "+ New plan (copy of an existing plan)"));
  const mg = el("div", "grid-2");
  const nCode = field(mg, "pd-new-code", "Code (a-z, 0-9, _ — cannot change later)", "");
  nCode.placeholder = "solo_plus";
  const nName = field(mg, "pd-new-name", "Name", "");
  const baseL = el("label", null, "Copy from"); baseL.htmlFor = "pd-new-base";
  const nBase = el("select"); nBase.id = "pd-new-base";
  for (const c of d.bases) {
    const o = el("option", null, (d.plans.find((x) => x.code === c) || {}).name || c); o.value = c; nBase.appendChild(o);
  }
  const bw = el("div"); bw.append(baseL, nBase); mg.appendChild(bw);
  mk.appendChild(mg);
  buttonRow(mk, [{ label: "Create plan", cls: "btn-primary", onClick: async () => {
      const body = { code: nCode.value.trim().toLowerCase(), name: nName.value.trim(), base: nBase.value, hidden: true };
      if (!body.code || !body.name) return toast("Code and name are needed", "err");
      await act(() => api("/control/api/plan-configs", { method: "POST", body }), `${body.name} created — hidden until you show it`);
      loadPlanConfigs();
    } }]);
  box.appendChild(mk);
  const LIMITS = [["max_orders_month", "Orders / month"], ["max_staff", "Staff logins"], ["max_outlets", "Outlets"],
    ["whatsapp_message_limit", "WhatsApp messages / month"], ["ai_usage_limit", "AI calls / month (internal cost)"],
    ["ai_reply_limit", "AI replies / month"], ["trial_ai_reply_limit", "AI replies in the whole free trial"], ["max_campaign_msgs_month", "Campaign messages / month"]];
  const BASICS = [["name", "Name", "text"], ["tagline", "One-line description", "text"], ["price_inr", "Price / month (₹)", "number"],
    ["annual_inr", "Price / year (₹)", "number"], ["setup_fee_inr", "One-time setup fee (₹, 0 = none)", "number"],
    ["trial_days", "Free trial (days)", "number"], ["ai_budget_usd_month", "AI spend cap / month (USD)", "number"]];
  for (const p of d.plans) {
    const cur = p.current, def = p.default;
    const det = el("details", "card plan-design");
    det.appendChild(el("summary", null,
      `${cur.name} · ${inr(cur.price_inr)}/month · setup ${inr(cur.setup_fee_inr)} · ${cur.features.length} features · ${cur.trial_days}-day trial` +
      `${p.custom ? ` · new plan (copy of ${p.base})` : ""}${p.hidden ? " · HIDDEN" : " · on website"}${p.ai_replies_paused ? " · AI PAUSED" : ""}`));
    // Har hissa apna section: label apne input ke saath, ek column mein
    const section = (title, hint) => {
      const sec = el("section", "pd-sec");
      sec.appendChild(el("h4", null, title));
      if (hint) sec.appendChild(el("p", "muted pd-hint", hint));
      det.appendChild(sec);
      return sec;
    };
    const pdField = (grid, ...args) => { const w = el("div", "pd-field"); grid.appendChild(w); return field(w, ...args); };
    const inputs = {};
    const basics = el("div", "pd-fields");
    section("Plan details").appendChild(basics);
    for (const [k, label, type] of BASICS) {
      inputs[k] = pdField(basics, `pd-${p.code}-${k}`, label, cur[k], type);
      inputs[k].placeholder = String(def[k]);
    }
    const limits = el("div", "pd-fields");
    section("Monthly limits", "−1 = unlimited. Blank keeps the current value.").appendChild(limits);
    for (const [k, label] of LIMITS) {
      inputs[k] = pdField(limits, `pd-${p.code}-${k}`, label, cur[k], "number");
      inputs[k].placeholder = String(def[k]);
    }
    const warn = pdField(limits, `pd-${p.code}-warn`, "AI replies: first warning at %", p.warn_pct, "number");
    const vis = el("div", "feat-grid");
    const toggle = (label, on) => {
      const lab = el("label", "feat"); const cb = el("input"); cb.type = "checkbox"; cb.checked = on;
      lab.append(cb, el("span", null, label)); vis.appendChild(lab); return cb;
    };
    const showCb = toggle("Show on website, signup and Solo app", !p.hidden);
    const popCb = toggle("“Most popular” badge", p.popular);
    section("Visibility").appendChild(vis);
    const feats = el("div", "feat-grid");
    const checks = {};
    for (const f of d.feature_info) {
      const lab = el("label", "feat");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = cur.features.includes(f.key);
      checks[f.key] = cb;
      const tx = el("span", null, f.label);
      if (def.features.includes(f.key) !== cb.checked) tx.appendChild(el("small", "pd-changed", "Changed"));
      lab.append(cb, tx);
      feats.appendChild(lab);
    }
    section("What this plan includes").appendChild(feats);
    const ptsL = el("label", "sr-only", "Lines on the pricing page (one per line)"); ptsL.htmlFor = `pd-${p.code}-pts`;
    const pts = el("textarea"); pts.id = `pd-${p.code}-pts`; pts.rows = 5; pts.value = (cur.sales_points || []).join("\n");
    section("Pricing page", "One line per point.").append(ptsL, pts);
    const foot = el("div", "pd-foot");
    det.appendChild(foot);
    const reason = pdField(foot, `pd-${p.code}-why`, "Reason (for the audit log)", "");
    buttonRow(foot, [
      { label: "Save plan", cls: "btn-primary", onClick: async () => {
          // Default ke barabar = reset (pin nahi) — code ka default aage badle to plan tak pahunche
          const body = { reason: reason.value.trim(), warn_pct: parseInt(warn.value, 10) || 80, reset_fields: [],
            hidden: !showCb.checked, popular: popCb.checked };
          for (const [k] of BASICS.concat(LIMITS)) {
            const v = inputs[k].value.trim();
            if (v === "") continue;
            if (v === String(def[k])) body.reset_fields.push(k);
            else body[k] = inputs[k].type === "number" ? Number(v) : v;
          }
          const fs = Object.keys(checks).filter((k) => checks[k].checked).sort();
          if (fs.join() === [...def.features].sort().join()) body.reset_fields.push("features"); else body.features = fs;
          const sp = pts.value.split("\n").map((x) => x.trim()).filter(Boolean);
          if (sp.join("\n") === (def.sales_points || []).join("\n")) body.reset_fields.push("sales_points"); else body.sales_points = sp;
          if (!confirm(`Apply this design to every shop on ${cur.name}?`)) return;
          await act(() => api(`/control/api/plan-configs/${p.code}`, { method: "PUT", body }), `${cur.name} saved`);
          loadPlanConfigs();
        } },
      { label: "Reset to default", onClick: async () => {
          if (!confirm(`Put ${def.name} back to its default design?`)) return;
          const reset_fields = BASICS.concat(LIMITS).map(([k]) => k).concat(["features", "sales_points"]);
          await act(() => api(`/control/api/plan-configs/${p.code}`, { method: "PUT", body: { reset_fields, reason: reason.value.trim() } }),
            `${def.name} back to default`);
          loadPlanConfigs();
        } },
      { label: p.ai_replies_paused ? "Resume AI replies" : "Pause AI replies", cls: p.ai_replies_paused ? "" : "btn-danger", onClick: async () => {
          await act(() => api(`/control/api/plan-configs/${p.code}`, { method: "PUT", body: { ai_replies_paused: !p.ai_replies_paused, reason: reason.value.trim() } }),
            p.ai_replies_paused ? "AI replies resumed" : "AI replies paused");
          loadPlanConfigs();
        } },
    ].concat(p.custom ? [{ label: "Delete plan", cls: "btn-danger", onClick: async () => {
          if (!confirm(`Delete ${cur.name}? Only works when no shop is on it — otherwise hide it.`)) return;
          await act(() => api(`/control/api/plan-configs/${p.code}`, { method: "DELETE" }), `${cur.name} deleted`);
          loadPlanConfigs();
        } }] : []));
    box.appendChild(det);
  }
  const wrap = el("div", "tbl-wrap");
  const tbl = el("table", "stack");
  const cap = el("caption", "sr-only", "AI replies per shop this month");
  const head = el("thead");
  const hr = el("tr");
  ["Shop", "Plan", "Used / limit", "Via LLM / workflow", "Left", "Failed", "Blocked", "Alerts"].forEach((h) => { const th = el("th", null, h); th.scope = "col"; hr.appendChild(th); });
  head.appendChild(hr);
  const body = el("tbody");
  if (!d.usage.length) {
    const tr = el("tr"); const td = el("td", "muted", "No AI replies sent this month yet."); td.colSpan = 8; tr.appendChild(td); body.appendChild(tr);
  }
  for (const u of d.usage) {
    const tr = el("tr");
    tr.appendChild(cell("Shop", u.shop_name || u.slug));
    tr.appendChild(cell("Plan", u.plan + (u.override != null ? ` (override ${u.override})` : "")));
    tr.appendChild(cell("Used / limit", `${u.used} / ${u.limit ?? "∞"}`));
    // Workflow (Solo) ke jawab owner ki ginti mein hain par LLM ka kharcha nahi
    tr.appendChild(cell("Via LLM / workflow", u.llm != null ? `${u.llm} / ${u.flow || 0}` : "—"));
    tr.appendChild(cell("Left", String(u.remaining ?? "∞")));
    tr.appendChild(cell("Failed", String(u.failed)));
    tr.appendChild(cell("Blocked", String(u.blocked)));
    tr.appendChild(cell("Alerts", [u.alert_80_at ? "80% " + fmtWhen(u.alert_80_at) : "", u.alert_100_at ? "100% " + fmtWhen(u.alert_100_at) : ""].filter(Boolean).join(" · ") || "—"));
    body.appendChild(tr);
  }
  tbl.append(cap, head, body);
  wrap.appendChild(tbl);
  box.appendChild(wrap);
}

let AUDIT = [], AUDIT_SHOWN = 0;
const AUDIT_PAGE = 25;

async function loadAudit() {
  const body = $("audit-body");
  skeletonRows(body, 4, 6);
  const slug = $("audit-tenant").value.trim();
  try {
    AUDIT = await api("/control/api/audit?limit=200" + (slug ? `&tenant_slug=${encodeURIComponent(slug)}` : ""));
  } catch (e) { return errState(body, 6, e, loadAudit); }
  AUDIT_SHOWN = 0;
  body.replaceChildren();
  if (!AUDIT.length) { $("btn-audit-more").classList.add("hidden"); return stateRow(body, 6, t("empty").audit); }
  renderMoreAudit();
}

/* Render on demand: 200 rows arrive, 25 paint. Keeps INP low and avoids a
   long task on slower phones. */
function renderMoreAudit() {
  const body = $("audit-body");
  const slice = AUDIT.slice(AUDIT_SHOWN, AUDIT_SHOWN + AUDIT_PAGE);
  const frag = document.createDocumentFragment();
  for (const r of slice) {
    const tr = el("tr");
    tr.appendChild(cell("When", fmtWhen(r.at)));
    tr.appendChild(cell("Tenant", r.tenant || "—"));
    tr.appendChild(cell("Actor", r.actor || r.actor_role));
    tr.appendChild(cell("Action", r.action));
    const det = cell("Details", JSON.stringify(r.args || {}));
    det.classList.add("muted", "tl-detail");
    tr.appendChild(det);
    tr.appendChild(cell("Result", r.ok ? "OK ✓" : "Failed ✗"));
    frag.appendChild(tr);
  }
  body.appendChild(frag);
  AUDIT_SHOWN += slice.length;
  const more = $("btn-audit-more");
  more.classList.toggle("hidden", AUDIT_SHOWN >= AUDIT.length);
  more.textContent = `Load more (${AUDIT.length - AUDIT_SHOWN} left)`;
}

async function loadKeys() {
  const body = $("keys-body");
  skeletonRows(body, 2, 6);
  let rows;
  try { rows = await api("/control/api/admin-keys"); }
  catch (e) {
    return stateRow(body, 6, ["🔒", "Keys need a danger-level key",
      "Sign in with the master key to manage per-admin keys."]);
  }
  if (!rows.length) {
    return stateRow(body, 6, t("empty").keys,
      can("danger") ? { label: "＋ New key", onClick: createKeyModal } : null);
  }
  body.replaceChildren();
  for (const k of rows) {
    const tr = el("tr");
    tr.appendChild(cell("Label", k.label));
    tr.appendChild(cell("Level", k.level));
    tr.appendChild(cell("Created", fmtWhen(k.created_at)));
    tr.appendChild(cell("Last used", fmtWhen(k.last_used_at)));
    tr.appendChild(cell("Status", k.revoked ? "Revoked" : "Active ✓"));
    const acts = cell("Actions");
    acts.classList.add("cell-actions");
    if (!k.revoked) {
      const b = el("button", "btn-sm btn-danger", "Revoke");
      b.type = "button"; b.dataset.act = "revoke-key";
      b.dataset.id = k.id; b.dataset.label = k.label;
      b.setAttribute("aria-label", `Revoke key ${k.label}`);
      acts.appendChild(b);
    }
    tr.appendChild(acts);
    body.appendChild(tr);
  }
}

/* ---------- modal plumbing (focus trap + restore) ----------------------- */
let LAST_FOCUS = null;
function openModal(build, title) {
  LAST_FOCUS = document.activeElement;
  const sheet = $("modal");
  sheet.className = "sheet";        // pichhle popup ki "workspace"/"wide" class na rahe
  sheet.replaceChildren();
  const h = el("h3", null, title);
  h.id = "modal-title";
  sheet.appendChild(h);
  build(sheet);
  $("ov").hidden = false;
  const first = sheet.querySelector("input, select, button");
  if (first) first.focus();
}
function closeModal() {
  $("ov").hidden = true;
  $("modal").className = "sheet";
  $("modal").replaceChildren();
  if (LAST_FOCUS) LAST_FOCUS.focus();
}
function field(parent, id, label, value = "", type = "text") {
  const l = el("label", null, label);
  l.htmlFor = id;
  const i = el("input");
  i.id = id; i.type = type; i.value = value ?? "";
  parent.appendChild(l); parent.appendChild(i);
  return i;
}
function buttonRow(parent, buttons) {
  const row = el("div", "btnrow");
  for (const b of buttons) {
    const btn = el("button", b.cls || "", b.label);
    btn.type = "button";
    btn.addEventListener("click", b.onClick);
    row.appendChild(btn);
  }
  parent.appendChild(row);
  return row;
}

/* Destructive actions: plain confirm for reversible, TYPED confirm for
   irreversible (purge). Both are dialogs, never a bare browser prompt. */
function confirmDialog({ title, body, confirmLabel, danger, typed, onConfirm }) {
  openModal((sheet) => {
    sheet.appendChild(el("p", null, body));
    let input = null;
    if (typed) {
      input = field(sheet, "confirm-typed", `Type “${typed}” to confirm`);
      input.autocomplete = "off";
    }
    buttonRow(sheet, [
      {
        label: confirmLabel, cls: danger ? "btn-danger" : "btn-primary",
        onClick: async () => {
          if (typed && input.value.trim() !== typed) { toast("Text did not match", "err"); return; }
          closeModal();
          await onConfirm();
        },
      },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, title);
}

/* ---------- tenant actions --------------------------------------------- */
const refresh = () => Promise.all([loadKpis(), loadTenants()]);

async function tenantAction(act, slug) {
  const row = ROWS.find((r) => r.slug === slug) || { shop_name: slug };
  if (act === "profile") return profileModal(slug);
  if (act === "more") return moreActions(slug, row);
  if (act === "users") return usersModal(slug);
  if (act === "plan") return planModal(slug, row);
  if (act === "status") return statusModal(slug, row);
  if (act === "convert") return convertModal(slug, row);
  if (act === "extend") {
    return confirmDialog({
      title: "Extend subscription", body: `Add 30 days to ${row.shop_name} and mark it active?`,
      confirmLabel: "Extend 30 days",
      onConfirm: async () => {
        await act2(() => api(`/control/api/tenants/${slug}`, { method: "PATCH", body: { extend_days: 30 } }),
          `${row.shop_name} extended by 30 days`);
        refresh();
      },
    });
  }
  if (act === "agent") {
    const turningOff = row.agent_enabled !== false;
    return confirmDialog({
      title: turningOff ? "Switch the AI agent off" : "Switch the AI agent on",
      danger: turningOff,
      body: turningOff
        ? `${row.shop_name}'s bot will stop replying to customers entirely. Messages still arrive in their Inbox so their team can answer by hand.`
        : `${row.shop_name}'s bot will start answering customers again.`,
      confirmLabel: turningOff ? "Switch off" : "Switch on",
      onConfirm: async () => { await setAgent(slug, !turningOff); loadTenants(); },
    });
  }
  if (act === "pw") return passwordModal(slug, row);
  if (act === "soft-delete") {
    return confirmDialog({
      title: "Move to recycle bin", danger: true,
      body: `${row.shop_name}'s logins stop working, but every row of data stays. You can restore it any time.`,
      confirmLabel: "Move to recycle bin",
      onConfirm: async () => {
        await act2(() => api(`/control/api/tenants/${slug}?confirm=${encodeURIComponent(slug)}`, { method: "DELETE" }),
          `${row.shop_name} moved to recycle bin`);
        refresh();
      },
    });
  }
  if (act === "restore") {
    await act2(() => api(`/control/api/tenants/${slug}/restore`, { method: "POST" }), `${row.shop_name} restored`);
    return refresh();
  }
  if (act === "purge") {
    return confirmDialog({
      title: "Permanently delete", danger: true, typed: slug,
      body: `This erases ${row.shop_name} and its users for good. It cannot be undone — export a backup first if you may need it.`,
      confirmLabel: "Delete forever",
      onConfirm: async () => {
        await act2(() => api(`/control/api/tenants/${slug}?confirm=${encodeURIComponent(slug)}&purge=true`, { method: "DELETE" }),
          `${row.shop_name} deleted permanently`);
        refresh();
      },
    });
  }
}
const act2 = act; // alias kept short inside handlers

function selectModal(title, label, options, onPick, current) {
  openModal((sheet) => {
    const l = el("label", null, label);
    l.htmlFor = "sel-value";
    const sel = el("select");
    sel.id = "sel-value";
    for (const [v, text] of options) {
      const o = el("option", null, text);
      o.value = v;
      sel.appendChild(o);
    }
    /* Bina iske dropdown hamesha PEHLA option dikhata tha. Business wale
       tenant par bhi "Basic" khulta, aur bina soche Save dabane par shop
       chupchaap downgrade ho jaati. Status par bhi wahi — hamesha "Trial". */
    if (current != null) sel.value = current;
    sheet.appendChild(l); sheet.appendChild(sel);
    buttonRow(sheet, [
      { label: "Save", cls: "btn-primary", onClick: async () => { const v = sel.value; closeModal(); await onPick(v); } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, title);
}

/* Values asli plan CODES hain (starter/pro/growth), bikne wale naam nahi.
   Pehle yahan "premium"/"business" tha — backend ALIASES se resolve kar
   leta tha, isliye Save chalta tha, par DB "growth" lautati hai aur us par
   koi option match nahi karta. Isi wajah se Business wali shop par bhi
   dropdown "Basic" dikhata tha. */
/* Plan + muddat ek saath: 1/3/6/12 mahine chuno, period end utna aage badhta
   hai aur status active. "Payment received" se raseed bhi Billing tab mein.
   Daam server ke catalog se — yahan hardcode nahi (pehle ₹3,999 galat likha tha). */
let PLAN_CATALOG = null;
let SOLO_PLANS = new Set(["solo_lite", "solo", "solo_pro"]);
const isSolo = (code) => SOLO_PLANS.has(code);
async function ensureCatalog() {
  if (PLAN_CATALOG) return true;
  try {
    PLAN_CATALOG = await api("/control/api/plan-catalog");
    SOLO_PLANS = new Set(PLAN_CATALOG.plans.filter((p) => p.kind === "solo").map((p) => p.code));
    return true;
  } catch (e) { toast(e.message, "err"); return false; }
}
/* Tenants ka plan filter catalog se — naya plan aaya to yahan apne aap */
async function paintPlanFilter() {
  if (!(await ensureCatalog())) return;
  const sel = $("t-plan"), keep = sel.value;
  sel.replaceChildren(Object.assign(el("option", null, "Plan: all"), { value: "" }));
  for (const p of PLAN_CATALOG.plans) sel.appendChild(Object.assign(el("option", null, p.name), { value: p.code }));
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : "";
}
const DURATION_LABEL = { 1: "1 month", 2: "2 months", 3: "3 months", 4: "4 months", 6: "6 months", 12: "12 months" };
async function planModal(slug, row) {
  if (!(await ensureCatalog())) return;
  openModal((sheet) => {
    sheet.classList.add("wide");
    sheet.appendChild(el("p", "muted", `Now on ${row.plan_name || row.plan || "—"}. Pick a plan — limits and features switch the moment you save.`));
    let picked = row.plan || "starter";
    const groups = [["solo", "Solo — one person, phone only"], ["shop", "Shop plans — counter, staff, dashboard"]];
    const cardsBy = {};
    for (const [kind, title] of groups) {
      const list = PLAN_CATALOG.plans.filter((p) => (p.kind || "shop") === kind);
      if (!list.length) continue;
      sheet.appendChild(el("div", "plan-group", title));
      const grid = el("div", "plan-grid");
      grid.setAttribute("role", "radiogroup");
      for (const p of list) {
        const c = el("button", `plan-card${p.kind === "solo" ? " solo" : ""}${p.retired ? " retired" : ""}`);
        c.type = "button";
        c.setAttribute("role", "radio");
        const top = el("div", "pc-top");
        top.append(el("b", null, p.name), el("span", "pc-price", `${inr(p.price_inr)}`));
        top.lastChild.appendChild(el("small", null, "/mo"));
        c.appendChild(top);
        if (p.tagline) c.appendChild(el("span", "pc-tag", p.tagline));
        // Retire plan: naya grahak galti se is par na jaaye — purani dukaanon ke liye hi
        if (p.retired) c.appendChild(el("span", "pc-retired", "Retired — only for old shops"));
        const L = p.limits || {};
        const lim = el("ul", "pc-lim");
        const fmt = (v) => (v == null ? "Unlimited" : Number(v).toLocaleString("en-IN"));
        [["Orders / mo", L.orders], ["WhatsApp msgs", L.wa],
          L.ai_replies != null ? ["AI replies", L.ai_replies] : ["AI calls", L.ai], ["Staff logins", L.staff]]
          .forEach(([k, v]) => { const li = el("li"); li.append(el("span", null, k), el("b", null, fmt(v))); lim.appendChild(li); });
        c.appendChild(lim);
        if (row.plan === p.code) c.appendChild(el("span", "pc-now", "Current"));
        c.addEventListener("click", () => { picked = p.code; paint(); });
        cardsBy[p.code] = c;
        grid.appendChild(c);
      }
      sheet.appendChild(grid);
    }

    const g = el("div", "grid-2");
    const dwrap = el("div");
    const dl = el("label", null, "Charge for");
    dl.htmlFor = "pm-dur";
    const dur = el("select");
    dur.id = "pm-dur";
    dur.appendChild(Object.assign(el("option", null, "Nothing now — only switch the plan"), { value: "" }));
    for (const d of PLAN_CATALOG.durations) {
      dur.appendChild(Object.assign(el("option", null, DURATION_LABEL[d.months]), { value: String(d.months) }));
    }
    dwrap.append(dl, dur);
    const payBox = el("div");
    const payWrap = el("label", "inline mt");
    const pay = el("input");
    pay.type = "checkbox"; pay.id = "pm-pay"; pay.checked = true;
    payWrap.append(pay, document.createTextNode(" Payment received — record an invoice"));
    payBox.appendChild(payWrap);
    g.append(dwrap, payBox);
    sheet.appendChild(g);
    // Is dukaan ke liye apna daam (offer) — server ghate se neeche nahi jaane deta
    const offWrap = el("div", "pm-offer");
    const offL = el("label", null, "Offer price ₹ (optional, whole period, before GST)");
    offL.htmlFor = "pm-offer";
    const off = el("input");
    off.id = "pm-offer"; off.type = "number"; off.min = "1"; off.step = "1"; off.inputMode = "numeric";
    off.placeholder = "Empty = plan price";
    offWrap.append(offL, off);
    sheet.appendChild(offWrap);
    const preview = el("div", "pm-preview");
    sheet.appendChild(preview);

    function paint() {
      Object.entries(cardsBy).forEach(([code, c]) => {
        c.classList.toggle("on", code === picked);
        c.setAttribute("aria-checked", String(code === picked));
      });
      const p = PLAN_CATALOG.plans.find((x) => x.code === picked) || {};
      const months = parseInt(dur.value, 10);
      payWrap.hidden = !months;
      offWrap.hidden = !months || !pay.checked;
      const change = picked !== row.plan ? `${row.plan_name || row.plan} → ${p.name}` : `Stay on ${p.name}`;
      if (!months) { preview.textContent = `${change}. Period end and status stay as they are.`; return; }
      const d = PLAN_CATALOG.durations.find((x) => x.months === months);
      const now = new Date();
      const cur = row.current_period_end ? new Date(row.current_period_end) : now;
      const start = cur > now ? cur : now;
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);
      const list = d.prices[picked], offer = parseInt(off.value, 10);
      const price = offer > 0 && pay.checked
        ? `offer ${inr(offer)} instead of ${inr(list)}${offer < list ? ` (${Math.round((list - offer) / list * 100)}% off)` : ""}`
        : inr(list);
      preview.textContent = `${change} · ${DURATION_LABEL[months]} · ${price} + GST · active until `
        + end.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        + (cur > now ? " (added after the current paid period)" : "");
    }
    dur.addEventListener("change", paint);
    pay.addEventListener("change", paint);
    off.addEventListener("input", paint);
    paint();
    buttonRow(sheet, [
      { label: "Save plan", cls: "btn-primary", onClick: async () => {
        const body = { plan: picked };
        if (dur.value) { body.duration_months = parseInt(dur.value, 10); body.payment_received = pay.checked; }
        if (dur.value && pay.checked && parseInt(off.value, 10) > 0) body.offer_price_inr = parseInt(off.value, 10);
        closeModal();
        await act(() => api(`/control/api/tenants/${slug}`, { method: "PATCH", body }),
          dur.value ? `Plan set for ${DURATION_LABEL[dur.value]}` : "Plan updated");
        refresh();
      } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, `Change plan — ${row.shop_name}`);
}

/* ⋯ — kam baar lagne wale kaam ek list mein (row par saat button ki jagah) */
function moreActions(slug, row) {
  const items = [
    ["users", "👥", "Users & logins", "Invite or remove people who can open this shop"],
    ["status", "🔁", "Change status", "Trial, active, past due, locked, suspended, cancelled"],
    ["extend", "📅", "Extend 30 days", "Add a month and mark the shop active"],
    ["convert", "🔄", "Change duration", "Turn 1 month into 3 months: same start date, pay the difference"],
    ["agent", "🤖", row.agent_enabled === false ? "Switch AI agent on" : "Switch AI agent off", "The bot that answers customers on WhatsApp"],
    ["pw", "🔑", "Password reset link", "Owner sets a new password from this link"],
    ["soft-delete", "🗑", "Move to recycle bin", "Logins stop; all data stays and can be restored"],
  ];
  openModal((sheet) => {
    const list = el("div", "act-list");
    for (const [a, ico, title, sub] of items) {
      const b = el("button", `act-item${a === "soft-delete" ? " danger" : ""}`);
      b.type = "button";
      const need = a === "soft-delete" ? "danger" : "write";
      if (!can(need)) b.disabled = true;
      b.append(el("span", "ai-ico", ico));
      const tx = el("span", "ai-tx");
      tx.append(el("b", null, title), el("small", null, sub));
      b.appendChild(tx);
      b.addEventListener("click", () => { closeModal(); tenantAction(a, slug); });
      list.appendChild(b);
    }
    sheet.appendChild(list);
  }, row.shop_name);
}

/* App ka offer card: kya likhna, kab, kitni baar, kisko (services/promo_offers.py) */
const OFFER_STATUS = { live: ["Live", "ok"], scheduled: ["Scheduled", "warn"], ended: ["Ended", "unknown"], off: ["Off", "unknown"] };
const offerDay = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
let OFFERS = null;
function offerWho(o) {
  if (o.mode === "plans") return o.plans.map((c) => (PLAN_CATALOG?.plans.find((p) => p.code === c) || {}).name || c).join(", ");
  return o.mode === "shops" ? `${o.shops.length} chosen shop${o.shops.length === 1 ? "" : "s"}` : "All shops";
}
async function loadOffers() {
  const box = $("offers-list");
  box.replaceChildren(el("p", "muted", "Loading…"));
  await ensureCatalog();
  let r;
  try { r = await api("/control/api/offers"); }
  catch (e) { box.replaceChildren(el("p", "muted", e.message)); return; }
  OFFERS = r;
  $("offers-auto").checked = r.auto_offer;
  $("offers-auto").disabled = !can("write");
  $("btn-new-offer").disabled = !can("write");
  $("offers-note").textContent = `Tapping the offer button opens WhatsApp to ${r.sales_wa}. If two offers are live for a shop, the newest one shows.`;
  box.replaceChildren();
  if (!r.offers.length) box.appendChild(el("p", "muted", "No offers yet."));
  for (const o of r.offers) {
    const [label, cls] = OFFER_STATUS[o.status];
    const card = el("div", "panel offer-row");
    const head = el("div", "panel-h");
    head.append(el("b", null, o.title), el("span", `pill ${cls}`, label));
    const every = o.every_days === 1 ? "every day" : `every ${o.every_days} days`;
    card.append(head, el("p", "offer-text", o.text),
      el("p", "muted", `${offerDay(o.start)} to ${offerDay(o.end)} · ${every} · ${offerWho(o)} · button: ${o.button}`));
    if (can("write")) {
      buttonRow(card, [
        { label: "Edit", onClick: () => offerModal(o) },
        { label: o.active ? "Turn off" : "Turn on", onClick: async () => {
          await act(() => api(`/control/api/offers/${o.id}`, { method: "PUT", body: { ...o, active: !o.active } }), o.active ? "Offer off" : "Offer on");
          loadOffers();
        } },
        { label: "Delete", onClick: () => confirmDialog({
          title: "Delete offer", body: `Delete "${o.title}"?`, confirmLabel: "Delete", danger: true,
          onConfirm: async () => { await act(() => api(`/control/api/offers/${o.id}`, { method: "DELETE" }), "Offer deleted"); loadOffers(); },
        }) },
      ]);
    }
    box.appendChild(card);
  }
}
async function offerModal(o) {
  await ensureCatalog();
  let shops = [];
  try { shops = (await api("/control/api/tenants?limit=200")).tenants || []; } catch (e) { toast(e.message, "err"); }
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const v = o || { title: "", text: "", button: "WhatsApp पर बात करें", start: today, end: week, every_days: 3, active: true, mode: "all", plans: [], shops: [] };
  openModal((sheet) => {
    const field = (label, node) => { const l = el("label", null, label); l.htmlFor = node.id; sheet.append(l, node); return node; };
    const input = (id, value, attrs = {}) => Object.assign(el("input"), { id, value, ...attrs });
    const title = field("Title", input("of-title", v.title, { maxLength: 80 }));
    const text = field("Text", Object.assign(el("textarea"), { id: "of-text", value: v.text, maxLength: 300, rows: 3 }));
    const button = field("Button text", input("of-button", v.button, { maxLength: 30 }));
    const g = el("div", "grid-2");
    sheet.appendChild(g);
    const dateBox = (id, label, value) => { const w = el("div"), l = el("label", null, label), i = input(id, value, { type: "date" }); l.htmlFor = id; w.append(l, i); g.appendChild(w); return i; };
    const start = dateBox("of-start", "Start", v.start), end = dateBox("of-end", "End", v.end);
    const every = field("Show every how many days (1 = daily)", input("of-every", String(v.every_days), { type: "number", min: 1, max: 30 }));
    const mode = field("Who sees it", el("select"));
    mode.id = "of-mode";
    [["all", "All shops"], ["plans", "Only these plans"], ["shops", "Only these shops"]].forEach(([k, t]) => mode.appendChild(Object.assign(el("option", null, t), { value: k })));
    mode.value = v.mode;
    const picks = (values, chosen) => {
      const box = el("div", "offer-picks");
      for (const [val, name] of values) {
        const l = el("label", "inline"), c = el("input");
        c.type = "checkbox"; c.value = val; c.checked = chosen.includes(val);
        l.append(c, document.createTextNode(` ${name}`));
        box.appendChild(l);
      }
      sheet.appendChild(box);
      return box;
    };
    const planBox = picks(PLAN_CATALOG.plans.map((p) => [p.code, p.name]), v.plans);
    const shopBox = picks(shops.map((s) => [s.slug, `${s.shop_name} · ${s.plan_name || s.plan}`]), v.shops);
    const on = el("input");
    on.type = "checkbox"; on.checked = v.active;
    const onWrap = el("label", "inline mt");
    onWrap.append(on, document.createTextNode(" Offer is on"));
    const err = el("p", "muted");
    sheet.append(onWrap, err);
    const paintWho = () => { planBox.hidden = mode.value !== "plans"; shopBox.hidden = mode.value !== "shops"; };
    mode.addEventListener("change", paintWho);
    paintWho();
    const ticked = (box) => [...box.querySelectorAll("input:checked")].map((c) => c.value);
    buttonRow(sheet, [
      { label: o ? "Save offer" : "Create offer", cls: "btn-primary", onClick: async () => {
        const body = { title: title.value.trim(), text: text.value.trim(), button: button.value.trim(), start: start.value, end: end.value,
          every_days: parseInt(every.value, 10) || 0, active: on.checked, mode: mode.value, plans: ticked(planBox), shops: ticked(shopBox) };
        try { await api(o ? `/control/api/offers/${o.id}` : "/control/api/offers", { method: o ? "PUT" : "POST", body }); }
        catch (e) { err.textContent = e.message; return; }
        closeModal(); toast("Offer saved"); loadOffers();
      } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, o ? "Edit offer" : "New offer");
}

/* 1 mahine wale ko 3 mahine ka: server hi hisaab batata hai, yahan sirf dikhta hai */
function convertModal(slug, row) {
  const when = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  openModal((sheet) => {
    const label = el("label", null, "New duration");
    label.htmlFor = "cv-months";
    const sel = el("select");
    sel.id = "cv-months";
    sel.appendChild(Object.assign(el("option", null, "Pick a duration"), { value: "" }));
    for (const m of Object.keys(DURATION_LABEL)) sel.appendChild(Object.assign(el("option", null, DURATION_LABEL[m]), { value: m }));
    const preview = el("div", "pm-preview", "The start date stays the same. Only the end date and the amount change.");
    const payWrap = el("label", "inline mt");
    const pay = el("input");
    pay.type = "checkbox"; pay.checked = true;
    payWrap.append(pay, document.createTextNode(" Payment received — record an invoice"));
    payWrap.hidden = true;
    sheet.append(label, sel, preview, payWrap);
    let quote = null;
    sel.addEventListener("change", async () => {
      quote = null; payWrap.hidden = true;
      if (!sel.value) { preview.textContent = ""; return; }
      try {
        const q = await api(`/control/api/tenants/${slug}/convert-preview?months=${sel.value}`);
        quote = q;
        const money = q.due_inr ? `Collect ${inr(q.due_inr)} + GST (${inr(q.new_price_inr)} − ${inr(q.old_price_inr)} already paid).`
          : q.refund_inr ? `No charge. ${inr(q.refund_inr)} is the difference; any refund is by hand.` : "No charge.";
        preview.textContent = `${DURATION_LABEL[q.from_months]} → ${DURATION_LABEL[q.to_months]}. Started ${when(q.starts_on)}. Ends ${when(q.old_end)} → ${when(q.new_end)}. ${money}`;
        payWrap.hidden = !q.due_inr;
      } catch (e) { preview.textContent = e.message; }
    });
    buttonRow(sheet, [
      { label: "Change duration", cls: "btn-primary", onClick: async () => {
        if (!quote) { toast("Pick a duration first", "err"); return; }
        closeModal();
        await act(() => api(`/control/api/tenants/${slug}/convert`, { method: "POST", body: { months: quote.to_months, payment_received: pay.checked } }),
          `Now ${DURATION_LABEL[quote.to_months]}, until ${when(quote.new_end)}`);
        refresh();
      } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, `Change duration — ${row.shop_name}`);
}

const statusModal = (slug, row) => selectModal(`Change status — ${row.shop_name}`, "Status",
  [["trial", "Trial"], ["active", "Active"], ["past_due", "Past due (read-only)"],
   ["locked", "Locked"], ["suspended", "Suspended"], ["cancelled", "Cancelled"]],
  async (status) => {
    await act(() => api(`/control/api/tenants/${slug}`, { method: "PATCH", body: { status } }), "Status updated");
    refresh();
  }, row.status);

function linkModal(title, body, path) {
  const url = location.origin + path;
  openModal((sheet) => {
    sheet.appendChild(el("p", null, body));
    sheet.appendChild(el("code", "copy", url));
    buttonRow(sheet, [
      { label: "Copy link", cls: "btn-primary", onClick: async (e) => {
          try { await navigator.clipboard.writeText(url); toast("Link copied"); }
          catch (err) { toast("Copy failed — select the text manually", "err"); } } },
      { label: "Done", onClick: closeModal },
    ]);
  }, title);
}


/* Password help: do raste — link bhejo (client khud set kare) ya turant
   naya password khud set kar do (support call ke liye). Dono mein password
   DB mein sirf hash jaata hai. */
function passwordModal(slug, row) {
  openModal((sheet) => {
    sheet.appendChild(el("p", "muted",
      `Choose how ${row.shop_name}'s owner gets back in. Either way every old session ends and the password is stored only as a hash.`));

    sheet.appendChild(el("h3", "mt", "Set a password now"));
    sheet.appendChild(el("p", "muted",
      "Fastest for a support call — you read it out, they must change it at first login."));
    const pw = field(sheet, "pw-new", "New password (8+ characters)", "", "password");
    pw.autocomplete = "new-password";
    addEyeToggle(pw);
    buttonRow(sheet, [
      { label: "🎲 Generate", onClick: () => { pw.value = randomPassword(); pw.type = "text";
          const b = pw.parentElement.querySelector(".eye"); if (b) b.textContent = "🙈"; } },
      { label: "Set password", cls: "btn-primary", onClick: async () => {
          if (pw.value.trim().length < 8) { toast("At least 8 characters", "err"); return; }
          const d = await act(() => api(`/control/api/tenants/${slug}/set-password`,
            { method: "POST", body: { password: pw.value.trim() } }), null);
          openModal((s2) => {
            s2.appendChild(el("p", null, `Tell ${d.email} this password. They must change it at first login.`));
            s2.appendChild(el("code", "copy", pw.value.trim()));
            buttonRow(s2, [
              { label: "Copy", cls: "btn-primary", onClick: async () => {
                  try { await navigator.clipboard.writeText(pw.value.trim()); toast("Password copied"); }
                  catch (e) { toast("Copy failed — read it from the box", "err"); } } },
              { label: "Done", onClick: closeModal },
            ]);
          }, "Password changed");
        } },
    ]);

    sheet.appendChild(el("h3", "mt", "Or send a set-password link"));
    sheet.appendChild(el("p", "muted",
      "They pick their own password — nobody, including you, ever sees it."));
    buttonRow(sheet, [
      { label: "Create link", onClick: async () => {
          const d = await act(() => api(`/control/api/tenants/${slug}/reset-password`, { method: "POST" }),
            "Reset link created");
          linkModal("Password reset link", `Send this to ${d.email}. It works once.`, d.reset_path);
        } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, `Password — ${row.shop_name}`);
}

/* Show/hide toggle — wahi jo har login form mein hota hai. */
function addEyeToggle(input) {
  const wrap = el("div", "pw-wrap");
  input.parentElement.insertBefore(wrap, input);
  wrap.appendChild(input);
  const b = el("button", "eye", "👁");
  b.type = "button";
  b.setAttribute("aria-label", "Show password");
  b.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    b.textContent = show ? "🙈" : "👁";
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    input.focus();
  });
  wrap.appendChild(b);
  return b;
}

const randomPassword = () => {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return [...a].map((n) => abc[n % abc.length]).join("");
};

/* ---------- add tenant -------------------------------------------------- */
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

async function addTenantModal() {
  await ensureCatalog();
  openModal((sheet) => {
    const shop = field(sheet, "f-shop", "Shop name");
    const slugWrap = el("div");
    const slug = field(slugWrap, "f-slug", "Slug");
    const hint = el("span", "muted");
    slugWrap.appendChild(hint);
    sheet.appendChild(slugWrap);
    const city = field(sheet, "f-city", "City");
    const owner = field(sheet, "f-owner", "Owner name");
    const phone = field(sheet, "f-phone", "Owner phone (+91…)");
    const email = field(sheet, "f-email", "Owner email", "", "email");

    const planL = el("label", null, "Plan"); planL.htmlFor = "f-plan";
    const plan = el("select"); plan.id = "f-plan";
    for (const p of (PLAN_CATALOG ? PLAN_CATALOG.plans : [{ code: "starter", name: "Basic", price_inr: 999 }])) {
      const o = el("option", null, `${p.name} — ${inr(p.price_inr)}/month${p.kind === "solo" ? " · Solo" : ""}`);
      o.value = p.code;
      plan.appendChild(o);
    }
    plan.value = "starter";
    const cycleL = el("label", null, "Billing cycle"); cycleL.htmlFor = "f-cycle";
    const cycle = el("select"); cycle.id = "f-cycle";
    ["monthly", "annual"].forEach((v) => { const o = el("option", null, v); o.value = v; cycle.appendChild(o); });
    sheet.append(planL, plan, cycleL, cycle);
    const trial = field(sheet, "f-trial", "Trial length (days)", "7", "number");
    // Plan badla to us plan ka trial (Solo 14 din, baaki 7)
    plan.addEventListener("change", () => {
      const p = PLAN_CATALOG && PLAN_CATALOG.plans.find((x) => x.code === plan.value);
      if (p && p.trial_days) trial.value = String(p.trial_days);
    });

    let timer = null;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const v = slug.value.trim();
        if (!v) { hint.textContent = ""; return; }
        try {
          const d = await api("/control/api/slug-check?slug=" + encodeURIComponent(v));
          hint.textContent = !d.valid ? "✗ invalid characters" : d.available ? "✓ available" : "✗ already taken";
        } catch (e) { hint.textContent = ""; }
      }, 300);
    };
    shop.addEventListener("input", () => { slug.value = slugify(shop.value); check(); });
    slug.addEventListener("input", check);

    buttonRow(sheet, [
      { label: "Create and invite", cls: "btn-primary", onClick: async () => {
          const body = {
            shop_name: shop.value.trim(), slug: slug.value.trim() || null,
            city: city.value.trim(), owner_name: owner.value.trim(),
            phone: phone.value.trim(), email: email.value.trim(),
            plan: plan.value, cycle: cycle.value,
            trial_days: parseInt(trial.value || "0", 10),
          };
          const d = await act(() => api("/control/api/tenants", { method: "POST", body }),
            `${body.shop_name} created`);
          refresh();
          linkModal("Send this set-password link",
            `WhatsApp: ${d.invite_sent_on_whatsapp ? "sent automatically" : "not sent — share it yourself"}. We never create or store their password.`,
            d.invite_path);
        } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, "New tenant");
}

/* ---------- profile ----------------------------------------------------- */
function bar(parent, label, used, limit) {
  const wrap = el("div", "mt");
  wrap.appendChild(el("div", "muted",
    `${label}: ${used}${limit != null ? " / " + limit : " (unlimited)"}`));
  if (limit != null) {
    const pct = limit ? Math.min(100, Math.round(used * 100 / limit)) : 0;
    const b = el("div", "bar" + (pct >= 90 ? " bad" : pct >= 70 ? " warn" : ""));
    const i = el("i");
    i.style.setProperty("--pct", pct + "%");   // CSSOM, not an inline attribute
    b.appendChild(i);
    wrap.appendChild(b);
  }
  parent.appendChild(wrap);
}

/* ---------- CLIENT WORKSPACE -------------------------------------------
   Ek client par click = uska poora control ek jagah, tabs mein:
   Overview · Usage & limits · Recharge · WhatsApp · AI agent · Users ·
   Billing · Activity · Danger. Har tab apna data alag se load karta hai
   (workspace turant khulta hai, spinner ke peeche nahi baithta). */
const WS_TABS = [
  ["overview", "Overview"], ["usage", "Usage & limits"], ["recharge", "Recharge"],
  ["whatsapp", "WhatsApp"], ["integrations", "Instagram & Google"], ["agent", "AI agent"], ["users", "Users"],
  ["billing", "Billing"], ["activity", "Activity"], ["danger", "Danger"],
];

async function profileModal(slug, openTab) {
  let d;
  try { d = await api(`/control/api/tenants/${slug}`); }
  catch (e) { toast(e.message, "err"); return; }

  LAST_FOCUS = document.activeElement;
  const sheet = $("modal");
  sheet.replaceChildren();
  sheet.classList.add("workspace");
  $("ov").hidden = false;

  // header: name, status, plan, quick facts
  const head = el("div", "ws-head");
  const title = el("h3", null, d.shop_name);
  title.id = "modal-title";
  const line1 = el("div", "row");
  await ensureCatalog();
  const solo = isSolo(d.plan);
  line1.append(title, badge(d.status),
    planChip(d.plan, `${d.plan_name} · ${d.billing_cycle}`),
    el("span", "chip", d.wa_connected ? "WhatsApp ✓" : "WhatsApp —"),
    el("span", `chip ${d.agent_enabled === false ? "chip-off" : "chip-on"}`,
      d.agent_enabled === false ? "Agent OFF" : "Agent ON"));
  head.appendChild(line1);
  head.appendChild(el("div", "muted",
    `${d.slug} · ${d.owner_name} · ${d.owner_phone} · joined ${fmtWhen(d.created_at)}`));
  const quick = el("div", "btnrow");
  quick.append(
    wsBtn("👤 Login as client", "btn-primary", () => impersonate(slug, d)),
    wsBtn("🔑 Password", "", () => passwordModal(slug, d)),
    wsBtn("⬇ Backup", "", () => download(slug, "json", true)),
    wsBtn("✕ Close", "", closeModal));
  head.appendChild(quick);
  sheet.appendChild(head);

  // tabs
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  const panel = el("div", "ws-panel");
  panel.id = "ws-panel";
  panel.setAttribute("role", "tabpanel");
  for (const [id, label] of WS_TABS) {
    // Solo dukaan: Instagram / Google ka kaam hi nahi (ek aadmi, phone)
    if (solo && id === "integrations") continue;
    const b = el("button", "tab", label);
    b.type = "button";
    b.id = `tab-${id}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", "false");
    b.addEventListener("click", () => selectTab(slug, d, id));
    tabs.appendChild(b);
  }
  sheet.appendChild(tabs);
  sheet.appendChild(panel);
  selectTab(slug, d, openTab || "overview");
}

const wsBtn = (label, cls, onClick) => {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
};

function selectTab(slug, d, id) {
  [...document.querySelectorAll(".tabs .tab")].forEach((b) =>
    b.setAttribute("aria-selected", String(b.id === `tab-${id}`)));
  const panel = $("ws-panel");
  panel.replaceChildren();
  panel.setAttribute("aria-labelledby", `tab-${id}`);
  ({
    overview: tabOverview, usage: tabUsage, recharge: tabRecharge,
    whatsapp: tabWhatsapp, integrations: tabIntegrations, agent: tabAgent, users: tabUsers,
    billing: tabBilling, activity: tabActivity, danger: tabDanger,
  })[id](panel, slug, d);
}

const reopen = (slug, tab) => { closeModal(); profileModal(slug, tab); };

/* --- tab: overview (stat tiles + profile edit) ------------------------- */
function tabOverview(box, slug, d) {
  const u = d.usage || {}, sub = d.subscription || {};
  const tiles = el("div", "ws-tiles");
  const tile = (label, value, sub2) => {
    const t = el("div", "ws-tile");
    t.appendChild(el("b", null, String(value)));
    t.appendChild(el("span", "muted", label));
    if (sub2) t.appendChild(el("div", "muted", sub2));
    tiles.appendChild(t);
  };
  tile("Orders this month", u.orders_month ?? 0, u.orders_limit == null ? "unlimited" : `limit ${u.orders_limit}`);
  tile("WhatsApp msgs", u.wa_msgs_month ?? 0, u.wa_limit == null ? "unlimited" : `limit ${u.wa_limit}`);
  if (u.ai_reply_limit != null) tile("AI replies", u.ai_replies_month ?? 0, `limit ${u.ai_reply_limit}`);
  tile("AI calls (internal)", u.ai_calls_month ?? 0, u.ai_limit == null ? "unlimited" : `limit ${u.ai_limit}`);
  tile("Staff", u.staff ?? 0, u.staff_limit == null ? "unlimited" : `limit ${u.staff_limit}`);
  tile("WA recharge", (d.credits || {}).wa ?? 0, "messages left");
  tile("AI recharge", (d.credits || {}).ai ?? 0, "left");
  tile("MRR", inr(d.mrr_inr), sub.current_period_end ? `paid till ${fmtWhen(sub.current_period_end)}` :
    sub.trial_ends_at ? `trial till ${fmtWhen(sub.trial_ends_at)}` : "");
  tile("Users", d.users, `${d.setup_fee_paid ? "setup paid" : "setup due"}`);
  box.appendChild(tiles);

  box.appendChild(el("h3", "mt", "Profile"));
  const shop = field(box, "p-shop", "Shop name", d.shop_name);
  const owner = field(box, "p-owner", "Owner", d.owner_name);
  const g = el("div", "grid-2");
  const phone = field(g, "p-phone", "Phone", d.owner_phone);
  const email = field(g, "p-email", "Email", d.owner_email || "");
  const city = field(g, "p-city", "City", d.city || "");
  const tags = field(g, "p-tags", "Tags (comma separated)", (d.tags || []).join(", "));
  box.appendChild(g);
  const notes = field(box, "p-notes", "Notes", d.notes || "");
  buttonRow(box, [{ label: "Save profile", cls: "btn-primary", onClick: async () => {
    await act(() => api(`/control/api/tenants/${slug}`, { method: "PATCH", body: {
      shop_name: shop.value.trim(), owner_name: owner.value.trim(),
      owner_phone: phone.value.trim(), owner_email: email.value.trim(),
      city: city.value.trim(), notes: notes.value,
      tags: tags.value.split(",").map((s) => s.trim()).filter(Boolean),
    } }), "Profile saved");
    loadTenants(); reopen(slug, "overview");
  } }]);

  box.appendChild(el("h3", "mt", "Plan & subscription"));
  const pg = el("div", "btnrow");
  pg.append(
    wsBtn("Change plan", "", () => planModal(slug, d)),
    wsBtn("Change duration", "", () => convertModal(slug, d)),
    wsBtn("Change status", "", () => statusModal(slug, d)),
    wsBtn("+30 days", "", () => confirmDialog({
      title: "Extend subscription", body: `Add 30 days to ${d.shop_name} and mark it active?`,
      confirmLabel: "Extend 30 days",
      onConfirm: async () => {
        await act(() => api(`/control/api/tenants/${slug}`, { method: "PATCH", body: { extend_days: 30 } }),
          "Extended by 30 days");
        loadTenants(); reopen(slug, "overview");
      },
    })));
  box.appendChild(pg);
}

/* --- tab: usage & limits ---------------------------------------------- */
function tabUsage(box, slug, d) {
  const u = d.usage || {}, c = d.credits || {};
  bar(box, "Orders this month", u.orders_month ?? 0, u.orders_limit);
  bar(box, "WhatsApp messages", u.wa_msgs_month ?? 0, u.wa_limit);
  bar(box, "AI replies to customers", u.ai_replies_month ?? 0, u.ai_reply_limit);
  bar(box, "AI calls (internal cost)", u.ai_calls_month ?? 0, u.ai_limit);
  bar(box, "Staff", u.staff ?? 0, u.staff_limit);
  box.appendChild(el("p", "muted mt",
    `Recharge left — WhatsApp: ${c.wa ?? 0} · AI: ${c.ai ?? 0}. ` +
    "Limit finishes → recharge is used automatically; when that is empty too, sending stops."));
  if (d.billing_estimate && d.billing_estimate.wa_overage_msgs) {
    box.appendChild(el("p", "muted",
      `Overage this month: ${d.billing_estimate.wa_overage_msgs} messages ≈ ${inr(d.billing_estimate.wa_overage_inr)}`));
  }

  box.appendChild(el("h3", "mt", "Override the plan limits"));
  box.appendChild(el("p", "muted", "Blank = leave unchanged · -1 = unlimited"));
  const g = el("div", "grid-2");
  const ai = field(g, "lo-ai", "AI calls / month", "");
  const wa = field(g, "lo-wa", "WA messages / month", "");
  const or = field(g, "lo-orders", "Orders / month", "");
  const st = field(g, "lo-staff", "Staff", "");
  const rp = field(g, "lo-replies", "AI replies / month (0 = off)", "");
  box.appendChild(g);
  rp.placeholder = String(u.ai_reply_limit ?? "unlimited");
  ai.placeholder = String(u.ai_limit ?? "unlimited");
  wa.placeholder = String(u.wa_limit ?? "unlimited");
  or.placeholder = String(u.orders_limit ?? "unlimited");
  st.placeholder = String(u.staff_limit ?? "unlimited");
  const num = (i) => i.value.trim() === "" ? null : parseInt(i.value, 10);
  buttonRow(box, [
    { label: "Save limits", cls: "btn-primary", onClick: async () => {
        await act(() => api(`/control/api/tenants/${slug}/limits`, { method: "PUT", body: {
          ai_usage_limit: num(ai), whatsapp_message_limit: num(wa),
          max_orders_month: num(or), max_staff: num(st), ai_reply_limit: num(rp),
        } }), "Limits updated");
        loadTenants(); reopen(slug, "usage");
      } },
    { label: "Reset to plan defaults", onClick: async () => {
        await act(() => api(`/control/api/tenants/${slug}/limits`, { method: "PUT", body: { clear: true } }),
          "Back to plan defaults");
        loadTenants(); reopen(slug, "usage");
      } },
  ]);
}

/* --- tab: recharge ----------------------------------------------------- */
/* ₹ likho -> units apne aap (Billing page ke daam se), units kam-zyada kar
   sakte ho. Saath mein aapka kharcha aur bachat — ₹30 mein kitna bachta hai. */
let PRICING = null;
async function ensurePricing(force) {
  if (PRICING && !force) return PRICING;
  try { PRICING = await api("/control/api/recharge-pricing"); } catch (e) { PRICING = null; }
  return PRICING;
}
const KIND_WORD = { ai: "AI replies", wa: "WhatsApp messages" };

async function tabRecharge(box, slug, d) {
  const c = d.credits || {};
  const tiles = el("div", "ws-tiles");
  for (const [label, val, kind] of [["AI replies left", c.ai ?? 0, "ai"], ["WhatsApp messages left", c.wa ?? 0, "wa"]]) {
    const t = el("div", `ws-tile kind-${kind}`);
    t.appendChild(el("b", null, Number(val).toLocaleString("en-IN")));
    t.appendChild(el("span", "muted", label));
    tiles.appendChild(t);
  }
  box.appendChild(tiles);
  box.appendChild(el("p", "muted mt", "Recharge is used only after the plan's monthly limit runs out. One reply or message = one unit."));

  const pr = await ensurePricing();
  const rates = (pr && pr.rates) || { ai: 10, wa: 0.8 };
  const cost = (pr && pr.cost_per_unit) || { ai: 0.02, wa: 0.13 };

  const form = el("div", "rc-form");
  form.appendChild(el("h3", null, "Add a recharge"));
  // kya
  const seg = el("div", "seg");
  seg.setAttribute("role", "radiogroup");
  let kind = "ai";
  const segBtns = {};
  for (const k of ["ai", "wa"]) {
    const b = el("button", "", KIND_WORD[k]);
    b.type = "button"; b.setAttribute("role", "radio");
    b.addEventListener("click", () => { kind = k; recompute(true); });
    segBtns[k] = b; seg.appendChild(b);
  }
  form.appendChild(seg);
  // kitne ₹
  form.appendChild(Object.assign(el("label", null, "Amount received (₹)"), { htmlFor: "rc-inr" }));
  const chips = el("div", "chips");
  const inr_ = el("input"); inr_.id = "rc-inr"; inr_.type = "number"; inr_.min = "0"; inr_.inputMode = "numeric"; inr_.value = "100";
  [30, 50, 100, 200, 500].forEach((n) => {
    const b = el("button", "chip-btn", `₹${n}`);
    b.type = "button";
    b.addEventListener("click", () => { inr_.value = String(n); recompute(true); });
    chips.appendChild(b);
  });
  form.append(chips, inr_);
  // kitne units
  const ul = el("label", null, "");
  ul.htmlFor = "rc-units";
  const units = el("input"); units.id = "rc-units"; units.type = "number"; units.min = "1"; units.inputMode = "numeric";
  const reset = el("button", "btn-sm", "Use rate");
  reset.type = "button";
  reset.addEventListener("click", () => recompute(true));
  const urow = el("div", "rc-units");
  urow.append(units, reset);
  form.append(ul, urow);
  const calc = el("div", "rc-calc");
  form.appendChild(calc);
  const g = el("div", "grid-2");
  const validity = field(g, "rc-days", "Valid for (days) — blank = never expires", "", "number");
  const reason = field(g, "rc-why", "Note — UPI ref, anything", "");
  form.appendChild(g);
  let manual = false;
  units.addEventListener("input", () => { manual = true; recompute(false); });
  inr_.addEventListener("input", () => recompute(true));

  function recompute(fromRate) {
    Object.entries(segBtns).forEach(([k, b]) => { b.classList.toggle("on", k === kind); b.setAttribute("aria-checked", String(k === kind)); });
    ul.textContent = `${KIND_WORD[kind]} to add`;
    const rupees = Math.max(0, parseFloat(inr_.value) || 0);
    if (fromRate) { manual = false; units.value = String(Math.floor(rupees * rates[kind])); }
    const n = Math.max(0, parseInt(units.value, 10) || 0);
    const myCost = n * cost[kind];
    calc.replaceChildren();
    const a = el("div", "rc-big");
    a.append(el("b", null, `₹${rupees.toLocaleString("en-IN")}`), el("span", null, " → "), el("b", null, `${n.toLocaleString("en-IN")} ${KIND_WORD[kind]}`));
    calc.appendChild(a);
    const per = rupees && n ? `₹${(rupees / n).toFixed(kind === "ai" ? 3 : 2)} each` : "";
    calc.appendChild(el("span", "muted", [
      manual ? "Custom count" : `Rate ₹1 = ${rates[kind]}`, per,
      `your cost ≈ ₹${myCost.toFixed(2)}`, `you keep ≈ ₹${(rupees - myCost).toFixed(2)}`,
    ].filter(Boolean).join(" · ")));
  }
  recompute(true);

  buttonRow(form, [
    { label: "Add recharge", cls: "btn-primary", onClick: async () => {
      const n = parseInt(units.value, 10);
      if (!(n > 0)) { toast("Enter how many to add", "err"); return; }
      const days = parseInt(validity.value, 10);
      const r = await act(() => api(`/control/api/tenants/${slug}/credits`, { method: "POST",
        body: { kind, amount: n, amount_inr: Math.round(parseFloat(inr_.value) || 0) || null,
                reason: reason.value.trim(), valid_days: days > 0 ? days : null } }), null);
      toast(`${KIND_WORD[kind]}: +${r.changed_by} → ${r.balance} left` + (r.expires_at ? ` (till ${fmtWhen(r.expires_at)})` : ""));
      loadTenants(); reopen(slug, "recharge");
    } },
    { label: "Take some back", onClick: () => {
      const n = parseInt(units.value, 10);
      if (!(n > 0)) { toast("Enter how many to take back", "err"); return; }
      confirmDialog({
        title: "Take back recharge", danger: true,
        body: `Remove ${n} ${KIND_WORD[kind]} from ${d.shop_name}? The balance never goes below zero.`,
        confirmLabel: `Take back ${n}`,
        onConfirm: async () => {
          await act(() => api(`/control/api/tenants/${slug}/credits`, { method: "POST",
            body: { kind, amount: -n, reason: reason.value.trim() || "taken back" } }), "Taken back");
          loadTenants(); reopen(slug, "recharge");
        },
      });
    } },
  ]);
  box.appendChild(form);

  box.appendChild(el("h3", "mt", "Recharge history"));
  const list = el("div", "timeline");
  list.appendChild(el("p", "muted", "Loading…"));
  box.appendChild(list);
  try {
    const h = await api(`/control/api/tenants/${slug}/credits?limit=30`);
    list.replaceChildren();
    if (!h.history.length) list.appendChild(el("p", "muted", "No recharges yet."));
    for (const r of h.history) {
      const item = el("div", "tl-item");
      item.appendChild(el("b", null, `${r.amount > 0 ? "+" : ""}${r.amount} ${r.kind === "wa" ? "WA msgs" : "AI replies"}`));
      item.appendChild(el("span", "muted",
        ` · balance ${r.balance_after} · ${r.by} · ${fmtWhen(r.at)}${r.reason ? " · " + r.reason : ""}` +
        (r.expires_at ? (r.expired ? ` · expired ${fmtWhen(r.expires_at)}` : ` · valid till ${fmtWhen(r.expires_at)}`) : "")));
      list.appendChild(item);
    }
  } catch (e) { list.replaceChildren(el("p", "muted", "Could not load history")); }
}

/* --- tab: whatsapp ------------------------------------------------------ */
function tabWhatsapp(box, slug, d) {
  const sub = d.subscription || {};
  box.appendChild(el("p", "muted", d.wa_connected
    ? "Connected. Messages from this number land in this client's inbox and replies go out from it."
    : "Not connected yet. Paste the Meta credentials for this client's number."));
  const g = el("div", "grid-2");
  const pnid = field(g, "wa-pnid", "Phone number ID", sub.wa_phone_number_id || "");
  const waba = field(g, "wa-waba", "WABA ID", "");
  box.appendChild(g);
  const tok = field(box, "wa-token", "Access token (stored, never shown again)", "", "password");
  tok.autocomplete = "new-password";
  addEyeToggle(tok);
  buttonRow(box, [{ label: "Validate with Meta and save", cls: "btn-primary", onClick: async () => {
    if (!tok.value.trim()) { toast("Paste the access token first", "err"); return; }
    await act(() => api(`/control/api/tenants/${slug}/whatsapp`, { method: "POST", body: {
      phone_number_id: pnid.value.trim(), waba_id: waba.value.trim(), token: tok.value.trim(),
    } }), "WhatsApp connected");
    loadTenants(); reopen(slug, "whatsapp");
  } }]);
  box.appendChild(el("p", "muted mt",
    "Meta's own limits (250 → 1K → 10K unique customers/day) apply on top of this and rise with the number's quality rating."));
  if (d.wa_connected) waTemplates(box, slug);
}

/* Auto-message templates: without API the shop sends from its phone; with API
   these approved templates go automatically once the 24h window is closed. */
async function waTemplates(box, slug) {
  const sec = el("div", "mt");
  sec.appendChild(el("h4", null, "Auto-message templates"));
  const list = el("div");
  list.appendChild(el("p", "muted", "Loading…"));
  sec.appendChild(list);
  buttonRow(sec, [{ label: "Submit missing templates to Meta", cls: "btn-primary", onClick: async () => {
    const r = await act(() => api(`/control/api/tenants/${slug}/whatsapp/templates`, { method: "POST" }),
      "Submitted — Meta usually reviews utility templates within a day");
    const failed = ((r && r.results) || []).filter((x) => x.status === "FAILED");
    if (failed.length) toast(failed.map((x) => `${x.name}: ${x.error}`).join(" · "), "err");
    reopen(slug, "whatsapp");
  } }]);
  box.appendChild(sec);
  try {
    const d = await api(`/control/api/tenants/${slug}/whatsapp/templates`);
    list.replaceChildren();
    if (d.state !== "ok") list.appendChild(el("p", "muted", "Could not read templates from Meta (check WABA ID and token)."));
    for (const t of d.templates) {
      const item = el("div", "tl-item");
      item.appendChild(el("b", null, `${t.purpose} `));
      item.appendChild(el("span", "muted", `${t.name} · ${t.status}` +
        (t.status === "NEEDS_UPDATE" ? " · approved on Meta without the View bill button — delete it in WhatsApp Manager, then Submit again" : "") +
        (t.rejected_reason && t.rejected_reason !== "NONE" ? ` · ${t.rejected_reason}` : "")));
      list.appendChild(item);
    }
  } catch (e) { list.replaceChildren(el("p", "muted", "Could not load templates")); }
}

/* --- tab: Instagram & Google ------------------------------------------- */
/* Tokens are set here only — the shop's own dashboard just shows status. */
async function tabIntegrations(box, slug) {
  box.appendChild(el("p", "muted", "Loading…"));
  let d;
  try { d = await api(`/control/api/tenants/${slug}/integrations`); }
  catch (e) { box.replaceChildren(el("p", "muted", e.message)); return; }
  box.replaceChildren();

  const ig = d.instagram;
  box.appendChild(el("h4", null, "Instagram (daily posts)"));
  box.appendChild(el("p", "muted", ig.linked
    ? `Connected — Instagram user ${ig.user_id}. The token is stored encrypted and never shown again.`
    : "Not connected. Paste the Instagram Business user ID and a token with instagram_content_publish."));
  const g = el("div", "grid-2");
  const igId = field(g, "ig-id", "Instagram user ID", ig.user_id || "");
  box.appendChild(g);
  const igTok = field(box, "ig-token", "Access token (stored encrypted, never shown again)", "", "password");
  igTok.autocomplete = "new-password";
  addEyeToggle(igTok);
  const igBtns = [{ label: "Validate with Meta and save", cls: "btn-primary", onClick: async () => {
    if (!igTok.value.trim()) { toast("Paste the access token first", "err"); return; }
    const r = await act(() => api(`/control/api/tenants/${slug}/instagram`, { method: "PUT", body: {
      user_id: igId.value.trim(), token: igTok.value.trim(),
    } }), "Instagram connected");
    if (r && r.username) toast(`Linked @${r.username}`, "ok");
    reopen(slug, "integrations");
  } }];
  if (ig.linked) igBtns.push({ label: "Disconnect", cls: "btn-danger", onClick: () => confirmDialog({
    title: "Disconnect Instagram", danger: true,
    body: "Daily posters will stop going to Instagram for this client.", confirmLabel: "Disconnect",
    onConfirm: async () => {
      await act(() => api(`/control/api/tenants/${slug}/instagram`, { method: "DELETE" }), "Instagram disconnected");
      reopen(slug, "integrations");
    },
  }) });
  buttonRow(box, igBtns);

  const gb = d.google;
  const gsec = el("div", "mt");
  gsec.appendChild(el("h4", null, "Google Business Profile (reviews on website)"));
  box.appendChild(gsec);
  if (!gb.configured) {
    gsec.appendChild(el("p", "muted", "Google sign-in is not configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."));
    return;
  }
  if (gb.last_error) gsec.appendChild(el("p", "muted", `⚠️ ${gb.last_error}`));
  if (!gb.connected || gb.reauth_required) {
    gsec.appendChild(el("p", "muted",
      gb.reauth_required
        ? "Google authorization needs to be renewed. Reconnect using the account that manages this client's listing."
        : "Sign in with the Google account that manages this client's listing (do it on the setup call)."));
    const a = el("a", "btn-primary", gb.reauth_required ? "Reconnect Google" : "Connect Google");
    a.href = `/control/api/tenants/${encodeURIComponent(slug)}/google-business/connect`;
    gsec.appendChild(a);
    return;
  }
  if (gb.choices && gb.choices.length) {
    gsec.appendChild(el("p", "muted",
      "Choose the primary listing for website reviews. Daily AI posts will be sent to ALL locations managed by this Google account."));
    const sel = el("select");
    for (const c of gb.choices) {
      const o = el("option", null, c.title + (c.address ? ` — ${c.address}` : ""));
      o.value = c.location;
      sel.appendChild(o);
    }
    gsec.appendChild(sel);
    buttonRow(gsec, [{ label: "Use primary listing + post to all", cls: "btn-primary", onClick: async () => {
      const r = await act(() => api(`/control/api/tenants/${slug}/google-business/location`,
        { method: "POST", body: { location: sel.value } }));
      toast(r.ok ? "Primary listing saved — daily posts enabled for all managed locations" : r.error, r.ok ? "ok" : "err");
      reopen(slug, "integrations");
    } }]);
    return;
  }
  gsec.appendChild(el("p", null, `Primary review listing: ${gb.title || "Google listing"}` +
    (gb.rating ? ` · ${Number(gb.rating).toFixed(1)} ★ · ${gb.count} reviews · ${gb.stored} on website` : "")));
  gsec.appendChild(el("p", "muted",
    `Daily AI posts: ${gb.auto_post_location_count || 1} location(s) selected · scheduled for 10:15 AM IST`));
  for (const p of (gb.auto_post_locations || [])) {
    const published = p.status === "published";
    const failed = p.status === "failed";
    const state = published ? "Published" : (failed ? "Failed" : "Not posted yet");
    const detail = [p.address, p.date, p.poster_attached ? "poster attached" : ""].filter(Boolean).join(" · ");
    gsec.appendChild(el("p", failed ? "error-text" : "muted",
      `${p.title || "Google location"}: ${state}${detail ? " · " + detail : ""}${p.error ? " — " + p.error : ""}`));
  }
  buttonRow(gsec, [{ label: "Refresh locations + enable all", cls: "btn-primary", onClick: async () => {
    const r = await act(() => api(`/control/api/tenants/${slug}/google-business/locations/refresh`, { method: "POST" }));
    if (r && r.ok) toast(`Daily AI posting enabled for ${r.location_count} Google location(s)`, "ok");
    reopen(slug, "integrations");
  } }]);
  gsec.appendChild(el("p", "muted", `Last sync: ${gb.synced_at ? fmtWhen(gb.synced_at) : "not yet"}`));
  buttonRow(gsec, [
    { label: "Sync now", onClick: async () => {
      const r = await act(() => api(`/control/api/tenants/${slug}/google-business/sync`, { method: "POST" }));
      toast(`Synced ${r.stored} reviews`, "ok");
      reopen(slug, "integrations");
    } },
    { label: "Disconnect", cls: "btn-danger", onClick: () => confirmDialog({
      title: "Disconnect Google", danger: true,
      body: "The token is revoked at Google and reviews are removed from this client's website.",
      confirmLabel: "Disconnect",
      onConfirm: async () => {
        await act(() => api(`/control/api/tenants/${slug}/google-business/disconnect`, { method: "POST" }), "Google disconnected");
        reopen(slug, "integrations");
      },
    }) },
  ]);
}

/* --- tab: AI agent ------------------------------------------------------ */
function tabAgent(box, slug, d) {
  const on = d.agent_enabled !== false;
  const u = d.usage || {}, c = d.credits || {};
  box.appendChild(el("p", null, on
    ? "The AI agent is answering this client's customers."
    : "The AI agent is OFF — the bot stays silent, messages still reach their Inbox."));
  buttonRow(box, [
    { label: on ? "⏸ Switch agent OFF" : "▶ Switch agent ON",
      cls: on ? "btn-danger" : "btn-primary",
      onClick: () => confirmDialog({
        title: on ? "Switch the AI agent off" : "Switch the AI agent on", danger: on,
        body: on
          ? "The bot will stop replying to customers entirely. Their team can still answer by hand from the Inbox."
          : "The bot will start answering customers again.",
        confirmLabel: on ? "Switch off" : "Switch on",
        onConfirm: async () => { await setAgent(slug, !on); loadTenants(); reopen(slug, "agent"); },
      }) },
  ]);
  box.appendChild(el("h3", "mt", "AI budget"));
  if (u.ai_reply_limit != null) bar(box, "AI replies this month", u.ai_replies_month ?? 0, u.ai_reply_limit);
  bar(box, "AI calls this month (internal)", u.ai_calls_month ?? 0, u.ai_limit);
  box.appendChild(el("p", "muted", `Recharge left: ${c.ai ?? 0}`));
  buttonRow(box, [
    { label: "Recharge AI", onClick: () => reopen(slug, "recharge") },
    { label: "Change AI limit", onClick: () => reopen(slug, "usage") },
  ]);
}

/* --- tab: users --------------------------------------------------------- */
async function tabUsers(box, slug, d) {
  const list = el("div", "timeline");
  list.appendChild(el("p", "muted", "Loading…"));
  box.appendChild(list);
  let rows = [];
  try { rows = await api(`/control/api/tenants/${slug}/users`); }
  catch (e) { list.replaceChildren(el("p", "muted", e.message)); return; }
  list.replaceChildren();
  if (!rows.length) list.appendChild(el("p", "muted", "No users yet."));
  for (const u of rows) {
    const line = el("div", "tl-item");
    line.appendChild(el("b", null, u.name));
    line.appendChild(el("span", "muted",
      ` · ${u.email} · ${u.role} · ${!u.is_active ? "revoked" : u.pending_invite ? "invite pending" : "active"}`));
    if (u.is_active) {
      const b = el("button", "btn-sm btn-danger", "Revoke");
      b.type = "button";
      b.setAttribute("aria-label", `Revoke access for ${u.email}`);
      b.addEventListener("click", () => confirmDialog({
        title: "Revoke access", danger: true,
        body: `${u.email} will be signed out immediately and cannot sign in again.`,
        confirmLabel: "Revoke access",
        onConfirm: async () => {
          await act(() => api(`/control/api/tenants/${slug}/users/${u.id}/revoke`, { method: "POST" }),
            "Access revoked");
          reopen(slug, "users");
        },
      }));
      line.appendChild(b);
    }
    list.appendChild(line);
  }
  box.appendChild(el("h3", "mt", "Invite a user"));
  const name = field(box, "iu-name", "Name");
  const email = field(box, "iu-email", "Email", "", "email");
  const roleL = el("label", null, "Role");
  roleL.htmlFor = "iu-role";
  const role = el("select");
  role.id = "iu-role";
  ["STAFF", "MANAGER", "ACCOUNTANT", "OWNER"].forEach((r) => {
    const o = el("option", null, r); o.value = r; role.appendChild(o);
  });
  box.append(roleL, role);
  buttonRow(box, [{ label: "Create invite link", cls: "btn-primary", onClick: async () => {
    const r = await act(() => api(`/control/api/tenants/${slug}/users/invite`, { method: "POST",
      body: { name: name.value.trim(), email: email.value.trim(), role: role.value } }),
      "Invite created");
    linkModal("Invite link", `Send this to ${r.email} (${r.role}). They set their own password.`, r.invite_path);
  } }]);
}

/* --- tab: billing ------------------------------------------------------- */
function tabBilling(box, slug, d) {
  const sub = d.subscription || {};
  box.appendChild(el("p", "muted", [
    `status ${d.status}`,
    sub.trial_ends_at ? `trial ends ${fmtWhen(sub.trial_ends_at)}` : null,
    sub.current_period_end ? `paid till ${fmtWhen(sub.current_period_end)}` : null,
    `setup fee ${sub.setup_fee_paid ? "paid" : "due"}`,
    sub.rzp_subscription_id ? `razorpay ${sub.rzp_subscription_id}` : "no subscription yet",
  ].filter(Boolean).join(" · ")));
  box.appendChild(el("h3", "mt", `Invoices (${d.invoices.length})`));
  if (!d.invoices.length) box.appendChild(el("p", "muted", "No invoices yet."));
  for (const i of d.invoices) {
    const line = el("div", "tl-item");
    line.appendChild(el("b", null, inr(i.amount_inr)));
    line.appendChild(el("span", "muted", ` · ${i.plan} ${i.cycle} · ${fmtWhen(i.date)} · ${i.payment_id}`));
    box.appendChild(line);
  }
  buttonRow(box, [
    { label: "⬇ Export JSON", onClick: () => download(slug, "json", false) },
    { label: "⬇ Export CSV", onClick: () => download(slug, "csv", false) },
  ]);
}

/* --- tab: activity ------------------------------------------------------ */
async function tabActivity(box, slug) {
  const list = el("div", "timeline");
  list.appendChild(el("p", "muted", "Loading…"));
  box.appendChild(list);
  let tl = [];
  try { tl = await api(`/control/api/tenants/${slug}/timeline?limit=60`); }
  catch (e) { list.replaceChildren(el("p", "muted", e.message)); return; }
  list.replaceChildren();
  if (!tl.length) list.appendChild(el("p", "muted", "Nothing yet."));
  for (const x of tl) {
    const item = el("div", "tl-item");
    item.appendChild(el("b", null, `${{ audit: "🛠", billing: "💳", invoice: "🧾" }[x.kind] || "•"} ${x.title}`));
    item.appendChild(el("span", "muted", ` · ${x.actor} · ${fmtWhen(x.at)}${x.ok === false ? " · failed" : ""}`));
    if (x.detail) item.appendChild(el("div", "muted tl-detail", JSON.stringify(x.detail)));
    list.appendChild(item);
  }
}

/* --- tab: danger -------------------------------------------------------- */
function tabDanger(box, slug, d) {
  box.appendChild(el("p", "muted",
    "Everything here is logged with your key label and IP. Data is never deleted without a typed confirmation."));
  buttonRow(box, [
    { label: "🗑 Move to recycle bin", cls: "btn-danger", onClick: () =>
        confirmDialog({
          title: "Move to recycle bin", danger: true,
          body: `${d.shop_name}'s logins stop working, but every row of data stays. You can restore it any time.`,
          confirmLabel: "Move to recycle bin",
          onConfirm: async () => {
            await act(() => api(`/control/api/tenants/${slug}?confirm=${encodeURIComponent(slug)}`, { method: "DELETE" }),
              "Moved to recycle bin");
            closeModal(); refresh();
          },
        }) },
    { label: "Permanently delete", cls: "btn-danger", onClick: () =>
        confirmDialog({
          title: "Permanently delete", danger: true, typed: slug,
          body: `This erases ${d.shop_name} and its users for good. Export a backup first if you may need it.`,
          confirmLabel: "Delete forever",
          onConfirm: async () => {
            await act(() => api(`/control/api/tenants/${slug}?confirm=${encodeURIComponent(slug)}&purge=true`, { method: "DELETE" }),
              "Deleted permanently");
            closeModal(); refresh();
          },
        }) },
  ]);
}

function impersonate(slug, d) {
  confirmDialog({
    title: "Open client's dashboard", danger: true,
    body: `You will be inside ${d.owner_name}'s account for 30 minutes. Your own dashboard comes back when you press Back to my account, or when the 30 minutes end. This is written to the audit log.`,
    confirmLabel: "Open as client",
    onConfirm: async () => {
      const r = await act(() => api(`/control/api/tenants/${slug}/impersonate`, { method: "POST" }),
        "Impersonation session created");
      window.open(r.adopt_path, "_blank", "noopener");
    },
  });
}


async function setAgent(slug, on) {
  await act(() => api(`/control/api/tenants/${slug}/settings`, { method: "PUT", body: { key: "agent_enabled", value: on } }),
    on ? "AI agent switched on" : "AI agent switched off — the bot stays silent");
}

async function download(slug, format, business) {
  try {
    const r = await fetch(`/control/api/tenants/${slug}/export?format=${format}&include_business=${business}`,
      { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    saveBlob(await r.blob(), (r.headers.get("Content-Disposition") || "").split('filename="')[1]?.replace('"', "") || `${slug}.${format}`);
    toast("Export downloaded");
  } catch (e) { toast("Export failed: " + e.message, "err"); }
}
function saveBlob(blob, name) {
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportCsv(name, header, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), name);
  toast("CSV downloaded");
}

/* ---------- users ------------------------------------------------------- */
async function usersModal(slug) {
  let rows;
  try { rows = await api(`/control/api/tenants/${slug}/users`); }
  catch (e) { toast(e.message, "err"); return; }
  openModal((sheet) => {
    if (!rows.length) sheet.appendChild(el("p", "muted", "No users yet."));
    for (const u of rows) {
      const line = el("div", "tl-item");
      line.appendChild(el("b", null, u.name));
      line.appendChild(el("span", "muted",
        ` · ${u.email} · ${u.role} · ${!u.is_active ? "revoked" : u.pending_invite ? "invite pending" : "active"}`));
      if (u.is_active) {
        const b = el("button", "btn-sm btn-danger", "Revoke");
        b.type = "button";
        b.setAttribute("aria-label", `Revoke access for ${u.email}`);
        b.addEventListener("click", () => confirmDialog({
          title: "Revoke access", danger: true,
          body: `${u.email} will be signed out immediately and cannot sign in again.`,
          confirmLabel: "Revoke access",
          onConfirm: async () => {
            await act(() => api(`/control/api/tenants/${slug}/users/${u.id}/revoke`, { method: "POST" }),
              "Access revoked");
            closeModal(); usersModal(slug);
          },
        }));
        line.appendChild(b);
      }
      sheet.appendChild(line);
    }
    sheet.appendChild(el("h3", "mt", "Invite a user"));
    const name = field(sheet, "iu-name", "Name");
    const email = field(sheet, "iu-email", "Email", "", "email");
    const roleL = el("label", null, "Role"); roleL.htmlFor = "iu-role";
    const role = el("select"); role.id = "iu-role";
    ["STAFF", "MANAGER", "ACCOUNTANT", "OWNER"].forEach((r) => {
      const o = el("option", null, r); o.value = r; role.appendChild(o);
    });
    sheet.append(roleL, role);
    buttonRow(sheet, [
      { label: "Create invite link", cls: "btn-primary", onClick: async () => {
          const d = await act(() => api(`/control/api/tenants/${slug}/users/invite`, { method: "POST",
            body: { name: name.value.trim(), email: email.value.trim(), role: role.value } }),
            "Invite created");
          linkModal("Invite link", `Send this to ${d.email} (${d.role}). They set their own password.`, d.invite_path);
        } },
      { label: "Close", onClick: closeModal },
    ]);
  }, `Users — ${slug}`);
}

/* ---------- admin keys -------------------------------------------------- */
function createKeyModal() {
  openModal((sheet) => {
    const label = field(sheet, "k-label", "Label (who is it for)");
    const lvlL = el("label", null, "Level"); lvlL.htmlFor = "k-level";
    const lvl = el("select"); lvl.id = "k-level";
    [["read", "read — view only"], ["write", "write — everyday actions"], ["danger", "danger — delete, reset, keys"]]
      .forEach(([v, tx]) => { const o = el("option", null, tx); o.value = v; lvl.appendChild(o); });
    lvl.value = "write";
    sheet.append(lvlL, lvl);
    buttonRow(sheet, [
      { label: "Create key", cls: "btn-primary", onClick: async () => {
          const d = await act(() => api("/control/api/admin-keys", { method: "POST",
            body: { label: label.value.trim(), level: lvl.value } }), "Key created");
          openModal((s2) => {
            s2.appendChild(el("p", null, "This key is shown once — the server only keeps a hash. Copy it now."));
            s2.appendChild(el("code", "copy", d.key));
            buttonRow(s2, [
              { label: "Copy", cls: "btn-primary", onClick: async () => {
                  try { await navigator.clipboard.writeText(d.key); toast("Key copied"); }
                  catch (e) { toast("Copy failed — select it manually", "err"); } } },
              { label: "Done", onClick: () => { closeModal(); loadKeys(); } },
            ]);
          }, `${d.label} (${d.level})`);
        } },
      { label: "Cancel", onClick: closeModal },
    ]);
  }, "New admin key");
}

/* ---------- command palette (Ctrl/Cmd-K) -------------------------------- */
const COMMANDS = [
  { id: "go-dash", label: "Go to Dashboard", hint: "page", run: () => go("dashboard") },
  { id: "go-tenants", label: "Go to Tenants", hint: "page", run: () => go("tenants") },
  { id: "go-billing", label: "Go to Billing & recharges", hint: "page", run: () => go("billing") },
  { id: "go-health", label: "Go to Server health", hint: "page", run: () => go("health") },
  { id: "go-audit", label: "Go to Audit log", hint: "page", run: () => go("audit") },
  { id: "go-settings", label: "Go to Settings", hint: "page", run: () => go("settings") },
  { id: "add", label: "Add tenant", hint: "create", run: addTenantModal, need: "write" },
  { id: "backup", label: "Run backup now", hint: "job", run: () => runBackup(), need: "write" },
  { id: "wa", label: "Check WhatsApp health", hint: "diagnose", run: () => whatsappHealthModal() },
  { id: "sweep", label: "Run subscription sweep + dunning", hint: "job", run: () => runSweep(), need: "write" },
  { id: "key", label: "Create admin key", hint: "security", run: createKeyModal, need: "danger" },
  { id: "csv", label: "Export tenants as CSV", hint: "export", run: () => exportTenantsCsv() },
  { id: "trial", label: "Filter: trials", hint: "view", run: () => setStatusFilter("trial") },
  { id: "pastdue", label: "Filter: past due", hint: "view", run: () => setStatusFilter("past_due") },
  { id: "clear", label: "Clear all filters", hint: "view", run: () => { $("t-search").value = ""; $("t-status").value = ""; $("t-plan").value = ""; resetAndLoad(); } },
  { id: "bin", label: "Toggle recycle bin", hint: "view", run: () => { $("show-deleted").checked = !$("show-deleted").checked; resetAndLoad(); } },
  { id: "signout", label: "Sign out", hint: "session", run: () => signOut() },
];
let PAL = [], PAL_I = 0;

function openPalette() {
  $("palette-ov").hidden = false;
  const inp = $("palette-input");
  inp.value = "";
  renderPalette("");
  inp.focus();
}
function closePalette() { $("palette-ov").hidden = true; }

function renderPalette(q) {
  const needle = q.trim().toLowerCase();
  const cmds = COMMANDS.filter((c) => (!c.need || can(c.need)) && c.label.toLowerCase().includes(needle))
    .map((c) => ({ label: c.label, hint: c.hint, run: c.run }));
  const tenants = ROWS.filter((r) => !needle || r.shop_name.toLowerCase().includes(needle) || r.slug.includes(needle))
    .slice(0, 8)
    .map((r) => ({ label: r.shop_name, hint: `${r.slug} · open profile`, run: () => profileModal(r.slug) }));
  PAL = [...cmds, ...tenants].slice(0, 12);
  PAL_I = 0;
  const list = $("palette-list");
  list.replaceChildren();
  if (!PAL.length) {
    const li = el("li", null, "No matches");
    li.setAttribute("role", "option");
    list.appendChild(li);
    return;
  }
  PAL.forEach((item, i) => {
    const li = el("li");
    li.id = `pal-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === 0));
    li.appendChild(el("span", null, item.label));
    li.appendChild(el("span", "hint", item.hint));
    li.addEventListener("click", () => { closePalette(); item.run(); });
    list.appendChild(li);
  });
  $("palette-input").setAttribute("aria-activedescendant", "pal-0");
}
function movePalette(delta) {
  if (!PAL.length) return;
  PAL_I = (PAL_I + delta + PAL.length) % PAL.length;
  [...$("palette-list").children].forEach((li, i) =>
    li.setAttribute("aria-selected", String(i === PAL_I)));
  $("palette-input").setAttribute("aria-activedescendant", `pal-${PAL_I}`);
  $("palette-list").children[PAL_I].scrollIntoView({ block: "nearest" });
}

/* ---------- jobs -------------------------------------------------------- */
async function runBackup() {
  const d = await act(() => api("/control/api/backup/run", { method: "POST", signal: AbortSignal.timeout ? AbortSignal.timeout(600000) : undefined }), null);
  toast(d.verified ? `Backup verified: ${d.file.split(/[\\/]/).pop()}` : "Backup written but verification FAILED — check logs",
    d.verified ? "ok" : "err");
}
/* WhatsApp history (WAHA fullSync): naye session ke liye setting, aur jude
   hue sessions jinka config abhi alag hai unpar ek button se lagao. */
let WA_SYNC = null;
async function loadWaSync() {
  const note = $("wa-sync-sessions"), on = $("wa-sync-on");
  try { WA_SYNC = await api("/control/api/whatsapp/sync"); }
  catch (e) { note.textContent = e.message; return; }
  on.checked = !!WA_SYNC.full_sync;
  on.disabled = $("btn-wa-sync-save").disabled = !can("danger");
  paintWaSync();
}
function paintWaSync() {
  const note = $("wa-sync-sessions"), apply = $("btn-wa-sync-apply");
  const want = $("wa-sync-on").checked;
  const ss = (WA_SYNC && WA_SYNC.sessions) || [];
  const off = ss.filter((x) => x.full_sync !== want);
  note.textContent = WA_SYNC && WA_SYNC.error ? `Sessions: ${WA_SYNC.error}`
    : `${ss.length} connected number(s) · ${ss.filter((x) => x.full_sync).length} on full history`;
  apply.hidden = !off.length || !can("danger");
  apply.textContent = `Apply to ${off.length} connected number(s)`;
}
async function saveWaSync(applyExisting) {
  const full = $("wa-sync-on").checked;
  const run = async () => {
    const d = await act(() => api("/control/api/whatsapp/sync", {
      method: "PUT", body: { full_sync: full, apply_existing: applyExisting },
    }), null);
    const bad = (d.applied || []).filter((x) => !x.ok);
    if (!applyExisting) toast(`Saved — new numbers ${full ? "load full history" : "skip old history"}`);
    else if (bad.length) toast(`${bad.length} number(s) failed: ${bad.map((x) => x.name).join(", ")}`, "err");
    else toast(`Applied to ${(d.applied || []).length} number(s)`);
    loadWaSync();
  };
  if (!applyExisting) return run();
  const n = ((WA_SYNC && WA_SYNC.sessions) || []).filter((x) => x.full_sync !== full).length;
  confirmDialog({
    title: "Apply to connected numbers",
    body: `WhatsApp restarts on ${n} number(s), one after another, a few seconds each. No QR rescan. ` +
      "History already loaded may stay until a number is reconnected.",
    confirmLabel: "Restart and apply", onConfirm: run,
  });
}
async function runSweep() {
  const d = await act(() => api("/control/api/dunning/run", { method: "POST" }), null);
  const m = d.moved || {};
  toast(`Sweep done — ${m.past_due || 0} to past due, ${m.locked || 0} locked, ${m.reminders || 0} reminders`);
  refresh();
}
function exportTenantsCsv() {
  exportCsv("tenants.csv",
    ["shop", "slug", "plan", "cycle", "status", "days_left", "users", "mrr_inr", "owner", "phone", "city", "wa_connected"],
    ROWS.map((r) => [r.shop_name, r.slug, r.plan_name, r.billing_cycle, r.status, r.days_left,
      r.users, r.mrr_inr, r.owner_name, r.owner_phone, r.city, r.wa_connected ? "yes" : "no"]));
}
function exportAuditCsv() {
  exportCsv("audit.csv", ["when", "tenant", "actor", "action", "details", "ok"],
    AUDIT.map((r) => [r.at, r.tenant, r.actor || r.actor_role, r.action, JSON.stringify(r.args || {}), r.ok]));
}

/* ---------- filters / paging ------------------------------------------- */
function resetAndLoad() { T.cursor = ""; T.offset = 0; T.stack = []; writeUrl(); loadTenants(); }
function setStatusFilter(v) { $("t-status").value = v; resetAndLoad(); if (CURRENT_VIEW !== "tenants") go("tenants"); }
function setSort(col) {
  if (T.sort === col) T.order = T.order === "asc" ? "desc" : "asc";
  else { T.sort = col; T.order = "asc"; }
  resetAndLoad();
}


/* ---------- pages: sidebar router --------------------------------------
   Ek waqt ek page (#dashboard, #tenants, …). Hash URL mein rehta hai —
   refresh ya link share karne par wahi page khulta hai. Purane sections
   apne ids ke saath andar hain, isliye unka saara logic waisa hi chalta. */
const VIEWS = {
  dashboard: ["Dashboard", "Your clients, money and server at a glance"],
  tenants: ["Tenants", "Every shop on Kwik Klin — search, filter, open a profile"],
  billing: ["Recharge & billing", "What ₹1 buys, client packs, requests waiting for you, and payments"],
  offers: ["Offers", "What the owner app shows, when, how often and to which shops"],
  sales: ["WhatsApp leads", "Reach laundry shops from your own number. AI talks to whoever replies"],
  health: ["Server health", "CPU, load, memory, disk, database, queue and API speed — live"],
  audit: ["Audit log", "Who did what, with IP"],
  settings: ["Settings", "AI usage and cost, backups, subscription sweep and admin keys"],
};
let CURRENT_VIEW = "";
function go(view) {
  if (location.hash !== `#${view}`) location.hash = view;   // hashchange -> route()
  else route();
}
function route() {
  let v = (location.hash || "").slice(1);
  if (!VIEWS[v]) {
    const p = new URLSearchParams(location.search);
    v = p.get("q") || p.get("status") || p.get("plan") ? "tenants" : "dashboard";
  }
  CURRENT_VIEW = v;
  for (const id of Object.keys(VIEWS)) {
    const sec = $(`view-${id}`);
    if (sec) sec.hidden = id !== v;
  }
  document.querySelectorAll(".nav a[data-view]").forEach((a) => {
    const on = a.dataset.view === v;
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("page-title").textContent = VIEWS[v][0];
  $("page-sub").textContent = VIEWS[v][1];
  document.title = `${VIEWS[v][0]} · Kwik Klin Control`;
  if (v === "health" || v === "dashboard") loadHealth();
  if (v === "dashboard") { loadActivity(); paintAttention(); }
  if (v === "settings") { loadAiUsage(); loadWaSync(); }
  if (v === "billing") { loadAiCost(); loadRazorpay(); loadPlanGst(); loadRecharge(); loadPricing(); }
  if (v === "offers") loadOffers();
  if (v === "sales") loadSales(); else stopSalesPoll();
  window.scrollTo({ top: 0 });
}
function openSide(open) {
  $("sidebar").classList.toggle("open", open);
  $("side-ov").classList.toggle("open", open);
  $("burger").setAttribute("aria-expanded", String(open));
}

/* ---------- WhatsApp leads: number, sheet, campaign, AI baat-cheet --------
   /control/api/sales (routers/sales_control.py). Saamne wale ka text anjaan
   logon ka hai: sirf textContent, kabhi innerHTML nahi. */
const SL_STAGE = {
  NEW: ["Queued", ""], SKIPPED: ["Skipped", ""], SENT: ["Sent", "info"], REPLIED: ["Replied", "warn"],
  HOT: ["Hot", "hot"], WON: ["Won", "ok"], NOT_INTERESTED: ["Not interested", ""], STOPPED: ["STOP", "bad"],
  NO_WHATSAPP: ["No WhatsApp", ""], FAILED: ["Failed", "bad"],
};
const SL_CAMP = { DRAFT: ["Draft", ""], RUNNING: ["Running", "ok"], PAUSED: ["Paused", "warn"], DONE: ["Finished", "info"] };
const SL_PAGE = 100;      // ek baar mein itni lead; "aur dikhao" se agli
const SL = { init: false, data: null, cur: null, filter: "", q: "", open: null, scanning: false, timer: null, scanTimer: null, shown: SL_PAGE };
const SL_DOUBT = { price: "Too costly", no_need: "No need", too_hard: "Hard to use", later: "Later", trust: "Trust", has_software: "Has software", other: "Other" };
const slPill = (map, key) => { const [t, c] = map[key] || [key, ""]; return el("span", `sl-pill ${c}`, t); };
const slWho = (p) => p.name || p.contact_name || p.phone;
const slSum = (c, ...keys) => keys.reduce((n, k) => n + (c[k] || 0), 0);

async function loadSales() {
  slInit();
  try { SL.data = await api("/control/api/sales/overview"); }
  catch (e) { toast(e.message, "err"); return; }
  slWa(); slPicker(); slCampaigns(); slSetupOpen(); slInsights(); slCities(); loadSalesLeads(); loadSalesCalls();
  stopSalesPoll();
  SL.timer = setInterval(() => { if (!document.hidden && CURRENT_VIEW === "sales") slRefresh(); }, 20000);
}
function stopSalesPoll() { clearInterval(SL.timer); SL.timer = null; clearInterval(SL.waTimer); SL.waTimer = null; slStopScan(); }

async function slRefresh() {
  try { SL.data = await api("/control/api/sales/overview"); } catch (e) { return; }
  slCampaigns(); slSetupOpen(); slInsights(); slCities();
  if (!SL.scanning) slWa();
  loadSalesLeads(); loadSalesCalls();
  if (SL.open) slOpen(SL.open, true);
}

async function loadSalesCalls() {
  let r;
  try { r = await api("/control/api/sales/calls"); } catch (e) { return; }
  const box = $("sl-calls"), now = Date.now(), f = SL.data.funnel;
  $("sl-calls-n").textContent = "";
  /* Teen ginti, dabao to neeche wahi leads. Sab 0 to ek patli line, bada khaali dabba nahi. */
  const jump = (stage) => { SL.filter = stage; SL.shown = SL_PAGE; loadSalesLeads(); $("sl-leads-top").scrollIntoView({ behavior: "smooth", block: "start" }); };
  const counts = [["Calls", r.calls.length, null, "📞"], ["Hot", f.HOT || 0, "HOT", "🔥"], ["New replies", f.REPLIED || 0, "REPLIED", "💬"]];
  $("sl-today").replaceChildren(...counts.map(([label, n, stage, icon]) => {
    const b = el("button", `sl-today-c${n ? " on" : ""}`);
    b.type = "button";
    b.append(el("span", "sl-today-i", icon), el("b", null, String(n)), el("span", null, label));
    b.setAttribute("aria-label", `${label}: ${n}`);
    if (stage) b.addEventListener("click", () => jump(stage));
    else b.addEventListener("click", () => box.scrollIntoView({ behavior: "smooth", block: "center" }));
    return b;
  }));
  if (!r.calls.length) {
    box.replaceChildren(el("p", "muted sl-small", slSum(f, "HOT", "REPLIED") ? "No calls due. Open a reply above to answer it." : "Nothing needs you right now. Replies and hot leads show up here."));
    return;
  }
  box.replaceChildren(...r.calls.map((p) => {
    const row = el("div", "sl-call");
    const open = el("button", "sl-call-who"); open.type = "button";
    open.append(el("b", null, slWho(p)), el("small", null, p.summary || p.area || p.phone));
    open.addEventListener("click", () => slOpen(p.id));
    const due = p.next_call_at && new Date(p.next_call_at).getTime() <= now;
    const when = el("span", `sl-pill ${due ? "hot" : p.next_call_at ? "info" : "warn"}`, p.next_call_at ? (due ? "Due now" : fmtWhen(p.next_call_at)) : "Call soon");
    const call = el("a", "btn-primary btn-sm", "Call"); call.href = `tel:${p.phone}`;
    const end = el("span", "sl-call-end");
    if (p.chosen_plan) end.appendChild(el("span", "sl-plan", p.chosen_plan));
    end.append(when, call);
    row.append(open, end);
    return row;
  }));
}

const SL_INSIGHT_MIN = 5;
function slInsights() {
  const { demand, doubts } = SL.data, box = $("sl-insights");
  box.replaceChildren();
  const card = (title, rows) => {
    // Ek-do jawab par poori lambi patti galat tasveer deti hai
    if (rows.reduce((n, [, c]) => n + c, 0) < SL_INSIGHT_MIN) return;
    const c = el("div", "panel");
    c.appendChild(el("div", "panel-h")).appendChild(el("b", null, title));
    const top = rows[0][1];
    for (const [label, n] of rows) {
      const row = el("div", "sl-bar");
      const bar = document.createElement("progress"); bar.max = top; bar.value = n; bar.setAttribute("aria-label", `${label}: ${n}`);
      row.append(el("span", null, label), bar, el("b", null, String(n)));
      c.appendChild(row);
    }
    box.appendChild(c);
  };
  card("Plans shops picked", demand.map((d) => [d.plan, d.count]));
  card("What holds them back", doubts.map((d) => [SL_DOUBT[d.objection] || d.objection, d.count]));
}

function slCities() {
  const sel = $("sl-city"), cur = sel.value;
  sel.replaceChildren(new Option("All cities", ""), ...SL.data.cities.map((c) => new Option(c, c)));
  sel.value = SL.data.cities.includes(cur) ? cur : "";
  sel.hidden = SL.data.cities.length < 2;
}

const slFilters = (extra) => new URLSearchParams({ stage: SL.filter, q: SL.q, city: $("sl-city").value, ...extra });
/* CSV Excel mein khulti hai: =, +, -, @ se shuru naam (anjaan logon ka) formula na bane */
const slCell = (v) => (/^[=+\-@]/.test(String(v ?? "")) ? `'${v}` : v);

async function slExport() {
  try {
    const r = await api(`/control/api/sales/prospects?${slFilters({ limit: 5000 })}`);
    exportCsv("whatsapp-leads.csv", ["shop", "name", "phone", "area", "city", "stage", "plan", "score", "orders_per_day", "summary", "next_call"],
      r.prospects.map((p) => [p.name, p.contact_name, p.phone, p.area, p.city, p.stage, p.chosen_plan, p.score, p.facts.orders_per_day, p.summary, p.next_call_at].map(slCell)));
  } catch (e) { toast(e.message, "err"); }
}

/* QR sirf tab jab number sach mein juda nahi. WAHA dheema ho (error) ya number
   reconnect ho raha ho (STARTING), to "ruko" — QR dabaane se session restart
   hota aur chalta hua link toot sakta tha. */
const SL_WA_WAIT = new Set(["STARTING"]);
const slWaUnsure = (w) => Boolean(w.configured && !w.connected && (w.error || SL_WA_WAIT.has(w.state)));

async function slCheckWa() {
  try { SL.data.wa = await api("/control/api/sales/wa"); } catch (e) { return; }
  if (SL.scanning) return;
  slWa(); slCampaigns(); slSetupOpen();
}
/* Pakka na ho tab tak har 4s dekho (2 minute tak), phir 20s wala aam poll. */
function slWatchWa() {
  if (SL.waTimer) return;
  let n = 0;
  SL.waTimer = setInterval(async () => {
    if (++n > 30 || CURRENT_VIEW !== "sales") { clearInterval(SL.waTimer); SL.waTimer = null; return; }
    if (document.hidden) return;          // chhupi tab par poochhna bekaar
    await slCheckWa();
    if (!slWaUnsure(SL.data.wa)) { clearInterval(SL.waTimer); SL.waTimer = null; }
  }, 4000);
}

function slWa() {
  const w = SL.data.wa, box = $("sl-wa");
  box.replaceChildren();
  if (!w.configured) { box.appendChild(el("p", "muted", "WhatsApp is not set up on this server.")); return; }
  if (slWaUnsure(w)) {
    const wait = el("div", "sl-conn wait");
    wait.append(el("span", "sl-dot"), el("div", null));
    wait.lastChild.append(el("b", null, w.error ? "Checking connection…" : "Connecting…"),
      el("small", null, w.error ? "WhatsApp is slow to answer right now." : "WhatsApp is reconnecting this number. This can take a minute."));
    box.appendChild(wait);
    box.appendChild(el("p", "muted", "Your number is most likely still linked. Do not scan a new QR yet."));
    const again = el("button", "btn-ghost btn-wide", "Check again"); again.type = "button";
    again.addEventListener("click", async () => { again.disabled = true; await slCheckWa(); again.disabled = false; });
    box.appendChild(again);
    slWatchWa();
    return;
  }
  if (w.connected) {
    const on = el("div", "sl-conn");
    on.append(el("span", "sl-dot"), el("div", null));
    on.lastChild.append(el("b", null, "Connected"), el("small", null, w.number_masked || "Number linked"));
    box.appendChild(on);
    box.appendChild(el("p", "muted", "AI answers anyone who writes to this number. Keep it separate from your shop and product numbers."));
    // Alert wala number AI se baat nahi karta (sales_outreach.record_inbound): test wahan se karoge to chup lagega
    if (SL.data.defaults.alert_to) box.appendChild(el("p", "sl-note", `Your own alert number ${SL.data.defaults.alert_to} gets alerts, not AI replies. To test the AI, write from another phone.`));
    const b = el("button", "btn-ghost btn-wide", "Use another number");
    b.type = "button"; b.disabled = !can("danger");
    b.addEventListener("click", () => confirmDialog({
      title: "Remove this number?", body: "Campaigns stop sending until you scan a new number.",
      confirmLabel: "Remove number", danger: true,
      onConfirm: async () => { await act(() => api("/control/api/sales/wa/disconnect", { method: "POST" }), "Number removed"); loadSales(); },
    }));
    box.appendChild(b);
    return;
  }
  if (window.KKPasskey && KKPasskey.isPasskey(w.state)) { slPasskey(); return; }
  if (w.state === "FAILED") box.appendChild(el("p", "sl-warn", "The last link did not finish. Get a new QR or code."));
  box.appendChild(el("p", "muted", "Link any WhatsApp number. Scan the QR from that phone: WhatsApp, Linked devices, Link a device."));
  const scan = el("button", "btn-primary btn-wide", "Show QR code");
  scan.type = "button"; scan.disabled = !can("write");
  scan.addEventListener("click", () => slScan(""));
  box.appendChild(scan);
  const pair = el("form", "sl-pair");
  const inp = el("input"); inp.placeholder = "Or use a phone number"; inp.inputMode = "tel"; inp.setAttribute("aria-label", "Number for pairing code");
  const go = el("button", "btn-ghost", "Get code"); go.type = "submit"; go.disabled = !can("write");
  pair.append(inp, go);
  pair.addEventListener("submit", (e) => { e.preventDefault(); if (inp.value.trim()) slScan(inp.value.trim()); });
  box.appendChild(pair);
}

function slStopScan() { clearInterval(SL.scanTimer); SL.scanTimer = null; SL.scanning = false; }

/* QR / code ke baad WhatsApp ne passkey maanga (kk-passkey.js). scanning=true
   rakhte hain taaki 20s wala poll card dobara na banaye (chipkaya jawab mit jaata). */
function slPasskey() {
  slStopScan();
  const box = $("sl-wa");
  if (!box || !window.KKPasskey) return;
  SL.scanning = true;
  KKPasskey.mount(box, {
    api, base: "/control/api/sales/wa/passkey", lang: "en",
    onDone: () => { SL.scanning = false; toast("Number connected"); loadSales(); },
    onRestart: () => { SL.scanning = false; slCheckWa(); },
  });
}

async function slScan(phone) {
  const box = $("sl-wa");
  box.replaceChildren(el("p", "muted", "Starting WhatsApp, this can take a few seconds…"));
  let r;
  try { r = await api("/control/api/sales/wa/connect", { method: "POST", body: { phone } }); }
  catch (e) { toast(e.message, "err"); slCheckWa(); return; }
  if (r.connected) { toast("Number connected"); loadSales(); return; }
  if (r.passkey) { slPasskey(); return; }
  SL.scanning = true;
  box.replaceChildren();
  if (r.code) {
    box.append(el("p", "muted", "On that phone: WhatsApp, Linked devices, Link with phone number. Enter this code:"), el("div", "sl-code", r.code));
  } else {
    const img = el("img", "sl-qr"); img.alt = "WhatsApp QR code"; img.width = 220; img.height = 220; img.hidden = true;
    const wait = el("p", "muted", "Getting the QR code…");
    wait.setAttribute("role", "status");
    const again = el("button", "btn-primary btn-wide", "Get a new QR"); again.type = "button"; again.hidden = true;
    again.addEventListener("click", () => { slStopScan(); slScan(""); });
    // fetch, img.src nahi: tooti image se server ki wajah kabhi pata nahi chalti
    const load = async () => {
      let res;
      try { res = await fetch(`/control/api/sales/wa/qr?t=${Date.now()}`, { credentials: "same-origin" }); }
      catch (e) { wait.textContent = "No connection. Trying again…"; return false; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        img.hidden = true;
        wait.textContent = d.detail || "QR is not ready. Trying again…";
        if (res.status === 410) { again.hidden = false; slStopScan(); SL.scanning = true; }
        return false;
      }
      const blob = await res.blob();
      img.src = await new Promise((done) => { const f = new FileReader(); f.onload = () => done(f.result); f.readAsDataURL(blob); });
      img.hidden = false; again.hidden = true;
      wait.textContent = "Scan this from the phone you want to use.";
      return true;
    };
    box.append(img, wait, again);
    // QR nahi to har 3s, dikh gaya to 15s par naya (WhatsApp ka QR badalta rehta hai)
    // busy: WAHA dheema ho to 3s waale fetch ek ke upar ek na chadhein
    let shown = false, n = 0, busy = false;
    SL.qrLoad = async () => {
      if (busy || (shown && ++n % 5)) return;
      busy = true;
      try { shown = await load(); } finally { busy = false; }
    };
    SL.qrLoad();
  }
  const cancel = el("button", "btn-ghost btn-wide", "Cancel"); cancel.type = "button";
  cancel.addEventListener("click", () => { slStopScan(); slWa(); });
  box.appendChild(cancel);
  let tries = 0;
  SL.scanTimer = setInterval(async () => {
    if (document.hidden) return;          // chhupi tab par QR/poll nahi
    if (r.code === "" && SL.qrLoad) SL.qrLoad();
    if (++tries > 100) { slStopScan(); slWa(); return; }
    try {
      const w = await api("/control/api/sales/wa");
      if (w.connected) { slStopScan(); toast("Number connected"); loadSales(); }
      else if (window.KKPasskey && KKPasskey.isPasskey(w.state)) { SL.data.wa = w; slPasskey(); }
    } catch (e) { /* agli baar */ }
  }, 3000);
}

function slPicker() {
  const sel = $("sl-pick"), cs = SL.data.campaigns;
  sel.replaceChildren(new Option("New campaign", ""), ...cs.map((c) => new Option(c.name, c.id)));
  if (SL.cur && !cs.some((c) => c.id === SL.cur)) SL.cur = null;
  if (!SL.init2) { SL.init2 = true; SL.cur = cs[0] ? cs[0].id : null; slFill(); }
  sel.value = SL.cur || "";
}

function slFill() {
  const d = SL.data.defaults, c = SL.data.campaigns.find((x) => x.id === SL.cur);
  $("sl-name").value = c ? c.name : "";
  $("sl-text").value = c ? c.template : d.template;
  $("sl-text-b").value = c ? c.template_b : "";
  $("sl-b-box").hidden = !$("sl-text-b").value;
  const lim = $("sl-limit");
  lim.max = d.daily_max; lim.value = c ? c.daily_limit : d.daily_limit;
  const gap = $("sl-interval");
  gap.min = d.interval_min; gap.max = d.interval_max; gap.value = c ? c.interval_minutes : d.interval;
  $("sl-import").replaceChildren();
  slVars(c); slPhoto(c); slPaintLimit(); slPreview();
}

/* Chip dabao: jahan cursor hai wahan variable. Sheet ke apne column bhi yahin. */
const SL_VAR = { name: "Name", shop: "Shop name", city: "City", area: "Area", menu: "Plans list" };
function slVars(c) {
  const box = $("sl-vars"), mine = (c && c.variables) || [];
  box.replaceChildren(el("span", "sl-lbl", "Add:"), ...SL.data.defaults.variables.concat(mine).map((v) => {
    const b = el("button", "sl-var", SL_VAR[v] || v); b.type = "button";
    b.addEventListener("click", () => slInsert(`{{${v}}}`));
    return b;
  }));
  $("sl-vars-hint").textContent = "Name is the person. If a lead has none, the shop name goes in its place.";
}
function slInsert(tag) {
  const t = SL.focus && !SL.focus.closest("[hidden]") ? SL.focus : $("sl-text");
  const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? a;
  t.value = t.value.slice(0, a) + tag + t.value.slice(b);
  t.focus();
  t.selectionStart = t.selectionEnd = a + tag.length;
  slPreview();
}

function slPhoto(c) {
  const img = $("sl-bubble-img"), on = !!(c && c.has_image);
  $("sl-image-add").textContent = on ? "Change photo" : "Add photo";
  $("sl-image-x").hidden = !on;
  img.hidden = !on;
  if (on) img.src = `/control/api/sales/campaigns/${c.id}/image?t=${Date.now()}`; else img.removeAttribute("src");
}
async function slImage(file) {
  $("sl-image").value = "";
  if (!file) return;
  const id = await slSave(true);
  if (!id) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const r = await fetch(`/control/api/sales/campaigns/${id}/image`, { method: "POST", credentials: "same-origin", body: form });
    if (r.status === 401) { showSignin(); return; }
    const out = await r.json();
    if (!r.ok) throw new Error(out.detail || `HTTP ${r.status}`);
    toast("Photo added");
    SL.data = await api("/control/api/sales/overview");
    slPhoto(SL.data.campaigns.find((x) => x.id === id));
  } catch (e) { toast(e.message, "err"); }
}
async function slImageRemove() {
  if (!SL.cur) return;
  await act(() => api(`/control/api/sales/campaigns/${SL.cur}/image`, { method: "DELETE" }), "Photo removed");
  SL.data = await api("/control/api/sales/overview");
  slPhoto(SL.data.campaigns.find((x) => x.id === SL.cur));
}
async function slAddLead(e) {
  e.preventDefault();
  const body = { contact_name: $("sl-add-name").value.trim(), shop: $("sl-add-shop").value.trim(),
    phone: $("sl-add-phone").value.trim(), city: $("sl-add-city").value.trim(), area: $("sl-add-area").value.trim(),
    note: $("sl-add-note").value.trim() };
  if (!body.phone) { toast("Enter the WhatsApp number", "err"); $("sl-add-phone").focus(); return; }
  if (!body.contact_name && !body.shop) { toast("Enter a name or a shop name", "err"); $("sl-add-name").focus(); return; }
  const id = await slSave(true);
  if (!id) return;
  try {
    await api(`/control/api/sales/campaigns/${id}/leads`, { method: "POST", body });
    toast("Lead added");
    for (const k of ["name", "shop", "phone", "note"]) $(`sl-add-${k}`).value = "";
    $("sl-add-name").focus();
    SL.data = await api("/control/api/sales/overview");
    slCampaigns(); loadSalesCalls(); loadSalesLeads();
  } catch (err) { toast(err.message, "err"); }
}

function slPaintLimit() {
  const v = Number($("sl-limit").value);
  $("sl-limit-v").textContent = v;
  const [a, b] = SL.data.defaults.send_hours;
  const gap = Math.max(1, Number($("sl-interval").value) || 1), openMins = (b - a) * 60;
  const fits = Math.min(v, Math.ceil(openMins / gap)), mins = (fits - 1) * gap;
  const span = mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
  $("sl-limit-hint").textContent = `${v > 20 ? "A new number is safer at 20 or less. " : ""}`
    + `One message every ${gap} min between ${a}:00 and ${b}:00. `
    + (fits < v ? `Only ${fits} of ${v} fit in a day at this gap.` : `${v} messages take about ${span}.`);
}

function slPreview() {
  const sample = { name: "Ramesh", owner: "Ramesh", shop: "Sharma Dry Cleaners", city: "Varanasi", area: "Lanka",
    menu: SL.data.defaults.menu };
  const show = (text) => (text.trim() + (/\bstop\b/i.test(text) ? "" : `\n\n${SL.data.defaults.stop_line}`))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => sample[k.toLowerCase()] ?? `[${k}]`);
  $("sl-bubble").textContent = show($("sl-text").value);
  const b = $("sl-text-b").value.trim();
  $("sl-bubble-b").hidden = !b;
  $("sl-bubble-b").textContent = b ? show(b) : "";
}

async function slSave(quiet) {
  const body = { name: $("sl-name").value.trim(), template: $("sl-text").value.trim(),
    template_b: $("sl-text-b").value.trim(), daily_limit: Number($("sl-limit").value),
    interval_minutes: Number($("sl-interval").value) };
  if (!body.name) { toast("Give the campaign a name", "err"); $("sl-name").focus(); return null; }
  try {
    const out = await api(SL.cur ? `/control/api/sales/campaigns/${SL.cur}` : "/control/api/sales/campaigns",
      { method: SL.cur ? "PUT" : "POST", body });
    SL.cur = out.id;
    if (!quiet) toast("Saved");
    SL.data = await api("/control/api/sales/overview");
    slPicker(); slCampaigns();
    return out.id;
  } catch (e) { toast(e.message, "err"); return null; }
}

async function slUpload(file) {
  if (!file) return;
  const id = await slSave(true);
  if (!id) return;
  const form = new FormData();
  form.append("file", file);
  const box = $("sl-import");
  box.replaceChildren(el("p", "muted", "Reading the sheet…"));
  try {
    const r = await fetch(`/control/api/sales/campaigns/${id}/import`, { method: "POST", credentials: "same-origin", body: form });
    if (r.status === 401) { showSignin(); return; }
    const out = await r.json();
    if (!r.ok) throw new Error(out.detail || `HTTP ${r.status}`);
    const row = el("div", "sl-result");
    for (const [v, l, c] of [[out.ready, "ready to send", "ok"], [out.skipped, "skipped", ""], [out.duplicate, "duplicates removed", ""], [out.already, "already in your list", ""],
      [out.clients, "your own or client numbers", ""], [out.no_number, "without a number", ""], [out.details, "got missing details (address, rating, Maps)", ""]]) {
      if (!v && c !== "ok") continue;
      const s = el("span", c); s.append(el("b", null, String(v)), document.createTextNode(` ${l}`));
      row.appendChild(s);
    }
    box.replaceChildren(row);
    toast(`${out.ready} shops ready`);
    SL.data = await api("/control/api/sales/overview");
    slCampaigns(); loadSalesCalls(); loadSalesLeads();
  } catch (e) { box.replaceChildren(); toast(e.message, "err"); }
  $("sl-file").value = "";
}

/* Campaign abhi kya kar raha hai — server ka "outlook" (sales_outreach.outlook)
   se, taaki "Running" likha ho aur kuch na jaaye to wajah saamne dikhe. */
// Bhejne ke ghante IST mein tay hain: dikhao bhi IST mein, browser kahin bhi ho
const SL_TZ = "Asia/Kolkata";
const slClock = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: SL_TZ }).toUpperCase();
const slDate = (d) => d.toLocaleDateString("en-CA", { timeZone: SL_TZ });          // YYYY-MM-DD, IST ka din
const slDay = (iso) => {
  const d = new Date(iso), today = new Date();
  if (slDate(d) === slDate(today)) return "today";
  if (slDate(d) === slDate(new Date(today.getTime() + 864e5))) return "tomorrow";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: SL_TZ });
};
const slHour = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
function slNow(c) {
  const o = c.outlook;
  if (c.status === "DRAFT") return ["", "Not started yet. Press Start when the message and sheet are ready."];
  if (c.status === "PAUSED") return ["warn", c.note ? "Paused by itself. See the note below." : "Paused. Press Resume to carry on."];
  if (c.status === "DONE") return ["", ""];             // pill hi kaafi: khatam card chhota rahe
  if (!o) return ["", ""];
  const at = o.at ? `${slDay(o.at) === "today" ? "" : `${slDay(o.at)} `}at ${slClock(o.at)}` : "";
  const [a, b] = SL.data.defaults.send_hours;
  switch (o.state) {
    case "no_number":
      if (slWaUnsure(SL.data.wa)) return ["wait", "Checking the WhatsApp connection… Sending carries on once it is back."];
      return ["bad", "Not sending: the campaign number is not connected. Open Setup and link it."];
    case "held": return ["bad", `WhatsApp gave a warning. New messages wait until ${at.replace(/^at /, "")}.`];
    case "behind": return ["warn", "Waiting: another campaign is sending first. One sends at a time."];
    case "empty": return ["ok", "All queued shops are done. It closes by itself."];
    case "hours": return ["wait", `First message ${at}. Messages go only ${slHour(a)} to ${slHour(b)}, when shops are open.`];
    case "limit": return ["wait", `Today's ${c.daily_limit} are done. Next message ${at}.`];
    case "gap": return ["ok", `Sending. Next message ${at}.`];
    default: return ["ok", "Sending. Next message within a minute."];
  }
}

function slCampaigns() {
  const box = $("sl-campaigns"), cs = SL.data.campaigns;
  if (!cs.length) {
    const empty = el("div", "sl-camp sl-camp-empty");
    empty.append(el("b", null, "No campaign yet"), el("p", "muted", "Link a number, write the first message and upload a sheet of shops."));
    const go = el("button", "btn-primary btn-sm", "Set up a campaign"); go.type = "button";
    go.addEventListener("click", () => { $("sl-setup").open = true; $("sl-name").focus(); });
    empty.appendChild(go);
    box.replaceChildren(empty);
    return;
  }
  // Chalta hua sabse upar, phir draft/ruka, khatam neeche
  const rank = { RUNNING: 0, PAUSED: 1, DRAFT: 2, DONE: 3 };
  const sorted = [...cs].sort((x, y) => (rank[x.status] ?? 4) - (rank[y.status] ?? 4));
  box.replaceChildren(...sorted.map((c) => {
    const n = c.counts, ready = n.NEW || 0, base = c.total - (n.SKIPPED || 0);
    const sent = slSum(n, "SENT", "REPLIED", "HOT", "WON", "NOT_INTERESTED", "STOPPED");
    const replied = slSum(n, "REPLIED", "HOT", "WON", "NOT_INTERESTED");
    const [tone, line] = slNow(c);
    const card = el("article", `sl-camp${c.status === "DONE" ? " done" : ""}`);

    const head = el("div", "sl-camp-h");
    const title = el("div", "sl-camp-t");
    title.append(el("b", null, c.name), slPill(SL_CAMP, c.status));
    const row = el("div", "sl-camp-act");
    const btn = (label, cls, fn) => { const b = el("button", cls, label); b.type = "button"; b.disabled = !can("write"); b.addEventListener("click", fn); row.appendChild(b); };
    const remote = CampaignShared.adapters.control(api);
    if (c.status === "RUNNING") {
      btn("Pause", "btn-ghost btn-sm", async () => { await act(() => remote.pause(c.id), "Paused"); slRefresh(); });
    } else if (ready) {
      btn(c.status === "DRAFT" ? "Start" : "Resume", "btn-primary btn-sm", () => confirmDialog({
        title: `Start "${c.name}"?`,
        body: `${ready} shops are queued. Up to ${c.daily_limit} get this message each day, and AI answers whoever replies. Anyone who did not reply is never messaged again.`,
        confirmLabel: "Start sending",
        onConfirm: async () => { await act(() => remote.resume(c.id), "Campaign started"); slRefresh(); },
      }));
    }
    btn("Edit", "btn-ghost btn-sm", () => {
      SL.cur = c.id; $("sl-pick").value = c.id; slFill();
      $("sl-setup").open = true;
      $("sl-name").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    head.append(title, row);
    card.appendChild(head);
    if (line) card.appendChild(el("p", `sl-camp-now ${tone}`, line));

    if (c.status !== "DONE") {
      const bar = document.createElement("progress");
      bar.max = base || 1; bar.value = base - ready; bar.setAttribute("aria-label", `${base - ready} of ${base} sent`);
      card.appendChild(bar);
    }

    // Ek hi line mein raasta: line mein -> gaye -> jawab -> hot -> grahak
    const steps = el("ol", "sl-steps");
    for (const [label, v, cls] of [["Waiting", ready, ""], ["Sent", sent, ""], ["Replied", replied, ""], ["Hot", n.HOT || 0, "hot"], ["Won", n.WON || 0, "won"]]) {
      const li = el("li", v ? cls : "");
      li.append(el("b", null, String(v)), el("span", null, label));
      steps.appendChild(li);
    }
    card.appendChild(steps);

    const meta = [];
    if (c.status === "RUNNING") meta.push(`Today ${SL.data.sent_today}/${c.daily_limit}`);
    if (c.outlook && c.outlook.finish && ready) meta.push(`done by about ${new Date(c.outlook.finish + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: SL_TZ })}`);
    if (sent >= 10) meta.push(`${Math.round(replied / sent * 100)}% replied`);
    const failed = slSum(n, "FAILED", "NO_WHATSAPP");
    if (n.SKIPPED) meta.push(`${n.SKIPPED} skipped`);
    if (n.STOPPED) meta.push(`${n.STOPPED} said STOP`);
    if (failed) meta.push(`${failed} not sent`);
    if (meta.length) card.appendChild(el("p", "muted sl-camp-meta", meta.join(" · ")));
    if (c.template_b) {
      const rate = (v) => { const x = c.ab[v] || { sent: 0, replied: 0 }; return `${v}: ${x.replied}/${x.sent}${x.sent ? ` (${Math.round(x.replied / x.sent * 100)}%)` : ""}`; };
      card.appendChild(el("p", "muted sl-camp-meta", `Replies ${rate("A")} · ${rate("B")}`));
    }
    if (c.note) card.appendChild(el("p", "sl-warn", c.note));
    return card;
  }));
}

/* Setup ek baar ka kaam: number na ho ya campaign hi na ho to khula, warna band.
   Pehli baar hi tay hota hai; uske baad jaisa aapne chhoda waisa rahe. */
function slSetupOpen() {
  const box = $("sl-setup"), w = SL.data.wa, cs = SL.data.campaigns;
  $("sl-setup-sub").textContent = [w.connected ? `Number ${w.number_masked || "linked"}` : slWaUnsure(w) ? "Connecting…" : "Number not linked",
    `${cs.length} campaign${cs.length === 1 ? "" : "s"}`].join(" · ");
  if (SL.setupSet) return;
  SL.setupSet = true;
  box.open = !cs.length || !w.connected;
}

async function loadSalesLeads() {
  const chips = [["", "All"], ["HOT", "Hot"], ["REPLIED", "Replied"], ["WON", "Won"], ["SENT", "Sent"], ["NEW", "Queued"],
    ["NOT_INTERESTED", "Not interested"], ["SKIPPED", "Skipped"], ["STOPPED", "STOP"], ["NO_WHATSAPP", "No WhatsApp"], ["FAILED", "Failed"]];
  const f = SL.data.funnel;
  $("sl-chips").replaceChildren(...chips.map(([k, l]) => {
    const b = el("button", `sl-chip${SL.filter === k ? " on" : ""}`, k ? `${l} ${f[k] || 0}` : l);
    b.type = "button"; b.setAttribute("aria-pressed", String(SL.filter === k));
    b.addEventListener("click", () => { SL.filter = k; SL.shown = SL_PAGE; loadSalesLeads(); });
    return b;
  }));
  /* 20 second wala refresh bhi utni hi lead laata hai jitni khuli hain — "aur dikhao" wapas na simte */
  const qs = slFilters({ limit: SL.shown });
  let r;
  try { r = await api(`/control/api/sales/prospects?${qs}`); } catch (e) { toast(e.message, "err"); return; }
  const box = $("sl-leads"), more = $("sl-leads-more");
  more.replaceChildren();
  if (!r.prospects.length) { box.replaceChildren(el("p", "muted sl-empty", "Nothing here yet.")); return; }
  box.replaceChildren(...r.prospects.map(slLeadRow));
  more.appendChild(el("span", "muted", `Showing ${r.prospects.length} of ${r.total}`));
  if (r.total > r.prospects.length) {
    const b = el("button", "btn-ghost btn-sm", `Show ${Math.min(SL_PAGE, r.total - r.prospects.length)} more`);
    b.type = "button";
    b.addEventListener("click", () => { SL.shown += SL_PAGE; loadSalesLeads(); });
    more.appendChild(b);
  }
}

function slLeadRow(p) {
  const row = el("div", "sl-lead");
  const open = el("button", "sl-lead-open"); open.type = "button";
  const who = el("span", "sl-lead-who");
  const city = (p.city || "").toLowerCase() !== (p.area || "").toLowerCase() ? p.city : "";   // "Ballia · Ballia" nahi
  who.append(el("b", null, slWho(p)), el("small", null, [p.name && p.contact_name, p.area, city, p.phone].filter(Boolean).join(" · ")));
  const why = el("span", "sl-lead-why", p.summary || p.detail || (p.reviews ? `${p.reviews} reviews${p.rating ? `, ${p.rating}★` : ""}` : p.address || ""));
  open.append(who, why);
  open.addEventListener("click", () => slOpen(p.id));
  const end = el("span", "sl-lead-end");
  if (p.chosen_plan) end.appendChild(el("span", "sl-plan", p.chosen_plan));
  else if (p.score) end.appendChild(el("span", "sl-score", String(p.score)));
  end.append(slPill(SL_STAGE, p.stage), slReach(p, true));
  row.append(open, end);
  return row;
}

/* Lead se seedha baat: call, apne phone ka WhatsApp, number copy. STOP ya bina
   WhatsApp wale ko WhatsApp ka button nahi. */
function slReach(p, compact) {
  const box = el("span", "sl-reach"), name = slWho(p);
  const link = (icon, label, href) => {
    const a = el("a", "btn-ghost btn-sm", compact ? icon : `${icon} ${label}`);
    a.href = href; a.title = `${label} ${name}`; a.setAttribute("aria-label", `${label} ${name}`);
    a.addEventListener("click", (e) => e.stopPropagation());
    box.appendChild(a);
    return a;
  };
  link("📞", "Call", `tel:${p.phone}`);
  if (!["STOPPED", "NO_WHATSAPP"].includes(p.stage)) {
    const wa = link("💬", "WhatsApp", `https://wa.me/${String(p.phone).replace(/\D/g, "")}`);
    wa.target = "_blank"; wa.rel = "noopener noreferrer";
  }
  const copy = el("button", "btn-ghost btn-sm", compact ? "📋" : "📋 Copy number");
  copy.type = "button"; copy.title = `Copy ${p.phone}`; copy.setAttribute("aria-label", `Copy number of ${name}`);
  copy.addEventListener("click", async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(p.phone); toast("Number copied"); }
    catch (err) { toast(p.phone); }
  });
  box.appendChild(copy);
  return box;
}

/* Lead ka naam, dukaan, shehar, ilaaka. Number nahi badalta: STOP usi par tika hai. */
function slEditLead(p) {
  const box = el("details", "sl-edit");
  box.appendChild(el("summary", null, "Edit name, shop, city"));
  const form = el("form", "sl-add-grid");
  const input = (label, value, max) => {
    const l = el("label", null, label), i = el("input");
    i.maxLength = max; i.value = value || ""; i.autocomplete = "off"; l.appendChild(i); form.appendChild(l); return i;
  };
  const name = input("Name", p.contact_name, 120), shop = input("Shop name", p.name, 160);
  const city = input("City", p.city, 80), area = input("Area", p.area, 120);
  const save = el("button", "btn-primary btn-sm", "Save"); save.type = "submit";
  form.appendChild(save);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await act(() => api(`/control/api/sales/prospects/${p.id}`, { method: "PUT",
      body: { contact_name: name.value, shop: shop.value, city: city.value, area: area.value } }), "Lead saved");
    slOpen(p.id, true); loadSalesLeads();
  });
  box.appendChild(form);
  return box;
}

async function slOpen(id, quiet) {
  let p;
  try { p = await api(`/control/api/sales/prospects/${id}`); } catch (e) { toast(e.message, "err"); return; }
  SL.open = id;
  $("sl-d-name").textContent = slWho(p);
  $("sl-d-sub").textContent = [p.name && p.contact_name, p.area, p.city, p.phone].filter(Boolean).join(" · ");
  const info = $("sl-d-info");
  info.replaceChildren();
  const top = el("div", "row");
  top.appendChild(slPill(SL_STAGE, p.stage));
  if (p.chosen_plan) top.appendChild(el("span", "sl-plan", p.chosen_plan));
  if (p.score) top.appendChild(el("span", "sl-score", `Score ${p.score}`));
  if (p.ai_paused) top.appendChild(el("span", "sl-pill warn", "AI off"));
  info.appendChild(top);
  if (p.summary) info.appendChild(el("p", "sl-summary", p.summary));
  if (p.detail) info.appendChild(el("p", "muted", p.detail));
  if (p.stage === "NEW") info.appendChild(el("p", "muted", "Queued: the campaign sends the first message. After a call, mark Interested or Not interested and it is not sent."));
  const shopFacts = [p.rating ? `${p.rating}★` : "", p.reviews ? `${p.reviews} reviews` : "", p.biz_type && p.biz_type !== "laundry" ? p.biz_type : "",
    p.created_at ? `Added ${fmtWhen(p.created_at)}` : ""].filter(Boolean);
  if (p.address || shopFacts.length) {
    const d = el("div", "sl-d-shop");
    if (p.address) d.appendChild(el("p", null, p.address));
    if (shopFacts.length) d.appendChild(el("small", "muted", shopFacts.join(" · ")));
    info.appendChild(d);
  }
  const f = p.facts || {}, chips = [];
  if (f.orders_per_day) chips.push(`${f.orders_per_day} orders a day`);
  if (f.staff != null) chips.push(f.staff ? `${f.staff} staff` : "No staff");
  if (f.current_method) chips.push(f.current_method);
  if (f.objection) chips.push(`Doubt: ${SL_DOUBT[f.objection] || f.objection}`);
  if (f.fit_plan) chips.push(`Fits ${f.fit_plan}`);
  if (chips.length) { const row = el("div", "row"); chips.forEach((c) => row.appendChild(el("span", "chip", c))); info.appendChild(row); }
  info.appendChild(slEditLead(p));
  const links = el("div", "row");
  links.append(...slReach(p, false).children);
  if (/^https:\/\//.test(p.maps || "")) {
    const m = el("a", "btn-ghost btn-sm", "Maps"); m.href = p.maps; m.target = "_blank"; m.rel = "noopener noreferrer";
    links.appendChild(m);
  }
  const post = (path, body, ok) => async () => {
    await act(() => api(`/control/api/sales/prospects/${id}/${path}`, { method: "POST", body }), ok);
    slOpen(id, true); slRefresh();
  };
  const btn = (label, fn) => { const b = el("button", "btn-ghost btn-sm", label); b.type = "button"; b.disabled = !can("write"); b.addEventListener("click", fn); links.appendChild(b); };
  if (p.stage !== "STOPPED") btn(p.ai_paused ? "Turn AI on" : "Turn AI off", post("ai", { on: p.ai_paused }, p.ai_paused ? "AI on" : "AI off"));
  if (p.stage === "SKIPPED") btn("Add to queue", post("stage", { stage: "NEW" }, "Added to queue"));
  // Call par hi faisla ho gaya: line wali (NEW) dukaan ko bhi — tab pehla message nahi jaata
  if (!["WON", "STOPPED"].includes(p.stage)) {
    if (p.stage !== "HOT") btn("Interested", post("stage", { stage: "HOT" }, "Marked interested"));
    btn("Mark won", post("stage", { stage: "WON" }, "Marked won"));
    if (p.stage !== "NOT_INTERESTED") btn("Not interested", post("stage", { stage: "NOT_INTERESTED" }, "Updated"));
  }
  info.appendChild(links);
  if (!["WON", "STOPPED", "NOT_INTERESTED"].includes(p.stage)) info.appendChild(slCallBox(p));
  const chat = $("sl-d-chat");
  const LABEL = { template: "First message", ai: "AI", human: "You", system: "Auto", welcome: "Welcome" };
  chat.replaceChildren(...(p.messages.length ? p.messages.map((m) => {
    const b = el("div", `sl-msg ${m.direction}`);
    b.appendChild(el("p", null, m.text.replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|\s)_([^_\n]+)_/g, "$1$2")));   // WhatsApp ka *bold*
    b.appendChild(el("small", null, [m.direction === "out" ? LABEL[m.sender] : "", fmtWhen(m.at), m.status === "read" ? "read" : ""].filter(Boolean).join(" · ")));
    return b;
  }) : [el("p", "muted sl-empty", "No messages yet.")]));
  $("sl-d-form").hidden = p.stage === "STOPPED" || !can("write");
  $("sl-drawer").hidden = false; $("sl-d-ov").hidden = false;
  chat.scrollTop = chat.scrollHeight;     // chhupe hue par scroll nahi lagta
  if (!quiet) $("sl-d-close").focus();
}
function slCallBox(p) {
  const box = el("div", "sl-callbox");
  const log = async (outcome, next_call_at) => {
    await act(() => api(`/control/api/sales/prospects/${p.id}/call`, { method: "POST", body: { outcome, next_call_at, note: note.value } }), "Call saved");
    slOpen(p.id, true); slRefresh();
  };
  const note = el("input"); note.placeholder = "Call note"; note.maxLength = 300; note.value = p.call_note || ""; note.setAttribute("aria-label", "Call note");
  const row = el("div", "row");
  const btn = (label, fn) => { const b = el("button", "btn-ghost btn-sm", label); b.type = "button"; b.disabled = !can("write"); b.addEventListener("click", fn); row.appendChild(b); };
  btn("Called", () => log("called"));
  btn("No answer", () => log("no_answer"));
  const when = el("input"); when.type = "datetime-local"; when.setAttribute("aria-label", "Next call time");
  btn("Call later", () => {
    if (!when.value) { when.focus(); toast("Pick a time", "err"); return; }
    log("later", new Date(when.value).toISOString());
  });
  row.appendChild(when);
  const facts = [];
  if (p.next_call_at) facts.push(`Next call ${fmtWhen(p.next_call_at)}`);
  if (p.call_count) facts.push(`Called ${p.call_count} time${p.call_count > 1 ? "s" : ""}`);
  if (facts.length) box.appendChild(el("p", "muted", facts.join(" · ")));
  box.append(note, row);
  return box;
}
function slClose() { SL.open = null; $("sl-drawer").hidden = true; $("sl-d-ov").hidden = true; }

function slInit() {
  if (SL.init) return;
  SL.init = true;
  $("sl-text").addEventListener("input", slPreview);
  $("sl-text-b").addEventListener("input", slPreview);
  for (const id of ["sl-text", "sl-text-b"]) $(id).addEventListener("focus", (e) => { SL.focus = e.target; });
  $("sl-interval").addEventListener("input", slPaintLimit);
  $("sl-image").addEventListener("change", (e) => slImage(e.target.files[0]));
  $("sl-image-x").addEventListener("click", slImageRemove);
  $("sl-add-form").addEventListener("submit", slAddLead);
  $("sl-b-toggle").addEventListener("click", () => { $("sl-b-box").hidden = false; $("sl-text-b").focus(); });
  $("sl-city").addEventListener("change", () => { SL.shown = SL_PAGE; loadSalesLeads(); });
  $("sl-export").addEventListener("click", slExport);
  $("sl-d-suggest").addEventListener("click", async (e) => {
    const b = e.currentTarget, id = SL.open;
    b.disabled = true;
    try { $("sl-d-text").value = (await api(`/control/api/sales/prospects/${id}/suggest`, { method: "POST" })).reply; }
    catch (err) { toast(err.message, "err"); }
    b.disabled = false;
  });
  $("sl-limit").addEventListener("input", slPaintLimit);
  $("sl-pick").addEventListener("change", (e) => { SL.cur = e.target.value || null; slFill(); });
  $("sl-save").addEventListener("click", () => slSave(false));
  $("sl-test").addEventListener("click", async () => {
    const id = await slSave(true);
    if (!id) return;
    const to = SL.data.defaults.alert_to;
    await act(() => api(`/control/api/sales/campaigns/${id}/test`, { method: "POST", body: { phone: to } }), `Test sent to ${to}`);
  });
  $("sl-ai").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { $("sl-text").value = (await api("/control/api/sales/ai-draft", { method: "POST", body: {} })).template; slPreview(); }
    catch (err) { toast(err.message, "err"); }
    b.disabled = false;
  });
  $("sl-file").addEventListener("change", (e) => slUpload(e.target.files[0]));
  const drop = $("sl-drop");
  for (const ev of ["dragover", "dragenter"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("on"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("on"); });
  drop.addEventListener("drop", (e) => slUpload(e.dataTransfer.files[0]));
  let debounce;
  $("sl-q").addEventListener("input", (e) => { clearTimeout(debounce); debounce = setTimeout(() => { SL.q = e.target.value; SL.shown = SL_PAGE; loadSalesLeads(); }, 250); });
  $("sl-d-close").addEventListener("click", slClose);
  $("sl-d-ov").addEventListener("click", slClose);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && SL.open) slClose(); });
  $("sl-d-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("sl-d-text").value.trim(), id = SL.open;
    if (!text || !id) return;
    await act(() => api(`/control/api/sales/prospects/${id}/reply`, { method: "POST", body: { text } }), "Sent. AI is off for this lead");
    $("sl-d-text").value = "";
    slOpen(id, true);
  });
}

/* ---------- server health ----------------------------------------------
   /control/api/system/health — har 5 second (Server health page khula ho
   aur tab saamne ho), dashboard par har 30 second. CPU ki pichhli 60
   readings ki chhoti line browser mein hi bachti hai, server par nahi. */
let HEALTH = null, HEALTH_LIVE = true, HEALTH_TIMER = null, HEALTH_TICK = 0, HEALTH_BUSY = false;
const CPU_HIST = [];
const LVL_WORD = { ok: "Healthy", warn: "Watch", bad: "Problem", unknown: "Unavailable" };
const fmtBytes = (n) => {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
};
const fmtDur = (s) => {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
const pctLvl = (pct, warn, bad) => (pct == null ? "unknown" : pct >= bad ? "bad" : pct >= warn ? "warn" : "ok");
const pill = (lvl) => el("span", `pill ${lvl || "unknown"}`, LVL_WORD[lvl] || LVL_WORD.unknown);

function startHealthPoll() {
  stopHealthPoll();
  HEALTH_TIMER = setInterval(() => {
    if (document.hidden) return;
    HEALTH_TICK += 1;
    if (CURRENT_VIEW === "health" && HEALTH_LIVE) loadHealth();
    else if (HEALTH_TICK % 6 === 0) loadHealth();          // baaki pages: har 30 s (sidebar ka dot)
  }, 5000);
}
function stopHealthPoll() { if (HEALTH_TIMER) clearInterval(HEALTH_TIMER); HEALTH_TIMER = null; }

async function loadHealth() {
  if (HEALTH_BUSY) return;
  HEALTH_BUSY = true;
  try {
    HEALTH = await api("/control/api/system/health");
    if (HEALTH.cpu && HEALTH.cpu.pct != null) {
      CPU_HIST.push(HEALTH.cpu.pct);
      if (CPU_HIST.length > 60) CPU_HIST.shift();
    }
    paintSideHealth();
    if (CURRENT_VIEW === "health") paintHealth();
    if (CURRENT_VIEW === "dashboard") { paintMiniHealth(); paintAttention(); }
  } catch (e) {
    $("sys-line").textContent = "Server check failed";
    $("sys-dot").className = "dot bad";
    if (CURRENT_VIEW === "health") {
      $("health-banner").className = "banner bad";
      $("health-banner").textContent = `Could not read server health: ${e.message}`;
    }
  } finally { HEALTH_BUSY = false; }
}

function paintSideHealth() {
  const h = HEALTH;
  $("sys-dot").className = `dot ${h.overall}`;
  const cpu = h.cpu.pct != null ? `CPU ${Math.round(h.cpu.pct)}%` : "CPU —";
  const db = h.database.up ? `DB ${Math.round(h.database.ping_ms)} ms` : "DB down";
  $("sys-line").textContent = `${LVL_WORD[h.overall] || "—"} · ${cpu} · ${db}`;
  const dot = $("nav-health");
  dot.hidden = h.overall === "ok" || h.overall === "unknown";
  dot.className = `nav-dot${h.overall === "bad" ? " bad" : ""}`;
}

function sparkline(values) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "spark");
  svg.setAttribute("viewBox", "0 0 100 40");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", values.length ? `CPU over the last ${values.length * 5} seconds, now ${values[values.length - 1]}%` : "CPU history");
  for (const y of [10, 20, 30]) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", "0"); ln.setAttribute("x2", "100"); ln.setAttribute("y1", String(y)); ln.setAttribute("y2", String(y));
    svg.appendChild(ln);
  }
  if (values.length < 2) return svg;
  const step = 100 / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(40 - (Math.max(0, Math.min(100, v)) * 0.38) - 1).toFixed(2)}`);
  const area = document.createElementNS(NS, "polygon");
  area.setAttribute("points", `0,40 ${pts.join(" ")} 100,40`);
  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("points", pts.join(" "));
  svg.append(area, line);
  return svg;
}

function hcard(icon, title, lvl, value, unit) {
  const c = el("div", `hcard ${lvl === "warn" || lvl === "bad" ? lvl : ""}`);
  const h = el("div", "hcard-h");
  h.append(el("span", "em", icon), el("b", null, title), pill(lvl));
  c.appendChild(h);
  if (value != null) {
    const v = el("div", "hval", value);
    if (unit) v.appendChild(el("small", null, unit));
    c.appendChild(v);
  }
  return c;
}
function meter(parent, pct, warn, bad) {
  const b = el("div", "bar" + (pct >= bad ? " bad" : pct >= warn ? " warn" : ""));
  const i = el("i");
  i.style.setProperty("--pct", Math.max(0, Math.min(100, pct || 0)) + "%");   // CSSOM, CSP-safe
  b.appendChild(i);
  parent.appendChild(b);
}
function kv(parent, k, v) {
  const r = el("div", "kv");
  r.append(el("span", null, k), el("span", null, v == null || v === "" ? "—" : String(v)));
  parent.appendChild(r);
}

function paintHealth() {
  const h = HEALTH, T = h.thresholds;
  const banner = $("health-banner");
  banner.className = `banner ${h.overall}`;
  const bad = [];
  if (h.cpu.status !== "ok" && h.cpu.status !== "unknown") bad.push("CPU / load");
  if (h.memory && h.memory.status !== "ok") bad.push("memory");
  if (h.disk && h.disk.status !== "ok") bad.push("disk");
  if (h.database.status !== "ok") bad.push("database");
  if (h.queue.status !== "ok") bad.push("WhatsApp queue");
  if (h.requests.status === "warn" || h.requests.status === "bad") bad.push("API speed / errors");
  banner.replaceChildren(
    el("span", null, h.overall === "ok" ? "✓ All systems healthy" : h.overall === "bad" ? "✕ Needs attention now" : "! Keep an eye on it"),
    el("small", null, bad.length ? ` — ${bad.join(", ")}` : ""));
  $("hl-updated").textContent = `Updated ${new Date(h.at).toLocaleTimeString("en-IN")}`;
  const g = $("health-grid");
  g.replaceChildren();

  // CPU
  const cpu = hcard("⚙", "CPU", h.cpu.status, h.cpu.pct != null ? `${Math.round(h.cpu.pct)}` : "—", h.cpu.pct != null ? `% of ${h.cpu.cores} core${h.cpu.cores > 1 ? "s" : ""}` : "");
  if (h.cpu.pct != null) meter(cpu, h.cpu.pct, T.cpu_pct.warn, T.cpu_pct.bad);
  cpu.appendChild(sparkline(CPU_HIST));
  cpu.appendChild(el("div", "muted", CPU_HIST.length > 1 ? `Last ${Math.round(CPU_HIST.length * 5 / 60 * 10) / 10} min · peak ${Math.round(Math.max(...CPU_HIST))}%` : "The line fills in while this page stays open"));
  g.appendChild(cpu);

  // Load
  const la = h.cpu.load;
  const load = hcard("📈", "Server load", la ? pctLvl(h.cpu.load_per_core, T.load_per_core.warn, T.load_per_core.bad) : "unknown",
    la ? la[0].toFixed(2) : "—", la ? `per core ${h.cpu.load_per_core}` : "");
  if (la) {
    const box = el("div", "loads");
    [["1 min", la[0]], ["5 min", la[1]], ["15 min", la[2]]].forEach(([k, v]) => {
      const d = el("div"); d.append(el("b", null, v.toFixed(2)), el("small", null, k)); box.appendChild(d);
    });
    load.appendChild(box);
    load.appendChild(el("div", "muted", `Above ${h.cpu.cores} (one per core) means work is queueing for the CPU.`));
  }
  g.appendChild(load);

  // Memory
  const m = h.memory;
  const mem = hcard("🧠", "Memory", m ? m.status : "unknown", m ? `${Math.round(m.pct)}` : "—", m ? `% used${m.scope === "container" ? " (container)" : ""}` : "");
  if (m) { meter(mem, m.pct, T.mem_pct.warn, T.mem_pct.bad); kv(mem, "Used", fmtBytes(m.used)); kv(mem, "Total", fmtBytes(m.total)); }
  kv(mem, "This app (RSS)", fmtBytes(h.process.rss));
  g.appendChild(mem);

  // Disk
  const d = h.disk;
  const dsk = hcard("💽", "Disk", d ? d.status : "unknown", d ? `${Math.round(d.pct)}` : "—", d ? "% used" : "");
  if (d) { meter(dsk, d.pct, T.disk_pct.warn, T.disk_pct.bad); kv(dsk, "Free", fmtBytes(d.free)); kv(dsk, "Total", fmtBytes(d.total)); }
  g.appendChild(dsk);

  // Database
  const db = h.database;
  const dbc = hcard("🗄", "Database", db.status, db.up ? `${Math.round(db.ping_ms)}` : "Down", db.up ? "ms ping" : "");
  if (db.conn_pct != null) meter(dbc, db.conn_pct, T.db_conn_pct.warn, T.db_conn_pct.bad);
  kv(dbc, "Connections", db.connections != null ? `${db.connections} / ${db.max_connections}` : null);
  kv(dbc, "Size", fmtBytes(db.size));
  kv(dbc, "Migration", (db.migration_heads || []).join(", "));
  g.appendChild(dbc);

  // API speed
  const r = h.requests;
  const api_ = hcard("⚡", "API speed", r.status, r.p95_ms != null ? `${Math.round(r.p95_ms)}` : "—", r.p95_ms != null ? "ms p95" : "");
  kv(api_, "Median (p50)", r.p50_ms != null ? `${Math.round(r.p50_ms)} ms` : null);
  kv(api_, "Requests / min", r.count ? r.per_min : 0);
  kv(api_, "Server errors (5xx)", r.count ? `${r.errors} · ${r.err_pct}%` : "0");
  api_.appendChild(el("div", "muted", `Last ${Math.round(r.window_s / 60)} minutes on this worker.`));
  g.appendChild(api_);

  // WhatsApp queue
  const q = h.queue;
  const qc = hcard("💬", "WhatsApp queue", q.status, q.queued != null ? String(q.queued) : "—", "waiting to send");
  kv(qc, "Oldest waiting", q.oldest_queued_min != null ? `${q.oldest_queued_min} min` : "none");
  kv(qc, "Failed for good (24 h)", q.dead_24h);
  const wa = el("button", "btn-sm", "🩺 Run WhatsApp check");
  wa.type = "button";
  wa.addEventListener("click", whatsappHealthModal);
  qc.appendChild(wa);
  g.appendChild(qc);

  // Process
  const p = h.process;
  const pc = hcard("🖥", "App process", h.scheduler.leader === false ? "ok" : "ok", fmtDur(p.uptime_s), "uptime");
  kv(pc, "Scheduler", h.scheduler.leader == null ? "—" : h.scheduler.leader ? "This worker (leader)" : "Standby");
  kv(pc, "Threads", p.threads);
  kv(pc, "Python", `${p.python} · ${p.platform}`);
  kv(pc, "PID", p.pid);
  g.appendChild(pc);
}

function paintMiniHealth() {
  const h = HEALTH, box = $("dash-health");
  if (!h || !box) return;
  box.replaceChildren();
  const item = (label, value, lvl) => {
    const d = el("div", "mh");
    const top = el("small", null, label);
    d.append(top, el("b", null, value), pill(lvl));
    box.appendChild(d);
  };
  item("CPU", h.cpu.pct != null ? `${Math.round(h.cpu.pct)}%` : "—", h.cpu.status);
  item("Load (1 min)", h.cpu.load ? `${h.cpu.load[0].toFixed(2)} / ${h.cpu.cores}` : "—", h.cpu.load ? pctLvl(h.cpu.load_per_core, 1, 2) : "unknown");
  item("Memory", h.memory ? `${Math.round(h.memory.pct)}%` : "—", h.memory ? h.memory.status : "unknown");
  item("Database", h.database.up ? `${Math.round(h.database.ping_ms)} ms` : "Down", h.database.status);
}

/* ---------- dashboard: needs attention + recent activity --------------- */
let KPI_LAST = null, RECHARGE_PENDING = 0;
async function paintAttention() {
  const box = $("dash-attn");
  if (!box) return;
  if (!KPI_LAST) { try { KPI_LAST = await api("/control/api/kpis"); } catch (e) { KPI_LAST = null; } }
  const items = [];
  if (RECHARGE_PENDING) items.push(["#billing", RECHARGE_PENDING, "warn", `recharge request${RECHARGE_PENDING > 1 ? "s" : ""} waiting for approval`]);
  if (KPI_LAST && KPI_LAST.past_due) items.push(["?status=past_due#tenants", KPI_LAST.past_due, "bad", "tenant(s) past due"]);
  if (KPI_LAST && KPI_LAST.onboarding_pending) items.push(["#tenants", KPI_LAST.onboarding_pending, "warn", "shop(s) still onboarding"]);
  if (HEALTH && HEALTH.overall !== "ok" && HEALTH.overall !== "unknown") items.push(["#health", "!", HEALTH.overall, "server needs a look"]);
  if (HEALTH && HEALTH.queue.dead_24h) items.push(["#health", HEALTH.queue.dead_24h, "warn", "WhatsApp message(s) failed in 24 h"]);
  box.replaceChildren();
  if (!items.length) {
    const d = el("div");
    d.append(el("span", "n ok", "✓"), el("span", null, "Nothing waiting on you"));
    box.appendChild(d);
    return;
  }
  for (const [href, n, lvl, text] of items) {
    const a = el("a");
    a.href = href.startsWith("?") ? `${location.pathname}${href}` : href;
    a.append(el("span", `n ${lvl}`, String(n)), el("span", null, text));
    box.appendChild(a);
  }
}
async function loadActivity() {
  const box = $("dash-activity");
  if (!box) return;
  let rows;
  try { rows = await api("/control/api/audit?limit=8"); }
  catch (e) { box.replaceChildren(el("p", "muted", `${t("loadFail")}: ${e.message}`)); return; }
  box.replaceChildren();
  if (!rows.length) { box.appendChild(el("p", "muted", "Nothing logged yet.")); return; }
  for (const r of rows) {
    const d = el("div");
    d.append(el("span", "when", fmtWhen(r.at)), el("span", null, `${r.tenant || "platform"} · ${r.action}`),
      el("span", r.ok ? "muted" : "use-over", r.ok ? (r.actor || r.actor_role || "") : "failed"));
    box.appendChild(d);
  }
}

/* ---------- recharge requests (manual UPI verify) ---------------------- */
async function loadRechargeCount() {
  try {
    const rows = await api("/control/api/recharge-requests?status=pending&limit=50");
    RECHARGE_PENDING = rows.length;
  } catch (e) { RECHARGE_PENDING = 0; }
  const n = $("nav-recharge");
  n.hidden = !RECHARGE_PENDING;
  n.textContent = String(RECHARGE_PENDING);
  if (CURRENT_VIEW === "dashboard") paintAttention();
}
async function loadRecharge() {
  const body = $("recharge-body");
  skeletonRows(body, 2, 7);
  const st = $("rc-status").value;
  let rows;
  try { rows = await api(`/control/api/recharge-requests?limit=50${st ? `&status=${encodeURIComponent(st)}` : "&status="}`); }
  catch (e) { return errState(body, 7, e, loadRecharge); }
  if (!rows.length) return stateRow(body, 7, ["💸", st === "pending" ? "No requests waiting" : "No requests", "Clients ask for message or AI packs from their billing page; they show up here."]);
  body.replaceChildren();
  for (const r of rows) {
    const tr = el("tr");
    tr.appendChild(cell("When", fmtWhen(r.at)));
    const shop = cell("Shop", null);
    const link = el("button", "link-cell", r.shop || r.tenant);
    link.type = "button";
    link.addEventListener("click", () => profileModal(r.tenant, "recharge"));
    shop.appendChild(link);
    tr.appendChild(shop);
    tr.appendChild(cell("Pack", `${Number(r.units).toLocaleString("en-IN")} ${r.kind === "ai" ? "AI replies" : "messages"}`));
    tr.appendChild(cell("Amount", inr(r.amount_inr)));
    tr.appendChild(cell("By", r.by || "—"));
    tr.appendChild(cell("Status", badge(r.status)));
    const act = cell("Actions", null);
    act.classList.add("cell-actions");
    if (r.status === "pending" && can("write")) {
      const box = el("div", "actions");
      const ok = el("button", "btn-primary", "Approve");
      ok.type = "button"; ok.dataset.rc = "approve"; ok.dataset.id = r.id; ok.dataset.label = `${r.shop} · ${inr(r.amount_inr)}`;
      ok.dataset.units = String(r.units); ok.dataset.kind = r.kind;
      const no = el("button", "btn-danger", "Reject");
      no.type = "button"; no.dataset.rc = "reject"; no.dataset.id = r.id; no.dataset.label = `${r.shop} · ${inr(r.amount_inr)}`;
      box.append(ok, no);
      act.appendChild(box);
    } else act.appendChild(el("span", "muted", r.note || "—"));
    tr.appendChild(act);
    body.appendChild(tr);
  }
}
function decideRecharge(id, approve, label, units, kind) {
  if (approve) {
    // Approve par units kam-zyada kar sakte ho (jo maanga tha wahi pehle se bhara)
    return openModal((sheet) => {
      sheet.appendChild(el("p", null, `${label}. Approve only after you have seen this money in your bank or UPI app. Credits are added to the shop right away.`));
      const u = field(sheet, "rc-approve-units", `${KIND_WORD[kind] || "Units"} to add`, String(units || ""), "number");
      buttonRow(sheet, [
        { label: "Yes, money received — approve", cls: "btn-primary", onClick: async () => {
          const n = parseInt(u.value, 10);
          if (!(n > 0)) { toast("Enter how many to add", "err"); return; }
          closeModal();
          await act(() => api(`/control/api/recharge-requests/${id}/decide`, { method: "POST", body: { approve: true, note: "", units: n } }),
            `Approved — ${n} added`);
          loadRecharge(); loadRechargeCount();
        } },
        { label: "Cancel", onClick: closeModal },
      ]);
    }, "Approve recharge");
  }
  confirmDialog({
    title: approve ? "Approve recharge" : "Reject recharge",
    danger: !approve,
    body: approve
      ? `${label}. Approve only after you have seen this money in your bank or UPI app. Credits are added to the shop right away.`
      : `${label}. Nothing is added; the request is closed.`,
    confirmLabel: approve ? "Yes, money received — approve" : "Reject",
    onConfirm: async () => {
      await act(() => api(`/control/api/recharge-requests/${id}/decide`, { method: "POST", body: { approve, note: "" } }),
        approve ? "Approved — credits added" : "Rejected");
      loadRecharge();
      loadRechargeCount();
    },
  });
}


/* ---------- recharge pricing editor ------------------------------------
   ₹1 = kitne units, aur client ke billing page ke packs. Pack ka units
   rate se bhar jaata hai, par aap kam-zyada kar sakte ho. Kharcha aur
   bachat sirf yahan dikhte hain, client ko kabhi nahi. */
let PR_DRAFT = null;
async function loadPricing() {
  const box = $("pricing-box");
  if (!box) return;
  box.replaceChildren(el("span", "skel skel-row"));
  const pr = await ensurePricing(true);
  if (!pr) { box.replaceChildren(el("p", "muted", "Could not load recharge prices.")); return; }
  PR_DRAFT = { rates: { ...pr.rates }, packs: pr.packs.map((p) => ({ kind: p.kind, price_inr: p.price_inr, units: p.units, title: p.title })) };
  paintPricing();
}
function paintPricing() {
  const box = $("pricing-box"), pr = PRICING, D = PR_DRAFT;
  const cost = pr.cost_per_unit;
  box.replaceChildren();
  const rates = el("div", "rate-grid");
  for (const k of ["ai", "wa"]) {
    const card = el("div", `rate-card kind-${k}`);
    card.appendChild(el("b", null, KIND_WORD[k]));
    const row = el("div", "rate-row");
    row.appendChild(el("span", null, "₹1 ="));
    const inp = el("input");
    inp.type = "number"; inp.step = "0.01"; inp.min = "0.01"; inp.value = String(D.rates[k]);
    inp.setAttribute("aria-label", `${KIND_WORD[k]} per rupee`);
    row.appendChild(inp);
    row.appendChild(el("span", null, k === "ai" ? "replies" : "messages"));
    card.appendChild(row);
    const ex = el("small", "muted");
    const say = () => {
      const r = parseFloat(inp.value) || 0;
      ex.textContent = `₹30 = ${Math.floor(30 * r)} · ₹100 = ${Math.floor(100 * r)} · your cost per unit ≈ ₹${cost[k]}`;
    };
    inp.addEventListener("input", () => { D.rates[k] = parseFloat(inp.value) || 0; say(); });
    say();
    card.appendChild(ex);
    rates.appendChild(card);
  }
  box.appendChild(rates);

  const wrap = el("div", "tbl-wrap mt");
  const tb = el("table", "stack packs");
  const th = el("thead");
  const hr = el("tr");
  ["What", "Price (₹)", "Units", "Your cost", "You keep", ""].forEach((h) => hr.appendChild(Object.assign(el("th", null, h), { scope: "col" })));
  th.appendChild(hr); tb.appendChild(th);
  const body = el("tbody");
  D.packs.forEach((p, i) => {
    const tr = el("tr");
    const kindSel = el("select");
    for (const k of ["ai", "wa"]) kindSel.appendChild(Object.assign(el("option", null, KIND_WORD[k]), { value: k }));
    kindSel.value = p.kind;
    kindSel.setAttribute("aria-label", "Pack type");
    const price = el("input"); price.type = "number"; price.min = "1"; price.value = String(p.price_inr); price.setAttribute("aria-label", "Pack price in rupees");
    const units = el("input"); units.type = "number"; units.min = "1"; units.value = String(p.units); units.setAttribute("aria-label", "Units in this pack");
    const autoB = el("button", "btn-sm", "= rate"); autoB.type = "button"; autoB.title = "Fill units from the rate";
    const ucell = el("div", "rc-units"); ucell.append(units, autoB);
    const costTd = cell("Your cost", ""), keepTd = cell("You keep", "");
    const share = pr.ai_mix && pr.ai_mix.ai_share != null ? pr.ai_mix.ai_share : null;
    const upd = () => {
      p.kind = kindSel.value; p.price_inr = parseInt(price.value, 10) || 0; p.units = parseInt(units.value, 10) || 0;
      const c = p.units * cost[p.kind];
      // AI pack: asli kharcha kam — Solo workflow ke jawab LLM nahi chalate (ai_mix.ai_share = LLM wala hissa)
      const real = p.kind === "ai" && share != null && share < 1 ? c * share : null;
      costTd.textContent = `₹${c.toFixed(2)}` + (real != null ? ` (real ≈ ₹${real.toFixed(2)}, ${Math.round(share * 100)}% via LLM)` : "");
      const keep = p.price_inr - (real != null ? real : c);
      keepTd.textContent = `₹${(p.price_inr - c).toFixed(2)}` + (real != null ? ` (real ≈ ₹${keep.toFixed(2)})` : "");
      keepTd.classList.toggle("use-over", keep < 0);
    };
    kindSel.addEventListener("change", () => { p.title = ""; upd(); });
    price.addEventListener("input", () => { p.title = ""; upd(); });
    units.addEventListener("input", () => { p.title = ""; upd(); });
    autoB.addEventListener("click", () => { units.value = String(Math.floor((parseInt(price.value, 10) || 0) * (D.rates[kindSel.value] || 0))); p.title = ""; upd(); });
    const del = el("button", "btn-sm btn-danger", "Remove"); del.type = "button";
    del.addEventListener("click", () => { D.packs.splice(i, 1); paintPricing(); });
    tr.append(cell("What", kindSel), cell("Price (₹)", price), cell("Units", ucell), costTd, keepTd);
    const dc = cell("", del); dc.classList.add("cell-actions"); tr.appendChild(dc);
    upd();
    body.appendChild(tr);
  });
  tb.appendChild(body); wrap.appendChild(tb); box.appendChild(wrap);
  const rowBtns = el("div", "btnrow");
  const addB = el("button", "", "＋ Add pack"); addB.type = "button";
  addB.disabled = D.packs.length >= (pr.max_packs || 12);
  addB.addEventListener("click", () => { D.packs.push({ kind: "ai", price_inr: 50, units: Math.floor(50 * (D.rates.ai || 0)) }); paintPricing(); });
  const save = el("button", "btn-primary", "Save prices"); save.type = "button";
  save.disabled = !can("write");
  save.addEventListener("click", async () => {
    const out = await act(() => api("/control/api/recharge-pricing", { method: "PUT", body: D }), "Recharge prices saved — clients see them now");
    if (out) { PRICING = out; PR_DRAFT = { rates: { ...out.rates }, packs: out.packs.map((p) => ({ kind: p.kind, price_inr: p.price_inr, units: p.units, title: p.title })) }; paintPricing(); }
  });
  const undo = el("button", "", "Undo changes"); undo.type = "button";
  undo.addEventListener("click", loadPricing);
  rowBtns.append(save, addB, undo);
  box.appendChild(rowBtns);
}

/* ---------- session ----------------------------------------------------- */
function showSignin() {
  stopHealthPoll();
  $("auth").classList.remove("hidden");
  $("signin").classList.remove("hidden");
  $("appbar").classList.add("hidden");
  // Khali tables dikhane se panel "toota hua" lagta tha — signed out par
  // ek saaf explanation, data sections chhupi hui.
  $("main").classList.add("hidden");
  $("signedout").classList.remove("hidden");
  $("session-label").textContent = STR[L].signedOut;
  const k = $("login");
  if (k) k.focus();
}
function showApp(level, label) {
  LEVEL = level;
  $("auth").classList.add("hidden");
  $("signin").classList.add("hidden");
  $("appbar").classList.remove("hidden");
  $("main").classList.remove("hidden");
  $("signedout").classList.add("hidden");
  $("session-label").textContent = STR[L].signedInAs(label, level);
  route();
  loadHealth();
  loadRechargeCount();
  paintPlanFilter();
  startHealthPoll();
}
/* Phone par app ki tarah: service worker + "Install app" (Chrome/Edge/Samsung
   beforeinstallprompt deta hai; iPhone par Share → Add to Home Screen). */
let INSTALL_EVT = null;
function installSetup() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/control/sw.js", { scope: "/control" }).catch(() => {});
  }
  const btn = $("btn-install");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); INSTALL_EVT = e; btn.hidden = false; });
  window.addEventListener("appinstalled", () => { INSTALL_EVT = null; btn.hidden = true; toast("Installed"); });
  btn.addEventListener("click", async () => {
    if (!INSTALL_EVT) return;
    INSTALL_EVT.prompt();
    try { await INSTALL_EVT.userChoice; } catch (e) { /* user ne mana kiya */ }
    INSTALL_EVT = null; btn.hidden = true;
  });
}

async function signOut() {
  try { await api("/control/api/session/logout", { method: "POST" }); } catch (e) {}
  showSignin();
  toast("Signed out");
}

async function boot() {
  readUrl();
  let s = null;
  try { s = await api("/control/api/session"); } catch (e) { /* no cookie yet */ }
  if (!s) { showSignin(); return; }
  showApp(s.level, s.label);
  await Promise.all([loadKpis(), loadTenants()]);   // above the fold first
  lazySections();                                    // rest after first paint
}

/* Below-the-fold sections load when they scroll into view (or right after
   first paint on tall screens) — keeps first render fast. */
function lazySections() {
  const jobs = [["billing-wrap", loadBilling], ["recharge-wrap", loadRecharge], ["plans-wrap", loadPlanConfigs], ["audit-wrap", loadAudit], ["keys-wrap", loadKeys]];
  if (!("IntersectionObserver" in window)) { jobs.forEach(([, fn]) => fn()); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const job = jobs.find(([id]) => $(id) === e.target);
      if (job) { job[1](); io.unobserve(e.target); }
    }
  }, { rootMargin: "200px" });
  jobs.forEach(([id]) => io.observe($(id)));
}

/* ---------- wiring (all listeners; zero inline handlers) ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  $("signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = $("login").value.trim();
    const password = $("password").value;
    $("password").value = "";              // never keep it around
    if (!login || !password) return;
    try {
      const s = await (await fetchOrThrow("/control/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
        credentials: "same-origin",
      })).json();
      showApp(s.level, s.label);
      toast(`Signed in as ${s.label}`);
      await Promise.all([loadKpis(), loadTenants()]);
      lazySections();
    } catch (err) { toast("Sign-in failed: " + err.message, "err"); }
  });

  addEyeToggle($("password"));
  window.addEventListener("hashchange", () => route());
  $("burger").addEventListener("click", () => openSide(!$("sidebar").classList.contains("open")));
  $("side-ov").addEventListener("click", () => openSide(false));
  $("sidebar").addEventListener("click", (e) => { if (e.target.closest("a[data-view]")) openSide(false); });
  $("btn-hl-refresh").addEventListener("click", () => loadHealth());
  $("hl-live").addEventListener("change", () => (HEALTH_LIVE = $("hl-live").checked));
  $("rc-status").addEventListener("change", loadRecharge);
  $("recharge-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rc]");
    if (b) decideRecharge(b.dataset.id, b.dataset.rc === "approve", b.dataset.label, parseInt(b.dataset.units, 10), b.dataset.kind);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && CURRENT_VIEW === "health") loadHealth(); });
  $("btn-signout").addEventListener("click", signOut);
  installSetup();
  $("btn-add").addEventListener("click", addTenantModal);
  $("btn-backup").addEventListener("click", runBackup);
  $("btn-sweep").addEventListener("click", runSweep);
  $("wa-sync-on").addEventListener("change", paintWaSync);
  $("btn-wa-sync-save").addEventListener("click", () => saveWaSync(false));
  $("btn-wa-sync-apply").addEventListener("click", () => saveWaSync(true));
  $("btn-wa").addEventListener("click", whatsappHealthModal);
  $("btn-palette").addEventListener("click", openPalette);
  $("btn-new-key").addEventListener("click", createKeyModal);
  $("btn-new-offer").addEventListener("click", () => offerModal(null));
  $("offers-auto").addEventListener("change", async (e) => {
    await act(() => api("/control/api/offers-auto", { method: "PUT", body: { on: e.target.checked } }),
      e.target.checked ? "Automatic offer on" : "Automatic offer off");
  });
  $("btn-export-tenants").addEventListener("click", exportTenantsCsv);
  $("btn-export-audit").addEventListener("click", exportAuditCsv);
  $("btn-audit-filter").addEventListener("click", loadAudit);
  $("btn-audit-more").addEventListener("click", renderMoreAudit);

  let searchTimer = null;
  $("t-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(resetAndLoad, 350);     // debounce: 1 request per pause
  });
  $("t-status").addEventListener("change", resetAndLoad);
  $("t-plan").addEventListener("change", resetAndLoad);
  $("show-deleted").addEventListener("change", resetAndLoad);
  $("t-next").addEventListener("click", () => {
    if (T._next) { T.stack.push(T.cursor); T.cursor = T._next; }
    else if (T._nextOffset != null) { T.stack.push(T.offset); T.offset = T._nextOffset; }
    loadTenants();
  });
  $("t-prev").addEventListener("click", () => {
    if (!T.stack.length) return;
    const prev = T.stack.pop();
    if (T.sort === "created_at") T.cursor = prev; else T.offset = prev;
    loadTenants();
  });

  document.querySelectorAll("th button.sort").forEach((b) =>
    b.addEventListener("click", () => setSort(b.dataset.sort)));

  // one delegated handler for every row action + KPI drill-down
  document.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act) { tenantAction(act.dataset.act, act.dataset.slug); return; }
    const kpi = e.target.closest("button.card[data-filter]");
    if (kpi) {
      setStatusFilter($("t-status").value === kpi.dataset.filter ? "" : kpi.dataset.filter);
      go("tenants");
      return;
    }
    const rk = e.target.closest('[data-act="revoke-key"]');
    if (rk) return;
  });
  $("keys-body").addEventListener("click", (e) => {
    const b = e.target.closest('[data-act="revoke-key"]');
    if (!b) return;
    confirmDialog({
      title: "Revoke key", danger: true,
      body: `Anything using “${b.dataset.label}” stops working immediately, including open panel sessions.`,
      confirmLabel: "Revoke key",
      onConfirm: async () => {
        await act(() => api(`/control/api/admin-keys/${b.dataset.id}/revoke`, { method: "POST" }), "Key revoked");
        loadKeys();
      },
    });
  });

  $("ov").addEventListener("click", (e) => { if (e.target.id === "ov") closeModal(); });
  $("palette-ov").addEventListener("click", (e) => { if (e.target.id === "palette-ov") closePalette(); });
  $("palette-input").addEventListener("input", (e) => renderPalette(e.target.value));
  $("palette-input").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1); }
    else if (e.key === "Enter") { e.preventDefault(); const item = PAL[PAL_I]; if (item) { closePalette(); item.run(); } }
  });

  // global keyboard: Cmd/Ctrl-K palette, / search, j/k rows, Enter open, Esc close
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (e.key === "Escape") {
      if (!$("palette-ov").hidden) closePalette();
      else if (!$("ov").hidden) closeModal();
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); go("tenants"); $("t-search").focus(); return; }
    if (e.key === "j" || e.key === "k") {
      const rows = [...$("tenants-body").querySelectorAll("tr[data-slug]")];
      if (!rows.length) return;
      CURSOR_ROW = Math.max(0, Math.min(rows.length - 1, CURSOR_ROW + (e.key === "j" ? 1 : -1)));
      rows.forEach((r, i) => r.setAttribute("aria-selected", String(i === CURSOR_ROW)));
      rows[CURSOR_ROW].focus();
      rows[CURSOR_ROW].scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && CURSOR_ROW >= 0) {
      const row = $("tenants-body").querySelectorAll("tr[data-slug]")[CURSOR_ROW];
      if (row) profileModal(row.dataset.slug);
    }
  });

  boot();
});

async function fetchOrThrow(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try { d = (await r.json()).detail || d; } catch (e) {}
    throw new Error(d);
  }
  return r;
}

/* ---------- WhatsApp health -------------------------------------------
   Chaar check ek jagah, kyunki "bot jawab nahi de raha" ki teen alag
   wajah hoti hain aur teenon bahar se ek jaisi dikhti hain. Aakhri check
   sabse kaam ka: upar sab hara ho aur "aakhri aaya message" kabhi na ho,
   to gadbad aane wale raste mein hai, bhejne wale mein nahi. */
const WA_MARK = { true: ["wa-ok", "✓"], false: ["wa-bad", "✕"], null: ["wa-warn", "?"] };

async function whatsappHealthModal() {
  openModal((sheet) => {
    const box = el("div");
    box.appendChild(el("p", "muted", "Meta se poochh rahe hain…"));
    sheet.appendChild(box);
    buttonRow(sheet, [{ label: "Band karo", onClick: closeModal }]);

    api("/control/api/whatsapp/health").then((d) => {
      box.replaceChildren();
      for (const c of d.checks) {
        const [cls, glyph] = WA_MARK[String(c.ok)];
        const row = el("div", "wa-row");
        const dot = el("span", `wa-dot ${cls}`, glyph);
        /* Rang akela kaam nahi karta — screen reader ko bhi haalat pata chale. */
        dot.setAttribute("role", "img");
        dot.setAttribute("aria-label", c.ok === true ? "theek" : c.ok === false ? "gadbad" : "pata nahi");
        const body = el("div", "wa-body");
        body.appendChild(el("div", "wa-label", c.label));
        body.appendChild(el("div", "wa-detail", c.detail));
        row.appendChild(dot); row.appendChild(body);
        box.appendChild(row);
      }
      const note = el("div", "wa-note");
      note.textContent = d.ok
        ? "Sab theek. Yaad rahe: 24 ghante se purane grahak ko sirf approved template ja sakta hai."
        : "Upar jo laal hai, wahi pehle theek karo — neeche wale usi ki wajah se laal ho sakte hain.";
      box.appendChild(note);
    }).catch((e) => {
      box.replaceChildren(el("p", "muted", `Check nahi ho paya: ${e.message || e}`));
    });
  }, "WhatsApp health");
}
