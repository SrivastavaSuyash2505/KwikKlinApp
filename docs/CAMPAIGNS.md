# Campaigns: rules and states

Two separate systems share only their screens' wording (`app/static/campaign-shared.*`).

| | Shop campaign | Control campaign |
|---|---|---|
| Who | Tenant owner, to its own customers | Vendor, to sales prospects |
| Code | `services/marketing.py`, `routers/agent_admin.py` | `services/sales_outreach.py`, `routers/sales_control.py` |
| Auth | Tenant session + RLS | `require_vendor_key` only |
| WhatsApp | The shop's own session | `kk-sales` session |
| Recipients | `customers`, `campaign_recipients` | `sales_prospects` |

## Recipient states (shop campaign)

| State | Meaning | Sent again? |
|---|---|---|
| `queued` | Waiting. If the campaign is paused, `pause_reason` says why | Yes, gate rechecked |
| `sent` / `delivered` / `read` / `replied` | WhatsApp accepted it, then the receipts | No |
| `skipped` + reason | A rule held it back. Nothing was sent | No |
| `failed` + reason | Rejected, definitely not sent | No |
| `uncertain` + reason | Tried, result unknown (timeout, 5xx, crash) | **Never automatically** |
| `holdout` | Control group, deliberately not sent | No |

## Pause, not fail

A temporary stop leaves rows `queued`, sets the campaign to `paused` and records
`pause_reason`: `no_session`, `quiet_hours`, `daily_cap`, `wa_quota`, `budget_hit`,
`restricted`, `provider_unavailable`, `creative_missing`, `worker_error`, `owner_paused`.

The hourly scheduler resumes a paused campaign when `resume_at` is due. `resume_at` is
empty when only the owner can decide (`budget_hit`, `wa_quota`, `creative_missing`,
`owner_paused`), and after 48 hours paused, so a stale offer does not go out on its own.

Three provider failures in a row pause the campaign, so an outage cannot turn the whole
list `uncertain`.

## Delivery guarantee

At most once per customer per campaign, not exactly once. The order is durable claim,
provider call, row update. A crash between the last two leaves `queued` with a held claim,
and the next worker marks that row `uncertain`. So a message can be missed or unconfirmed,
but is not sent twice. A worker lease on the campaign keeps a second worker off it.
Campaign sends do not use `outbound_queue`, whose retry knows nothing about these rows.

## Customers with active orders

The `active_orders` audience is customers with an order in
`order_service.ACTIVE_STATUSES`, one row per customer, rechecked just before each send.

**An active order is not consent.** This audience always goes through the promotional
path: opt-outs, marketing opt-out, complaints, frequency cap, quiet hours, budgets, and the
rule that a customer must have messaged the shop first. There is deliberately no
"transactional campaign" type. Free-form owner text cannot be proven non-promotional, so
relabelling it would bypass compliance. Real service updates remain the automatic order
status messages in `order_service`, which use the transactional path.

Greetings are exempt from the frequency cap only. Payment reminders are not.

## Investigating a short campaign

```sql
SELECT status, detail, count(*) FROM campaign_recipients
WHERE campaign_id = '<id>' GROUP BY 1, 2 ORDER BY 3 DESC;
```
