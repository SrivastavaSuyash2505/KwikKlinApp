# Kwik Klin Solo Laundry Plans — Product & Development Plan

**Status:** Planning/specification only. Do not start implementation until this plan is reviewed.
**Target customer:** One-owner laundry / washerman / small dry cleaner in India, primarily using a mobile phone.
**Plans:** ₹300 Starter and ₹500 Pro per month.
**Core rule:** Keep the product simple, reliable, mobile-first, and financially safe. Reuse existing Kwik Klin functionality; do not rebuild existing features without checking the current implementation.

## 1. Product promise

- **Starter ₹300/month:** Replace the paper register and manual bill book.
- **Pro ₹500/month:** Billing plus customer follow-up and stronger daily business control.
- The owner can create a bill quickly without training or needing a desktop.
- The customer owns their customer/order/payment data and can export it.

Prices are proposed and must be validated with real laundry owners before broad launch. Annual billing can be added later.

## 2. Plan matrix

| Feature | Starter — ₹300/month | Pro — ₹500/month |
|---|---|---|
| Mobile-friendly owner dashboard | Included | Included |
| New bill and rate × quantity calculation | Included | Included |
| Order status: Received → Washing → Ready → Delivered | Included | Included |
| Customer directory and order history | Included | Included |
| Paid amount, balance due and customer ledger | Included | Included |
| Today's orders, sales and collections | Included | Included |
| Share bill via WhatsApp share intent/link | Included | Included |
| PDF bill / printable bill | Basic PDF | PDF + print-friendly layout |
| Custom garment/service rate card | Basic editable rate card | Full editable rate card |
| Monthly sales and pending-dues reports | Basic | Detailed |
| Customer order-status link | Not included initially | Included, if secure public link is already feasible |
| Automated AI customer replies via connected WhatsApp provider | Limited monthly quota | Higher monthly quota |
| AI quota and usage visibility | Show usage | Show usage |
| Multiple branches | Not included | Not included |
| AI marketing campaigns / bulk promotional messages | Not included | Not included |
| Live route optimization / live tracking | Not included | Not included |
| Unlimited AI or WhatsApp messages | Never promise | Never promise |

**Important distinction:** Clicking “Share on WhatsApp” opens a user-initiated share flow and is not the same as sending automated WhatsApp Business Platform messages. Automated replies require a supported connected provider/number and are subject to provider/Meta rules and costs.

## 3. AI / WhatsApp quota controls — required design

The product owner (super-admin/control panel) must be able to configure the included monthly AI reply quota for each plan without a code deployment.

Suggested initial defaults for pilot testing (configurable, not a permanent promise):
- Starter ₹300: **100 AI-generated replies per shop per billing month**
- Pro ₹500: **300 AI-generated replies per shop per billing month**

These numbers must be checked against actual per-message/provider and model costs before launch. Count one successfully sent AI-generated customer reply as one AI reply. Retries, failed sends, inbound customer messages, and manual owner/staff replies must be tracked separately so usage and cost are not misleading. Define and test the counting rule before implementation.

### Control panel settings
- Edit included AI reply quota for Starter and Pro.
- Enable/disable AI replies per shop and per plan.
- Set a hard monthly spend cap per shop (where cost data is available).
- View usage: used / included / remaining, period reset date, send failures, estimated AI cost and estimated WhatsApp/provider cost when available.
- Search/filter shops and override quota for a specific shop with audit log.
- Configure warning thresholds (default 80% and 100%).
- Changes apply safely and are audited; never allow a browser/client to change its own plan or quota.

### What happens when a shop reaches its limit
- At 80%: notify the platform admin; optionally show a usage warning to the shop owner.
- At 100%: stop **AI-generated automated replies** for that shop until the next billing period or an authorized admin raises the quota.
- Do not block bill creation, order management, manual WhatsApp sharing, or manual replies.
- Tell the owner that the AI quota is used up; do not silently pretend a reply was sent.
- Ensure concurrent requests cannot exceed the hard quota materially. Enforce limits server-side, atomically, per tenant and billing period.
- Add rate limiting, deduplication/idempotency, opt-out/STOP handling, quiet hours, and audit logs. Do not send unsolicited bulk messages under the AI reply allowance.

The platform owner pays the included messaging/AI costs, so every tenant needs a hard quota and spend guard. No “unlimited” claims.

## 4. Owner-facing UI

Keep the first screen focused on five actions:
1. **New Bill**
2. **Orders**
3. **Customers**
4. **Pending Payments**
5. **Today's Sales**

Also show a clear plan/AI usage card:
- Plan name and renewal date
- AI replies used / included / remaining
- AI status: On / Paused / Limit reached
- Simple explanation if the limit has been reached

Use plain Hindi/Hinglish-friendly labels where the existing UI supports them. Support small mobile widths (320px+), accessible tap targets, loading/error states, and no horizontal overflow.

## 5. Admin / control-plane UI

Add or extend a plan configuration page rather than hard-coding plan limits in frontend code:
- Plan list: Starter ₹300 and Pro ₹500
- Monthly price, included feature flags, AI reply quota, enabled/disabled state
- Per-shop plan assignment and quota override
- Usage table and period-wise usage history
- Audit log for quota/plan changes
- Cost and usage alerts

Only authorized platform admins can modify plan definitions. Shop owners can view their plan and usage, not modify limits or another tenant's data.

## 6. Development sequence (one small, reviewable step at a time)

### Phase 0 — Audit before coding
- Inspect current authentication, tenant isolation, Control panel, subscription/billing, WhatsApp provider abstraction, AI client, usage logging, and dashboard routes.
- Map existing features to the plan matrix; mark each as implemented / partial / missing.
- Confirm how a shop/tenant and its billing period are represented.
- Confirm the actual WhatsApp provider and who owns the connected number. Do not assume all existing WhatsApp paths are suitable for external customers.
- Output an audit report and identify migrations needed. Do not change production data or secrets.

### Phase 1 — Plan and quota data model
- Define plan records/settings and per-tenant subscription/assignment.
- Define monthly AI usage records with tenant, period, successful sends, failures, estimated model cost, provider status and idempotency key as appropriate.
- Add safe migrations and tenant-isolation/RLS policies consistent with existing architecture.
- Test month boundaries, timezone Asia/Kolkata, quota overrides, concurrent sends, and tenant isolation.

### Phase 2 — Server-side enforcement
- Centralize AI reply quota checks in the server/service layer used by every automated reply path.
- Enforce quota and spend cap before provider/model calls where possible; record final outcomes consistently.
- Ensure failed sends/retries are not double-counted and duplicate webhook events cannot cause duplicate replies.
- Add 80%/100% alerts and graceful limit-reached behavior.
- Manual billing and manual messaging workflows must remain usable when AI is capped.

### Phase 3 — Control panel
- Create/edit plan quotas and feature flags.
- Assign Starter/Pro to a tenant and optionally set an audited per-shop override.
- Show usage, costs, errors and reset date.
- Add authorization, validation, audit trail and tests.

### Phase 4 — Owner dashboard and billing workflow
- Simplify mobile home screen.
- Verify new bill → order → payment/dues → WhatsApp share flow end-to-end.
- Show current plan and AI usage/limit state.
- Add accessible empty, loading, offline and error states.

### Phase 5 — Subscription and onboarding
- Implement payment/subscription integration only after the plan and usage model is stable.
- Handle active, trial, overdue, cancelled and expired states.
- Do not delete customer data when a subscription lapses; use a clear restricted/read-only policy only after defining and testing it.
- Build a low-friction onboarding flow for shop profile, rates, and first bill.

### Phase 6 — Pilot and launch
- Test with 3–5 external laundry owners.
- Observe whether they can create their first bill without assistance.
- Track weekly active shops, bills/shop, AI usage/shop, cost/shop, quota-hit rate, failed messages, support time and renewal willingness.
- Adjust included quotas based on real costs and usage before marketing the plans broadly.

## 7. Minimum acceptance criteria

- A tenant cannot read or alter another tenant's data, plan, quota or usage.
- Plan limits are enforced on the server, not just hidden in the UI.
- Admin can change Starter/Pro quotas without redeploying.
- Usage is correct across retries, webhook duplicates, concurrent requests and month reset.
- At the limit, AI automated replies stop clearly, while billing and manual workflows still work.
- The shop owner can see quota usage and reset date.
- Existing Kwik Klin functionality is not unintentionally broken.
- Migrations and tests run against a dedicated disposable test database, never production.
- Mobile layout works from 320px width upward.
- No credentials, API keys, or customer personal data are committed to Git.

## 8. Out of scope for the first release

- Multi-branch operations
- Route optimization and live GPS tracking
- AI marketing/bulk campaign sends
- Unlimited messages
- Custom integrations and bespoke reports
- Native Android/iOS apps (use responsive web/PWA first)

## 9. Key risks / decisions to resolve in the audit

1. Current app architecture may already contain plan-related settings; reuse them rather than creating duplicate systems.
2. “AI replies” and “WhatsApp messages” are different cost units. Report them separately.
3. Provider charges and message categories can change. Display estimated costs as estimates and use actual provider billing data where available.
4. Do not promise 100/300 replies until measured costs confirm the ₹300/₹500 plans remain profitable.
5. Existing PRD includes broader SaaS milestones. This document narrows the first release to solo laundry shops and the two proposed plans.

## 10. First implementation task

Start with **Phase 0 audit only**. Produce a feature inventory and exact file/route/service map for the existing code. Then implement one phase per small branch/PR, with tests and review before merging. Do not attempt a large all-at-once rewrite.


## 11. Pricing review — is ₹300 / ₹500 viable?

**Decision: keep ₹300 Starter and ₹500 Pro as pilot prices, not yet as guaranteed long-term prices.** They are simple and accessible for a solo shop, but they are viable only if usage is capped and the real per-shop costs are measured. The platform owner is paying for AI and WhatsApp automation, so a low subscription with unbounded usage can lose money.

Before public launch, measure at least 3–5 pilot shops for 30 days:
- Subscription revenue per shop, excluding taxes where applicable.
- AI model cost per shop.
- WhatsApp/provider cost per shop and message category.
- Hosting/database/storage/backup allocation per shop.
- Payment processing and support time per shop.
- Gross margin per plan and quota-hit rate.

Use the measurements to tune the included quota or price. Keep the initial 100/300 monthly AI replies as **pilot defaults only**; do not advertise them as final until cost data supports them. If the Pro plan's automated messaging costs are consistently too high, reduce its quota or charge a transparent add-on. Do not silently overspend or promise unlimited messages. Make clear whether prices include GST and what counts as one billable AI reply.

## 12. Security and privacy requirements — every shop's data must remain separate

Security is a release blocker, not a later enhancement. “100% secure” cannot honestly be guaranteed; the goal is layered controls, independent testing, monitoring, and a tested incident/recovery process.

### Tenant isolation
- Every shop-owned record must be scoped to a server-verified tenant: customers, orders, order history, payments, staff, conversations, messages, AI memory/context, FAQs/corrections, uploaded media, usage, reports, exports, and backups.
- Derive tenant identity from the authenticated session/token on the server. Never trust a tenant ID supplied by a browser, URL, request body, uploaded file, or webhook alone.
- Enforce tenant scoping in service/repository queries and PostgreSQL Row-Level Security (RLS) where supported. Use least-privilege DB roles; ensure RLS cannot be bypassed by ordinary application requests.
- Add negative tests for cross-tenant reads, writes, ID guessing, exports, search, media URLs, background jobs, scheduled jobs, and webhook processing.
- Cache keys, idempotency keys, task payloads, temporary files, logs and object-storage paths must include an appropriate tenant scope and must not leak data across shops.
- A tenant must not be able to change another tenant's plan, AI quota, phone number, provider credentials, prompt settings or usage records.

### AI isolation and safe behavior
- Each shop's conversation history, customer context, FAQ, corrections, uploaded documents and AI memory must be isolated by tenant and customer/conversation.
- Never put one shop's customer data into another shop's prompt, retrieval results, cache, training examples or response.
- Retrieve only the authenticated tenant's approved context. Do not use one shop's conversations to train or personalize another shop's AI.
- Apply per-tenant quota, per-tenant hard spend cap, rate limits, timeout/retry limits and safe fallback. Do not let one noisy tenant consume the whole shared AI budget.
- Treat customer messages, documents and images as untrusted input; defend against prompt injection and data-exfiltration instructions. AI must not reveal secrets or internal notes.
- Log usage and decisions with minimal personal data. Do not log API keys, access tokens, full payment details, or unnecessary message contents.
- AI must not claim an order, payment, pickup or delivery action succeeded unless the backend confirms it. Require owner confirmation for sensitive or ambiguous actions.

### Identity, permissions and secrets
- Require secure authentication for owners, staff and platform administrators; enforce role-based authorization on every sensitive server endpoint.
- Use secure, HttpOnly, SameSite cookies where cookie sessions are used; CSRF protections where needed; session expiry and revocation; strong password hashing and rate limiting.
- Keep vendor/admin controls separate from shop-owner controls. Require least privilege and audit every privileged plan, quota, tenant, export and support action.
- Store secrets in environment/secret management, never in Git or frontend code. Encrypt provider credentials at rest and rotate/revoke them safely.
- Verify WhatsApp/webhook signatures and prevent replay/duplicate processing. Validate uploads, block path traversal, and use short-lived/authorized links for private media.
- Use HTTPS in production, secure headers, dependency/security updates, and a documented vulnerability response process.

### Data lifecycle and backups
- Define data retention, account closure, export and deletion policies. A subscription lapse must not silently erase customer data.
- Encrypt backups and restrict access. Keep backups isolated from normal application credentials and run periodic restore drills into a disposable environment.
- Test restore completeness and recovery time, not just whether a backup file exists.
- Do not expose private backups, database dumps, logs or customer data through public object storage.
- Establish a security incident procedure: contain access, rotate secrets, preserve necessary audit evidence, assess impact and notify affected users as legally required.

## 13. Capacity goal: 1,000 solo shops — target, not an untested promise

The business goal is to support **1,000 independent solo shops**, but the existing app must not be assumed to handle 1,000 tenants safely just because each shop is small. Capacity must be demonstrated by load tests and production monitoring. The current architecture notes describe a single FastAPI process and in-process scheduler; that is not enough evidence to promise 1,000 shops without further engineering.

### Required architecture direction
- Use shared multi-tenant application infrastructure with strict tenant_id isolation; do not run 1,000 independent app processes/databases.
- Keep API/web workers stateless where practical so multiple instances can run behind a load balancer.
- Move long-running AI calls, WhatsApp sends, reminders, exports and other background work to a durable queue with bounded concurrency, retries, idempotency and dead-letter handling.
- Run scheduled jobs through a single elected scheduler or dedicated worker service; avoid every web worker running duplicate scheduled jobs.
- Use PostgreSQL connection pooling (and PgBouncer if measurements justify it), indexed tenant-scoped queries, query timeouts, pagination and connection budgets. Set pool sizes from the total number of workers, not per worker in isolation.
- Put private uploads/backups in access-controlled object storage as volume requires; avoid storing large media in process memory.
- Add observability: request latency/error rate, DB pool saturation, slow queries, queue depth/age, webhook lag, AI/provider failures, per-tenant usage/cost, disk/RAM/CPU and backup/restore status.
- Add per-tenant rate limits and fair queue scheduling so one shop cannot starve other shops.
- Keep feature flags and quota enforcement server-side. Add graceful degradation: if AI/provider is unavailable or a quota is exhausted, billing/orders/manual operations should continue.

### Capacity acceptance tests before claiming 1,000 shops
- Create synthetic tenants and representative data in a dedicated staging/load-test environment; never load-test production with fake data.
- Test expected normal and peak traffic using explicit assumptions for bills/shop/day, incoming WhatsApp messages/shop/day, concurrent owners, AI calls, and background jobs.
- Test at least 1,000 tenant records and simulate the agreed peak concurrent traffic; tenant count alone is not a load test.
- Run cross-tenant security tests under load and test queue retries, duplicate webhooks, provider outages, AI budget exhaustion, database restart, and worker restart.
- Agree measurable service targets before the test (for example, API latency percentiles, error rate, queue delay, and recovery time), record actual results, and fix bottlenecks before launch.
- Run a soak test long enough to expose memory leaks, scheduler duplication, connection exhaustion, and queue growth.
- Re-test after significant architecture, provider, database, or traffic changes.

**Do not market “supports 1,000 shops” until the load test passes and the production deployment has enough measured capacity.** Start with a small pilot, then grow in stages (for example 5 → 25 → 100 → 300 → 1,000 shops), checking cost, errors, latency and security at each stage.

## 14. Expanded implementation order — security and scale gates

1. **Audit current implementation:** inspect actual auth, tenant middleware/context, RLS policies, models, media, AI retrieval/memory, webhook/background jobs, scheduler, secrets, and deployment. Mark existing controls as verified / partial / missing; documentation alone is not proof.
2. **Threat model and data map:** list every table, endpoint, background task, external provider and file path containing tenant data; document trust boundaries and attack scenarios.
3. **Tenant-isolation test suite:** cross-tenant negative tests for API, DB/RLS, AI context, media, exports, cache, webhooks and jobs. Fix blockers before external onboarding.
4. **Plan/quota enforcement:** atomic per-tenant AI reply counters, spend caps, audit log, usage reporting and graceful limit handling.
5. **Control panel and owner UI:** role-protected plan configuration, usage visibility, simple mobile billing/orders.
6. **Durable background processing and observability:** queue, scheduler ownership, metrics, alerts and recovery behavior where the audit identifies gaps.
7. **Subscriptions and onboarding:** only after tenant isolation and quota enforcement are verified.
8. **Security review and load testing:** staging-only, reproducible results and fixes.
9. **Staged pilot:** 3–5 shops first; expand only when support load, costs, security and reliability remain acceptable.

## 15. Additional definition of done

- Automated tests prove shop A cannot access shop B's records through API, DB/RLS, AI, search, exports, media, cache, webhook or background jobs.
- AI prompts and retrieval are demonstrably tenant-scoped; a dedicated test uses unique canary data per shop and asserts it never appears in another shop's response or retrieval.
- Per-tenant AI quotas and spend limits remain correct during concurrent requests and retries.
- Secrets and sensitive data are absent from Git, frontend bundles, routine logs and error messages.
- Authorization tests cover owner, staff, accountant, support/admin and unauthenticated roles.
- Backup restore and tenant export/deletion workflows are tested.
- Load-test report records test environment, workload assumptions, concurrent traffic, p50/p95/p99 latency, errors, queue lag, DB connections, resource usage, and bottlenecks.
- Production monitoring and incident/restore runbooks exist before onboarding paying customers at scale.
