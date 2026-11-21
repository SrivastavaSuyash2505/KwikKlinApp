# WhatsApp OTP login — staff app

Staff (delivery boy, washerman, iron boy, manager, owner) ab password ke bina
sign in kar sakte hain: mobile number daalo, Kwik Klin ke WhatsApp number se
6-digit code aata hai, code daalo, andar. Password login waise hi chalta
rahega (fallback).

Android side is repo mein ho chuka hai. Backend side **kwikklindashbord**
(FastAPI) repo mein karna hai — niche ka contract exactly wahi hai jo app
expect karti hai.

## Faisle (kyun aise)

| Sawaal | Jawab | Kyun |
|---|---|---|
| OTP kis number se jaye? | **Kwik Klin ka home/platform number** (Meta Cloud API), tenant ka WAHA number nahi | Login ke waqt tenant pata nahi hota (phone cross-tenant lookup hai); tenant ka WhatsApp link toot jaye to staff lock-out na ho; sender hamesha "Kwik Klin" dikhe |
| Message text | Meta **AUTHENTICATION** template, fixed text: `<code> is your verification code.` + copy-code button | Business-initiated message 24h window ke bahar sirf approved template se ja sakta hai. Authentication category mein custom text / dukaan ka naam allowed nahi — isliye app khud "Sent to +91 •••• 3210" aur shop chooser dikhati hai |
| Ek phone, do dukaanein | OTP ek hi jaata hai; verify par **409 `choose_shop`** + list; client `shop_id` ke saath dobara verify karta hai, code consume nahi hota | Staff ko do baar code nahi maangna padta |
| Password zaroori? | Nahi. OTP session par `must_change_password` gate **skip** | Owner ne temp password diya ho ya password ho hi na (`has_password=false`) — OTP se phir bhi kaam shuru ho |
| Queue/retry? | OTP **direct send**, `outbound_queue` mein nahi | 5 min ka code 6 ghante baad deliver hone ka matlab nahi; fail ho to 503, staff "Resend" dabaye |

## API contract (app isi par bani hai)

### `POST /staff/api/otp/send`

Request: `{"phone": "9876543210"}` (digits aur `+` ke alawa sab strip; 10-digit
Indian number ko `+91` prefix do; already `+` se shuru ho to waisa hi).

| HTTP | Body | App kya dikhati hai |
|---|---|---|
| 200 | `{"ok": true, "masked_phone": "+91 •••••• 3210", "expires_in": 300, "resend_after": 30}` | Code screen, countdown |
| 404 | `{"detail": "No staff account found for this number. Ask your shop owner to add you."}` | Banner |
| 429 | `{"detail": "Too many codes requested. Try again after 15 minutes."}` | Banner |
| 402 / 403 | `{"detail": "..."}` (sab dukaanein band/expired) | Subscription banner |
| 503 | `{"detail": "Could not send the WhatsApp code right now. Try again."}` | Banner |

Phone enumeration: staff app ke liye 404 saaf bolna theek hai (UX > secrecy),
par per-IP + per-phone rate limit zaroori hai (niche).

### `POST /staff/api/otp/verify`

Request: `{"phone": "9876543210", "code": "482913", "shop_id": null}`

| HTTP | Body | App |
|---|---|---|
| 200 | `{"ok": true}` + `Set-Cookie: kk_staff=...` (password login jaisa hi session) | `GET /staff/api/boot` → app khul jaati hai |
| 401 | `{"detail": "Wrong code. Check the WhatsApp message and try again.", "attempts_left": 3}` | Inline error, attempts dikhte hain |
| 409 | `{"detail": "choose_shop", "shops": [{"id": "<tenant_id>", "name": "Ramesh Laundry"}, ...]}` | Shop buttons; tap par `shop_id` ke saath same code dobara |
| 410 | `{"detail": "This code has expired. Request a new one."}` | Field lock, "Send new code" |
| 429 | `{"detail": "Too many wrong attempts. Request a new code."}` | Same as 410 |
| 402 / 403 | subscription detail | Subscription banner |

`shop_id` aane par sirf usi tenant ka staff row use karo; `shop_id` galat ya
us phone ka nahi → 401 (code consume mat karo).

## Backend design

### Table `staff_login_otp` (RLS ke **bahar**, `users`/`login_sessions` jaise)

```sql
CREATE TABLE staff_login_otp (
    id           BIGSERIAL PRIMARY KEY,
    phone        TEXT NOT NULL,            -- E.164, +91XXXXXXXXXX
    code_hash    TEXT NOT NULL,            -- HMAC-SHA256(STAFF_OTP_SECRET, phone || ":" || code)
    attempts     SMALLINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    request_ip   TEXT
);
CREATE INDEX ON staff_login_otp (phone, created_at DESC);
```

Tenant yahan nahi hai kyunki OTP phone ka hai, dukaan ka nahi. Verify ke baad
tenant staff row se nikalta hai. Purani rows nightly cleanup (24h+).

### Limits (constants, env se override)

| Kya | Value |
|---|---|
| Code | 6 digits, `secrets.randbelow(10**6)`, zero-padded |
| Validity | 300 s |
| Resend gap | 30 s (same phone) |
| Sends | 5 / phone / hour, 20 / IP / hour |
| Verify attempts | 5 per code, phir code dead (429) |
| Compare | `hmac.compare_digest` |

### Flow — send

1. Phone normalize → E.164.
2. `tenant_context.system_context()` mein `Staff` rows dhoondo: `phone = ? AND active = true`,
   saare tenants. 0 rows → 404. Sab tenants expired/blocked → 402/403.
3. Rate-limit check (phone + IP). Last code 30 s se naya ho → 429 `resend_after` ke saath.
4. Code banao, hash store karo, purane unconsumed codes us phone ke `consumed_at = now()` (ek waqt ek hi valid code).
5. Home tenant Meta Cloud API se template bhejo (`STAFF_OTP_TEMPLATE`, default `staff_login_code`,
   language `en`/`hi`), body param = code, button param = code. Send fail → row delete + 503.
6. `audit_log`: `staff_otp_sent` (phone masked, ip).

### Flow — verify

1. Latest unconsumed, unexpired row for phone. Nahi mili → 410.
2. `attempts >= 5` → 429. Hash mismatch → `attempts += 1`, 401 with `attempts_left`.
3. Match → matching active staff rows (system context). 0 → 404. >1 tenants aur `shop_id` nahi → **409 choose_shop** (row consume nahi).
   `shop_id` diya → us tenant ka row.
4. Tenant plan check wahi jo password login mein hai (402/403).
5. `consumed_at = now()`, phir **password login wala hi session create** (`kk_staff` cookie, same expiry),
   session row par `auth_method = 'whatsapp_otp'`.
6. `audit_log`: `staff_otp_login` (staff id, tenant, ip).

### `must_change_password` gate

Jahan abhi `if staff.must_change_password: raise 403 "Change your password first"`
hai, wahan `and session.auth_method != 'whatsapp_otp'` jodo. OTP se aaya staff
password ke bina kaam kare; `GET /staff/api/me` mein `must_change_password=false`
bhejo OTP session par. (Web `staff.js` already `has_password === false` handle
karta hai, to "Change password" modal old-password field chhupa dega.)

### Env

```
STAFF_OTP_ENABLED=1
STAFF_OTP_SECRET=<32+ random bytes, base64>     # alag rakho SECRET_KEY se, rotate karna aasaan
STAFF_OTP_TEMPLATE=staff_login_code
STAFF_OTP_TEMPLATE_LANG=en
```

### Meta template (ek baar, WhatsApp Manager mein)

- Name `staff_login_code`, category **Authentication**, language en (aur hi chaho to).
- Body: default authentication text, "Add security recommendation" on, "Add expiry time" 5 min.
- Button: **Copy code** (one-tap/zero-tap Android ke liye optional — app auto-fill nahi karti, staff paste/type karta hai).
- Approval 1–2 din. Approved hone tak endpoint 503 dega; app password se chalti rahegi.

### Reference router (drop-in skeleton)

```python
# app/routers/staff_otp.py  — kwikklindashbord repo
import hmac, hashlib, secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import tenant_context
from app.database import get_db
from app.models import Staff, StaffLoginOtp
from app.settings import settings
from app.whatsapp import send_template_home          # home tenant Meta Cloud API
from app.staff_auth import create_staff_session, normalize_phone, mask_phone, tenant_login_guard

router = APIRouter(prefix="/staff/api/otp", tags=["staff-otp"])
OTP_TTL = timedelta(seconds=300); RESEND_GAP = 30; MAX_ATTEMPTS = 5

class SendIn(BaseModel):  phone: str
class VerifyIn(BaseModel): phone: str; code: str; shop_id: str | None = None

def _hash(phone: str, code: str) -> str:
    return hmac.new(settings.staff_otp_secret.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()

def _active_staff(db: Session, phone: str) -> list[Staff]:
    with tenant_context.system_context():
        return db.query(Staff).filter(Staff.phone == phone, Staff.active.is_(True)).all()

@router.post("/send")
def send_otp(body: SendIn, request: Request, db: Session = Depends(get_db)):
    if not settings.staff_otp_enabled:
        raise HTTPException(503, "Could not send the WhatsApp code right now. Try again.")
    phone = normalize_phone(body.phone)
    rows = _active_staff(db, phone)
    if not rows:
        raise HTTPException(404, "No staff account found for this number. Ask your shop owner to add you.")
    rate_limit_otp_send(db, phone, request.client.host)       # 429 on breach
    now = datetime.now(timezone.utc)
    last = (db.query(StaffLoginOtp).filter(StaffLoginOtp.phone == phone)
              .order_by(StaffLoginOtp.created_at.desc()).first())
    if last and (now - last.created_at).total_seconds() < RESEND_GAP:
        raise HTTPException(429, "Please wait a few seconds before requesting another code.")
    code = f"{secrets.randbelow(10**6):06d}"
    db.query(StaffLoginOtp).filter(StaffLoginOtp.phone == phone, StaffLoginOtp.consumed_at.is_(None))\
      .update({StaffLoginOtp.consumed_at: now})
    row = StaffLoginOtp(phone=phone, code_hash=_hash(phone, code), expires_at=now + OTP_TTL,
                        request_ip=request.client.host)
    db.add(row); db.commit()
    try:
        send_template_home(to=phone, template=settings.staff_otp_template,
                           lang=settings.staff_otp_template_lang, body_params=[code], button_params=[code])
    except Exception:
        db.delete(row); db.commit()
        raise HTTPException(503, "Could not send the WhatsApp code right now. Try again.")
    audit(db, "staff_otp_sent", phone=mask_phone(phone), ip=request.client.host)
    return {"ok": True, "masked_phone": mask_phone(phone),
            "expires_in": int(OTP_TTL.total_seconds()), "resend_after": RESEND_GAP}

@router.post("/verify")
def verify_otp(body: VerifyIn, request: Request, response: Response, db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    now = datetime.now(timezone.utc)
    row = (db.query(StaffLoginOtp)
             .filter(StaffLoginOtp.phone == phone, StaffLoginOtp.consumed_at.is_(None))
             .order_by(StaffLoginOtp.created_at.desc()).first())
    if not row or row.expires_at < now:
        raise HTTPException(410, "This code has expired. Request a new one.")
    if row.attempts >= MAX_ATTEMPTS:
        raise HTTPException(429, "Too many wrong attempts. Request a new code.")
    if not hmac.compare_digest(row.code_hash, _hash(phone, body.code.strip())):
        row.attempts += 1; db.commit()
        left = MAX_ATTEMPTS - row.attempts
        raise HTTPException(401, detail="Wrong code. Check the WhatsApp message and try again.",
                            headers=None) if left <= 0 else \
              HTTPException(401, {"detail": "Wrong code. Check the WhatsApp message and try again.",
                                  "attempts_left": left})
    rows = _active_staff(db, phone)
    if not rows:
        raise HTTPException(404, "No staff account found for this number.")
    if body.shop_id:
        rows = [r for r in rows if str(r.tenant_id) == body.shop_id]
        if not rows:
            raise HTTPException(401, "Wrong code. Check the WhatsApp message and try again.")
    if len({r.tenant_id for r in rows}) > 1:
        shops = [{"id": str(r.tenant_id), "name": r.tenant.name} for r in rows]
        raise HTTPException(409, {"detail": "choose_shop", "shops": shops})
    staff = rows[0]
    tenant_login_guard(staff.tenant)              # same 402/403 as password login
    row.consumed_at = now; db.commit()
    create_staff_session(db, response, staff, auth_method="whatsapp_otp")   # sets kk_staff cookie
    audit(db, "staff_otp_login", staff_id=staff.id, tenant_id=staff.tenant_id, ip=request.client.host)
    return {"ok": True}
```

(`HTTPException(401, {...dict...})` FastAPI mein `detail` ko dict bana deta hai —
app `detail` string **ya** top-level `attempts_left` dono padh leti hai; dict
hone par `detail.detail` nahi, isliye upar wale 401 ko `JSONResponse(status_code=401,
content={"detail": "...", "attempts_left": n})` se bhejna zyada saaf hai.
Same 409 ke liye.)

### Tests (pytest, web repo)

- send: unknown phone → 404; 2nd send within 30 s → 429; 6th send in hour → 429; Meta fail → 503 + row gone.
- verify: wrong ×5 → 401,401,401,401,429; expired → 410; correct → cookie + `boot` 200; two tenants → 409 then 200 with `shop_id`; `must_change_password=true` staff via OTP → `boot` 200 (gate skipped).
- Security: hash compare constant-time; code never logged; RLS: table not tenant-scoped.

## Android (done in this repo)

- `POST otp/send` / `otp/verify` in `StaffApiService`; `OtpVerifyResult` in `StaffRepository`
  (409 choose_shop ko order-conflict 409 se alag rakha).
- `StaffViewModel`: `sendLoginOtp`, `verifyLoginOtp`, `resendLoginOtp`, `selectOtpShop`, `cancelLoginOtp`;
  state `otpFlow`.
- `LoginScreen`: default WhatsApp flow (phone → code with countdown, "Open WhatsApp", shop chooser);
  "Sign in with password" purana form kholta hai. Test tags: `login_send_otp_button`,
  `login_otp_input`, `login_verify_otp_button`, `resend_otp_button`, `change_number_button`,
  `use_password_button`, `use_whatsapp_button`, `otp_shop_<id>`.
- Manifest `<queries>` for `com.whatsapp` / `com.whatsapp.w4b` (Android 11+ package visibility).
- Backend ready hone tak: send → 404 (route nahi) → banner "Request failed (HTTP 404)". Staff password se login kar lega.
