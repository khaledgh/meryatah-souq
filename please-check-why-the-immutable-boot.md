# Plan: Mobile pull-to-refresh, OTP 500 diagnosis, admin-controlled vendor login method

## Context

Three requested updates:

1. **Mobile home pull-to-refresh** — the user wants to pull-down-to-refresh the first
   screen (home) to reload its data. Today the home `FlatList`
   ([mobile-user/app/(app)/(tabs)/home.tsx](mobile-user/app/(app)/(tabs)/home.tsx)) has no
   `RefreshControl` (none exists anywhere in the app). It renders two queries: `useNearbyVendors`
   and `useBannerAds`.
2. **`POST /auth/request-otp` returns 500** (`INTERNAL_ERROR`). The OTP request path
   ([otp_service.go `RequestOTP`](backend/internal/services/otp_service.go)) fails at one of its
   `apperror.Internal` points — most likely the **Redis pipeline** in `reserveRateLimitSlot`
   (first thing it does), the Redis `Set`, or the `otp_challenges` DB insert. Cannot reach the
   server to confirm, so per the user's choice we **add logging first**, then fix the confirmed cause.
3. **Admin-controlled vendor login method (password vs OTP)** — a global setting in web-admin
   selects whether vendors sign in by password or OTP. Findings: vendors are **passwordless**
   today (`Approve`/`CreateUser` never set `PasswordHash`); `LoginWithPassword` already exists
   and works for any role *with* a password but short-circuits on nil `PasswordHash`; the
   `app_configs` string-enum pattern (`otp_provider`, `storage_driver`) + the generic web-admin
   settings editor are the established seam.

Decisions (confirmed): OTP → **logging first**; vendor password → **admin sets/resets it**;
toggle → **global `app_configs` key**.

Per CLAUDE.md: auth-adjacent work (tasks 2 & 3) is built with `senior-backend` and reviewed
with `senior-security` + `security-pen-testing` before merge; frontend with `senior-frontend`;
mobile screen with `react-native-best-practices`. Zero `any`, zero ignored Go errors, all
strings i18n'd, every admin write audited (§5).

---

## Task 1 — Mobile home pull-to-refresh

In [home.tsx](mobile-user/app/(app)/(tabs)/home.tsx): add a `RefreshControl` to the main
`FlatList`. Derive `refreshing` from the queries' fetching state and `onRefresh` from their
refetches:

```tsx
import { RefreshControl } from 'react-native'
const onRefresh = useCallback(() => {
  void Promise.all([nearby.refetch(), bannerAds.refetch()])
}, [nearby, bannerAds])
// on the FlatList:
refreshControl={
  <RefreshControl
    refreshing={nearby.isRefetching || bannerAds.isRefetching}
    onRefresh={onRefresh}
    tintColor="#10b981"
    colors={['#10b981']}
  />
}
```

Reuse the existing `nearby`/`bannerAds` query objects — no new hooks. `isRefetching` (not
`isLoading`) so the spinner only shows on pull, not initial load. RN `RefreshControl` needs a
scrollable — the `FlatList` already is one.

## Task 2 — Diagnose the request-otp 500 (logging first)

Add step-scoped logging to [otp_service.go `RequestOTP`](backend/internal/services/otp_service.go)
so the exact failing step is visible in the backend log, mirroring the logging pattern already
added to the banner-ad service. Log (no PII beyond the already-logged dev phone): entry, before/
after `reserveRateLimitSlot` (Redis), provider resolve, `otp_challenges` insert (DB), Redis
`Set`. Each existing `apperror.Internal(...)` gets a preceding `log.Printf("otp: request: <step>
failed: %v", err)`. Also log the resolved `otp_provider` and whether Redis/DB round-trips
succeed.

Most probable root cause (to verify from the log): **Redis unreachable** — every `RequestOTP`
starts with a Redis pipeline, so a bad/unset `REDIS_URL` or a down Redis 500s immediately. The
log will say `otp: request: reserve rate-limit slot failed: <dial tcp ...>`. Secondary suspect:
`otp_challenges` insert failing.

Deliverable now: the logging build. Once the user deploys + reproduces + pastes the log line,
apply the targeted fix (e.g. correct `REDIS_URL`, ensure Redis running, or a DB/migration fix).
Do **not** blindly change behavior before the log confirms the step.

## Task 3 — Admin-controlled vendor login method (global) + admin-set vendor password

### 3a. Config key (backend)
New migration (next number, `000008_vendor_login_method.up.sql` + down) seeding an
`app_configs` row:
```sql
INSERT INTO app_configs (key,value,description)
VALUES ('vendor_login_method','"otp"','otp | password — how vendors sign in');
```
It auto-appears in the web-admin **System Settings** page (generic key/value editor,
`z.unknown()` value schema) — **no web-admin code change needed** to edit it.

### 3b. Backend enforcement
Inject `*config.Cache` into `AuthService` (`NewAuthService` currently takes `db, cfg, otp,
audit`; add `cache` — `SettingsService` already holds one, so the pattern exists). Read
`cache.AppConfigString("vendor_login_method")` and branch **after the user row is loaded** in
each login path ([auth_service.go](backend/internal/services/auth_service.go)):
- `LoginWithPassword`: if `user.Role == RoleVendor` and method != `"password"` → reject
  (`apperror.Forbidden`/`Unauthorized`, generic message, no enumeration).
- OTP login (`IssueTokensForVerifiedUser` / the verify path): if `user.Role == RoleVendor` and
  method == `"password"` → reject the OTP login for vendors.
- Non-vendor roles (super_admin password, regular users OTP) are unaffected.

### 3c. Admin sets/resets a vendor password (backend)
New admin endpoint `PUT /admin/users/:userId/password` → `AdminUserService.SetPassword`
(argon2id via the existing `security` package used in `CompleteRegistration`), restricted to
`super_admin`, writing an `audit_logs` entry, never logging the password. Wire in
[main.go](backend/cmd/api/main.go) admin group. Validate password strength server-side.

### 3d. web-admin UI
Add a "Set password" action for vendor-role users. Simplest placement: in the Users page /
`AdminUserList` row actions (or the vendor detail page) a small modal with a password field →
new `useSetUserPassword` hook (PUT the new endpoint). Reuse `Modal`, `Button`, `TextInput`,
`toApiError`. Add i18n keys.

### 3e. web-vendor client
- `auth-context.tsx`: add `loginWithPassword(phone, password)` → `POST /auth/login-password`
  (endpoint already exists), mirroring `verifyOtp`'s session setup (set tokens, fetch
  `/vendor/me`, set user/vendor).
- `login-page.tsx`: show the password form vs the OTP form based on the configured method. The
  client learns the method from a small **unauthenticated** read (add `vendor_login_method` to
  the public config the client already fetches, or a tiny public `GET /auth/vendor-login-method`).
  Fallback if unknown: show OTP (current behavior).

---

## Files (representative)

- Mobile: `mobile-user/app/(app)/(tabs)/home.tsx`.
- Backend: `internal/services/otp_service.go` (logging); `migrations/000008_vendor_login_method.{up,down}.sql`;
  `internal/services/auth_service.go` (+cache, branching); `internal/services/admin_user_service.go`
  (`SetPassword`); `internal/handlers/admin_user.go` + `auth.go`; `cmd/api/main.go` (wiring, +cache into AuthService).
- web-admin: `features/users/admin-user-list.tsx` (+ set-password modal), `features/users/use-admin-users.ts`, `i18n/locales/en.json`.
- web-vendor: `features/auth/auth-context.tsx`, `features/auth/login-page.tsx`, related schema/i18n.

## Verification

1. **Mobile**: `tsc --noEmit` clean; on the home screen, pull down → spinner shows and the
   vendor list + banners refetch; releasing without a pull does nothing; initial load still uses
   the centered spinner, not the pull spinner.
2. **OTP logging**: `go build ./...` clean; deploy; hit `request-otp`; confirm the log now names
   the failing step; then apply + verify the real fix (OTP request returns 204 and, in dev, the
   code is logged).
3. **Vendor login method**:
   - `go build`/`go vet` clean; migration up/down reverses.
   - In web-admin Settings, `vendor_login_method` appears and is editable (`otp`↔`password`).
   - Admin sets a vendor password (new modal) → `audit_logs` row written, no password in logs.
   - With config = `password`: vendor logs into web-vendor with phone+password; OTP login for a
     vendor is rejected. With config = `otp`: OTP works; password login for a vendor is rejected.
   - super_admin password login and regular-user OTP are unaffected either way.
   - `senior-security` + `security-pen-testing` review the auth branching and set-password
     endpoint before merge.

## Non-goals / notes

- Per-vendor login method (only global now), vendor self-service password, and password-reset
  emails/links are out of scope.
- Keep no-enumeration behavior: rejected vendor logins return generic messages, same shape/timing.
- The mobile icon fix from the previous session is already applied (useFonts removed); unrelated
  to these tasks.
