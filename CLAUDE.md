# Meryata Souq — Project Instructions

## Source of truth
`docs/BLUEPRINT.md` is the complete spec: schema, architecture, security, i18n/RTL,
currency, scheduling, storage, and every page in every app (§11). **Read it before
any work.** If a skill's default advice conflicts with the blueprint, the blueprint
wins — do not deviate without explicitly telling me why and asking first.

## Locked stack (do not substitute)
- Backend: **Go 1.24+**, Echo v4, GORM, PostgreSQL 16 + PostGIS, Redis 7
- Layering: strict `handlers / services / models` (+ middleware, config, ws, i18n, storage, currency, pkg)
- Web (admin + vendor dashboards): React 18 + **TypeScript strict**, Vite, TailwindCSS v3, TanStack Query, React Hook Form + Zod
- Mobile (user + driver apps): React Native + Expo (TS strict), NativeWind, same query/form/validation stack
- **Zero `any`** anywhere in TypeScript. `unknown` + narrowing only. ESLint `no-explicit-any: error`, `tsc --noEmit` must be clean.
- No ignored `err != nil` in Go. Every error handled or returned as `apperror.AppError`.
- All config/secrets in `.env` (never committed). `.env.example` per service.
- Docker is optional convenience only (§17) — never the primary run path in docs or scripts.

## Security is not a phase — it applies to every phase
Before marking any phase done, confirm against blueprint §5:
- [ ] Every route has explicit RBAC + ownership check (tenant isolation)
- [ ] Every input validated server-side
- [ ] No secret/PII in logs; privileged actions written to `audit_logs`
- [ ] New file uploads pass the §5.9 validation pipeline
- [ ] Auth-adjacent changes reviewed with `senior-security` + `security-pen-testing` before merging

## How to work: one builder + one reviewer per task
Never stack multiple `senior-*` builder skills on one prompt — pick one. Always
follow a build step with a review step before moving on.

| Phase (blueprint §15) | Build with | Review with |
|---|---|---|
| 1. Foundation (Go scaffold, apperror, migrations) | `senior-architect` | `code-reviewer` |
| 2. Config, i18n, currency core | `senior-backend` | `code-reviewer` |
| 3. Auth (2-step) + security | `senior-backend` | `senior-security` + `security-pen-testing` |
| 4. Storage abstraction (local/S3) | `aws-solution-architect` | `cloud-security` |
| 5. Vendors, hours, tenancy | `senior-backend` | `code-reviewer` |
| 6. Catalog, images, currency display | `senior-backend` | `code-reviewer` |
| 7. Orders, commission, currency/schedule snapshots | `tdd-guide` (tests first) → `senior-backend` | `senior-qa` |
| 8. Notifications (OneSignal) | `senior-backend` | `code-reviewer` |
| 9. Live tracking (WebSockets) | `senior-backend` | `senior-security` (authed upgrade) |
| 10. Marketing & ratings | `senior-fullstack` | `code-reviewer` |
| 11a. Web dashboards — admin (§11.A), vendor (§11.B) | `senior-frontend` | `senior-qa` |
| 11b. Mobile apps — user (§11.C), driver (§11.D) | `react-native-best-practices` + `senior-frontend` | `senior-qa` |

For 11b: invoke `react-native-best-practices` first on every RN/Expo screen — it
is Software Mansion's New Architecture skill (Reanimated, Gesture Handler, SVG,
multithreading/worklets, JSI) and auto-triggers on any file where `package.json`
depends on `react-native`/`expo`/`expo-router`. Layer `senior-frontend`'s React/TS/
Zod/query-layer conventions on top for the parts it doesn't cover (data fetching,
forms, project structure) — do not let it suggest Next.js/DOM-only APIs (`<div>`,
`localStorage`, web routing) for RN screens. Only pull in the skill's animation/
gesture/audio/on-device-AI/JSI sub-skills (`references/*`) when the screen actually
needs them (e.g. D4 live map + gestures, C-side product image galleries) — most
§11.C/§11.D CRUD screens need only the base best practices.

Phase 11 is four surfaces, not one — build and review admin, vendor, mobile-user,
and mobile-driver as four separate passes through this table row, one surface at a
time (per §15's "build one surface at a time"), each ending with its own senior-qa
check before starting the next surface.

End every phase with:
> "Using senior-qa, verify Phase N's acceptance check in docs/BLUEPRINT.md §15 is
> fully met before I proceed to Phase N+1."

Do not start the next phase until the acceptance check passes.

## Non-negotiable conventions (apply everywhere, every phase)
- Multilingual: backend-driven i18n (`locales` + `ui_translations`), no hardcoded
  UI strings on any client. Arabic is `is_rtl = true` — verify RTL layout (logical
  Tailwind utilities `ms/me/ps/pe/start/end`, `I18nManager.forceRTL` on mobile)
  whenever touching a screen.
- Currency: USD is canonical (`price_usd`). Any order-adjacent write must snapshot
  `currency_code`, `exchange_rate`, and display amount — never recompute historical
  orders from live rates.
- Scheduling: two-gated. Admin sets `scheduling_allowed`; vendor sets
  `scheduling_enabled`. Both must be true before a user sees a slot picker.
- Store hours: always resolve via `vendor_hour_overrides` first, then
  `vendor_hours`, in the vendor's `timezone` — never assume UTC or local server time.
- Image uploads: go through the `Storage` interface (local or s3, switchable via
  `app_configs.storage_driver`). Never write raw file paths into the DB — record the
  driver + object key per §4.4.

## Definition of done for the whole project
See blueprint §13. Do not consider Phase 11 finished until every §11 page has
loading/empty/error states, i18n keys (no hardcoded strings), and passes lint with
zero `any` / zero ignored Go errors.
