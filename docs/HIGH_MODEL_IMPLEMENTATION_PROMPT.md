# High-Model Implementation Prompt — Kwik Klin Solo Washerman SaaS

Use this file as the main instruction prompt for a strong coding AI working in this repository. The goal is to implement the solo laundry product in small, safe, reviewable steps—not to rewrite the app in one pass.

## Repository and product context

- Repository: Suyash0225/KwikKlinDasboard
- Product: Kwik Klin, a laundry billing/order-management platform.
- Target customer: one-owner laundry/washerman/small dry cleaner in India, primarily using a mobile phone.
- Proposed monthly plans: ₹300 Starter and ₹500 Pro.
- Proposed AI reply quotas: 100/month Starter and 300/month Pro are pilot defaults only, NOT approved final commercial guarantees.
- The platform owner pays the included AI and messaging costs. Quotas and hard spend limits must be enforced server-side.
- Business goal: eventually support 1,000 independent shops. This is a capacity target, not a claim that current infrastructure already supports it.
- Primary product specification: `docs/PRODUCT_PLAN_SOLO_WASHERMAN.md`
- Treat repository code and tests as the source of truth. Existing architecture documents can be stale; verify them against actual implementation.

## Your role

Act as a senior full-stack engineer, application security engineer, database engineer, QA automation engineer, and pragmatic technical lead. First understand the codebase; then implement the smallest correct slice, add tests, report evidence, and stop for review before moving to the next phase.

## Non-negotiable rules

1. **Audit first.** Do not modify application code until Phase 0 findings are written down.
2. Do not rewrite the app, replace the framework, or refactor unrelated areas without evidence and approval.
3. Do not assume a feature exists because documentation says it exists. Inspect routes, models, migrations, middleware, services, UI, configuration, tests, and deployment files.
4. Never claim a test, security property, load test, migration, or deployment passed unless you actually ran it and can report the command/result.
5. Never use the production database for experiments, migrations testing, synthetic load, or destructive testing. Use a disposable test database or isolated staging environment.
6. Never print, commit, or request real secrets, tokens, customer personal data, production dumps, or private credentials. Do not change production configuration.
7. Preserve existing features and data. Create backward-compatible migrations and a rollback/recovery plan where feasible.
8. All tenant identity must be derived from verified server-side authentication/context. Never trust tenant_id supplied by a client, query parameter, request body, uploaded file, or unverified webhook.
9. Enforce authorization and quotas on the server. Frontend-only restrictions do not count.
10. Do not promise 100% security or 1,000-tenant capacity without evidence.
11. Do not add a paid vendor, new infrastructure dependency, queue, payment provider, or major architectural component before documenting why the current solution is insufficient, its cost/operations implications, and a viable alternative.
12. Work in small branches/PRs with clear scope. Do not merge or deploy unless explicitly authorized by the repository owner.
13. If requirements conflict with existing architecture or are ambiguous, document the options, risks, and recommendation; do not silently guess.
14. Keep billing/order/manual customer communication working if AI is disabled, the AI quota is exhausted, or an external provider is unavailable.
15. Avoid logging full message content and personal data. Use redacted structured logs and tenant-scoped identifiers.

## Phase 0 — Audit only (no application changes)

Inspect at least:
- Repository tree, README, architecture/product/QA docs, package manifests, CI workflows and test commands.
- Backend entry points, FastAPI routers, authentication/session/token handling, tenant middleware/context, roles and authorization.
- Database models, tenant_id patterns, migrations, PostgreSQL RLS policies, ORM filters and database roles.
- Existing plan/subscription/feature-flag/quota tables and admin/control-panel pages.
- All AI entry points, prompts, retrieval, memory, FAQ/correction storage, model/provider client, token/cost tracking and fallback paths.
- All WhatsApp/provider entry points, inbound webhooks, signature validation, retries, deduplication/idempotency, outbound sends, opt-out handling and message status tracking.
- Scheduler and background jobs, worker/process assumptions, concurrency, retries and duplicate-execution controls.
- Customer/order/payment/staff/media/export/report/cache/storage flows that contain tenant data.
- Frontend routes, mobile owner dashboard, admin/control panel, existing bill/order/share/PDF workflows.
- Secrets management, environment variable names (not secret values), Docker/deployment, logging, monitoring, backups and restore docs.
- Existing tests and coverage gaps.

Create `docs/SOLO_WASHERMAN_AUDIT.md` containing:
1. Verified architecture and runtime flow.
2. Feature matrix: implemented / partial / missing / unknown, with exact file paths, route names, model/table names, and test references.
3. Tenant-data inventory and trust boundaries.
4. AI and WhatsApp flow diagrams in Mermaid if useful.
5. Existing plan/quota/subscription support and recommended reuse.
6. Security findings ranked Critical/High/Medium/Low with evidence and recommended fixes.
7. Scalability bottlenecks and unknowns; separate measured facts from assumptions.
8. Proposed migrations and backwards-compatibility risks.
9. Test commands actually run and their exact outcomes; identify anything not run.
10. A phase-by-phase implementation proposal with small PR boundaries.
Do not include secrets or personal data. Do not implement fixes in Phase 0. Commit only the audit report and any necessary documentation cross-links.

## Implementation phases (after Phase 0 review)

### Phase 1 — Tenant isolation and security baseline
- Map every tenant-owned table, API, media asset, export, cache key, webhook, AI context and background task.
- Add/fix tenant scoping in server-side services and database/RLS policies consistent with existing patterns.
- Use least-privilege access. Confirm privileged roles cannot accidentally bypass tenant policies through ordinary user requests.
- Add cross-tenant negative tests for guessed IDs, search, pagination, filters, media, exports, webhook payloads, scheduled jobs and task payloads.
- Add AI canary tests: unique secret-like dummy text in shop A must never appear in shop B's retrieval, prompt context, response or cache.
- Fix Critical/High findings before onboarding outside pilot shops. Do not claim complete security based on a checklist alone.

### Phase 2 — Plan and quota model
- Reuse existing subscription/plan settings if they safely fit; do not create duplicate plan systems.
- Define plan configuration, per-shop assignment/override, billing period, feature flags, AI usage and audit history.
- Keep ₹300/₹500 prices and 100/300 AI replies as configurable pilot defaults only.
- Define precisely what counts as one AI reply. Track successful sends, failed sends, retries, inbound messages, manual messages and provider costs separately.
- Use Asia/Kolkata for user-facing billing-period boundaries unless existing billing conventions require a documented alternative.
- Make usage updates concurrency-safe/atomic and idempotent. Define behavior for month boundaries, provider failures, retries, duplicate webhooks and admin overrides.
- Store money as integer paise/decimal-safe values, not floating-point currency calculations.

### Phase 3 — Server-side quota and spend enforcement
- Centralize quota checks so every automated AI reply path uses the same enforcement service.
- Enforce quota and budget before expensive model/provider calls where possible.
- Apply tenant-level rate limits, bounded retries, timeouts, idempotency, deduplication and fair-use controls.
- Warn at configurable thresholds (initially 80% and 100%). At quota limit, stop AI-generated automated replies and clearly inform the owner.
- Never block manual bill creation, order management or manual WhatsApp share/reply because AI quota is exhausted.
- Fail closed for automated AI sending when quota/tenant context cannot be verified. Do not send twice after uncertain provider outcomes without idempotency/reconciliation.

### Phase 4 — Admin/control panel
- Authorized platform admin can configure plan price, included features, AI quota, enable/disable flags, tenant assignment, per-tenant override and hard spend cap.
- Every privileged change has actor, tenant/plan, old value, new value, timestamp and reason where appropriate.
- Shop owners can view their plan, usage, remaining quota and reset date, but cannot change their own quota, price, plan privileges or another tenant's data.
- Protect endpoints with server-side RBAC; test direct API calls, not only UI visibility.
- Show estimated costs as estimates unless verified provider billing data is available.

### Phase 5 — Mobile owner workflow
- Keep owner UI simple and usable at widths from 320px upwards.
- Core flow: create bill → create/update order → record payment/balance → customer history/ledger → share bill manually through WhatsApp.
- Provide plan and AI usage status, reset date, clear quota-exhausted explanation, loading/empty/offline/error states.
- Preserve current desktop behavior and existing working features.
- Test keyboard/accessibility basics, tap targets, forms/modals, table overflow and mobile navigation.

### Phase 6 — Onboarding and subscription lifecycle
- Only after security and quota behavior are verified, implement or extend subscription/payment integration.
- Support active, trial, overdue, cancelled and expired states if in scope.
- Define grace/read-only behavior and data export before restricting an expired account. Never silently delete customer/order data on lapse.
- Make onboarding low-friction: shop profile, service/rate card, WhatsApp/provider connection where supported, first customer and first bill.
- Never assume a provider account/number is automatically available to every tenant.

### Phase 7 — Reliability and capacity
- Based on audit evidence, improve background job durability, scheduler ownership, database pooling, indexing, pagination, worker configuration, queue backpressure, monitoring and backups.
- Do not add a queue or other infrastructure solely because it is fashionable. State the evidence, alternatives and operational cost.
- Ensure scheduled tasks do not duplicate across web workers; use a single elected scheduler or dedicated scheduler/worker if appropriate.
- Add per-tenant rate limits and fair scheduling to prevent one shop consuming shared capacity.
- Keep billing/orders/manual workflows available during AI/provider outages.

### Phase 8 — Verification and pilot
- Run unit, integration, migration, authorization, tenant-isolation, AI-isolation, webhook-idempotency, quota-concurrency, frontend and regression tests.
- Run migrations only against disposable test DB first; document upgrade and rollback/recovery.
- Use synthetic data in staging for load tests. Never run synthetic load against production.
- Test 1,000 tenant records plus explicitly agreed peak concurrent traffic. Tenant count alone is not a capacity test.
- Record test environment, workload assumptions, concurrency, p50/p95/p99 latency, errors, queue lag, DB connections, CPU/RAM, cost estimates and bottlenecks.
- Define measurable service targets before the load test; do not invent a passing threshold after seeing results.
- Pilot with 3–5 real shops for about 30 days; track activation, bills/shop, weekly active shops, quota-hit rate, cost/shop, failures, support effort and renewal intent.
- Only expand in stages when security, cost and reliability gates pass.

## Required testing checklist

At minimum, add tests for:
- Anonymous user cannot access tenant data or admin endpoints.
- Shop A cannot read/write Shop B customers, orders, payments, staff, conversations, media, reports, exports, plan, quota, usage, or provider settings.
- Changing tenant_id in request body/query/path does not change authorized tenant scope.
- Owner/staff/support/platform-admin permissions are distinct and enforced on API endpoints.
- AI retrieval/prompt/cache are tenant-scoped and canary data never crosses tenant boundaries.
- Quota behavior at 0, 1, 80%, 100%, over-limit, month reset, admin override and disabled AI.
- Concurrent AI requests cannot materially overshoot the quota; usage writes are atomic.
- Duplicate inbound webhook and retry do not cause duplicate replies or double-counting.
- Failed model/provider call, failed send, timeout and unknown provider outcome have defined accounting/reconciliation behavior.
- Hard spend cap and per-tenant rate limits work.
- Manual billing and manual WhatsApp share remain usable when AI is capped/offline.
- Migrations upgrade from a representative prior schema and preserve existing records.
- Mobile layout has no horizontal overflow at 320px and works at tablet/desktop widths.
- Backup restore and tenant data export/deletion are tested in isolated environments.
- Regression suite passes, or failures are listed with clear baseline/new-failure distinction.

## Required workflow for every implementation phase

1. State the phase objective and scope.
2. Inspect relevant code before editing.
3. Propose files to change and data/API compatibility risks.
4. Implement only that phase in a dedicated branch/PR.
5. Add tests alongside changes.
6. Run focused tests, then relevant regression suite. Report exact commands and results.
7. Review the diff for tenant leaks, secret exposure, duplicated logic and unrelated changes.
8. Update docs and migration/rollback notes.
9. Provide a concise completion report: changed files, behavior, tests passed/failed/not run, known risks, manual verification needed.
10. Stop and wait for repository-owner review before proceeding to the next phase. Never merge/deploy unless explicitly instructed.

## Final instruction to the coding AI

Begin with Phase 0 only. Do not start coding features yet. The first deliverable is `docs/SOLO_WASHERMAN_AUDIT.md` plus a PR with the audit and a prioritized implementation proposal. After review, proceed one phase at a time. Be honest about uncertainty, and never state that a requirement is satisfied without code/test evidence.
