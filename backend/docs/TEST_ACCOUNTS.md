# Test Accounts (development)

Local/dev login credentials for exercising each app. Do not use these in
production — the super-admin password is dev-only and the other roles are
passwordless (OTP).

## Super Admin — web-admin dashboard

Created automatically on first backend boot by the bootstrap service from
`backend/.env`:

| Field    | Value                |
|----------|----------------------|
| Phone    | `+96170123456`       |
| Password | `TestAdminPass123!`  |
| Role     | `super_admin`        |

Log in at the web-admin `/login` page with **phone + password**. If admin
pages show "Your session has expired. Please sign in again.", your access
token lapsed — just sign in again (the access token is memory-only by design
and is re-established from the refresh token on reload).

## Vendor Owner — web-vendor dashboard

Vendor accounts are **passwordless** — they sign in with **phone + OTP**. Seed
a demo vendor owner (+ a "Demo Grocery" vendor with hours, categories, and
products) with the seed CLI:

```bash
cd backend
go run ./cmd/seed        # idempotent — re-running replaces the prior seed for this phone
```

The seed prints the owner phone on success:

| Field | Value            |
|-------|------------------|
| Phone | `+96176100100`   |
| Role  | `vendor`         |

### Getting the OTP in dev

There is no real SMS provider locally, so the OTP is **logged by the backend**
when `APP_ENV=development` (already set in `backend/.env`). To log in:

1. Start the backend (`go run ./cmd/api`).
2. On web-vendor's login page, enter `+96176100100` and tap **Send code**.
3. Read the 6-digit code from the **backend console log**, enter it, and submit.

## Drivers & regular users

No driver/user accounts are seeded. Create them from the admin dashboard:
- **Driver:** Drivers page → **Create driver** (passwordless; OTP login).
- **User:** Users page → **Add user** (role = User).

Both log in via phone + OTP the same way (dev OTP printed to the backend log).

## Where to create a vendor owner (answering the common question)

Two supported ways, both in web-admin:

1. **Approve a vendor application** — Vendor Onboarding page → **Approve**. This
   atomically creates the vendor **and** its owner user (the canonical flow).
2. **Create the owner user, then the vendor** — Users page → **Add user** with
   role **Vendor**; they then appear in the owner dropdown on Vendors →
   **Add vendor**, where you link them to a new vendor row.
