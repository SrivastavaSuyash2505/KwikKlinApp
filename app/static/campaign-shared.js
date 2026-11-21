/* Dono campaign screens ka saanjha hissa: dukaan (app.js) aur control panel (control.js).
 * Sirf dikhana aur shabd. Auth, data aur niyam alag hi rehte hain: dukaan ka adapter
 * /admin/api par, control ka /control/api/sales par, aur server dono jagah khud jaanchta hai. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const REASONS = {
    name_not_saved: "Name not saved. Save it in Customers",
    never_messaged: "Never messaged this shop on WhatsApp",
    opted_out: "Opted out",
    freq_cap: "Frequency limit, messaged recently",
    recent_complaint: "Recent complaint",
    blocked_test_recipient: "Blocked or test number",
    inactive: "Customer inactive",
    active_order: "Order in progress",
    no_active_order: "Order finished before sending",
    recent_bad_rating: "Recent negative rating",
    no_dues: "No dues",
    not_eligible: "Not eligible",
    cancelled: "Campaign cancelled",
    empty_message: "Message came out empty",
    new_contact_pause: "WhatsApp has limited new contacts",
    provider_rejected: "WhatsApp rejected this message",
    provider_uncertain: "No reply from WhatsApp. It may have been delivered, so it is not sent again",
    previous_attempt_unconfirmed: "An earlier try was interrupted. It may have been delivered, so it is not sent again",
    worker_exception: "Sending was interrupted. It may have been delivered, so it is not sent again",
    duplicate_send_claim_suppressed: "An earlier try was interrupted, not sent again",
    budget_hit: "Monthly campaign limit reached",
  };

  // Campaign kyon ruka. Row "queued" rehti hai, isi se wajah milti hai.
  const PAUSES = {
    owner_paused: "You paused this campaign",
    quiet_hours: "Waiting for morning. Campaigns do not send at night",
    daily_cap: "Daily message limit reached. Continues tomorrow",
    budget_hit: "Monthly campaign limit reached. Raise the limit or wait for next month, then resume",
    wa_quota: "WhatsApp message limit of the plan is used up. Recharge, then resume",
    no_session: "WhatsApp is not connected. Connect it, then resume",
    restricted: "WhatsApp has limited this number for some hours",
    provider_unavailable: "WhatsApp is not answering. Trying again soon",
    creative_missing: "The campaign image is missing. Create the campaign again with the image",
    worker_error: "Sending stopped because of a server problem. Trying again soon",
  };

  const STATUS = {
    draft: ["Draft", "draft"], suggested: ["Suggested", "draft"], scheduled: ["Scheduled", "scheduled"],
    approved: ["Starting", "running"], sending: ["Running", "running"], paused: ["Paused", "paused"],
    sent: ["Completed", "completed"], failed: ["Failed", "failed"], cancelled: ["Cancelled", "cancelled"],
    DRAFT: ["Draft", "draft"], RUNNING: ["Running", "running"], PAUSED: ["Paused", "paused"], DONE: ["Completed", "completed"],
  };

  const reason = (code) => REASONS[code] || PAUSES[code] || String(code || "").replaceAll("_", " ");
  const pauseReason = (code) => PAUSES[code] || reason(code);

  function statusInfo(status, counts) {
    const [label, tone] = STATUS[status] || [status, "draft"];
    const c = counts || {};
    // Kuch gaya, kuch nahi: hara "Completed" wahi dhokha tha jisse 36 mein 6 chhupte the
    if (status === "sent" && ((c.failed || 0) + (c.uncertain || 0)) > 0) return { label: "Completed with issues", tone: "paused" };
    return { label, tone };
  }

  const sum = (c, ...keys) => keys.reduce((n, k) => n + Number(c[k] || 0), 0);

  // Har tile ek sawaal ka jawab: kitne chune, kitne pakke, kitne kahan hain
  function tenantFunnel(c, s) {
    return [
      ["In audience", c.audience_total, "Everyone you chose when the campaign started"],
      ["Approved", c.approved_count, "Passed every rule when the campaign started"],
      ["Waiting", s.queued, "Still in line to be sent"],
      ["Sent", sum(s, "sent", "delivered", "read", "replied"), "Accepted by WhatsApp"],
      ["Delivered", sum(s, "delivered", "read", "replied"), "Reached the phone"],
      ["Read", sum(s, "read", "replied"), "Opened, if the customer shares read receipts"],
      ["Replied", s.replied, "Customer answered"],
      ["Failed", s.failed, "Not sent"],
      ["Skipped", s.skipped, "Held back by a rule, see the reason"],
      ["Uncertain", s.uncertain, "No answer from WhatsApp. Never sent twice"],
    ].filter(([, n]) => n != null);
  }

  function controlFunnel(c) {
    const n = c.counts || {};
    return [
      ["Shops", c.total, "All shops in this campaign"],
      ["Waiting", n.NEW, "Still in line to be sent"],
      ["Sent", sum(n, "SENT", "REPLIED", "HOT", "WON", "NOT_INTERESTED", "STOPPED"), "First message accepted by WhatsApp"],
      ["Replied", sum(n, "REPLIED", "HOT", "WON", "NOT_INTERESTED"), "Shop answered"],
      ["Hot", n.HOT, "Wants a call or a demo"],
      ["Failed", sum(n, "FAILED", "NO_WHATSAPP"), "Not sent, or result unknown"],
      ["Skipped", n.SKIPPED, "Not a fit, see the lead"],
      ["Stopped", n.STOPPED, "Said STOP. Never messaged again"],
    ];
  }

  const funnelHtml = (rows) => '<div class="cs-funnel">' + rows.map(([label, n, hint]) =>
    '<div title="' + esc(hint) + '"><b>' + esc(n ?? 0) + '</b><span>' + esc(label) + '</span></div>').join("") + "</div>";

  // API ka raasta mode se: screen ko pata hi nahi kaunsa backend hai
  const adapters = {
    tenant: (api) => ({
      list: () => api("/admin/api/campaigns"),
      detail: (id) => api("/admin/api/campaigns/" + id),
      pause: (id) => api("/admin/api/campaigns/" + id + "/pause", { method: "POST" }),
      resume: (id) => api("/admin/api/campaigns/" + id + "/resume", { method: "POST" }),
      cancel: (id) => api("/admin/api/campaigns/" + id + "/cancel", { method: "POST" }),
    }),
    control: (api) => ({
      list: () => api("/control/api/sales/overview"),
      pause: (id) => api("/control/api/sales/campaigns/" + id + "/pause", { method: "POST" }),
      resume: (id) => api("/control/api/sales/campaigns/" + id + "/start", { method: "POST" }),
    }),
  };

  window.CampaignShared = { adapters, controlFunnel, funnelHtml, pauseReason, reason, statusInfo, tenantFunnel, REASONS };
})();
