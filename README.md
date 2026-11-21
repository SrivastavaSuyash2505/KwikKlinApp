# Kwik Klin — Native Android Staff Application

Native Kotlin + Jetpack Compose Android application built for **Kwik Klin** laundry staff operations, connecting directly to the existing FastAPI + PostgreSQL backend (`/staff/api/*`) at `https://kwikklin.online` (configurable in App Settings).

---

## 1. Staff Roles vs. Subscription Plans

This application strictly separates **Staff Roles** from **Shop Subscription Plans**:

### Staff Roles (who is logged in)
- **Delivery Boy (`DELIVERY`)**: Exact Web Staff App 5-tab workflow (`Work · Tasks · + New · Bills · You`) — Today KPI summary & overdue alerts, assigned pickups & deliveries, customer address & Google Maps navigation (including multi-stop route), Call Customer, Mark Picked Up, Out for Delivery, Mark Delivered, Customer Not Home, **3-Step New Bill Wizard** (customer search/new customer, rate card, usual items, rewards, urgent charge, discount ₹/%, delivery charge, GST, Cash/UPI/Split advance), **Make Pickup Bill** directly from pickup tasks, **Bills Register** (search, Paid/Unpaid filter, Send Bill via WhatsApp/Share, Collect Due), online-only Cash/UPI handover, and Expenses (when enabled).
- **Washerman (`WASHER`)**: Assigned washing queue (`Home · Washing · Tasks · History · You`), garment counts & special instructions, Start Washing, Move to Drying / Ironing / Ready. **Never sees New Bill, Bills, billing amounts, payment history, cash handover, or customer phone/address.**
- **Iron Boy (`IRONER`)**: Assigned ironing/pressing queue (`Home · Ironing · Tasks · History · You`), garment details & special instructions, Start Ironing, Mark Ready. **Only sees information needed to complete ironing work.**
- **Supervisor / Manager / Solo Owner**: Automatically adapts using backend `me.role`, `me.features`, `me.can_bill`, `me.can_money`, `me.can_contact`, `me.can_expense`, and `me.show_route`.
- **Excluded**: Vendor internal Control Room (`/control`) is intentionally excluded from this staff app.

### Subscription Plans (what the laundry shop subscribes to)
- **Solo**, **Starter**, and **Pro** — read dynamically from `GET /staff/api/boot` (`me.plan`, `me.plan_tier`, `me.solo`, `me.features`, `me.plan_validity`).
- No plan limits, pricing, or entitlements are hardcoded in the APK. HTTP `402` and `403` subscription/limit responses from the backend are surfaced directly to the user.

---

## 2. Reused Backend Endpoints (`/staff/api/*`)

No second database or duplicate business logic was created. The app talks directly to the existing FastAPI backend:

- **Auth & Session**: `POST /staff/api/login`, `POST /staff/api/otp/send`, `POST /staff/api/otp/verify` (WhatsApp OTP sign-in, see [docs/WHATSAPP-OTP-LOGIN.md](docs/WHATSAPP-OTP-LOGIN.md)), `POST /staff/api/logout`, `POST /staff/api/password`, `GET /staff/api/boot`, `GET /health`
- **Dashboard & Work**: `GET /staff/api/today`, `GET /staff/api/route?tab=todo|done`, `GET /staff/api/tasks?tab=mine|done`
- **Order Lifecycle** (`RECEIVED → PICKUP_ASSIGNED → PICKED_UP → IN_WASH → IN_DRY → IN_IRON → READY → OUT_FOR_DELIVERY → DELIVERED`, plus `ON_HOLD` & `CANCELLED`):
  - `GET /staff/api/orders/{number}`
  - `POST /staff/api/orders/{number}/picked-up`
  - `POST /staff/api/orders/{number}/washing`
  - `POST /staff/api/orders/{number}/ready`
  - `POST /staff/api/orders/{number}/status`
  - `POST /staff/api/orders/{number}/deliver`
  - `POST /staff/api/orders/{number}/not-home`
- **Billing, Receipts & Expenses (Online-Only, permission-gated)**:
  - `GET /staff/api/rates`, `GET /staff/api/customers/search`, `GET /staff/api/customers/{ref}/rewards`, `GET /staff/api/customers/{ref}/usual-items`
  - `GET /staff/api/tasks/{code}/bill-context` (prefills New Bill from a Pickup Task)
  - `POST /staff/api/bills` (with UUID `idempotency_key`), `GET /staff/api/bills`, `GET /staff/api/orders/{number}/receipt`
  - `GET /staff/api/expenses`, `POST /staff/api/expenses`
- **Other Online-Only Operations**:
  - `GET /staff/api/orders/{number}/call`
  - `GET /staff/api/orders/{number}/dues` & `POST /staff/api/orders/{number}/collect` (with UUID `client_ref`)
  - `GET /staff/api/cash` & `POST /staff/api/cash/handover`
  - `POST /staff/api/tasks/{code}/done`, `GET /staff/api/tasks/{code}/messages`, `POST /staff/api/tasks/{code}/ask`, `POST /staff/api/tasks/{code}/cancel-request`
  - `GET /staff/api/notifications`, `GET /staff/api/points`

---

## 3. Architecture & Security Highlights

- **Stack**: Kotlin, Jetpack Compose, Material 3, MVVM (`StaffViewModel` + `StateFlow`), Retrofit 2 + OkHttp 4, Kotlinx Serialization, Coroutines/Flow, Room (strictly for the offline status-only outbox), WorkManager.
- **Encrypted Session Storage**: `kk_staff` session cookies are encrypted at rest using **Android Keystore (`AES/GCM/NoPadding`)** (`KeystoreCrypto` + `SecureCookieJar`). Cloud backup is disabled (`android:allowBackup="false"`).
- **Safe Logout / `401`**: Signing out or receiving HTTP `401` immediately wipes all encrypted cookies, clears the Room offline status outbox, and resets in-memory state.
- **Safe Offline Outbox**:
  - Only status-only order updates (`picked-up`, `washing`, `ready`, `status`, `deliver`, `not-home`) are queued offline with a unique `X-Idempotency-Key`.
  - `OfflineOutboxWorker` replays them when connectivity returns; HTTP `409 Conflict` is resolved safely as already progressed on the server.
  - Cash/UPI payment collection and cash handover are strictly **online-only**.
- **Notifications & Lock-Screen Privacy**: High-priority `URGENT — DO THIS NOW` channel with `VISIBILITY_PRIVATE` and redacted public lock-screen text (never exposes customer phone numbers or home addresses).

---

## 4. Build & Run

1. Open the project in Android Studio (JDK 21 / Gradle 9.3.1 / AGP 9.1.1) or run:
   ```bash
   gradle :app:assembleDebug
   ```
2. Default backend URL is `https://kwikklin.online` (configured via `CRM_BASE_URL` in `.env.example` and editable live inside the app's **Login → Server URL** or **Profile → App Settings**).

## 5. Known Backend-Side Note for Background Push (FCM)

- While the app is active/foregrounded, it polls `/staff/api/boot` and `/staff/api/notifications` and triggers native Android high-priority urgent notifications immediately.
- To deliver push notifications when the app is completely force-stopped/killed, the existing Kwik Klin FastAPI backend (which currently uses Web Push VAPID `/staff/api/push/subscribe`) will need a small additive endpoint (e.g., `POST /staff/api/push/fcm-register`) and `firebase-admin` sender on the EC2 server.
