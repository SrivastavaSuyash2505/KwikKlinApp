# Solo Washerman — audit and build status

Companion to `docs/PRODUCT_PLAN_SOLO_WASHERMAN.md`, `docs/HIGH_MODEL_IMPLEMENTATION_PROMPT.md` and `docs/SOLO_WASHERMAN_RELEASE_CHECKLIST.md`.
Each row cites the code path and the tests behind it.

**Branch:** `feature/solo-app`, stacked on `feature/solo-plan` (PR #324).

**Status labels:**
- *done*: built and tested in this branch
- *existing*: already in the codebase before this branch
- *partial*: some of it is in place; the row says what is missing
- *missing*: not built

## 1. Plan matrix (§2)

| Requirement | Status | Where | Tests |
|---|---|---|---|
| Starter ₹300 / Pro ₹500 plans | done | `app/services/plans.py` (`solo` = "Solo Starter", `solo_pro` = "Solo Pro"). Internal codes `starter`/`pro` already mean Basic ₹999 / Premium ₹1,999, so the solo plans keep their own codes. | `tests/test_solo_plan.py` |
| Mobile owner app, no dashboard | existing | `app/static/solo.js` on top of `staff.js` (owner seat); `account.py` blocks the dashboard for `solo_app` plans | `tests/test_solo_mobile.py` |
| New bill, rate × qty | existing | Staff app bill wizard (`showNewBill`). Being restyled for every role on `feature/bill-ui-v3` by another session. | bill wizard tests |
| Status Received → Washing → Ready → Delivered | existing | `solo_owner.py /orders` with a one-tap next step | `tests/test_solo_app.py` |
| Customer directory + order history | done | `GET /staff/api/owner/customers`, `/customers/{ref}`; Customers screen in `solo.js` | `tests/test_solo_owner_screens.py` |
| Paid, balance, customer ledger | done | `/customers/{ref}` returns bills, paid, due and payments (method, time, bill no.) | same |
| Today's orders, sales, collections | done | `GET /staff/api/owner/today` (billed, collected by method, new dues); home tile | same |
| WhatsApp share / bill link | existing | `/b/{token}` bill page; staff app Share | `tests/test_bill_link.py` |
| Monthly sales + dues report (Starter: basic, Pro: detailed) | done | `GET /staff/api/owner/reports`; Pro adds by-service, top 5 customers, day by day (feature `solo_reports_detailed`) | `tests/test_solo_owner_screens.py` |
| Customer order-status link: Pro only | partial | Feature key `order_status_link` exists, but `/b/{token}` still shows live status on every plan. Gating it means editing the public bill template; left for a separate change. | — |
| PDF: basic vs print-friendly | partial | Thermal and bill pages exist for both plans; no plan difference yet | — |
| Rate card: basic vs full | partial | Owner can edit, add and switch off rates on both plans; no plan difference defined yet | `tests/test_solo_app.py` |
| AI quota + usage visible to owner | done | Plan/AI card on home and the plan screen (`solo.js` `planCard`/`aiBlock`) | `tests/test_solo_ai_replies.py` |

## 2. AI reply quota (§3)

| Requirement | Status | Where |
|---|---|---|
| Unit = one AI-written reply actually sent | done | `app/services/ai_replies.py`: counted on `_send_customer_agent_reply` (`customer_agent_reply`) and the human-handoff reply. Deterministic order-status answers (no LLM) are not counted and still go out at the limit. |
| Sent, failed and blocked tracked separately | done | Table `ai_reply_usage` (tenant, IST month) |
| Atomic, cannot overshoot | done | One `INSERT … ON CONFLICT DO UPDATE … WHERE sent < limit`. A failed send gives the slot back (`release`). Tests run on one shared connection, so they check the limit edge in sequence, not real parallel sends. |
| Checked before the model call | done | `can_reply()` in `webhook.py` and `human_handoff.py` before `build_ai_reply` |
| Fail closed when the tenant is unknown | done | `reserve(None)` returns False; a plan with a limit returns False on a DB error. Plans without a reply limit still reply. |
| 80% / 100% alerts, once a month | done | `alert_80_at` / `alert_100_at`. Audit actions `ai_reply_quota_80` / `_100` for the vendor; web push to the owner seat; red banner on the owner home |
| Billing and manual replies unaffected | done | The limit only gates the automated AI reply path |
| Vendor edits per-plan quota without a deploy | done | Table `plan_configs`; `GET/PUT /control/api/plan-configs[/code]` (danger-level key); "Solo plans · AI replies" section in `control.js`. 60 s cache per worker. |
| Per-shop override, audited | done | `ai_reply_limit` added to `/control/api/tenants/{slug}/limits` (existing `limits_overridden` audit); Usage tab field |
| Pause AI per plan / per shop | done | `ai_replies_paused` per plan; override `0` per shop; owner's own Agent switch shows as "off" |
| Hard monthly spend cap per shop | existing | `quota.check_ai_quota`: `llm_monthly_budget_usd`, reservations, daily request cap |
| Usage table in the control panel | done | Used/limit, left, failed, blocked and alert times per shop this month |
| Opt-out, quiet hours, dedup | existing | `whatsapp.send_message` and the inbound webhook dedupe (`wa_message_id` unique) |

## 3. Owner UI (§4)

- Home shows five actions: **New bill** (big button), **Orders**, **Customers**, **Pending payments**, **Today's sales**. Each tile shows its live number.
- Below the actions is the plan card: plan, price, renew/trial date, AI replies used/included/left, refill date and state (On / Running low / Limit reached / Paused / Turned off).
- Hindi is the default with an English toggle. Every new string is in both languages in `solo.js` `S`.
- New CSS is in `staff-ui2.css` (`.so-act`, `.so-plan`, `.so-state`, `.so-alert`, `.so-day`). Three-column tiles fall back to two columns at 360px and below.

## 4. Not done yet (next phases)

1. Gate the live status on `/b/{token}` to Pro (`order_status_link`), plus a Pro print layout.
2. Phase 5 of the plan: payment/subscription self-serve for Solo (Razorpay flow exists for other plans), and the overdue/expired read-only policy.
3. Phase 1 of the prompt, tenant-isolation audit:
   - `ai_reply_usage` has RLS and a cross-shop test (`test_one_shops_count_never_shows_in_another`).
   - The wider canary/AI-isolation suite and the load test are not started.
   - `tests/test_data_isolation.py` and `tests/test_rls_billing.py` only pass with the non-superuser `kk_app` role used in CI.
4. Cost measurement per shop (pilot): AI and WhatsApp cost per shop are already logged (`llm_usage`, conversations). No per-plan margin report yet.

## 5. Migrations

`alembic/versions/20261029_solo_plan_quota.py` adds two tables:
- `plan_configs`: platform-wide, no RLS.
- `ai_reply_usage`: tenant-scoped, with the same `tenant_isolation` RLS policy as other tenant tables.

Both are additive. Downgrade drops both tables.
