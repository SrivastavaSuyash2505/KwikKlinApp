# UI Audit and Redesign Record

Audit date: 2 November 2026. Branch: `feat/ui-redesign`, based on `origin/main` at 201f0e4.

Method: a Playwright sweep of 140 role, viewport and section combinations on an isolated database, with real accounts for Owner, Manager, Staff, Solo Starter and Solo Pro. Viewports were 1440, 820, 390 and 320px where each role applies. A separate end-to-end run exercised billing in a touch-emulating browser and created real bills through the existing APIs.

## What the app is

The brief assumed React and Tailwind. The app is hand-written HTML, CSS and JavaScript (about 1.2 MB of JS) served by FastAPI, with no Node toolchain, and its contract tests read those files directly. It was redesigned in place, because a rewrite would have put working features at risk.

| Role | Entry point | Login |
|---|---|---|
| Owner, dashboard Manager | `/admin` → `dashboard.html`, `app.js` | `POST /api/login` |
| Staff, staff-table Manager | `/staff` → `staff.html`, `staff.js` | `POST /staff/api/login` |
| Solo Starter, Solo Pro | `/solo` → same shell with `solo.js` | `POST /api/login`, then `/api/solo/app-session` |
| Vendor | `/control` | `POST /control/api/session` |

"Manager" exists in two role systems: `users.role` and `staff.role`.

Solo Pro adds `order_status_link`, `solo_reports_detailed` and `customer_location`, plus higher limits (`app/services/plans.py`). The server enforces these. This redesign does not change any plan, limit or permission.

## Findings

| # | Area | Finding | Status |
|---|---|---|---|
| 1 | Design | Orange primary conflicted with the navy chrome, and over 100 hard-coded orange values bypassed tokens | Fixed |
| 2 | Design | `ui-v2.css` silently redefined `tokens.css`, so surfaces drifted apart | Fixed |
| 3 | Design | Emoji in dashboard filters and order actions rendered differently per device | Fixed on the dashboard; see open issues |
| 4 | Accessibility | `.chip` and `.taskcard` used a gradient as an outline colour, which is invalid, so keyboard focus was invisible | Fixed |
| 5 | Billing | "Usually gives" chips had no remove control, and tapping a selected chip did nothing | Fixed |
| 6 | Billing | Chip tap was also the only add path, with no separate Add action | Fixed |
| 7 | Billing | Chip tap forced focus on quantity, opening the keyboard and moving the page | Fixed |
| 8 | Billing | Piece counts used a decimal keyboard, and 27 inputs set no `inputmode` | Fixed |
| 9 | Billing | Admin kept showing the previous customer's chips until the new fetch returned | Fixed |
| 10 | Billing | Cart re-render could reset page and chip-row scroll | Fixed with `KKBill.keep` (page) and `KKDS.keepScroll` (chip rows) |
| 11 | Billing | Save as Draft did not exist, and the server has no draft concept | Added on-device; see open issues |
| 12 | Billing | Primary bill button had a pink glow | Fixed |
| 13 | Touch | Several small controls were under 40px on phones | Fixed; see open issues |
| 14 | Solo | Stretched to a 780px layout on large screens | Fixed: 480px phone column |
| 15 | Layout | Horizontal overflow | None found before or after |
| 16 | Billing | Adding a custom item already on the rate card returned 409 and left the modal open | Fixed: the existing item joins the bill, the modal closes and a notification shows |
| 17 | Billing | "No match" opened a dropdown that covered the next field and stayed open | Fixed: inline hint, and suggestions close on an outside tap or the next field |
| 18 | Polisher | "Send & notify" shrank on phones and its text was cut off | Fixed: full width on phones, and buttons no longer shrink in flex rows |

## Billing behaviour now

- Each selected usual item shows its own × button, which removes only that item from the bill.
- Unselected items show ＋ and add one piece. `＋ Add` is separate and opens a searchable list, most-used first. Items added this way stay as chips while they are on the bill.
- Choosing a customer or item never opens the keyboard, including by-weight items, which use − and + buttons. The keyboard opens only when a field is tapped.
- Item search is a dropdown: arrows, Enter and Escape work on desktop, and the list and page stay where they are.
- On wide screens the existing sticky order summary holds Save as draft. Phones keep the summary bar with a Draft button.
- Bill calculations and `POST /orders` and `POST /staff/api/bills` are unchanged.

## Verification

- Full test suite: 2,125 passed, 13 skipped, 17 failed. The same 17 fail on a clean `origin/main` with the same local settings, so the branch adds no regressions. They depend on local settings; the row-level security tests, for example, need CI's non-superuser database role.
- Billing end to end: no failures for Solo Starter at 390px, Solo Pro at 320px, Staff Manager at 390px, and Owner at 1440px and 390px.
- Role sweep: 140 views, no horizontal overflow.

## Open issues

- **Drafts are per device.** They live in `localStorage` for 7 days, scoped to the user, and hold customer names. Staff drafts store only the masked phone number. A cross-device draft needs a server endpoint.
- **Parallel billing work.** Resolved: the search dropdown and chips from the other session were merged onto this branch.
- **Emoji remain** in about 40 places outside the dashboard filters and actions, including modals, Solo KPI cards and staff screens.
- **Small visual targets.** The sweep still counts 57 undersized controls across phone views because it measures visual boxes. Step dots, toggles and dismiss buttons got larger hit areas without growing visually. Others, such as inline links, are unchanged.
- **Expected errors in the sweep.** 18 views log 402 or 403 responses: the plan-gated leads API and the manager-blocked WAHA status. The UI requests them anyway. This behaviour is older than the redesign.
- **Public surfaces are out of scope.** The marketing site, `join.html` and the Google poster generator keep their own styling.
- **Not fully verified.** All 8 Control sections were swept at 1440px and 390px, but its modals and actions were not. Sections were swept, but not every modal was opened. Real iOS and Android keyboards were not tested; touch was emulated in Chromium.
- **App icons changed.** The PWA icons are now blue. Installed apps may keep the old icon until the OS refreshes it.
