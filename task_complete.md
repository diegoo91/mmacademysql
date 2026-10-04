# MM Padel Academy — Complete Task Log

All tasks completed from project inception (2026-09-09) through current date.

---

## Phase 1: Initial Build (2026-09-09)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Full-stack app scaffold (React 19 + Vite 8 + Tailwind 4 frontend, Node.js + Express backend) | Done | 2026-09-09 |
| 2 | JSON file backend (`server/src/database.js`) with CRUD operations | Done | 2026-09-09 |
| 3 | JWT authentication (access + refresh tokens, httpOnly cookies) | Done | 2026-09-09 |
| 4 | Role-based access control (superadmin, admin, coach, player) | Done | 2026-09-09 |
| 5 | User/player management (CRUD, skill levels, positions, member codes) | Done | 2026-09-09 |
| 6 | Booking system (session types, status flow, balance deduction) | Done | 2026-09-09 |
| 7 | Schedule management (Excel import, CRUD slots, court assignments) | Done | 2026-09-09 |
| 8 | Payment management (Cash/Instapay, approve/reject, balance credit) | Done | 2026-09-09 |
| 9 | Match results (CRUD, confirm, winner derivation) | Done | 2026-09-09 |
| 10 | Comments/testimonials (submission, moderation) | Done | 2026-09-09 |
| 11 | Notifications system (per-user, read/unread) | Done | 2026-09-09 |
| 12 | Expense tracking | Done | 2026-09-09 |
| 13 | Admin dashboard (stats, charts, recent activity) | Done | 2026-09-09 |
| 14 | Reports & analytics (revenue, sessions, match stats) | Done | 2026-09-09 |
| 15 | Excel import system (5 types: results, schedule, payments, bookings, players) | Done | 2026-09-09 |
| 16 | Frontend pages: Home, Login, SignUp, Schedule, Book, Payment, Profile | Done | 2026-09-09 |
| 17 | Admin pages: Dashboard, Players, Bookings, ScheduleManager, Results, Users, Imports, Comments, Expenses, Reports, Payments | Done | 2026-09-09 |
| 18 | Shared components: Layout, Navbar, Footer, LoginModal, PlayerSearchInput | Done | 2026-09-09 |

---

## Phase 2: Deployment Setup (2026-09-13 to 2026-09-14)

| # | Task | Status | Date |
|---|------|--------|------|
| 19 | GitHub Pages deploy workflow (CI/CD: build + deploy) | Done | 2026-09-14 |
| 20 | SPA deep links (404.html copy for GitHub Pages) | Done | 2026-09-14 |
| 21 | Conditional base path (`/MMAcademy/` in production) | Done | 2026-09-14 |
| 22 | Prefix image paths with `BASE_URL` for GitHub Pages subpath | Done | 2026-09-14 |
| 23 | Deploy workflow fix (paths filter, list dist, force redeploy) | Done | 2026-09-14 |
| 24 | Base path case fix (`/mmacademy/` -> `/MMAcademy/`) | Done | 2026-09-14 |

---

## Phase 3: Feature Enhancements (2026-09-15)

| # | Task | Status | Date |
|---|------|--------|------|
| 25 | Conditional Pages base, absolute avatar URLs, ensure-admin import | Done | 2026-09-15 |
| 26 | Admin DB import endpoint (`/api/admin/import-db`) + local push script | Done | 2026-09-15 |
| 27 | Real login errors + scoped auth limiter (email+IP) | Done | 2026-09-15 |
| 28 | Admin balance override (warning dialog with free/deduct options) | Done | 2026-09-15 |
| 29 | Move runtime data (DB + uploads) into `server/data/` for safe Docker volume mount | Done | 2026-09-15 |
| 30 | Player schedule history (match slots by name, not just booking_id) | Done | 2026-09-15 |
| 31 | Coach assignment + week Sun-Sat + session history fix + profile stats + balance booking + slot notifications | Done | 2026-09-15 |
| 32 | Ahmed balance fix (4/0), deduction bug in reverse paths, broken /book link, move book-from-balance to Schedule page | Done | 2026-09-15 |
| 33 | DB path root cause fix + balance check consistency + coach seed on startup | Done | 2026-09-15 |
| 34 | Court coach defaults UI + production-to-local DB sync | Done | 2026-09-15 |
| 35 | Balance check endpoint + strict per-choice flow + player search in results | Done | 2026-09-15 |
| 36 | Book page TDZ crash fix + player suggestions 500 fix | Done | 2026-09-15 |

---

## Phase 4: MySQL Migration (2026-09-15 to 2026-09-16)

| # | Task | Status | Date |
|---|------|--------|------|
| 37 | Install `mysql2` + `knex` in `server/` | Done | 2026-09-15 |
| 38 | `server/src/mysql.js` — MySQL connection (Knex + mysql2, lazy init, `now()`/`stamp()`) | Done | 2026-09-15 |
| 39 | `server/src/db.js` — Dual-backend data access layer (MySQL or JSON, same async API) | Done | 2026-09-15 |
| 40 | `server/schema.sql` — Canonical DDL (13 tables, FKs, indexes, utf8mb4) | Done | 2026-09-15 |
| 41 | `scripts/migrate-json-to-mysql.js` — Loader (schema apply + chunked load + verify) | Done | 2026-09-15 |
| 42 | Convert all 17 route files + middleware to async `db.js` | Done | 2026-09-15 |
| 43 | `server/.env.example` documentation + local `server/.env` with `DB_*` vars | Done | 2026-09-15 |
| 44 | JSON backend smoke tests: **28/28 PASS** | Done | 2026-09-15 |
| 45 | Fix pre-existing bugs: `auth.js` missing import, `imports.js` payment commit, stale DDL/inserts | Done | 2026-09-15 |
| 46 | Fix migration bugs: knex lazy env read, loader `.env` overlay, schema splitter, `DB_PASSWORD` passthrough | Done | 2026-09-15 |
| 47 | MySQL read-type parity fix (`normalizeFromMysql` for Date/DECIMAL/JSON) | Done | 2026-09-15 |
| 48 | Route-level JSON guards (`parseIfString`, `Array.isArray`) | Done | 2026-09-15 |
| 49 | Both backends **28/28 PASS** with timing instrumentation | Done | 2026-09-15 |
| 50 | Deep parity — export-db diff (81 cosmetic diffs, zero data corruption) | Done | 2026-09-15 |
| 51 | Deep parity — booking lifecycle (7 steps identical on both backends) | Done | 2026-09-15 |
| 52 | Lifecycle parity test script | Done | 2026-09-15 |
| 53 | Deep parity test script | Done | 2026-09-15 |

---

## Phase 5: Results ↔ Users ID Relationship (2026-09-16)

| # | Task | Status | Date |
|---|------|--------|------|
| 54 | Add `sideA_ids`/`sideB_ids` JSON columns to `results` table (`server/schema.sql`) | Done | 2026-09-16 |
| 55 | Register new columns in `server/src/db.js` `JSON_COLS` | Done | 2026-09-16 |
| 56 | Add `resolveIds()` helper to `server/src/routes/results.js` | Done | 2026-09-16 |
| 57 | Update `POST /results` to accept and store user IDs | Done | 2026-09-16 |
| 58 | Update `PUT /results/:id` to accept and store user IDs | Done | 2026-09-16 |
| 59 | Update `server/src/routes/imports.js` — resolve player names → user IDs on import | Done | 2026-09-16 |
| 60 | Update `server/src/routes/reports.js` — ID-based player stats with name fallback | Done | 2026-09-16 |
| 61 | Update `scripts/migrate-json-to-mysql.js` — add new columns to spec | Done | 2026-09-16 |
| 62 | Update `src/pages/admin/Results.jsx` — use `PlayerSearchInput`, send IDs | Done | 2026-09-16 |
| 63 | Update `src/pages/Profile.jsx` — track IDs, auto-fill current user ID, send IDs | Done | 2026-09-16 |
| 64 | Run lint — no new errors (all warnings pre-existing) | Done | 2026-09-16 |
| 65 | Update `TASK_PROGRESS.md` with results-user ID changes | Done | 2026-09-16 |
| 66 | Create `task_complete.md` (this file) | Done | 2026-09-16 |

---

## Phase 6: PostgreSQL Migration + Full API Sweep + Security Audit Plan (2026-09-16)

| # | Task | Status | Date |
|---|------|--------|------|
| 67 | MySQL → PostgreSQL migration completed (413 rows, 13 tables) | Done | 2026-09-16 |
| 68 | `server/src/sql.js` rewritten for pg (Knex/pg, `mysql2` removed, `pg` added) | Done | 2026-09-16 |
| 69 | `server/src/db.js` pg↔app column mapping adapter (`PG_TO_APP`/`APP_TO_PG`) | Done | 2026-09-16 |
| 70 | `server/schema.sql` rewritten for pg (DDL, triggers, pg-native types) | Done | 2026-09-16 |
| 71 | `scripts/migrate-mysql-to-pg.js` — one-time migration (JSONB stringification, FK ordering) | Done | 2026-09-16 |
| 72 | `server/.env` updated: `DB_ENABLED=true`, `DB_PORT=5432`, `DB_USER=postgres` | Done | 2026-09-16 |
| 73 | `.env.example` updated for pg | Done | 2026-09-16 |
| 74 | `server/src/mysql.js` deleted, zero mysql refs in `server/src/` | Done | 2026-09-16 |
| 75 | Full API endpoint test sweep — **99/99 PASS** (`server/e2e-all.cjs`, 88 unique endpoints) | Done | 2026-09-16 |
| 76 | Fixed: `PUT /slots/court-defaults` — `requireRole` before `authenticate` → crash | Done | 2026-09-16 |
| 77 | Fixed: `POST /results` 500 — pg `sidea`/`sideb` lowercase vs app `sideA`/`sideB` (PG_TO_APP mapping) | Done | 2026-09-16 |
| 78 | Fixed: `JSON_COLS` uses app names but `normalizeForPg` checks after pg mapping (updated to pg names) | Done | 2026-09-16 |
| 79 | Fixed: pg `slots` table missing `coach_id` column (`ALTER TABLE`) | Done | 2026-09-16 |
| 80 | Fixed: pg `slots.time` varchar(10) too narrow → varchar(20) | Done | 2026-09-16 |
| 81 | Fixed: `actionLimiter` max:20 too low for 5 shared route groups → 100/min | Done | 2026-09-16 |
| 82 | payments DELETE 500 regression test: **verified fixed** | Done | 2026-09-16 |
| 83 | Security audit plan completed — 5 critical/high, 7 medium, 4 low findings documented | Done | 2026-09-16 |
| 84 | `TASK_PROGRESS.md` updated with pg migration + security audit plan | Done | 2026-09-16 |

---

## Phase 7: Security Hardening Pass (2026-09-18)

| # | Task | Status | Date |
|---|------|--------|------|
| 85 | Install `cookie-parser`, add middleware in `index.js` | Done | 2026-09-18 |
| 86 | Fix refresh/logout flow: `req.cookies` reads, server-side revocation | Done | 2026-09-18 |
| 87 | Sessions: access token 15m→1d, refresh 7d→30d, env-driven cookie MaxAge | Done | 2026-09-18 |
| 88 | Persistent revocation store: `refresh_denylist` table replaces in-memory Map | Done | 2026-09-18 |
| 89 | Cookie-based boot: `initAuth()` tries refresh→me before returning null | Done | 2026-09-18 |
| 90 | Atomic balance ops: `deductBalance`/`deductBalanceAllowNegative` wrapped in `db.transaction` | Done | 2026-09-18 |
| 91 | DB CHECK constraints: `users.private_balance>=0`, `users.group_balance>=0`, `payments.amount>=0` | Done | 2026-09-18 |
| 92 | JSON 404 + error middleware (no stack traces to clients) | Done | 2026-09-18 |
| 93 | PII scoping: `requireRole` on all `GET /players` routes | Done | 2026-09-18 |
| 94 | ensure-admin create-only (no auto-update on boot) | Done | 2026-09-18 |
| 95 | Import file cleanup: `unlinkSync` after parse in `imports.js` | Done | 2026-09-18 |
| 96 | Weak secrets: `crypto.randomInt` for temp passwords + booking refs | Done | 2026-09-18 |
| 97 | Password policy: min-10, max-72 across all server + frontend paths | Done | 2026-09-18 |
| 98 | Payment delete clamp: negative balance rejection (409), tx-wrapped | Done | 2026-09-18 |
| 99 | Async bcrypt: all `hashSync`/`compareSync` → `await hash`/`await compare` | Done | 2026-09-18 |
| 100 | admin-import-db hardened: backup, preserve audit_logs, confirm, prod guard, >50% sanity | Done | 2026-09-18 |
| 101 | Schedule UX: removed Quick Dates chips, added awaiting-confirmation banner | Done | 2026-09-18 |
| 102 | Gitignore cleanup: uploads, backups, logs, exports | Done | 2026-09-18 |
| 103 | Hardening verification: `oxlint` 0 new warnings, `vite build` clean, e2e 87/89 | Done | 2026-09-18 |

---

## Phase 8: DB-Driven Roles (2026-09-18)

| # | Task | Status | Date |
|---|------|--------|------|
| 104 | Create `server/src/utils/modules.js`: ALL_MODULES, DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES | Done | 2026-09-18 |
| 105 | Add `roles` table to `server/schema.sql` (PostgreSQL DDL + seed) | Done | 2026-09-18 |
| 106 | Seed 4 system roles in `server/src/database.js` (JSON backend) | Done | 2026-09-18 |
| 107 | Boot-time ensure: create `roles` table via Knex if missing, seed if empty | Done | 2026-09-18 |
| 108 | Add `roles` to `TABLES`, `JSON_COLS`, `DATE_COLS` in `server/src/db.js` | Done | 2026-09-18 |
| 109 | Add `roles` to `COLLECTIONS` in `admin-import-db.js` | Done | 2026-09-18 |
| 110 | Rewrite `rbac.js`: DB-backed `getRole()` with 60s cache, async `getUserPermissions()` | Done | 2026-09-18 |
| 111 | Update `auth.js`: all 3 `getUserPermissions` calls → `await` | Done | 2026-09-18 |
| 112 | Create `routes/roles.js`: `GET /api/roles` (any auth), `PUT /api/roles/:name` (superadmin only) | Done | 2026-09-18 |
| 113 | Update `users.js`: validRoles from DB, superadmin escalation guard | Done | 2026-09-18 |
| 114 | Mount `rolesRoutes` in `index.js` at `/api/roles` | Done | 2026-09-18 |
| 115 | Create `src/pages/admin/Roles.jsx`: 4-role grid, per-module toggles, save | Done | 2026-09-18 |
| 116 | Add `/admin/roles` route in `App.jsx` (superadmin-only) | Done | 2026-09-18 |
| 117 | Add "Roles" nav link in `AdminLayout.jsx` (superadmin-only, ShieldCheck icon) | Done | 2026-09-18 |
| 118 | Update `Users.jsx`: role dropdown from `GET /roles`, baseline hint text | Done | 2026-09-18 |
| 119 | Roles verification: `oxlint` 0 new warnings, `vite build` clean, server boots with roles | Done | 2026-09-18 |

---

## Phase 9: Supabase Migration + Public Repo (2026-09-19)

| # | Task | Status | Date |
|---|------|--------|------|
| 120 | Repo made public, GitHub Pages confirmed live, README updated | Done | 2026-09-19 |
| 121 | Git history rewritten via `filter-branch` — purged dumps/uploads/hashes/`inserts.sql` | Done | 2026-09-19 |
| 122 | `.gitignore` hardened: `.env*`, `node_modules/`, `dist/`, `server/data/` | Done | 2026-09-19 |
| 123 | E2E admin password redacted from `e2e-all.cjs` (uses env vars) | Done | 2026-09-19 |
| 124 | `server/schema.sql` fixed: `app_sessions` placement, `created_at`/`updated_at`, `refresh_denylist`, `coach_daily_hours`, `coach_payments` | Done | 2026-09-19 |
| 125 | `scripts/migrate-local-pg-to-supabase.js` created — schema apply + data load + verify | Done | 2026-09-19 |
| 126 | Supabase data load: **1292 rows, 19 tables** — all counts verified | Done | 2026-09-19 |
| 127 | Live write test vs Supabase: signup/login/delete via pooler — **PASS** | Done | 2026-09-19 |
| 128 | Pooled vs direct host resolved — `aws-1-eu-west-1.pooler.supabase.com:6543` (IPv4-compatible) | Done | 2026-09-19 |

---

## Phase 10: Railway Backend + Pages Repoint (2026-09-19)

| # | Task | Status | Date |
|---|------|--------|------|
| 129 | `server/package.json` — added `engines: { node: ">=20" }` for Railway Node 20 | Done | 2026-09-19 |
| 130 | Railway service created: `mm-academy-api-production`, root dir `server/`, watch `server/**`, healthcheck `/api/health` | Done | 2026-09-19 |
| 131 | Railway env vars set: `DATABASE_URL` (pooler), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CORS_ORIGINS` | Done | 2026-09-19 |
| 132 | `render.yaml` committed (inert — config-as-code deprecated on Railway) | Done | 2026-09-19 |
| 133 | `VITE_API_BASE` repo variable set → `https://mm-academy-api-production.up.railway.app/api` | Done | 2026-09-19 |
| 134 | Pages redeployed — bundle verified: Railway URL in, `localhost:5174` out | Done | 2026-09-19 |
| 135 | E2E via Railway: health OK, signup, login, admin delete, moharam (id=34, superadmin, active) | Done | 2026-09-19 |
| 136 | Frontend: `base: '/mmacademysql/'`, router `basename` from `BASE_URL`, `public/CNAME`, multi-origin CORS | Done | 2026-09-19 |
| 137 | CORS `FRONTEND_URL=https://diegoo91.github.io` set on Railway | Done | 2026-09-19 |

---

## Phase 11: Production PG Bug Fixes (2026-09-19)

| # | Task | Status | Date |
|---|------|--------|------|
| 138 | `PUT /api/users/:id` 500 — removed nonexistent `permissions` column, added 409 duplicate email guard (`5dee471`) | Done | 2026-09-19 |
| 139 | Import commit 500 — `slots.time VARCHAR(10)` too narrow → widened to `VARCHAR(20)` + boot migration (`c00278c`) | Done | 2026-09-19 |
| 140 | Schedule import overwrite → merge: group players combine into one slot (`b85f3dc`, `e93d6e8`) | Done | 2026-09-19 |
| 141 | `db.findAll` predicate bug — raw knex rows (Date objects) never `===` strings → normalize before filter (`4d591d4`) | Done | 2026-09-19 |
| 142 | Added `authenticate` middleware to 9 protected slot routes (PUT, DELETE, approve, toggle-type, mark-attended) (`760ad90`) | Done | 2026-09-19 |
| 143 | Schedule import merge verified — group pairs merge into one slot with both players | Done | 2026-09-19 |

---

## Phase 12: Session Polish & UX (2026-09-25)

| # | Task | Status | Date |
|---|------|--------|------|
| 144 | Logo component (`src/components/Logo.jsx` + `public/images/logo-badge.png`) swapped into Navbar, Footer, LoginModal, Login, DeclineChoiceModal, Book — both themes verified | Done | 2026-09-25 |
| 145 | Unified time utils (`src/lib/time.js` — `canonTime`, `formatSlotTime` incl. `10:00-12:00` ranges) wired into 10 pages/components | Done | 2026-09-25 |
| 146 | Reports totals fix: All-Time preset default, approved-only totals, "Received (Filtered)" — verified live (all = 96,400 EGP) | Done | 2026-09-25 |
| 147 | Schedule Manager: per-cell dropdown menu with two-step delete confirm | Done | 2026-09-25 |
| 148 | Scroll-to-top on route change (`ScrollToTop.jsx` mounted in `Layout.jsx`) | Done | 2026-09-25 |
| 149 | Session-polish batch: `oxlint` 0 new warnings, `vite build` clean | Done | 2026-09-25 |

---

## Phase 13: Balance Integrity & UserDetail Rework (2026-09-25)

| # | Task | Status | Date |
|---|------|--------|------|
| 150 | `scripts/balance-audit.js` (read-only) — finding: all stored balances correct, display-only bug (3× private counted), 3 mis-attributed prod slots | Done | 2026-09-25 |
| 151 | True-total display: `group_balance` = real credits + new `group_from_private` in `users.js`/`reports.js`/`dashboard.js`; Reports/UserDetail/Profile/ScheduleManager UI — verified live (Titos 5/0, remaining 5) | Done | 2026-09-25 |
| 152 | `scripts/apply-balance-fixes.js` — applied: slot 216 renamed + 1 group deducted (Eyad/Youssef Dawish 4→3), slot 214 renamed, orphan user 26 deleted; slot 213 skipped per rejection; backups + 5 audit rows | Done | 2026-09-25 |
| 153 | Post-fix verification: audit re-run (all stored == FIFO), live API check, `oxlint` + `vite build` clean | Done | 2026-09-25 |
| 154 | UserDetail restructure: Amount Owed + Total Paid moved to top; Remaining Private + Remaining Group merged into one `1P · 2G` card (full-width on mobile) | Done | 2026-09-25 |

---

## Phase 14: Coach Balance Backfill (2026-09-25)

| # | Task | Status | Date |
|---|------|--------|------|
| 155 | Preflight: Coach Laila = `user_id 36`, Coach Omar = `user_id 37` (only coaches), zero existing rows for 2026-09-20..23 | Done | 2026-09-25 |
| 156 | Backup `coach_daily_hours` → `scripts/payments-backups/coach-daily-hours-2026-09-25T16-05-48.json`, then transactional insert of 7 rows + 7 audit rows | Done | 2026-09-25 |
| 157 | API verification: range sums Laila 26h (7+6+6+7), Omar 18h (7+6+5, 21-9 skipped) ASSERT PASS; all-time balances Laila 73 / Omar 44 | Done | 2026-09-25 |

---

## Summary

| Category | Count |
|----------|-------|
| Total tasks completed | 194 |
| Phase 1: Initial Build | 18 |
| Phase 2: Deployment | 6 |
| Phase 3: Feature Enhancements | 12 |
| Phase 4: MySQL Migration | 17 |
| Phase 5: Results ↔ Users IDs | 13 |
| Phase 6: pg Migration + API Sweep + Security Audit | 18 |
| Phase 7: Security Hardening Pass | 19 |
| Phase 8: DB-Driven Roles | 16 |
| Phase 9: Supabase Migration + Public Repo | 9 |
| Phase 10: Railway Backend + Pages Repoint | 9 |
| Phase 11: Production PG Bug Fixes | 6 |
| Phase 12: Session Polish & UX | 6 |
| Phase 13: Balance Integrity & UserDetail Rework | 5 |
| Phase 14: Coach Balance Backfill | 3 |
| Phase 15: Coaching Journey & Progress Reports | 9 |
| Phase 16: Package-Priced Unpaid Report + Money-Driven Allocation | 4 |
| Phase 17: Schedule Integrity & Coach Availability | 4 |
| Phase 18: Receipt PDF Redesign | 4 |
| Phase 19: Academy Media Gallery | 1 |
| Phase 20: Shared FIFO Balance Engine + Local Reconcile | 8 |
| Phase 21: Production Balance Reconcile | 7 |
| Outstanding: orphan name merge + never-deducted slot workflow cleanup | (next) |

---

## Bugs Fixed (chronological)

| # | Bug | Fix | Date |
|---|-----|-----|------|
| 1 | Book page TDZ crash | Fixed temporal dead zone in `Book.jsx` | 2026-09-15 |
| 2 | Player suggestions 500 error | Fixed player search endpoint | 2026-09-15 |
| 3 | `auth.js` called `auditUpdate` without importing | Added missing import | 2026-09-15 |
| 4 | `imports.js` payments-commit searches `users` by booking `ref` | Preserved as-is (known issue) | 2026-09-15 |
| 5 | Knex lazy env read (module-level `dbConfig` captured empty env) | Deferred env read to function call | 2026-09-15 |
| 6 | Loader `server/.env` overlay not applied | Added manual `.env` parser for standalone scripts | 2026-09-15 |
| 7 | Schema-apply splitter failed on comments with `;` | Strip full-line `--` comments before splitting | 2026-09-15 |
| 8 | `DB_PASSWORD` not passed through to Knex | Added explicit passthrough in `mysql.js` | 2026-09-15 |
| 9 | MySQL read-type mismatch (Date objects vs strings) | Added `normalizeFromMysql` row normalizer | 2026-09-15 |
| 10 | `sessions_json` string vs parsed object | Added `parseIfString()` guard in `bookings.js` | 2026-09-15 |
| 11 | `sideA`/`sideB` not always arrays | Wrapped with `Array.isArray()` in `results.js` + `reports.js` | 2026-09-15 |
| 12 | Ahmed balance wrong (4/0) | Fixed deduction bug in reverse paths | 2026-09-15 |
| 13 | Broken `/book` link | Moved book-from-balance to Schedule page | 2026-09-15 |
| 14 | CORS error (backend not running) | Started backend API on `:5174` | 2026-09-16 |
| 15 | `PUT /slots/court-defaults` crashes (no auth before `requireRole`) | Added `authenticate` middleware before `requireRole` | 2026-09-16 |
| 16 | `POST /results` 500 on pg (camelCase vs lowercase columns) | Added `results` PG_TO_APP mapping: `sidea→sideA`, `sideb→sideB`, etc. | 2026-09-16 |
| 17 | `JSON_COLS` checked app names after pg mapping → jsonb stringification failed | Updated `JSON_COLS` to use pg column names (`sidea`, not `sideA`) | 2026-09-16 |
| 18 | pg `slots` table missing `coach_id` column → insert 500 | `ALTER TABLE slots ADD COLUMN coach_id integer` | 2026-09-16 |
| 19 | pg `slots.time` varchar(10) too narrow for import `HH:MM-HH:MM` | `ALTER COLUMN time TYPE varchar(20)` | 2026-09-16 |
| 20 | `actionLimiter` max:20 shared across 5 route groups → 429 cascade | Increased to 100/min | 2026-09-16 |
| 21 | Refresh-token flow broken (no `cookie-parser`) | Installed + added `cookie-parser` middleware | 2026-09-18 |
| 22 | Balance race / non-atomic money ops | Wrapped balance helpers in `db.transaction` | 2026-09-18 |
| 23 | PII over-exposure (`GET /players` public) | Added `requireRole` to all player GET routes | 2026-09-18 |
| 24 | Multer errors leak stack traces as HTML | Added JSON 404 + error middleware | 2026-09-18 |
| 25 | `ensure-admin` resets password on every boot | Rewritten to create-only-if-missing | 2026-09-18 |
| 26 | Import files left on disk after parse | Added `unlinkSync` after `XLSX.readFile` | 2026-09-18 |
| 27 | Weak temp passwords (`Math.random`) | Replaced with `crypto.randomInt` | 2026-09-18 |
| 28 | No password max length (bcrypt 72-byte truncation) | Added max-72 check everywhere | 2026-09-18 |
| 29 | `DELETE /payments` drives balances negative | Added floor check + 409 rejection | 2026-09-18 |
| 30 | `bcrypt.hashSync` blocks event loop | Converted all to async `await bcrypt.hash/compare` | 2026-09-18 |
| 31 | `admin-import-db` wipes audit_logs | Added backup, append-preserve, confirm, prod guard | 2026-09-18 |
| 32 | In-memory revocation Map wiped on restart | Replaced with `refresh_denylist` DB table | 2026-09-18 |
| 33 | Hardcoded 7d cookie `MaxAge` | Derived from `REFRESH_TOKEN_EXPIRES` env | 2026-09-18 |
| 34 | PG `roles` table missing → boot crash | Boot-time `CREATE TABLE IF NOT EXISTS` via Knex | 2026-09-18 |
| 35 | PG JSONB insert: array passed instead of string | Added `roles` to `JSON_COLS` in `db.js` | 2026-09-18 |
| 36 | `PUT /api/users/:id` 500 on Supabase (nonexistent `permissions` column) | Removed `permissions` from update, added 409 duplicate email guard | 2026-09-19 |
| 37 | Import commit 500 — `slots.time VARCHAR(10)` truncates `HH:MM-HH:MM` | Widened to `VARCHAR(20)` + boot migration | 2026-09-19 |
| 38 | Schedule import overwrites instead of merging group players | Changed from `db.upsert` to `findAll` + merge + delete extras | 2026-09-19 |
| 39 | `db.findAll` predicate never matches — raw knex Date objects vs strings | Normalize rows before passing to predicate in `findAll` | 2026-09-19 |
| 40 | 9 slot routes missing `authenticate` middleware — silent 401s | Added `authenticate` to PUT/DELETE/approve/toggle-type/mark-attended routes | 2026-09-19 |
| 41 | Reports vs Payments totals disagreed (missing All-Time preset) | All-Time preset default + approved-only totals + "Received (Filtered)" | 2026-09-25 |
| 42 | Remaining-sessions display overstated (private counted 3× as group) | True-total display: group = real credits, convertible amount surfaced as `group_from_private` note | 2026-09-25 |
| 43 | Prod slots 214/216 mis-attributed names + orphan user 26 (bare "Youssef") | Renamed to canonical players, +1 group deducted per slot, orphan deleted; slot 213 skipped per rejection | 2026-09-25 |
| 44 | Court-default save overwrote coach on ALL future slots (not just default-less ones) | Apply only where coach is empty + full-future pass fix (`75839d9`, `6d05562`) | 2026-10-02 |
| 45 | Payment counts credited per-bucket while sessions list cross-converted (1P=2G) → phantom credit + group debt never settled ("8P paid, both sides still owed") | Shared `simulateFifo` engine, conversion-aware `allocateFromSessions`, UI entered-vs-money warning, local reconcile repair (`c14dd67`) | 2026-10-04 |

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Dual-backend (JSON + MySQL + pg) | Local dev uses pg; JSON was legacy fallback |
| Supabase pooler (aws-1) over direct host | Direct host is IPv6-only; pooler is IPv4-compatible |
| Railway backend over Render | Free tier, deploys from GitHub, healthcheck endpoint, no procfile needed |
| Config-as-code via dashboard (not `railway.json`) | Railway deprecated config-as-code in repo; env vars + service settings in dashboard |
| Idempotent boot migrations | `ALTER TABLE` + `ALTER COLUMN` at boot handles schema drift without manual DDL |
| `ON DELETE SET NULL` for all FKs | Matches JSON behavior (no cascades in app) |
| `sideA_ids`/`sideB_ids` alongside names | Backward compatible — old results without IDs still work |
| ID-based matching in reports with name fallback | Handles legacy data gracefully |
| `PlayerSearchInput` in Results/Profile | Enables ID capture via `onPlayerSelect` callback |
| pg column mapping adapter in `db.js` | Transparent to all route files — zero route changes needed for pg |
| `actionLimiter` max:100 | 5 route groups share one limiter; 20 was too restrictive for normal use |
| One security hardening pass (single batch) | All security fixes in one PR to avoid intermediate broken states |
| DB-backed roles with 60s cache | Avoids per-request DB hit while staying reasonably fresh |
| `users.role` stays as name string (no FK) | Avoids refactoring ~40 `requireRole` call sites; validated at app layer |
| Per-user permission overrides kept | Role gives baseline, user.permissions adds extras; zero migration of existing data |
| Superadmin row locked to all modules | Prevents accidental lockout from reduced permissions |
| True-total display + separate convertible note | Balances show real remaining; "available as group (up to X)" note instead of hidden pooling — matches conversion rule 1 priv = 2 group |
| Balance fixes via script with backups + audit rows | `apply-balance-fixes.js`: validations, optimistic-lock guards, tx rollback, backup JSON, `audit_logs` rows — repeatable/verifiable prod data ops |
| Coach balance = SUM(coach_daily_hours) − SUM(coach_payments) | Hours worked upserted per day (UNIQUE coach+date); backfill done via transactional SQL + audit rows with pre/post verification |
| One shared FIFO engine (`convertBalance.simulateFifo`) for every balance consumer | Three duplicated loops had drifted from per-bucket caps (root cause of the phantom-credit class); sessions list, reports, rebuild, audit, allocation and reconcile now walk identical state |
| Reconcile = deterministic re-seed to empty-pool truth + cumulative FIFO replay | Reverse-then-replay churned into oscillating excess buckets; re-seeding makes starting state/columns irrelevant → one-pass exactness, replay converges, trim is a safety no-op |

---

## Phase 15: Coaching Journey & Progress Reports (2026-10-01)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Assessment structure: 33 skills across 4 pillars (Shots 19 / Fitness 4 / Movement 5 / Game Intelligence 5) as `assessment_templates`, boot-seeded idempotently on both pg + JSON backends | Done | 2026-10-01 |
| 2 | New tables `journey_reports` (kind initial/monthly, 6-status machine, `UNIQUE(user_id, kind, report_number)`, default `maximum_reports=10`) + `journey_items` (1–10 CHECK constraints) wired into `schema.sql`, `db.js` (`TABLES`/`DATE_COLS`/`DECIMAL_COLS`), `database.js` `DEFAULTS` | Done | 2026-10-01 |
| 3 | REST API `server/src/routes/journey.js`: templates, self summary, per-user admin view, assessment lifecycle (draft→submitted→in-review→returned→reviewed→published), monthly creation with assessment-first gate + active/duplicate-month guards, whole-number 1–10 validation, completeness gates (submit=33 self-scores, reviewed=admin+final, publish=final), server-computed overall + pillar averages (1dp) + progress %, `notifyUser` + audit on transitions | Done | 2026-10-01 |
| 4 | Shared UI `src/components/Journey.jsx`: summary cards in exact spec formats (`Sessions completed: 8`, `Report 3 of 10`, `Overall score: 7.2/10`, `Journey progress: 30%` — score and count kept separate), pillar-average chips, grouped 33-skill editors (player / admin / read-only), empty state (explanation + sessions count + Start Your Journey + Initial Assessment), journey timeline, collapsible report cards, status pills | Done | 2026-10-01 |
| 5 | Profile.jsx: `My Journey` section (players only) between Session History and Session Credits, `#journey` anchor | Done | 2026-10-01 |
| 6 | UserDetail.jsx: `Journey` tab in the player tab bar — full admin workflow: create monthly report (month picker + gating hints), admin-score/final-score editing with "Finals ← admin scores" helper, start review, return with feedback prompt, mark reviewed, publish, edit a published report | Done | 2026-10-01 |
| 7 | Decisions: report authorship = admins + coaches via existing `players` permission (zero RBAC changes); completed session = `player_confirmed` slot on/before today (mirrors `enrichPlayer` name matching); players only see published reports fully (returned reports editable, drafts metadata-only) | Done | 2026-10-01 |
| 8 | Verification: oxlint 0 errors (0 warnings in Journey.jsx), `npm run build` OK, e2e extended with 41 journey checks (RBAC 403s, validation 400s, full lifecycle, progress math) — **141/141 passed** | Done | 2026-10-01 |
| 9 | Interface redesign + analytics committed as checkpoint `4a7e10d` (dense SkillsList R1-R6, ScoreRing, sticky action bars, TrendChart/PillarRadar/ReportAnalytics, journey-constraint boot self-heal after orphan-row incident) — e2e **144/144** | Done | 2026-10-02 |

---

## Phase 16: Package-Priced Unpaid Report + Money-Driven Allocation (2026-09-30 → 2026-10-01)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Module permission gating on API routes + payment editing (`PUT /payments/:id`) + slot deduct integrity guards (`e24596d`) | Done | 2026-09-30 |
| 2 | Package-priced unpaid report (`packagePrice`: 16P = 14,000 + 3G = 1,500 → 15,500 EGP, not 17,500) + money-driven payment allocation preview (`9b70bf9`) | Done | 2026-10-01 |
| 3 | Pricing regression suite + prod invariant audit + CI gate (`ff962f8`) — server↔frontend pricing parity for counts 0..64 | Done | 2026-10-01 |
| 4 | Fix: FeedbackProvider mount + base-absolute sw/manifest URLs (`e5e2e7e`) | Done | 2026-10-01 |

---

## Phase 17: Schedule Integrity & Coach Availability (2026-10-01 → 2026-10-02)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Load all slots so dates outside the today±30 window render (`ed47ea2`) | Done | 2026-10-01 |
| 2 | Saved court-default coach applied to existing future slots (`75839d9`) | Done | 2026-10-01 |
| 3 | Fix: court default no longer overwrites coach on ALL future slots (`6d05562`) | Done | 2026-10-02 |
| 4 | Coach availability management (weekly + date exceptions) with assignment enforcement in ScheduleManager (`5ea0eec`); coach-availability smoke **19/19** | Done | 2026-10-02 |

---

## Phase 18: Receipt PDF Redesign (2026-10-02 → 2026-10-03)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Redesigned receipt PDF: partial-payment options + two-step package box + "WHAT YOU OWE" framing (`922d885`) | Done | 2026-10-02 |
| 2 | Drop "pay any amount" carry-over line from next-step box (`eb915c0`) | Done | 2026-10-03 |
| 3 | Hero recommendation band so players see the package, not just the debt (`0a6c764`) | Done | 2026-10-03 |
| 4 | Receipt smoke (`server/_smoke-receipt.mjs` → ALL PRESENT) + real-data receipt vs Farida (21 sessions, 17,500 EGP → 286 KB PDF) + **user acceptance** | Done | 2026-10-03 |

---

## Phase 19: Academy Media Gallery (2026-10-02)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Media gallery checkpoint: hero video + Moharam portrait on redesigned pages (`a5ea837`) | Done | 2026-10-02 |

---

## Phase 20: Shared FIFO Balance Engine + Local Reconcile (2026-10-04)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Root-cause audit: three duplicated FIFO loops vs `paymentAllocation` per-bucket caps (`coverGroup = min(covered.group, 0) = 0`) — counts credited per-bucket while the sessions list cross-converts (1P = 2G) → phantom credit + group debt never settled (the "8P vs 1P+12G" bug) | Done | 2026-10-04 |
| 2 | `server/src/utils/convertBalance.js` — pure `simulateFifo(poolP, poolG, slots, {isExternallyPaid})` as the single source of truth; rewired `sessionPaid.js`, `payments-rebuild.js`, `balance-audit.js` — zero-drift baselines (audit/unpaid/receipt outputs identical) | Done | 2026-10-04 |
| 3 | `paymentAllocation.js` rewritten — pure `allocateFromSessions` (chronological slots) + conversion-aware covered/credit split + `warning` when entered counts ≠ money-derived (live previews verified: money 5000 → covered (4,2); explicit 8P/0G → covered (7,2) + warning) | Done | 2026-10-04 |
| 4 | UI: `fetchPaymentPreview`/`useAllocationPreview` send explicit private/group counts when touched; `AllocationHint` entered-vs-money warning block; removed `countsTouched ? null` suppression in Payments add/edit + UserDetail | Done | 2026-10-04 |
| 5 | `planPaymentReversal` extracted to `server/src/utils/paymentReversal.js` (routes import it) + regression tests F1–F5 + simulateFifo pins — server tests **26/26** | Done | 2026-10-04 |
| 6 | `scripts/balance-audit.js --source=localpg` added; prod DB pulled local (`pull-supabase-to-local --force --skip-schema`, 3892 rows, pre-pull backup taken); Phase-0 audit: 36 players / 33 flagged, 3 orphan name segments, 0 duplicates | Done | 2026-10-04 |
| 7 | `scripts/reconcile-balances.js --report/--apply` — deterministic RE-SEED to empty-pool truth + cumulative FIFO replay + engine-exact settlement columns (routes' `applyAllocation` math, cell for cell) + trim/verify per player; JSON backups + `balance.reconcile` audit rows; mirror-safety abort vs `computePlayerSessions`; replay converges to a fixed point (no drift loops) | Done | 2026-10-04 |
| 8 | Local repair **27/27 players, 0 drift on re-report** (8 skipped = no manual payments, untouched); API spot-check matches (Adham credit 0/2, Ahmed debt 3P, Aley phantom 7P→1P, Titos excess removed, Youssef Ashraf 6P restored); gates: tests 26/26, receipt ALL PRESENT, coach 19/19, oxlint 0, build 0; pushed `c14dd67` | Done | 2026-10-04 |

---

## File Changes Summary

### Backend (server/)
| File | Changes |
|------|---------|
| `server/src/routes/journey.js` | New: coaching journey REST — assessment + monthly report lifecycle, validation, math, notify + audit |
| `server/src/utils/journey.js` | New: 33-skill template list, PILLARS, status sets, score validation, avg/round1/progress helpers |
| `server/src/index.js` | `ensureJourneyTables()` boot migration (3 tables + triggers + indexes + 33-skill seed) + `/api/journey` mount |
| `server/schema.sql` | `assessment_templates` / `journey_reports` / `journey_items` DDL, CHECKs, UNIQUE, FK indexes, updated_at triggers; DROPs in cleanup block |
| `server/src/db.js` | Journey tables in `TABLES`; `DATE_COLS` + `DECIMAL_COLS` (`overall_score`) entries |
| `server/src/database.js` | Journey collections in `data` literal + `DEFAULTS` (JSON backend parity) |
| `server/e2e-all.cjs` | New `[journey]` block — 41 checks; suite now 141 endpoints |
| `server/schema.sql` | Added `sideA_ids`/`sideB_ids` JSON columns to `results`; pg DDL; `roles` table + seed; `refresh_denylist` table; CHECK constraints; `app_sessions` placement fix; `slots.time` widened to `VARCHAR(20)`; `coach_daily_hours` + `coach_payments` tables |
| `server/src/db.js` | Added `sideA_ids`/`sideB_ids` to `JSON_COLS`; pg↔app column mapping; `roles` to `TABLES`/`JSON_COLS`/`DATE_COLS`; `removeWhere`; normalize rows before predicate in `findAll`; `DATE_COLS` for slots |
| `server/src/sql.js` | Rewritten for pg (Knex/pg) |
| `server/src/middleware/rbac.js` | DB-backed `getRole()` with cache, async `getUserPermissions()`, `requirePermission` now async |
| `server/src/middleware/auth.js` | `authenticate` + `optionalAuth` + `requireRole` exported; `authenticate` added to 9 slot routes |
| `server/src/middleware/validation.js` | Added `validatePassword()` helper (min-10, max-72) |
| `server/src/utils/tokens.js` | 1d/30d defaults, `parseDuration()`, env-driven `cookieOptions` |
| `server/src/utils/token-revocation.js` | DB-backed (`refresh_denylist`), replaces in-memory Map |
| `server/src/utils/modules.js` | New: `ALL_MODULES`, `DEFAULT_ROLE_PERMISSIONS`, `ROLE_HIERARCHY`, `SYSTEM_ROLES` |
| `server/src/routes/auth.js` | cookie-parser support, async bcrypt, password policy, await getUserPermissions, env-driven cookie |
| `server/src/routes/users.js` | DB-derived validRoles, superadmin escalation guard, crypto.randomInt, async bcrypt; removed `permissions` from PUT, added 409 email guard |
| `server/src/routes/roles.js` | New: GET + PUT (superadmin-only) |
| `server/src/routes/players.js` | `requireRole` on all GET routes (PII scoping) |
| `server/src/routes/payments.js` | Negative balance clamp, tx-wrapped delete |
| `server/src/routes/slots.js` | Balance helpers wrapped in `db.transaction`; 9 routes protected with `authenticate` |
| `server/src/routes/imports.js` | `unlinkSync` after parse; schedule import merge (findAll + dedup + delete extras) |
| `server/src/routes/admin-import-db.js` | Backup, preserve audit_logs, confirm, prod guard, roles in COLLECTIONS |
| `server/src/ensure-admin.js` | Create-only (no auto-update), async bcrypt |
| `server/src/seed.js` | Async bcrypt |
| `server/src/index.js` | cookie-parser, 404/error middleware, roles ensure + mount, revocation DB setup; boot migrations (account_status, slots.time widening) |
| `server/src/database.js` | `roles` collection + seed |
| `server/package.json` | `engines: { node: ">=20" }` for Railway |
| `server/.env.example` | 1d/30d token defaults |
| `server/e2e-all.cjs` | Existing: 99-endpoint sweep |
| `scripts/migrate-local-pg-to-supabase.js` | New: schema apply + data load + verify for Supabase |
| `server/src/routes/users.js` (balance display) | `enrichPlayer`: `group_balance` = real credits, new `group_from_private` field |
| `server/src/routes/reports.js` (balance display) | Both remaining-sessions builders fixed (group real + convertible note) |
| `server/src/routes/dashboard.js` | `sessionCredits` group balance = real credits |
| `scripts/balance-audit.js` | New: read-only prod audit — stored vs FIFO, orphan segments, duplicate names |
| `scripts/apply-balance-fixes.js` | New: transactional prod fixes — validations, optimistic locks, backups, audit rows |
| `scripts/payments-backups/` | Excluded from git: balance-fixes + coach-daily-hours backup JSONs |

### Frontend (src/)
| File | Changes |
|------|---------|
| `src/components/Journey.jsx` | New: shared `MyJourneySection` (Profile) + `JourneyTab` (UserDetail) — summary cards, 33-skill editors, report cards, timeline, empty state |
| `src/pages/Profile.jsx` | `My Journey` section (players) after Session History; import |
| `src/pages/admin/UserDetail.jsx` | `Journey` tab entry + `<JourneyTab userId>` mount; `TrendingUp` icon import |
| `src/lib/api.js` | Cookie-based boot in `initAuth()` (refresh→me) |
| `src/pages/admin/Roles.jsx` | New: role permissions management page |
| `src/pages/admin/Users.jsx` | Role dropdown from GET /roles, baseline hint |
| `src/pages/admin/AdminLayout.jsx` | Roles nav link (superadmin-only) |
| `src/pages/admin/ScheduleManager.jsx` | Upload/preview/import/delete slot UI |
| `src/pages/Schedule.jsx` | Removed Quick Dates, awaiting-confirmation banner |
| `src/pages/SignUp.jsx` | Password min-10 |
| `src/pages/Profile.jsx` | Password min-10 |
| `src/App.jsx` | Roles route, password min-10 |
| `vite.config.js` | `base: '/mmacademysql/'` for GitHub Pages subpath |
| `.gitignore` | uploads, backups, logs, exports, `.env*`, `node_modules/`, `dist/`, `server/data/` |
| `public/CNAME` | `www.mmacademy.com` for custom domain |
| `.github/workflows/deploy.yml` | Pages deploy with `VITE_API_BASE` baked in at build time |
| `render.yaml` | Inert (Railway deprecated config-as-code; kept for reference) |
| `src/components/Logo.jsx` + `public/images/logo-badge.png` | New: logo badge component + asset, used in Navbar, Footer, LoginModal, Login, DeclineChoiceModal, Book |
| `src/components/ScrollToTop.jsx` | New: scroll reset on route change; mounted in `Layout.jsx` |
| `src/lib/time.js` | New: `canonTime` / `formatSlotTime` unified time format (incl. `10:00-12:00`) |
| `src/pages/admin/UserDetail.jsx` | Owed/Paid moved to top, Remaining merged into `1P · 2G` card, Balances "Available as group" row |
| `src/pages/admin/Reports.jsx` | All-Time default, approved-only totals, "Received (Filtered)", convertible note |
| `src/pages/admin/ScheduleManager.jsx` | Cell dropdown + two-step delete; group-avail check includes convertible private (`grp + priv*2`) |
| `src/pages/Profile.jsx` | "Up to X as group" conversion note; time utils |
| Other logo/time files | `Navbar`, `Footer`, `LoginModal`, `Login`, `DeclineChoiceModal`, `Book`, `Schedule`, `Dashboard`, `Users` — logo swap + time-format wiring |

---

## Phase 21: Production Balance Reconcile (2026-10-04)

| # | Task | Status | Date |
|---|------|--------|------|
| 1 | Deploy verified live: Railway `/api/health` 200 + conversion-aware preview marker (entered-vs-money `warning` field returned) proves `c14dd67` on prod; Pages deploy run `37189712505` success; CI Tests green on both pushes | Done | 2026-10-04 |
| 2 | Prod DB backup before writes: `pg_dump -Fc` → `%TEMP%\opencode\prod-before-reconcile-20261004.dump` (589 KB; `sslmode=no-verify` rewritten to `require` for libpq) | Done | 2026-10-04 |
| 3 | `node scripts/reconcile-balances.js --source=prod --report` (read-only) — mirrored local exactly: 36 players, 27 drifted, 1 ok, 8 skipped, same 6 excess players (Adham 1P, Aley 6P, Halawany 2P, Yasin Mahmoud 3P, Zein 2G, Titos 1P) | Done | 2026-10-04 |
| 4 | `--source=prod --apply` — **27/27 repaired** (JSON report + per-row backup written); re-report → **0 drifted / 28 ok / 8 skipped** | Done | 2026-10-04 |
| 5 | `node scripts/balance-audit.js --source=prod` — 30 flagged / 6 clean; credit side == FIFO everywhere (residuals are workflow flags only: never-deducted / vs-deducted-FIFO / vs-allSlots-FIFO); orphan segments `zein`/`john smith`/`jane doe` unchanged, 0 duplicates, 0 payment mismatches | Done | 2026-10-04 |
| 6 | API spot-check vs prod (9/9 match targets): Adham 0/2, Ahmed Saleh debt 3P, Aley 1/0 (phantom 7P gone), Zein 0/4, Haitham 2/0, Titos 0/1, Youssef Ashraf 6/0, Omar haitham 1/9; skipped Farida untouched (0/0, debt 2P, unpaid 17,500 / 21 sessions); unpaid report unchanged (14 players, 80,000) | Done | 2026-10-04 |
| 7 | Gates: server tests **26/26**, receipt smoke **ALL PRESENT**, coach smoke **19/19** (one transient `fetch failed`, rerun green — smokes run on local backend with the same `c14dd67` code prod-marker-verified; coach smoke writes slots so never pointed at prod) | Done | 2026-10-04 |
