# Solo Washerman — security and tenant-isolation audit

Gate 1 of `docs/SOLO_WASHERMAN_RELEASE_CHECKLIST.md`.
- Every claim below cites a code path, a query or a test that was actually run on 2026-10-30.
- "Not verified" means exactly that.
- Load and capacity results are in `docs/SOLO_WASHERMAN_LOAD_TEST.md`.

**Scope:** the Solo product surface:
- owner app: `/staff/api/owner/*` and the staff app it runs in
- public bill link `/b/{token}`
- AI reply path, AI-reply quota tables
- control-panel plan config
- the database policies under all of these

Dashboard-only features were covered only by the existing suite (§3).

## 1. How tenant identity is decided (verified in code)

| Surface | Where the shop comes from | Client can override? |
|---|---|---|
| Owner app / staff app | `staff_auth.current_staff`: session token → `staff_sessions` → staff → `tenant_id` | No — body/query `tenant_id` is never read (`test_tenant_id_in_the_body_never_changes_the_shop`) |
| Dashboard | `auth` session → user → tenant | No |
| Public bill / pay link | HMAC-signed token `bill_link.make(tenant, order)` | No — tampered token → same 404 for every failure |
| WhatsApp webhook | `X-Hub-Signature-256` HMAC (`webhook._signature_valid`, `hmac.compare_digest`), tenant from the receiving phone-number id | No |
| Razorpay | `billing.verify_webhook` (signed); plan becomes active **only** in `billing.handle_event`, never from the browser callback | No |
| Control panel | Vendor key/session, levels read < write < danger; plan config needs danger (`/control/api/plan-configs`) | Shop cookies get 401/403 (`test_a_shop_cannot_change_its_own_plan_or_quota`) |

## 2. Database isolation (verified by query)

- **Tenant tables:**
  - All **43 of 43** tables that carry `tenant_id` have RLS enabled + FORCE + a `tenant_isolation` policy.
  - Query run on the migrated `laundry_rls` database: `pg_class.relrowsecurity`, `relforcerowsecurity`, `pg_policy`.
  - This includes the new `ai_reply_usage`.
  - The guard test `test_every_tenant_table_has_an_rls_policy` fails if a future table forgets it.
- **Tables without `tenant_id` (11):**
  - `admin_keys`, `alembic_version`, `kpi_snapshots`, `plan_configs`, `tenants`, `login_sessions`, `sent_events` are platform tables or keyed by user.
  - Three of them hold shop data — see finding M1.
- **RLS enforced for real:**
  - The local `laundry` role is a superuser (RLS is bypassed for it).
  - So the whole suite was re-run as a **NOSUPERUSER, NOBYPASSRLS** role (`kk_rls_test`) on a disposable database, in the same CI mode as `.github/workflows/tests.yml`.
  - Result: **1,449 passed, 1 failed, 8 skipped**.
  - The failure is `test_growth::test_next_action_is_timed_by_rhythm_and_gated`, an IST date-boundary test that fails after 18:30 UTC on any role.
  - The run includes `test_data_isolation.py` and `test_rls_billing.py`, which are skipped or fail under a superuser.

## 3. Cross-shop tests run

| Test | What it proves | Result (NOSUPERUSER role) |
|---|---|---|
| `test_solo_isolation::test_owner_cannot_reach_another_shops_customers_orders_or_bill` | Shop B gets nothing from A: guessed customer id → 404; A's bill number → 404 on read and on status change; empty customer search, order search, today, report, dues | pass |
| `…::test_tenant_id_in_the_body_never_changes_the_shop` | `tenant_id` injected in a bill body is ignored; the order lands in the caller's shop | pass |
| `…::test_a_shop_cannot_change_its_own_plan_or_quota` | Shop cookie cannot reach plan config or per-shop limits; extra `plan` / `limit_overrides` fields are ignored; checkout only offers Solo plans | pass |
| `…::test_ai_knowledge_canary_never_reaches_another_shop` | A unique word in shop A's FAQ is retrieved for A (positive control). With A's corpus already cached, shop B gets no FAQ, correction or doc hit and no row. | pass |
| `…::test_ai_reply_usage_rows_are_fenced_by_rls` | Raw SQL with `app.tenant_id = A` sees only A's AI-reply counter (RLS, not the ORM) | pass (skips on a superuser) |
| `test_solo_ai_replies::test_one_shops_count_never_shows_in_another` | Quota usage never shows across shops | pass |
| Existing: `test_data_isolation`, `test_rls_billing`, `test_tenant_isolation`, `test_isolation_new_features`, `test_outbound_retry_tenant_isolation`, `test_lead_attribution_isolation` | Wider API/DB isolation, including retries and lead attribution | pass |

## 4. Findings

Ranked Critical, High, Medium, Low. None is Critical. H2 was found during this audit and is fixed on this branch.

**H1 — Production DB role not verified (High, deployment).**
- RLS is only a real wall if the running app connects as a non-superuser.
- The code supports it: `APP_DATABASE_URL` and `scripts/create_app_role.py`.
- The development container connects as the superuser `laundry`. There, isolation rests on the ORM filter alone. It is good and tested, but it is one layer.
- **Action:** on the server, run `SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user` through the app's URL. It must return `false`.
- Do not onboard outside pilot shops until this is confirmed.

**H2 — Every shop's WhatsApp went out from the vendor's number (High) — FIXED on this branch.**
- **Before:**
  - With `WHATSAPP_PROVIDER=waha`, `whatsapp.send_message` sent every shop's messages through the single home WAHA session (the vendor's own number).
  - The WAHA webhook filed every inbound message under the home shop.
  - So a Solo shop's customers would have received bills from, and replied to, Kwik Klin's number.
- **Now (`services/wa_sessions.py`, migration `20261030_tenant_wa_session`):**
  - The home shop sends from `settings.WAHA_SESSION`.
  - Every other shop sends **only** from its own session `tenants.wa_session`, which the owner links from the app with a pairing code or QR.
  - A shop with no session sends nothing (fail closed; the owner shares the bill instead).
  - Inbound events are routed by their `session` name, and an unknown session is dropped.
- **Tests:** `tests/test_wa_sessions.py`.
- **Requirement:** WAHA 2026.6.1 or newer (Plus features are part of the free image since then). Older WAHA Core runs one session, so connecting a second number fails.

**M1 — Three tables with shop data have no `tenant_id` / RLS (Medium).**
- `order_status_history` (FK → orders), `campaign_recipients` (FK → campaigns, customers) and `outbound_queue` (phone + message payload) are fenced only through their parent rows and application code.
- `webhook_events` also stores raw inbound payloads, but is system-only.
- **Action:** add `tenant_id` + the standard policy in a migration, backfilled from the parent row (or from the payload for the queue).
- The retry path already fails closed on a missing or cross-tenant identity (`test_outbound_retry_tenant_isolation`).

**M2 — Dashboard CSP is still report-only (Medium).**
- The staff/owner app (the whole Solo surface) has an enforced, strict CSP with no inline handlers.
- The laptop dashboard still has inline handlers, so its CSP is `Report-Only` (`routers/admin.py`).
- Solo owners never open the dashboard (`account.py` blocks it for `solo_app` plans), so this does not affect Solo. It does affect staff plans.

**M3 — AI calls and background work run in the web process (Medium, scale).**
- Inbound WhatsApp → AI reply happens inside the webhook request (`webhook.py`).
- Other background work uses in-process tasks (`background.run_after`).
- Durable retry exists only for outbound WhatsApp (`outbound_queue`).
- Scheduled jobs are single-leader (`scheduler_leader.py`, advisory lock), so extra workers do not duplicate them.
- See the load-test document for what this means for 1,000 shops.

**L1 — No per-shop API rate limit (Low).**
- The limit is per IP (`RATE_LIMIT_PER_MIN`).
- AI spend is capped per shop three ways: monthly USD budget with reservations, daily request cap, and the AI-reply quota.
- One noisy shop can still use web capacity. That is acceptable for the pilot; revisit before scale.

**L2 — Knowledge cache invalidation is global (Low, performance only).**
- `knowledge._corpus_cache` is keyed by tenant (verified by the canary test).
- `invalidate()` clears every tenant when any shop teaches the agent. That is correct, but costs a reload elsewhere.

## 5. Other checks

- **Secrets:** only `.env.example` / `.env.dev.example` are tracked. `.env*` is git-ignored. A pattern scan for live Razorpay / Google keys in tracked files found none.
- **Plan lapse never deletes data:**
  - `billing.run_subscription_sweep` only changes `status`.
  - Solo rules are tested in `test_solo_lifecycle.py`:
    - past_due: new bills off, open work on
    - locked: view + pay only
    - a paid webhook switches everything back on
- **Owner sees masked customer phones only:** `solo_owner._mask`. Customer screens are asserted not to contain full numbers (`test_customers_directory_history_and_ledger`).

## 6. Not verified (open)

- Production DB role (H1), production TLS, headers and backups. No access to the server from this environment.
- Backup restore drill and tenant export/deletion.
- Penetration testing by an independent party.
- AI prompt-injection resistance beyond the existing agent tests.

Security cannot honestly be called "100%". The layers above are what is in place and what was tested.
