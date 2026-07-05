# Meryata Souq — Multi-Tenant Delivery & Marketplace Platform

> **Execution-ready blueprint for Claude Code (v2).** Single source of truth. Build strictly in the phase order in §16. Every phase ends with a verifiable acceptance check — do not proceed until it passes. Security (§5) is not a phase; it is a constraint applied to **every** phase.

---

## 0. System Overview

Meryata Souq digitizes local town commerce (supermarkets, clothing, restaurants, pharmacies, etc.) as a multi-tenant marketplace with integrated last-mile delivery.

### Four surfaces

| Surface | Stack | Purpose |
|---|---|---|
| **Super Admin Dashboard** | React + TypeScript (Vite) | Vendors, drivers, ads, feature toggles, OTP switch, commission, currencies, locales, storage, scheduling grants |
| **Vendor Dashboard** | React + TypeScript (Vite) | Store, inventory, orders, hours, scheduling, earnings |
| **User App** | React Native + Expo (TS) | Browse, ads, coupons, order, schedule, track, rate |
| **Driver App** | React Native + Expo (TS) | Receive/accept requests, stream location, update status |

Backend: single modular Go monolith serving a versioned REST API + WebSocket hub. PostgreSQL + PostGIS, Redis, OneSignal. Multilingual (Arabic RTL included), multi-currency, pluggable image storage (local or AWS S3).

> **Note on the brief:** the dashboards were requested as "React JS," but the zero-`any` directive is only enforceable with TypeScript, so both dashboards are **React + TypeScript**.

---

## 1. Technical Stack (locked)

**Backend**
- **Go 1.24+**, Echo v4, GORM (PostgreSQL), goroutines for notification/WS fan-out
- PostgreSQL 16 + PostGIS 3.4, Redis 7
- `golang-migrate` (versioned SQL migrations)
- Layering: strict `handlers / services / models` (+ `middleware`, `config`, `ws`, `i18n`, `storage`, `currency`, `pkg`)

**Web (both dashboards)** — React 18 + TS (strict), Vite, TailwindCSS v3, TanStack Query, React Hook Form + Zod, Axios (centralized + interceptors), i18next (RTL-aware).

**Mobile (both apps)** — React Native + Expo (TS strict), NativeWind, TanStack Query, RHF + Zod, `expo-location`, `react-native-maps`, OneSignal Expo plugin, i18next + `I18nManager` for RTL.

**Cross-cutting** — all config/secrets in `.env` (+ `.env.example` per service). All API shapes defined once as Zod schemas; types inferred, never hand-duplicated. Docker provided as an **optional** convenience (§17), not the primary run path.

---

## 2. Repository Layout

```
meryata-souq/
├── backend/
│   ├── cmd/api/main.go
│   ├── internal/
│   │   ├── config/            # env + settings cache (Redis-backed, pub/sub refresh)
│   │   ├── handlers/          # thin HTTP handlers
│   │   ├── services/          # business logic (auth, orders, notifications, commission,
│   │   │                      #   scheduling, hours, currency, storage, i18n)
│   │   ├── models/            # GORM models + DTOs
│   │   ├── middleware/        # auth, rbac, tenant, error, ratelimit, security headers, locale
│   │   ├── ws/                # WebSocket hub, client, presence
│   │   ├── i18n/              # locale registry, translation loader
│   │   ├── storage/           # Storage interface + local + s3 drivers
│   │   ├── currency/          # rate provider + conversion
│   │   └── pkg/               # otp, onesignal, geo, phone, apperror, security
│   ├── migrations/
│   ├── .env.example
│   └── go.mod
├── web-admin/                 # Super Admin (React TS)
├── web-vendor/                # Vendor Dashboard (React TS)
├── mobile-user/               # User App (Expo TS)
├── mobile-driver/             # Driver App (Expo TS)
├── docker-compose.yml         # OPTIONAL (Postgres, Redis, backend) — see §17
└── docs/
```

Frontend shared structure: `src/{api, schemas, hooks, components, features, lib, i18n, types}`. `src/i18n` holds locale JSON + RTL config.

---

## 3. Database Schema (PostgreSQL + PostGIS)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3.1 Config, feature toggles, storage, i18n, currency

```sql
CREATE TABLE app_configs (
    key TEXT PRIMARY KEY, value JSONB NOT NULL, description TEXT,
    updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_configs (key, value, description) VALUES
  ('otp_provider','"whatsapp"','sms | whatsapp'),
  ('commission_default_pct','10','default commission %'),
  ('otp_ttl_seconds','300',''), ('otp_length','6',''),
  ('storage_driver','"local"','local | s3'),
  ('base_currency','"USD"','canonical pricing currency'),
  ('default_locale','"en"','en | ar | ...');

CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supported languages. is_rtl drives layout direction on all clients.
CREATE TABLE locales (
    code TEXT PRIMARY KEY,          -- 'en', 'ar', 'fr'
    name TEXT NOT NULL,             -- 'English', 'العربية'
    is_rtl BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO locales (code,name,is_rtl,is_default,sort_order) VALUES
  ('en','English',false,true,0), ('ar','العربية',true,false,1);

-- Backend-driven UI strings served to clients per locale.
CREATE TABLE ui_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    locale TEXT NOT NULL REFERENCES locales(code) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'common',
    key TEXT NOT NULL, value TEXT NOT NULL,
    UNIQUE (locale, namespace, key)
);

CREATE TABLE currencies (
    code TEXT PRIMARY KEY,          -- 'USD','LBP','AED'
    symbol TEXT NOT NULL, name TEXT NOT NULL,
    decimals INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO currencies (code,symbol,name,decimals) VALUES
  ('USD','$','US Dollar',2), ('LBP','ل.ل','Lebanese Pound',0);

-- Rate expresses: 1 base_currency (USD) = rate units of `code`.
CREATE TABLE exchange_rates (
    code TEXT PRIMARY KEY REFERENCES currencies(code) ON DELETE CASCADE,
    rate NUMERIC(18,6) NOT NULL,
    updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO exchange_rates (code,rate) VALUES ('USD',1),('LBP',89000);
```

### 3.2 Identity & auth (with refresh tokens & lockout)

```sql
CREATE TYPE user_role AS ENUM ('user','vendor','driver','super_admin');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,             -- E.164 (+961...)
    phone_verified BOOLEAN NOT NULL DEFAULT false,
    first_name TEXT, last_name TEXT,
    password_hash TEXT,                     -- argon2id; null until step 2
    role user_role NOT NULL DEFAULT 'user',
    preferred_locale TEXT REFERENCES locales(code) DEFAULT 'en',
    is_active BOOLEAN NOT NULL DEFAULT true,
    failed_logins INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_phone ON users (phone);

CREATE TABLE otp_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL, provider TEXT NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false, attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_otp_phone ON otp_challenges (phone, created_at DESC);

-- Refresh-token rotation store (hashed tokens only).
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,               -- sha256 of the token
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by UUID,
    created_ip TEXT, user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);

CREATE TABLE push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL, role user_role NOT NULL, platform TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, player_id)
);
CREATE INDEX idx_push_role ON push_tokens (role);

-- Security audit trail.
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID, actor_role user_role,
    action TEXT NOT NULL, entity TEXT, entity_id UUID,
    ip TEXT, meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);
```

### 3.3 Vendors, hours, scheduling, catalog

```sql
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES users(id),
    name_i18n JSONB NOT NULL DEFAULT '{}',       -- {"en":"...","ar":"..."}
    category TEXT NOT NULL,
    location GEOGRAPHY(POINT,4326) NOT NULL,
    address TEXT, logo_url TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Beirut',
    commission_pct NUMERIC(5,2),                 -- null -> app default
    display_currency TEXT REFERENCES currencies(code) DEFAULT 'USD',
    -- scheduling: admin GRANTS capability, vendor ENABLES it
    scheduling_allowed BOOLEAN NOT NULL DEFAULT false,  -- set by admin
    scheduling_enabled BOOLEAN NOT NULL DEFAULT false,  -- set by vendor (only if allowed)
    scheduling_config JSONB NOT NULL DEFAULT '{}',      -- {slot_minutes, lead_minutes, max_days_ahead, max_per_slot}
    features JSONB NOT NULL DEFAULT '{}',               -- per-vendor overrides
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_location ON vendors USING GIST (location);
CREATE INDEX idx_vendors_category ON vendors (category);

-- Weekly recurring hours (multiple rows per day allow split shifts).
CREATE TABLE vendor_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
    open_time TIME NOT NULL, close_time TIME NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_hours_vendor ON vendor_hours (vendor_id, day_of_week);

-- Date-specific overrides (holidays, special hours).
CREATE TABLE vendor_hour_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    open_time TIME, close_time TIME,
    note TEXT, UNIQUE (vendor_id, date)
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name_i18n JSONB NOT NULL DEFAULT '{}', sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name_i18n JSONB NOT NULL DEFAULT '{}',
    description_i18n JSONB NOT NULL DEFAULT '{}',
    price_usd NUMERIC(12,2) NOT NULL,           -- canonical price in base currency
    stock INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_vendor ON products (vendor_id);

-- Product images stored via the storage abstraction (local or s3).
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    storage_driver TEXT NOT NULL,               -- 'local' | 's3' (where THIS file lives)
    object_key TEXT NOT NULL,                    -- path/key within that driver
    sort_order INT NOT NULL DEFAULT 0
);
```

### 3.4 Orders (currency + schedule snapshots), tracking, marketing

```sql
CREATE TYPE order_status AS ENUM
  ('pending','accepted','preparing','on_the_way','delivered','cancelled');

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    driver_id UUID REFERENCES users(id),
    status order_status NOT NULL DEFAULT 'pending',
    delivery_point GEOGRAPHY(POINT,4326) NOT NULL,
    subtotal_usd NUMERIC(12,2) NOT NULL,         -- canonical
    -- currency snapshot: what the user paid in
    currency_code TEXT NOT NULL DEFAULT 'USD',
    exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,   -- 1 USD = rate units
    subtotal_display NUMERIC(14,2) NOT NULL,     -- subtotal_usd * exchange_rate
    commission_pct NUMERIC(5,2) NOT NULL,        -- snapshot
    commission_usd NUMERIC(12,2) NOT NULL,       -- snapshot
    coupon_id UUID,
    scheduled_for TIMESTAMPTZ,                    -- null = ASAP; set if scheduled
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_vendor_day ON orders (vendor_id, placed_at);
CREATE INDEX idx_orders_driver ON orders (driver_id, status);
CREATE INDEX idx_orders_scheduled ON orders (scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    name TEXT NOT NULL, unit_price_usd NUMERIC(12,2) NOT NULL, quantity INT NOT NULL
);

CREATE TABLE driver_locations (
    driver_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(POINT,4326) NOT NULL, heading NUMERIC,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_loc ON driver_locations USING GIST (location);

CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    driver_id UUID NOT NULL REFERENCES users(id),
    user_id UUID NOT NULL REFERENCES users(id),
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5), comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE banner_ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,   -- null = platform ad
    image_key TEXT NOT NULL, storage_driver TEXT NOT NULL,
    target_url TEXT, is_paid BOOLEAN NOT NULL DEFAULT false,
    priority INT NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL, discount_val NUMERIC(12,2) NOT NULL,
    max_redemptions INT, redeemed_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true
);
```

---

## 4. Backend Architecture

### 4.1 Layering rules
- **handlers**: validate → call one service → map to standardized JSON. No logic, no DB.
- **services**: all logic + transactions; return domain result or `*apperror.AppError`.
- **models**: GORM structs + DTOs only.
- **middleware**: auth, RBAC, tenant resolution, locale resolution, security headers, rate limit, recover→error mapper.

### 4.2 Standardized error contract
Every non-2xx response:
```json
{ "error": { "code":"OTP_INVALID","status":400,
  "developer_message":"otp mismatch","user_message":"The code is incorrect." } }
```
`user_message` is **localized** using the request locale (§6). `apperror.AppError` carries a `MessageKey` resolved against `ui_translations`. No silent failures — every `err != nil` is handled or wrapped; CI flags ignored errors.

### 4.3 Config cache (dynamic switches)
Boot-load `app_configs`, `feature_flags`, `locales`, `currencies`, `exchange_rates` into memory backed by Redis. `config.Get` is O(1). Admin write → DB → Redis invalidate → pub/sub refresh across instances (OTP provider, storage driver, rates, etc. change with no restart).

### 4.4 Storage abstraction (local | S3)
```go
type Storage interface {
    Put(ctx context.Context, key string, r io.Reader, contentType string) error
    // Signed, time-limited URL for private objects (S3) or served path (local).
    URL(ctx context.Context, key string, ttl time.Duration) (string, error)
    Delete(ctx context.Context, key string) error
}
```
- `local`: writes under a configured media dir; served via an authenticated static route or signed local path.
- `s3`: AWS SDK v2; private bucket + presigned GET URLs; server-side encryption on.
- Active driver read from `app_configs.storage_driver`; each stored file records the driver it lives on (`product_images.storage_driver`) so switching drivers doesn't break old URLs. Validate uploads (§5.9) before `Put`.

### 4.5 Currency service
- Canonical price is `price_usd`. Convert with `exchange_rates` cache: `display = round(usd * rate, decimals)`.
- At **order placement**, snapshot `currency_code`, `exchange_rate`, and `subtotal_display` so later rate changes never alter historical orders.
- Per vendor `display_currency`; user may also request a currency at checkout if the store enables it.

### 4.6 Store-hours service
- `IsOpenNow(vendor, at)` evaluates `vendor_hour_overrides` first (date match), else `vendor_hours` for the weekday, in the vendor `timezone`. Returns open/closed + next-open time. User app blocks ASAP orders when closed (scheduling still allowed if enabled).

### 4.7 Scheduling service
- Two gates: `scheduling_allowed` (admin) **and** `scheduling_enabled` (vendor). Both true → user sees slot picker.
- Slots generated from `scheduling_config` (`slot_minutes`, `lead_minutes`, `max_days_ahead`, `max_per_slot`) intersected with store hours. Enforce capacity via count of orders per slot. Order stores `scheduled_for`.

### 4.8 NotificationService (OneSignal)
Role-grouped `player_id` fan-out. Fire on every status transition on a bounded goroutine pool with context timeout; failures logged + bounded-retry, never swallowed. Payload text localized to recipient `preferred_locale`.

### 4.9 WebSocket hub (live tracking)
Room-per-order; JWT-authed upgrade; driver streams location → validate → `driver_locations` upsert → broadcast to room. Redis pub/sub for horizontal scale.

### 4.10 Commission & phone
- Commission snapshotted at placement (vendor pct → else default).
- All phones normalized to E.164 (`+961…`), handling Lebanese mobile prefixes; invalid → `PHONE_INVALID`.

---

## 5. Security (applies to every phase — HIGH priority)

### 5.1 Authentication & sessions
- **Short-lived access JWT** (10–15 min) + **rotating refresh token** (stored hashed in `refresh_tokens`). On refresh, revoke old, issue new (`replaced_by` chain). Detect reuse of a revoked token → revoke the whole chain and force re-auth.
- Access token in memory on clients; refresh token in secure storage (Expo SecureStore / httpOnly-style handling on web via secure cookie or protected storage). Never store secrets in plain localStorage.
- Sign JWTs with a strong secret/asymmetric key from env; include `role`, `sub`, `exp`, `iat`, `jti`.

### 5.2 Passwords & OTP
- Hash passwords with **argon2id** (or bcrypt cost ≥ 12). Enforce min length + complexity server-side.
- OTP: cryptographically random, config TTL, **max attempts** per challenge, constant-time compare, per-phone + per-IP rate limits, and **no user enumeration** (identical responses whether the number exists or not until after verification).
- **Account lockout**: increment `failed_logins`, set `locked_until` after threshold; exponential backoff.

### 5.3 Authorization & tenant isolation
- RBAC middleware per route (`user`/`vendor`/`driver`/`super_admin`).
- **Row-level tenant checks in every service**: a vendor can only read/write its own vendor_id rows; a driver only its assigned orders; a user only its own orders. Never trust IDs from the client without an ownership check.
- Deny-by-default: routes require an explicit role guard.

### 5.4 Transport & headers
- HTTPS/TLS only; HSTS. Security headers middleware: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- Strict CORS allowlist (per-surface origins), no wildcard with credentials.

### 5.5 Input validation & injection
- Validate every input (Zod on clients, struct validation on server). Use GORM parameterized queries only — **no string-concatenated SQL**. Whitelist sortable/filterable fields.
- Escape/encode all user-rendered content; React auto-escaping preserved (no `dangerouslySetInnerHTML` on user data).

### 5.6 Rate limiting & abuse
- Redis-based limits on auth, OTP, order placement, and write endpoints (per IP + per user). Global sane ceilings + tight OTP-specific limits.

### 5.7 CSRF & state-changing requests
- Token-based auth (Bearer) avoids classic CSRF; if any cookie-based auth is used on web, add CSRF tokens + SameSite=strict.

### 5.8 Idempotency
- Order placement (and any payment-adjacent action) requires an `Idempotency-Key` header; store keys in Redis to dedupe retries and prevent double orders.

### 5.9 File upload security
- Validate MIME + magic bytes + extension + size cap; re-encode/strip metadata for images; generate random object keys (never trust filenames); store outside web root (local) or in a private bucket (S3) served via signed URLs; reject executables/SVstripped.

### 5.10 Secrets, data, logging, deps
- All secrets in env/secret manager; never committed; rotate regularly.
- Encrypt sensitive data at rest where applicable; TLS in transit.
- Structured logs **without** PII/secrets; full audit trail in `audit_logs` for admin/vendor/driver privileged actions.
- Dependency scanning (`govulncheck`, `npm audit`) in CI; pinned versions.
- WebSocket upgrades authenticated; drop unauthenticated connections.

### 5.11 Security acceptance (every phase)
- [ ] Every new route has an explicit role guard + ownership check.
- [ ] Every new input is validated server-side.
- [ ] No secret/PII in logs; privileged actions audited.
- [ ] New uploads pass the §5.9 pipeline.

---

## 6. Internationalization & RTL

### 6.1 Backend-driven i18n
- `locales` defines supported languages + `is_rtl` + default. `GET /api/v1/i18n/:locale` returns all `ui_translations` for that locale (namespaced), cached in Redis and on clients.
- Locale resolution order: authenticated user `preferred_locale` → `Accept-Language` / `?locale` → default. Middleware sets request locale; error `user_message` and push text localized accordingly.
- Content entities (`vendors.name_i18n`, `products.name_i18n/description_i18n`, `categories.name_i18n`) are locale-keyed JSONB; API returns the value for the active locale with fallback to default locale.

### 6.2 Client RTL
- **Web**: i18next; set `<html dir="rtl" lang="ar">` when the active locale `is_rtl`. Tailwind: use logical utilities (`ms-*/me-*/ps-*/pe-*`, `text-start/text-end`) instead of hard left/right so layouts mirror automatically. Provide an in-app language switcher.
- **Mobile (Expo)**: i18next + `I18nManager.forceRTL(isRtl)`; prompt reload on direction change. Use `start/end` styles, not `left/right`. Mirror icons/chevrons.
- Add Arabic-capable fonts; ensure number/date/currency formatting via `Intl` with the active locale.
- **"Make it Arabic RTL" control**: a language switcher on every surface (in Settings and on the onboarding screen) writes `preferred_locale` and immediately flips direction.

---

## 7. Multi-Currency

- Base/canonical currency = USD (`app_configs.base_currency`, product `price_usd`).
- Admin manages `currencies` + `exchange_rates` (LBP seeded; any currency addable).
- Each **vendor** picks a `display_currency`; optionally the store lets the **user** choose among active currencies at checkout.
- Display conversion uses live cached rate; **order snapshots** `currency_code` + `exchange_rate` + `subtotal_display`. Dual USD/LBP shown where useful (Lebanon market).

---

## 8. Store Hours & Scheduled Orders

- Vendors set weekly `vendor_hours` (split shifts allowed) + date `vendor_hour_overrides`, in their `timezone`. Clients show **Open/Closed** + next-open.
- Scheduling requires **admin grant** (`scheduling_allowed`) then **vendor enable** (`scheduling_enabled`). When on, users pick a slot generated from `scheduling_config` ∩ store hours, capacity-capped. `orders.scheduled_for` set; ASAP when null.
- When closed and scheduling off → ordering disabled with a clear localized message.

---

## 9. Two-Step Authentication Flow

1. `POST /auth/request-otp {phone}` → normalize → generate OTP → Redis w/ TTL → resolve provider from config → send → audit. Rate-limited, no enumeration.
2. `POST /auth/verify-otp {phone, code}` → validate (attempt cap, constant-time) → mark verified.
   - Complete user → issue access+refresh → `{status:"login", ...}`.
   - New/incomplete → `{status:"register_required", verification_token}` (short-lived).
3. `POST /auth/complete-registration {verification_token, first_name, last_name, password, preferred_locale}` → argon2id hash → persist → issue tokens.
4. `POST /auth/refresh {refresh_token}` → rotate (§5.1). `POST /auth/logout` → revoke.

Auth payload: `{ access_token, refresh_token, user:{ id, phone, first_name, last_name, role, preferred_locale } }`.

---

## 10. Frontend Directives (all four apps)
- **Zero `any`**: `strict:true`, ESLint `no-explicit-any: error`. One Zod schema per API response in `src/schemas`; infer types; parse responses in the API layer. Unknown → `unknown` + narrowing.
- **Unified errors**: root Error Boundary; Axios response interceptor reads the standardized error, toasts localized `user_message`, rejects typed for TanStack Query; RHF+Zod field-level errors block submit; server field errors mapped back.
- **Server state**: all via TanStack Query hooks; invalidate on mutation; optimistic updates for accept/status actions.
- **i18n/RTL**: every screen uses translation keys (no hardcoded strings) and logical (start/end) layout.

---

## 11. Page & Screen Specifications

> For each page: **Purpose · Elements/Data · Actions · Rules**. All strings via i18n; all lists paginated + loading/empty/error states; all forms RHF+Zod. Direction flips with locale.

### 11.A — Super Admin Dashboard (web-admin)

**A1. Login** — Purpose: admin sign-in. Elements: phone → OTP (admin role), or credential login for super admin. Actions: request/verify OTP, submit. Rules: super_admin role only; lockout on repeated failure; audit login.

**A2. Overview / KPIs** — Elements: cards (today orders, GMV in USD, commission earned, active vendors, online drivers), recent orders table, revenue trend chart. Actions: date-range filter, drill into vendor/order. Rules: read-only aggregates.

**A3. Vendors — List** — Elements: table (name, category, status, commission %, scheduling_allowed, active toggle), search, category filter. Actions: create vendor, open detail, activate/deactivate. Rules: deactivating hides the store from users.

**A4. Vendor — Detail/Edit** — Elements: profile (name_i18n, category, location on map, logo, timezone, display_currency), commission override, **feature toggles** (JSONB), **`scheduling_allowed` grant**, ads eligibility. Actions: save, upload logo (storage pipeline), set commission, grant/revoke scheduling, impersonate-view. Rules: audit every change; commission null → default.

**A5. Vendor Onboarding/Approval** — Elements: pending applications queue. Actions: approve/reject with reason. Rules: approval creates vendor + owner user.

**A6. Drivers** — Elements: list (name, phone, status online/offline, rating, active). Detail: documents, assigned/active orders, location. Actions: create/verify/activate/deactivate driver. Rules: only active+verified drivers receive requests.

**A7. Users** — Elements: list/search users; detail (orders, locale). Actions: activate/deactivate, reset lockout. Rules: no password view; audit.

**A8. Banner Ads** — Elements: list (image, vendor/platform, paid/free, priority, schedule, active). Editor: upload image (storage), target URL, is_paid, priority, start/end. Actions: create/edit/delete/toggle. Rules: priority orders display in user app.

**A9. Coupons (global)** — Elements: list; editor (code, type, value, limits, expiry, vendor optional). Actions: CRUD, activate/deactivate. Rules: enforce max_redemptions.

**A10. System Settings** — Elements: **OTP provider switch (sms/whatsapp)**, commission default, **storage driver (local/s3)**, base currency, default locale, OTP TTL/length, feature_flags grid. Actions: save each (live, no restart). Rules: audit; some changes broadcast via pub/sub.

**A11. Currencies & Rates** — Elements: currencies table (code, symbol, decimals, active), exchange_rates editor. Actions: add/activate currency, update rate. Rules: base currency rate fixed at 1; changing rates does not alter historical orders.

**A12. Localization** — Elements: locales table (code, name, is_rtl, default, active), ui_translations editor (namespace/key/value per locale), missing-key report. Actions: add locale, edit strings, set default, toggle RTL. Rules: adding `ar` with is_rtl flips client direction.

**A13. Orders (all)** — Elements: global orders table with filters (vendor, status, scheduled, date), detail drawer (items, currency snapshot, timeline, driver, live map). Actions: filter/export, reassign driver (with audit). Rules: read-mostly.

**A14. Push Broadcast** — Elements: audience (role/all), title/body per locale, schedule. Actions: send. Rules: audited; rate-limited.

**A15. Audit Log** — Elements: filterable audit_logs table (actor, action, entity, ip, time). Actions: filter/export. Rules: read-only.

### 11.B — Vendor Dashboard (web-vendor)

**B1. Login** — phone→OTP (vendor role). Rules: vendor role + active.

**B2. Dashboard** — Elements: today's orders count, revenue (display currency), commission, live incoming-orders panel (WS), low-stock alerts. Actions: jump to order. Rules: scoped to own vendor.

**B3. Store Profile/Settings** — Elements: name_i18n, category, logo, location map, timezone, **display_currency**, allowed currencies for checkout. Actions: save, upload logo. Rules: own vendor only.

**B4. Store Hours** — Elements: weekly grid (per day open/close, split shifts, closed), date overrides/holidays. Actions: add/edit/remove rows & overrides. Rules: timezone-aware; drives Open/Closed in user app.

**B5. Scheduling Settings** — Elements: **`scheduling_enabled` toggle (only if admin `scheduling_allowed`)**, config (slot_minutes, lead_minutes, max_days_ahead, max_per_slot). Actions: enable/disable, save config. Rules: if not allowed by admin → toggle hidden/disabled with explanatory note.

**B6. Categories** — Elements: list with name_i18n, sort order. Actions: CRUD, reorder. Rules: own vendor.

**B7. Products — List** — Elements: table (image, name, price USD + converted, stock, active), search/filter. Actions: create, edit, toggle active, delete. Rules: stock/price validation.

**B8. Product — Editor** — Elements: name_i18n & description_i18n (per-locale fields), **price in USD (canonical)** with live converted preview, stock, category, **multi-image uploader** (storage pipeline, reorder, set primary). Actions: save; add/remove images. Rules: zero-`any` typed; image pipeline §5.9.

**B9. Orders** — Elements: tabs (incoming/active/scheduled/history); realtime incoming via WS; detail (items, currency snapshot, delivery point map, scheduled_for). Actions: accept, set preparing/on_the_way, hand to driver, cancel with reason. Rules: only own orders; status transitions trigger pushes.

**B10. Coupons (vendor)** — Elements: list/editor scoped to vendor. Actions: CRUD. Rules: vendor-scoped codes.

**B11. Earnings/Payouts** — Elements: daily/period table (order volume, commission, net) in display currency; export. Actions: filter, export CSV. Rules: from commission snapshots.

**B12. Account/Language** — Elements: profile, password change, **language switcher (Arabic/RTL)**. Actions: save, change locale. Rules: writes preferred_locale.

### 11.C — User App (mobile-user)

**C1. Splash / Language Select** — first-run language picker (English / العربية / …). Sets locale + direction.

**C2. Phone Entry** — input phone (Lebanese formats), request OTP. Rules: rate-limited, no enumeration.

**C3. OTP Verify** — code input, resend timer. Rules: attempt cap.

**C4. Register (new numbers only)** — first name, last name, password, locale. Rules: only when `register_required`.

**C5. Home** — Elements: location header, search, category chips, banner ads carousel (priority order), nearby vendors (PostGIS) with Open/Closed badge. Actions: search, open vendor, tap ad, change location. Rules: closed stores still visible; ordering gated.

**C6. Vendor/Store Page** — Elements: header (name, logo, rating, Open/Closed + next-open, currency), category tabs, product grid, schedule availability banner if enabled. Actions: add to cart, view product, start scheduled order. Rules: ASAP disabled when closed; scheduling shown only if allowed+enabled.

**C7. Product Detail** — Elements: images gallery, name/description (localized), price (display currency, USD reference), stock. Actions: choose qty, add to cart. Rules: block if out of stock.

**C8. Cart** — Elements: items, quantities, subtotal (display currency), coupon field. Actions: edit qty, apply coupon, proceed. Rules: validate stock at checkout.

**C9. Checkout** — Elements: delivery location (map/address), **ASAP vs Schedule slot picker** (if enabled), **currency selector** (if store allows), coupon summary, totals with converted amounts, place order. Actions: pick slot, select currency, confirm. Rules: `Idempotency-Key`; snapshots currency + schedule.

**C10. Order Tracking** — Elements: status timeline, **live driver map (WS)**, ETA, vendor/driver contact. Actions: refresh/cancel (if allowed). Rules: live only while active.

**C11. Order History** — list past orders; detail with currency snapshot + reorder. Actions: reorder, view.

**C12. Rate Driver** — after delivered: 1–5 stars + comment. Rules: once per order.

**C13. Coupons/Offers** — claimable coupons/offers list. Actions: claim/copy code.

**C14. Profile/Settings** — addresses, **language switcher (Arabic/RTL)**, notifications, logout. Actions: manage addresses, change locale, logout (revoke refresh).

### 11.D — Driver App (mobile-driver)

**D1. Login** — phone→OTP (driver role). Rules: active+verified only.

**D2. Availability** — online/offline toggle; starts/stops location streaming + push eligibility. Rules: offline drivers get no requests.

**D3. Incoming Requests** — new order card (pickup vendor, drop-off, distance, payout) with accept/decline + countdown. Actions: accept/decline. Rules: first-accept wins; concurrency-safe.

**D4. Active Order** — Elements: map with pickup→dropoff route, customer/vendor info, status buttons. Actions: set on_the_way / delivered, navigate, stream location (WS + `driver_locations`). Rules: transitions push to user; delivered sets `delivered_at`.

**D5. History/Earnings** — completed deliveries, ratings, earnings summary. Actions: filter.

**D6. Profile/Language** — profile, **language switcher (Arabic/RTL)**, logout. Rules: writes preferred_locale.

---

## 12. Standardized API Conventions
- Versioned base `/api/v1`. JSON only. Bearer auth. `Accept-Language` honored.
- Success: `{ "data": ... , "meta": { pagination } }`. Error: standardized contract (§4.2).
- Every list endpoint: pagination + filtering on whitelisted fields.
- Write endpoints: server-side validation, ownership check, audit where privileged.

---

## 13. Definition of Done (global)
- [ ] Go 1.24 backend; no ignored `err != nil`; standardized localized errors.
- [ ] No `any` in any TS codebase (lint + `tsc --noEmit` clean).
- [ ] Security §5 checklist satisfied for every route (auth, RBAC, ownership, validation, rate limit, audit, upload pipeline).
- [ ] Refresh-token rotation + lockout working; OTP provider switchable at runtime.
- [ ] i18n served from backend; Arabic RTL flips layout on all four surfaces; no hardcoded strings.
- [ ] Storage driver switchable (local/S3); uploads validated; S3 uses signed URLs.
- [ ] Multi-currency: USD canonical, per-vendor display, optional user choice, order snapshots.
- [ ] Store hours drive Open/Closed; scheduling respects admin-grant + vendor-enable + slot capacity.
- [ ] Push on every status change (non-blocking); live tracking over WS.
- [ ] Commission snapshotted; vendor earnings accurate.
- [ ] Every page/screen in §11 implemented with loading/empty/error states.

---

## 14. Environment (.env per service)
Backend `.env.example` (illustrative keys): `APP_ENV, HTTP_PORT, DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL, OTP_TTL_SECONDS, SMS_API_KEY, WHATSAPP_API_KEY, ONESIGNAL_APP_ID, ONESIGNAL_API_KEY, STORAGE_DRIVER, MEDIA_LOCAL_DIR, AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BASE_CURRENCY, DEFAULT_LOCALE, CORS_ORIGINS`. Never commit real `.env`.

---

## 15. Phased Build Plan (build in order; §5 applies throughout)

1. **Foundation** — Go 1.24 scaffold, config loader, Postgres+PostGIS+Redis, `apperror`, error + security-headers middleware, health, migrations §3.1–3.4. *Accept:* boots, `/health` 200, migrations applied, PostGIS on, security headers present.
2. **Config, i18n & currency core** — config cache + pub/sub; locales + `ui_translations` endpoint; currencies + rates + conversion. *Accept:* `otp_provider`/`storage_driver`/rates change live; `/i18n/ar` returns RTL locale.
3. **Auth (2-step) + security** — phone normalize, OTP (rate-limited, no enumeration), sms/whatsapp behind interface + dynamic switch, argon2id, JWT access + **refresh rotation**, lockout, RBAC, audit. *Accept:* new vs existing flows correct; provider switch works; refresh rotation + lockout verified.
4. **Storage abstraction** — Storage interface + local + S3; upload validation pipeline (§5.9); signed URLs. *Accept:* upload works on both drivers; switching driver keeps old files servable.
5. **Vendors, hours, tenancy** — vendor CRUD (name_i18n, currency, timezone), tenant isolation, `vendor_hours` + overrides, `IsOpenNow`, admin `scheduling_allowed` grant. *Accept:* spatial nearby lookup; Open/Closed correct across timezone; ownership enforced.
6. **Catalog + images + currency display** — categories/products (i18n, price_usd), multi-image upload, converted price preview. *Accept:* product shows localized name + display-currency price; images stored via active driver.
7. **Orders + commission + currency/schedule snapshots** — cart→order, commission snapshot, currency snapshot, scheduling (admin-grant + vendor-enable + slots + capacity). *Accept:* ASAP blocked when closed; scheduled slot honored; snapshots correct; idempotency prevents doubles.
8. **Notifications (OneSignal)** — token registration, role fan-out, non-blocking dispatch on transitions, localized text. *Accept:* driver push on new order; user push on accept/delivered, sub-second.
9. **Live tracking (WS)** — hub, order rooms, driver streaming, Redis presence, authed upgrade. *Accept:* user sees driver moving live.
10. **Marketing & ratings** — banner ads (priority/schedule), coupons (limits), driver ratings. *Accept:* ads by priority; coupon limits enforced; one rating per order.
11. **Dashboards & apps (all §11 pages)** — build every page/screen with i18n/RTL, Error Boundaries, toasts, Zod-typed data, language switchers. *Accept:* all §11 flows pass happy + error paths; Arabic RTL flips all four surfaces; lint clean (no `any`, no ignored Go errors).

---

## 16. Initial task for the coding assistant
Start at **Phase 1** on **Go 1.24**. Scaffold the backend, wire config + Postgres/PostGIS/Redis, add `apperror`, error + security-headers middleware, and produce migrations for §3.1–3.4. Apply the §5 security constraints from the first line of code. Stop at the Phase 1 acceptance check and confirm before continuing.

---

## 17. Docker (optional, not primary)
Provide a `docker-compose.yml` for local convenience only: services for `postgres` (PostGIS image), `redis`, and `backend`. The primary documented run path is running the Go binary + a local Postgres/Redis directly; Docker is an alternative. Keep images minimal (multi-stage Go build), mount `.env`, and never bake secrets into images. Frontends run via their own dev servers / Expo and are not required to be containerized.
