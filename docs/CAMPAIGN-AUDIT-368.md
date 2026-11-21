# Campaign audit, issue #368

Audited at `201f0e4` (origin/main). Evidence is from this code, a local PostgreSQL 15 run
with the non-superuser `kk_app` role, and a mocked provider. **Production data was not
read**, so the cause of the original campaign is narrowed down but not identified.

## The reported bug: 36 selected, 6 sent

Each path below was reproduced on the unchanged code with 36 recipients through the real
`send_message` and policy, with only WAHA mocked. Every one that completed showed the
campaign as `sent`.

| # | Trigger | Old result | Now |
|---|---|---|---|
| A | Other shops' sends count against this shop's budget | 6 sent, 30 `skipped: budget_hit` | 36 sent |
| B | 30 customers never messaged the shop | 6 sent, 30 `failed` after a preview that said 36 | Preview says 6; 30 `skipped: never_messaged` |
| C | WhatsApp session drops after 6 | 6 sent, 30 `failed` | `paused`, 30 `queued`, resume finishes 36 |
| D | Provider timeout after 6 | Worker crashes (`MissingGreenlet`), stuck on `sending` | 3 `uncertain`, `paused`, 27 `queued` |
| E | Daily cap reached after 6 | 6 sent, 30 `failed` permanently | `paused` until tomorrow, 30 `queued` |
| F | 30 names not saved | 6 sent, 30 `skipped: name_not_saved`, reason hidden in the preview breakdown | Every skip reason shown |

The history card also hid the shortfall: it showed `queued || sent`, so a finished campaign
read "Recipients 6".

To find which path hit the real campaign, run the query in `docs/CAMPAIGNS.md`. The `detail`
column names it: `budget_hit`, a `promotional send blocked: ...` text, or `session down`.

## Findings

Confirmed unless marked otherwise.

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| Critical | `campaign_recipients` had no `tenant_id` and no RLS. Budget counted across all shops, and `/campaigns/overview` returned platform-wide totals | `marketing.month_send_count`, `agent_admin.campaigns_overview`, `pg_class.relrowsecurity = f` | Migration adds `tenant_id`, backfill, forced RLS |
| High | Temporary stops wrote permanent `failed`, then the campaign showed `sent` | `send_campaign` | Pause with reason |
| High | Timeout crashed the worker: `_enqueue_outbound` rolls back, later attribute access fails | Scenario D | No ORM object survives a round; `enqueue_on_fail=False` |
| High | Preview and send used different rules: never-messaged, frequency and complaint flags | `_campaign_verdicts` vs `outbound_policy` | One gate; the flags that had no effect are gone |
| High | Hourly resume started a second worker on a running campaign | `scheduler` resume loop | Atomic worker lease |
| High | A held claim after a crash became `skipped`, reading as "nothing was sent" | `duplicate_send_claim_suppressed` | `uncertain` |
| High | Transient campaign sends entered the blind `outbound_queue` retry while the row said `failed` | `send_message` default | Not queued; row is the record |
| Medium | Resumed worker with 0 new sends turned a `sent` campaign into `failed` | `sent_now` | Counted from all rows |
| Medium | Missing image silently sent text only | `media_path.exists()` | Pause `creative_missing` |
| Medium | Double approve could queue twice; cancel overwrote `sent` and left rows `queued`; bad ids gave 500 | `approve_campaign`, `cancel_campaign` | Atomic moves, 409, 400 |
| Medium | Deactivated selected customers vanished with no row | `queue_campaign` | `skipped: inactive` |
| Medium | Upload trusted the client content type, read the whole body, and had no pixel limit (both panels) | `upload_campaign_image`, `sales.save_image` | Real format, read cap, 40 MP limit |
| Medium | Control: a reply could go out after STOP arrived during the AI turn | `sales._answer`, `_nudge` | Re-read, STOP wins |
| Medium | Control: crash after marking SENT stayed "sent" forever; timeouts burned the list | `sales._send_next` | Marked unknown; pause after 3 |
| Low | `{{name}}` reached customers as `{Aarav}`; unknown variables vanished silently | `render_campaign_text` | Fixed; rejected on save |
| Low | UI promised a 15–20 sec gap, the real gap is 30–60 | `app.js`, `dashboard.html` | Corrected |
| Low | Full phone in `whatsapp_sent` log; provider error text stored in `detail` | `send_message` | Last 4 digits; reason code only |

Checked and found sound: cross-tenant creatives (`_require_owned_creative`), selected IDs
resolved under tenant scope, vendor routes behind `require_vendor_key`, separate
`kk-sales` session, separate prospect tables, STOP handling in control.


## Behaviour changes to know

- Promotions with the frequency or complaint rule "off" no longer exist. Those switches
  never worked: the policy blocked the send anyway. They are now shown locked.
- Monthly budget now pauses the campaign instead of skipping the rest.
- Quiet hours now show as `paused`, not `sending`.
- Fixing the shared budget means each shop now really gets its own 300 a month, so total
  platform sends can rise.

## Not done

- Tenant and control share labels, status, the funnel and the API adapter. The create form,
  audience picker and editor are still separate. The two flows differ too much to merge safely.
- No "retry uncertain" button: an `uncertain` row stays that way.
- No preview fingerprint at approval. An old approval is refused by status, and every
  recipient is rechecked at send, but the count can differ from the review screen.
- Campaigns cannot be edited after saving, only duplicated.
- The customer picker shows 25 at a time, so a large selection takes several searches.
- Keyboard and screen-reader use was not walked through by hand.
- Delivery through a real WhatsApp session was not tested.

Bad variables are validated on create and preview only. AI-suggested drafts skip that check,
but rendering still removes unknown placeholders.
