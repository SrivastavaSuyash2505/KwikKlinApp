# Kwik Klin — Laundry Order Creation & Billing UI Prompt

> **Purpose:** Give this prompt to Claude Code, Codex, or another coding agent to implement a working mobile-first laundry order creation and billing flow in the existing Kwik Klin application.
>
> **Repository:** `Suyash0225/KwikKlinDasboard`
>
> **Reference:** User-provided Blinkit home/checkout screenshots. Use them only as UX inspiration for clear cards, scheduling, quantity controls, checkout summaries, and sticky actions. Do not copy Blinkit branding, logo, exact assets, or product images.

## Critical context

This is part of the **Solo-User MVP** and should be prioritized before platform-owner multi-tenant Control Panel features. The daily-use workflow for one laundry business must work end-to-end first.

Inspect the existing React/Tailwind frontend, FastAPI backend, PostgreSQL models/migrations, customer/order/billing/payment logic, staff permissions, WhatsApp/WAHA integration, media registry, and tests before coding. Reuse existing functionality. Do not build a second, parallel billing system or replace working screens with static mockups.


## Visual reference interpretation — follow this, do not guess

The user supplied three mobile screenshots from Blinkit as visual inspiration. If those screenshots are attached in the coding-agent session, inspect all three before implementation. If they are not available to the coding agent, do not claim to have seen them; follow the explicit mapping below and ask the user to attach/copy the screenshots before final visual matching.

### Reference 1 — Home/category screen
Use only the broad visual principles:
- Mobile-first layout with clear top-level context and strong search/discovery affordance.
- Horizontal, scrollable category chips/cards.
- Promotional/category cards with rounded corners and generous spacing.
- Clear visual hierarchy rather than a dense admin form.

**Kwik Klin translation:** Show the selected customer/order context at the top, then horizontally scrollable laundry service categories (Wash & Fold, Wash & Iron, Dry Cleaning, Iron Only, etc.) and garment selection cards. Do not add grocery search, festival banners, brand logos, or unrelated promotional content.

### Reference 2 — Checkout product list
Key elements to emulate:
- Compact but readable product cards.
- Optional product thumbnail/icon on the left.
- Garment/service name and short supporting details in the middle.
- Price and a prominent green minus / quantity / plus control on the right.
- Subtle separators between items.
- A sticky bottom action bar showing a live count/total and one clear next action.

**Kwik Klin translation:** Each card represents a garment + service line, not a grocery product. Example: “Shirt · Wash & Iron”, configured price per piece, quantity control, and line subtotal. The sticky bar should say something like “4 garments · ₹320” and “Review Order”. Amounts are examples only.

### Reference 3 — Checkout extras and payment footer
Key elements to emulate:
- Separate rounded cards for optional extras, instructions, and policy information.
- A fixed/sticky bottom summary with payment/order total and a strong primary action.
- Clear separation between the main scrollable content and the bottom action area.
- Simple selection chips/buttons for optional choices.

**Kwik Klin translation:** Use distinct cards for pickup/delivery instructions, stain/care notes, discount (if supported), advance payment, remaining balance, delivery assignment, and cancellation/order policy (only if an actual policy exists). The bottom bar should summarize the current order total and provide “Save Order & Generate Bill”. Do not add donations, delivery tips, gift wrapping, grocery items, or unsupported payment integrations.

### Visual acceptance rules
- Match the *interaction patterns and hierarchy*, not Blinkit's exact colors, branding, copy, assets, or proprietary design.
- Use existing Kwik Klin design tokens and brand identity; keep the green primary action style consistent with the current app.
- At 320px width, garment cards and quantity controls must remain usable without horizontal scrolling.
- The sticky footer must not cover the last card, form inputs, or Android/browser navigation. Add bottom padding to scroll content.
- Show loading, empty, validation, failure, and success states—not just the happy-path mockup.
- Before calling the UI complete, run the app and inspect screenshots at 320px, 375px, and 430px widths. Report actual visual checks performed.
- Do not fabricate data or prices in production UI. Use existing backend data.

## Goal and workflow

Implement:

**Select Customer → Schedule Pickup → Select Garments & Services → Add Order Notes → Review Pricing → Schedule Delivery & Assign Staff → Confirm Order → Generate Bill → Share Bill via Existing WhatsApp Flow**

The interface is for the owner/admin, manager, and authorized staff. Show actions based on roles, and enforce all permissions on the backend.


## End-to-end business workflow recommendation — required

The order workflow must support both common real-world cases:

### A. Pickup booking first (customer's clothes are not yet received)
1. Select/create customer and confirm address.
2. Record preferred pickup date/time and assign pickup staff if known.
3. Record an **estimated** garment count or notes only; do not present estimated quantity/pricing as a confirmed final bill.
4. Save as a pickup booking / draft using existing status conventions.
5. When clothes are collected and counted, staff opens that booking, confirms actual garments/services/quantities, and calculates the final amount.
6. Generate the final bill only when the required details are confirmed under existing business rules.

### B. Walk-in / clothes already received
1. Select/create customer (or use existing walk-in customer flow if supported).
2. Skip pickup scheduling when not required.
3. Add actual garments, services, and quantities.
4. Review the calculated total and record advance payment if received.
5. Set expected delivery date and assign delivery staff if appropriate.
6. Confirm order, generate bill, and share it through the existing WhatsApp flow.

### Shared rules
- Pickup scheduling must be optional for walk-in orders.
- Clearly distinguish booking/draft, clothes received, confirmed order, processing, ready, out for delivery, delivered, and cancelled states; reuse current status values where possible rather than introducing incompatible duplicates.
- Never treat estimated garment counts as confirmed quantities.
- Never generate a final bill from unconfirmed estimates unless existing business policy explicitly allows it.
- Allow authorized staff to update the actual garment list after pickup, preserving an audit/history trail if the application supports it.
- Keep the order/customer context intact when moving between steps.
- The workflow must be quick enough for daily use: optimize common actions and avoid unnecessary mandatory fields.

## 1. Customer selection

- Search existing customers by name, phone number, or supported customer code.
- Show concise customer information and saved addresses; mask phone numbers where appropriate.
- Provide recent customers and an “Add New Customer” action.
- Allow selecting an existing address or adding a new one.
- Show previous dues only when supported and authorized, clearly separate from the new order amount.
- Validate duplicate customer creation using existing business rules.
- After selection, continue into order creation with the selected customer and address retained.

## 2. Pickup scheduling

Build a clear, card-based section inspired by the reference checkout's delivery-time card.

Fields:
- Pickup date.
- Available pickup time slot.
- Pickup address.
- Assigned pickup person/delivery staff.
- Pickup instructions.
- Optional customer-preferred time.

Example visual structure (slot labels are illustrative; use actual business availability):

**Schedule Clothes Pickup**
- Customer: selected customer
- Pickup date: [Choose date]
- Time: [Available slot chips]
- Pickup person: [Select staff]
- Instructions: [Optional text]
- [Save & Continue]

Do not hardcode sample slots. Respect configured business hours, existing scheduling rules, and staff availability if available. Keep pickup and delivery staff assignments independent.

## 3. Garment and service selection

This is the core of the UI. Make garment selection fast, thumb-friendly, and usable on small phones.

Use configurable service categories based on existing data, for example:
- Wash & Fold
- Wash & Iron
- Iron Only
- Dry Cleaning
- Premium Garment Care
- Blanket & Bedsheet
- Curtains
- Shoes & Bags
- Other Services

Do not assume these exact categories or prices already exist. Load configured categories, garments, and prices from the existing backend.

Each garment line/card should include:
- Garment name and optional icon/image.
- Selected service.
- Configured per-piece or applicable pricing basis.
- Quantity decrement/increment controls.
- Line subtotal.
- Optional special-care note.
- Remove action.

Example only:
- Shirt — Wash & Iron — [−] 2 [+] — ₹60
- Trouser — Dry Cleaning — [−] 1 [+] — ₹120
- [+ Add More Clothes]

All displayed amounts are illustrative. Use real configured prices and backend-calculated totals.

Include:
- Search garments by name.
- Filter by category/service.
- Quick-add common garments where supported.
- Multiple services for different garments.
- Custom garment/service entry only if compatible with existing business rules.
- Preserve selected items when navigating between steps.
- Show selected item count and a live subtotal.

Use a sticky bottom summary/action bar such as **“3 items · ₹180 · Review Order”**. It must not obscure form fields, browser controls, or Android navigation.

## 4. Order notes and garment condition

Allow optional:
- Order-level notes.
- Stain/damage notes.
- Special washing/care instructions.
- Customer preferences.
- Garment condition notes.
- Estimated weight if the current business supports weight-based pricing.
- Before-cleaning photos if supported.

Use existing secure media storage and tenant/business-scoped authorization for photo uploads. Avoid making optional fields mandatory.

## 5. Pricing, discount, and payment summary

Create a clean checkout-style summary card showing:
- Garment/service subtotal.
- Pickup/delivery fee, if configured.
- Valid discount/coupon.
- Applicable tax, if configured.
- Current order total.
- Advance payment received.
- Remaining balance for this order.
- Existing customer dues shown separately.

Example (illustrative only):
- Order subtotal: ₹500
- Delivery fee: ₹0
- Discount: −₹50
- Current order total: ₹450
- Advance paid: ₹100
- Remaining for this order: ₹350

Requirements:
- Calculate totals using established backend business rules.
- Recalculate the UI when quantities/services change, but the backend remains authoritative.
- Never trust client-submitted prices, discounts, taxes, or totals.
- Clearly distinguish current order charges from previous unpaid dues.
- Use existing payment methods and payment-recording workflow.
- Do not mark an order paid unless payment has been recorded according to existing rules.
- Show eligible offers only if offer rules already exist; do not invent unsupported promotions.

## 6. Delivery schedule and assignment

Provide a separate delivery card with:
- Estimated completion date.
- Delivery date.
- Delivery time slot where supported.
- Assigned delivery person/staff.
- Delivery address.
- Delivery instructions.
- Priority only if supported.

Respect existing turnaround rules, working days, Sundays, and configured holidays. Do not promise unavailable slots or assign unavailable staff if that information is tracked. Permit authorized staff to update the schedule and assignment later.

## 7. Final review before saving

Display a full summary:
- Customer and selected address.
- Pickup date/time/person.
- Garments, services, quantities, line totals.
- Notes and care instructions.
- Subtotal, discounts, fees, tax if applicable, final order amount.
- Advance payment and remaining balance.
- Expected delivery date/time/person.

Actions:
- [Back to Edit]
- [Save Order & Generate Bill]

Warn before leaving with unsaved changes. Disable repeat submissions while a request is in progress, but also implement server-side idempotency/duplicate protection.

## 8. Successful order confirmation

After the backend confirms the transaction, display:
- Success state.
- Actual generated order/bill number.
- Customer.
- Order total and payment status.
- Expected delivery date.
- [View Bill]
- [Share Bill on WhatsApp]
- [Print Bill] if supported
- [Create Another Order]

Use persisted backend values, never fabricated examples. Integrate with the existing WhatsApp/WAHA implementation. Opening WhatsApp is not proof of message delivery; show delivery status only when reliable provider status exists.

## 9. Visual and responsive design

Use the reference screenshots as interaction inspiration:
- White rounded cards on a light neutral background.
- Clear section titles and readable labels.
- Kwik Klin's existing brand tokens and green primary actions where appropriate.
- Compact garment cards with obvious quantity controls.
- Distinct schedule, order-summary, and payment sections.
- Sticky bottom action bar for mobile.
- Responsive tablet and desktop layouts.
- Clear validation, loading, empty, error, and success states.
- Accessible labels, keyboard focus, sufficient contrast, and touch targets.
- Avoid horizontal overflow on 320px+ screens.

Must work in the existing mobile web UI and Electron desktop wrapper. Do not introduce another frontend framework unless the current architecture requires it.

## 10. Role-based permissions

**Owner/Admin:** Create/edit orders, manage pricing/discounts according to current permissions, assign staff, view payment details, and generate/share bills.

**Manager:** Create orders and manage scheduling/assignments within granted permissions; view only authorized payment/order information.

**Delivery staff:** Access assigned or explicitly authorized tasks, customer address and necessary pickup/delivery instructions, and permitted status updates. Do not expose unrelated customer records, business-wide financial reports, or owner-only controls.

Enforce access on the server. Hiding a frontend button is not authorization.

## 11. Backend and data integrity

- Inspect and reuse existing customer, order, garment/service, bill/invoice, payment, staff, scheduling, and media models.
- Follow existing FastAPI routers, service layer, schemas, and migration conventions.
- Use a database transaction for order creation and associated bill/payment records.
- Ensure order/bill numbering is safe under concurrent requests.
- Add idempotency or equivalent duplicate prevention for retries/double taps.
- Keep business/tenant scoping server-derived and consistent across every endpoint.
- Prevent IDOR/cross-business access to customers, orders, bills, payments, staff, and media.
- Return safe, actionable errors; avoid partially saved inconsistent orders.
- Add migrations only when needed and document rollback considerations.
- Do not expose secrets or sensitive customer information in logs.

## 12. Test requirements

Add/update tests for:
1. Existing customer → order creation.
2. New customer → order creation and duplicate prevention.
3. Multiple garments, quantity updates, service changes, and line totals.
4. Invalid discount and manipulated client-side totals.
5. Pickup/delivery scheduling and independent staff assignment.
6. Working-day/holiday calculations.
7. Advance payment, current order balance, and previous dues separation.
8. Bill generation with real saved order data.
9. Duplicate submission/idempotency.
10. Existing WhatsApp share flow and truthful delivery-status handling.
11. Owner/manager/delivery staff permissions.
12. Cross-business access denial.
13. Photo/media authorization where applicable.
14. Mobile layout at 320px, 375px, and 430px.
15. Regression of existing billing, order, staff, WhatsApp, and solo-user workflows.

Run the available backend/frontend tests, migration checks, lint/format checks, and report exact results. Clearly state any tests blocked by missing services or credentials; never fabricate test success.

## 13. Delivery approach

1. Audit the current code and identify reusable components, APIs, and blockers.
2. Provide a brief implementation/status matrix.
3. Implement the end-to-end mobile UI in small stages.
4. Connect every action to real backend services; do not stop at a static mockup.
5. Run tests and fix regressions.
6. Report files changed, API/schema/migration changes, tests run, results, and remaining gaps.
7. Keep changes on a feature branch.
8. Do not merge or deploy without explicit approval.

**Acceptance condition:** An authorized solo-business user can select a customer, schedule pickup, add garments/services and quantities, review accurate pricing, assign pickup/delivery staff, save an order, generate a bill, and share it using the existing WhatsApp workflow—without breaking current data or security.
