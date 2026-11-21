# Solo Washerman Release Checklist

Use this checklist alongside:
- `docs/PRODUCT_PLAN_SOLO_WASHERMAN.md`
- `docs/HIGH_MODEL_IMPLEMENTATION_PROMPT.md`

This is a release gate, not a claim that the items are already complete.

## Gate 0 — Code audit
- [ ] Audit report created with verified file/route/model/test references.
- [ ] Existing implementation mapped to requirements: implemented / partial / missing / unknown.
- [ ] Tenant data map and trust boundaries documented.
- [ ] Existing security controls verified in code/tests, not docs alone.
- [ ] Test commands and results recorded honestly.
- [ ] Audit reviewed before feature implementation.

## Gate 1 — Tenant security
- [ ] Tenant identity comes from verified server-side auth.
- [ ] API, DB/RLS, media, exports, search, caches, webhooks and jobs are tenant-scoped.
- [ ] Cross-tenant negative tests pass.
- [ ] AI retrieval, prompts and memory are tenant-scoped; canary tests pass.
- [ ] Admin/owner/staff roles are enforced server-side.
- [ ] No secrets or unnecessary personal data in Git/logs/frontend.

## Gate 2 — Plans and quotas
- [ ] Plan config reuses existing safe structures where possible.
- [ ] Starter/Pro values are configurable, not hard-coded in frontend.
- [ ] 100/300 replies are labelled pilot defaults until cost validation.
- [ ] Quota definitions and counting rules documented.
- [ ] Atomic per-tenant enforcement works under concurrency.
- [ ] Retries, failed sends and duplicate webhooks are accounted for.
- [ ] Spend caps, rate limits, alerts and audit logs work.
- [ ] AI limit does not block manual billing or manual share/reply.

## Gate 3 — Owner/admin UI
- [ ] Admin controls are role-protected and audited.
- [ ] Shop owner sees plan, usage, remaining quota and reset date.
- [ ] Shop owner cannot change own quota or access other shops.
- [ ] Bill → order → payment/dues → manual WhatsApp share works end-to-end.
- [ ] Mobile layout tested at 320px, tablet and desktop.
- [ ] Loading, empty, offline, provider-error and quota-exhausted states are clear.

## Gate 4 — Lifecycle, operations and scale
- [ ] Subscription lapse does not silently delete data.
- [ ] Backup restore and export/deletion workflows tested.
- [ ] Scheduler/background work cannot duplicate unexpectedly.
- [ ] Monitoring/alerts and incident/recovery runbooks exist.
- [ ] Staging load test uses documented traffic assumptions and synthetic data.
- [ ] Load-test report records latency percentiles, errors, queue lag, DB connections and resource use.
- [ ] 1,000-shop claim is withheld until representative capacity test passes.

## Gate 5 — Pilot
- [ ] 3–5 shops complete onboarding and create bills.
- [ ] 30-day cost and usage data collected.
- [ ] AI/WhatsApp cost per shop measured separately.
- [ ] Support effort, reliability, quota-hit rate and renewal willingness reviewed.
- [ ] ₹300/₹500 price and quotas reviewed using actual costs.
- [ ] Expand gradually only after security, cost and reliability gates pass.

## Evidence required for every checked item
Record the code path, test name/command, test result, and reviewer/date. Do not check an item based on intention or documentation alone.
