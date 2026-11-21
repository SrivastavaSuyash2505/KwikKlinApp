# Kwik Klin Control Panel — AI Development Prompt

> **Purpose:** Give this document to an AI coding agent (Claude Code, Codex, etc.) to plan and implement the Kwik Klin **platform-owner / super-admin Control Panel**. The existing tenant-workspace UI mockup is a design reference, not proof that any backend functionality exists.
>
> **Repository:** `Suyash0225/KwikKlinDasboard`
>
> **Design reference:** `docs/control-panel-tenant-workspace-mockup.svg`
>
> **Important:** Build on the current codebase. Do not blindly rewrite the application, duplicate an existing feature, or assume the mockup's sample numbers are real data.

---

## 1. Master prompt to give the coding AI

You are a senior full-stack engineer, SaaS architect, security engineer, and product designer. Work inside the existing Kwik Klin repository to build a secure, responsive, production-minded **platform-owner Control Panel** for a multi-tenant laundry SaaS.

The platform owner must be able to manage tenant businesses, plans and subscriptions, AI credits, payment verification, WhatsApp integration health, system operations, support history, feature flags, and security/audit activity from one central interface.



## 1A. CRITICAL PRIORITY — Build the Solo-User / Single-Business Mode FIRST

**This is the first product milestone and must be implemented before the platform-owner multi-tenant Control Panel.** Kwik Klin must work reliably for one laundry business (the initial solo user/business owner) without requiring tenant onboarding, subscription billing, payment verification, AI-credit purchase, or super-admin configuration. Do not let the larger SaaS control-panel work block the core single-business workflow.

### Solo-user definition and boundaries

- A solo user is the owner/admin of one laundry business using Kwik Klin for their own operations.
- The solo-user experience is the initial/default deployment mode for the existing Kwik Klin product. Inspect the current auth, tenant/business model, and routes first; preserve working behavior and migrate existing data safely.
- The owner must be able to log in and use the existing laundry workflows directly, without first creating or selecting a tenant through a platform-owner panel.
- Keep a clean path to multi-tenant SaaS later. Do not hardcode a single business into shared services or create a schema that makes future tenant isolation impossible.
- Prefer one business/workspace associated with the authenticated owner. If the current architecture already has tenant IDs, continue using them consistently, even when only one tenant exists.
- Do not implement the solo-user mode by disabling authentication or authorization, exposing admin routes, or bypassing tenant scoping.

### Solo-user MVP — required before multi-tenant Control Panel

1. **Authentication and first-run setup**
   - Ensure the owner can sign in using the existing supported authentication flow.
   - On first run, provide a simple setup flow for business name and essential business settings only if these are not already configured.
   - Avoid duplicate business/workspace creation on refresh, retries, or repeated setup submissions.
   - Preserve existing staff login and permission rules; staff must not automatically inherit owner permissions.

2. **Core laundry operations**
   - Verify and preserve the existing dashboard, customers, orders, billing/invoices, payments, delivery dates, staff/tasks, and business settings.
   - Confirm the full critical journey works: owner login → create/find customer → create order/bill → view/share bill through existing WhatsApp flow → track payment/status → manage delivery.
   - Do not replace existing working workflows with mock screens or sample data.
   - Fix blockers in this journey before adding optional platform features.

3. **Business data and settings**
   - The solo owner can manage only their own business records and settings.
   - Ensure customer, order, bill, payment, staff, media, AI usage, and WhatsApp records remain correctly scoped to that business.
   - Use existing models and migrations where possible. Do not duplicate tables or create a second parallel implementation of billing/orders.
   - Existing records must remain accessible after any migration.

4. **WhatsApp and integrations**
   - Preserve the current WAHA/provider integration and its established configuration.
   - Show honest connection/error states; do not claim a message was delivered without reliable provider status.
   - Keep credentials and session secrets server-side, and keep logs sanitized.

5. **AI features in solo mode**
   - If AI features already exist, let the owner use them according to existing configuration and safe limits.
   - For the initial solo-user MVP, do not require a paid AI-credit wallet or manual top-up approval unless the current product explicitly depends on it.
   - Track usage safely where supported; keep a future path for tenant-level AI credits and subscription plans without blocking core laundry operations.

6. **Security and reliability**
   - Enforce authenticated access and business-level data isolation on every read/write endpoint.
   - A user must not be able to access another business's customers, orders, bills, media, staff, WhatsApp sessions, or AI history by changing an ID.
   - Add regression tests for owner vs staff permissions, cross-business access denial, and critical laundry workflows.
   - Do not remove existing security controls or bypass RLS/tenant checks to make single-user mode easier.

7. **Solo-user UI**
   - Keep the day-to-day owner interface simple and mobile-friendly, with obvious access to dashboard, customers, orders, billing, staff/tasks, WhatsApp status, and settings.
   - Do not show platform-owner-only menus such as all tenants, global subscriptions, global payment approvals, platform-wide audit logs, or global feature flags to the solo owner.
   - Include loading, empty, error, and success states. Do not hardcode sample metrics as real business data.



### Required solo-user order and billing UI specification

Before implementing platform-owner Control Panel features, read and follow **`docs/LAUNDRY_ORDER_BILLING_UI_PROMPT.md`**. It defines the mobile-first customer → pickup scheduling → garment/service selection → pricing/payment → delivery assignment → bill generation → WhatsApp sharing workflow. Treat this as a required part of the Solo-User MVP, not an optional future enhancement. Implement a working end-to-end flow using existing APIs and data models; do not stop at a static UI mockup.

### Solo-user acceptance criteria

Do not proceed to the full platform-owner Control Panel until these checks are complete or each remaining blocker is clearly documented:

- [ ] Existing solo owner can sign in and reach their business dashboard.
- [ ] First-run setup works once and does not create duplicate business records.
- [ ] Existing customer/order/billing data is preserved.
- [ ] Owner can complete the critical laundry workflow end-to-end.
- [ ] WhatsApp/WAHA flows use the current provider and report status honestly.
- [ ] Staff permissions remain restricted.
- [ ] Cross-business/unauthorized access tests pass for relevant endpoints.
- [ ] Existing critical tests pass; new failures are documented.
- [ ] Mobile layout is usable on 320px+ screens.
- [ ] Migrations and rollback considerations are documented.


### First: inspect and plan before coding

1. Inspect the repository structure, README, current branches, frontend routes/templates, styles, API routers, authentication/authorization, database models, migrations, tenant resolution, AI services, WhatsApp/WAHA integration, background jobs, and existing tests.
2. Identify which requested features already exist, are partially implemented, or are missing. Reuse existing patterns and services.
3. Read and follow `docs/control-panel-tenant-workspace-mockup.svg` for visual direction. The mockup is a UI reference only; all displayed figures are illustrative.
4. Write a concise implementation plan and a feature/status matrix before making broad changes. Note dependencies and security risks.
5. Implement in small, reviewable stages. Add database migrations only when needed. Do not break existing laundry billing, customer/order workflows, staff portal/PWA, WhatsApp messaging, or existing admin functionality.
6. Never claim a feature or test works unless you actually verified it. Run the relevant tests and report failures honestly.

### 2. Main navigation / information architecture

Create or refine these areas, using the project's existing navigation conventions:

- **Overview / Dashboard**
- **Tenant Management**
- **Subscriptions & Payments**
- **AI Credits & Usage**
- **WhatsApp & Integrations**
- **System Operations**
- **Support & Activity Logs**
- **Feature Flags**
- **Settings & Security**

The UI must be professional, clean, consistent with the existing Kwik Klin branding, and responsive on small mobile screens (320px+), tablets, and desktop. Include loading, empty, error, permission-denied, and confirmation states. Use accessible labels, keyboard-friendly controls, readable contrast, and consistent spacing. Do not introduce a new frontend framework unless the existing code clearly requires it.

### 3. Platform overview dashboard

Provide live, backend-derived metrics where data exists:

- Total tenants; active, trial, suspended, expired, and pending tenants
- Active subscriptions, renewals due soon, expired subscriptions
- AI credits issued, consumed, and remaining (clearly define each metric)
- Pending manual payment verification requests
- WhatsApp connected/disconnected tenants and message failures
- API errors/latency and failed background jobs, where monitoring is available
- Recent security-sensitive admin actions

Requirements:
- Metrics must come from authorized backend APIs and real database/service data.
- Never hardcode mockup values into production.
- If a metric is not yet available, display “Not configured” or “Data unavailable” rather than fabricating it.
- Add useful time filters only where the backend can support accurate aggregation.

### 4. Tenant management

Create a searchable, filterable, paginated tenant list. Search by business/tenant name and supported identifiers; do not expose unnecessary personal data.

Each tenant workspace/profile should support, according to the current data model:

- Tenant/business name, tenant ID, status, creation date, owner/admin contact fields where authorized
- Subscription plan, start date, renewal/expiry date, trial status
- Feature/usage limits and current usage
- AI credit balance and usage summary
- WhatsApp integration status and last successful activity, if recorded
- Internal admin notes and support history
- Recent tenant-specific activity/audit events
- Safe actions: activate, suspend, reactivate, change plan/limits, and initiate password reset/invitation using existing secure flows

Rules:
- Every action must be permission-checked on the server.
- Show a clear confirmation for suspension, reactivation, plan changes, and other consequential operations.
- Require a reason for high-impact actions where appropriate and record it in the audit log.
- Do not allow tenant IDs supplied by the browser to override authenticated tenant/platform-admin scope.
- Do not expose tenant secrets, API keys, session credentials, or full payment credentials in the UI or logs.
- Do not create an unrestricted “log in as tenant” feature. If support impersonation is ever implemented, make it time-limited, explicitly authorized, clearly visible, read-only by default, and fully audited.

### 5. Plans, subscriptions, and billing

Build a maintainable plan/subscription management flow:

- Plan name, price, billing period (monthly/yearly where supported), included features and limits
- Tenant subscription status: trial, active, past due/pending, expired, suspended, cancelled
- Start, renewal, and expiry dates; grace-period rules if adopted
- Plan upgrade/downgrade and limit changes with confirmation and audit history
- Payment/subscription history and invoices/receipts where supported
- Renewal/expiry reminders and failed-payment follow-up where a messaging scheduler exists
- Optional coupons/discounts only after the core subscription lifecycle is reliable

Do not assume a payment gateway is integrated. Inspect the existing implementation first. Do not mark a subscription paid solely because a tenant submitted a screenshot or transaction reference. Clearly distinguish subscription payment from AI credit top-ups.

### 6. Manual payment verification workflow

The current intended approach may use a manually verified UPI payment flow; confirm the current implementation before changing it.

If manual payments are used, support:

1. Tenant selects a plan or AI credit package and sees the configured payment instructions/QR.
2. Tenant submits transaction/reference ID and optional receipt screenshot.
3. Admin sees a pending request with tenant, requested amount/package, submission time, and reference.
4. Admin verifies the transaction independently in the payment app/bank record, then approves or rejects with a reason.
5. Approval must be idempotent: one payment request can never be credited twice, even after retries or double-clicks.
6. Record who approved/rejected, when, the decision, reason, and linked ledger entry.
7. Never store UPI PINs, passwords, card credentials, or other payment secrets. Treat screenshots as supporting evidence, not proof of payment.

If the repository has a gateway already, use its verified server-side webhook/status flow instead of duplicating a manual process.

### 7. AI credit wallet and usage ledger

Treat AI credits as **prepaid service credits**, not as a cash wallet or bank balance. Keep them separate from subscription payments.

Required capabilities:

- Per-tenant current credit balance
- Credit package configuration and admin-granted adjustment with mandatory reason
- Top-up request list with pending/approved/rejected status
- AI usage ledger with timestamp, tenant, operation/model category where available, credits debited/credited, status, and a safe reference to the request
- Usage summaries by tenant and time period
- Low-balance alerts and configurable tenant limits
- Failed-request handling/refund rules
- Admin history of every adjustment and top-up
- Optional provider-cost reporting once reliable provider usage/cost data is available

Accounting and correctness:
- Use a server-side ledger as the source of truth; do not trust client-submitted balances or credit amounts.
- Perform balance checks and debit/credit operations atomically in the database, using transactions/locking or an equivalent safe mechanism.
- Add idempotency protections to top-ups, usage debits, refunds, and payment approvals.
- Do not charge for an AI request that fails before billable execution; define and test the refund/reversal behavior for timeouts and partial failures.
- Never allow a negative balance unless an explicit, documented policy requires it.
- Keep an auditable immutable transaction history. Corrections should use reversal/adjustment entries rather than silently editing historical rows.
- Keep provider API keys and secrets server-side only.
- Do not hardcode credit-to-rupee economics. Measure real provider costs and configure packages/prices through secure admin settings.

### 8. WhatsApp and integration monitoring

Use the existing WhatsApp provider/WAHA integration and current database records. Do not switch providers or introduce Meta API assumptions without explicit product requirements.

Show tenant-scoped operational information where available:

- Connection/session status and last successful activity
- Last error category/time and safe diagnostic message
- Message counts and delivery/failure counts if the provider exposes reliable status data
- Pending/failed jobs and retry status where the existing queue supports them
- Provider health and relevant rate-limit signals
- Safe retry/reconnect actions only if already supported by backend services

Security:
- Never display session secrets, tokens, raw authentication material, or private message content unnecessarily.
- Do not log full customer messages, access tokens, or sensitive payloads by default.
- Enforce tenant isolation for all WhatsApp sessions, webhooks, jobs, and message records.
- Rate-limit retries and avoid retry storms. Use backoff and idempotency where appropriate.
- If a status cannot be verified from the provider, label it as unknown rather than assuming success.

### 9. System operations and health

Add a practical operations view based on actual observability capabilities:

- API health/latency/error rates
- Database connectivity and migration status where safely available
- Background scheduler/worker heartbeat and failed jobs
- WhatsApp provider status
- AI provider availability/errors
- Storage/backup status only if the system can verify it
- Recent deployment/version information if available

Requirements:
- Never expose environment variables, stack traces containing secrets, database URLs, API keys, or internal credentials.
- Provide sanitized errors with a trace/correlation ID for investigation.
- Add retry/re-run controls only for safe, idempotent jobs and require confirmation for risky operations.
- Do not run destructive maintenance operations directly from the browser.
- Add alerts/thresholds only where reliable metrics exist. Do not create fake health indicators.

### 10. Support, notes, and audit trail

Add a searchable activity timeline per tenant and a platform-wide audit view.

Record relevant events, including:
- Tenant status and plan/limit changes
- Payment approval/rejection
- AI credit top-ups, debits, reversals, and manual adjustments
- Admin login/security events where supported
- WhatsApp reconnect/retry operations
- Role/permission changes
- Feature-flag changes
- Data exports, deletion requests, and destructive actions

Each audit event should capture actor ID, action, target tenant/resource, timestamp, outcome, and safe metadata/reason. Avoid secrets and unnecessary personal data. Restrict audit access to authorized roles and do not permit ordinary users to edit or delete audit records.

Support history should allow internal notes and status tracking without exposing internal notes to tenants. If a ticketing system already exists, extend it rather than creating a duplicate.

### 11. Feature flags and controlled rollout

Where useful, support tenant-specific feature flags for staged rollout, beta access, or temporarily disabling a problematic feature.

- Server-side enforcement is mandatory; hiding a frontend button is not access control.
- Record who changed a flag, its previous/new state, scope, reason, and time.
- Default to safe/off for new risky features.
- Ensure flags cannot bypass authentication, tenant isolation, payment rules, or security controls.

### 12. Roles and security

Inspect current authentication and roles before implementing. Use least privilege and server-side authorization.

At minimum, distinguish platform-owner/super-admin access from tenant-owner/admin/staff access. Add narrower permissions for sensitive operations where the current architecture supports them.

Security checklist:
- All platform-admin endpoints require authenticated platform-admin authorization.
- Tenant-facing endpoints always resolve tenant scope from trusted server-side authentication/context.
- Validate ownership/scope on reads and writes; never rely on a tenant ID from the request body alone.
- Enforce tenant isolation at the service/query layer and use database row-level security if it is already part of the architecture.
- Validate and sanitize input; use parameterized queries/ORM protections.
- Add rate limits to login, sensitive actions, payment submissions, and AI usage as appropriate.
- Use CSRF protection where relevant to the authentication/session model.
- Store secrets in environment/secret-management services; never commit credentials.
- Require re-authentication or stronger confirmation for especially sensitive actions if supported.
- Make destructive operations reversible where practical; otherwise require explicit confirmation and log the reason.
- Use safe error responses; never return debug traces to production users.
- Implement backup/restore procedures and test restoration; a backup indicator must represent verified status, not merely a scheduled command.
- Define data retention/export/deletion rules and protect customer data.
- Add tests for cross-tenant access attempts and unauthorized platform-admin access.

### 13. Reliability, database, and API design

- Follow existing FastAPI/backend patterns, model conventions, migration framework, response schemas, and error handling.
- Keep business logic in services rather than duplicating it in route handlers or frontend code.
- Add appropriate indexes for tenant IDs, status, dates, and ledger lookups based on real query patterns.
- Use database transactions for multi-step financial/credit changes.
- Make background jobs idempotent and safe to retry.
- Add pagination and bounded date ranges to potentially large audit/usage queries.
- Avoid N+1 queries and loading all tenants/events into the browser.
- Preserve compatibility with existing data; migrations should be safe and have documented rollback considerations.
- Do not invent endpoints/models before checking whether equivalent functionality already exists.

### 14. Frontend behavior

For each page, implement:
- Responsive layout
- Search/filter/sort/pagination where useful
- Loading skeleton or progress state
- Empty state with a useful next action
- Error state with safe retry
- Form validation and clear success/error messages
- Confirmation dialog for high-impact actions
- Permission-aware action visibility, backed by server authorization
- Accessible labels, focus states, and keyboard support
- Consistent design tokens and reuse of existing components

Do not display sample/mock data as real production data. If development fixtures are necessary, keep them clearly separated from production.

### 15. Testing requirements

Add or update tests for:
- Platform-admin authorization and tenant-user denial
- Tenant isolation on every new read/write path
- Tenant search/filter/pagination
- Subscription status transitions and date/limit calculations
- Payment approval/rejection and duplicate approval prevention
- Atomic AI credit debit/top-up/reversal and insufficient balance
- Failed AI request credit behavior
- Audit-event creation for sensitive operations
- WhatsApp status/error handling and safe retry behavior
- Feature-flag authorization and server-side enforcement
- Input validation, safe errors, and rate limits where applicable
- Responsive UI states and existing critical workflows

Run the relevant unit, integration, migration, and frontend tests available in the repository. If tests require external credentials/services, report which ones could not be run; do not fake success. Run formatting/lint/type checks if configured.

### 16. Delivery approach and priority

Work in phases; do not attempt an unsafe all-at-once rewrite.

**Phase 0 — Audit and plan (mandatory)**
- Inspect existing code and map requirements to current features.
- Document gaps, risks, database changes, API changes, and test plan.

**Phase 1 — Solo-user MVP (highest priority; complete before platform Control Panel)**
- Owner login and first-run business setup
- Verify/fix the end-to-end customer → order → bill → payment/status → delivery workflow
- Preserve existing billing, staff, WhatsApp/WAHA, AI, and business settings
- Confirm server-side business scoping, owner/staff permissions, and cross-business access tests
- Fix critical mobile UI blockers and verify existing regression tests
- Meet the Solo-user acceptance criteria in Section 1A, or explicitly document any blocked criterion

**Phase 2 — Secure platform-owner core**
- Platform-admin authorization and tenant list/profile
- Tenant status/plan/limit management
- Server-side tenant isolation
- Audit events for sensitive changes
- Responsive tenant workspace matching the SVG reference

**Phase 3 — Money and credits**
- Subscription lifecycle
- Manual payment verification or existing gateway integration
- AI credit ledger, atomic transactions, idempotency, and usage history

**Phase 4 — Operations**
- WhatsApp/integration health
- System health and safe job/error views
- Support history and feature flags

**Phase 5 — Scale and polish**
- Reporting, alerts, retention/export/deletion workflows
- Performance tuning, backup restore verification, accessibility, and security hardening

After each phase:
1. Summarize files changed and why.
2. List migrations and API changes.
3. Run tests and report exact results.
4. Identify risks and manual verification needed.
5. Keep changes on a dedicated feature branch and create/update a pull request.
6. Do not merge or deploy without explicit authorization.

### 17. Final expected output from the coding AI

At the end of the work, provide:
- Current-state audit and implemented-vs-pending matrix
- Updated architecture and navigation summary
- List of API routes, services, models, migrations, and UI files changed
- Security decisions and tenant-isolation approach
- Test commands and actual pass/fail results
- Known limitations and manual setup steps
- Ordered remaining backlog
- Screenshots or visual evidence for major responsive pages if supported

**Start by auditing the current repository and existing tenant workspace mockup. Then implement Phase 0 and Phase 1 (Solo-user MVP) first. Do not start platform-owner Control Panel features until the solo-user acceptance criteria pass or blockers are documented. Do not start with a wholesale rewrite.**
