# MySQL Migration — Task Progress (local-only; production stays on JSON)

**Scope:** migrate local dev to MySQL (`localhost:5175`, db `mmacademy`); production (Railway) keeps the JSON file. Dual-backend design: `DB_ENABLED=true` → MySQL, otherwise JSON (`server/src/database.js`, untouched).

## Done

- [x] Installed `mysql2` + `knex` in `server/` (`server/package.json` + lock updated).
- [x] `server/src/mysql.js` (pool, lazy env read, `now()`/`stamp()`), `server/src/db.js` (async dual-backend API: object filters + predicate fns + `[[col,dir]]`/comparator orderBy, `transaction()`, `replaceAll/exportAll`).
- [x] `server/schema.sql` — canonical DDL (13 tables, `id` PKs, FKs `ON DELETE SET NULL`, indexes; `players` table dropped; keeps JSON names `read`/`from`/`to`/`count`/`before`/`after`). Supersedes `server/ddl.sql` + `server/inserts.sql` (left in place, do not use).
- [x] `scripts/migrate-json-to-mysql.js` — loader (schema apply + chunked load + verify; `--dry-run`, `--force`, `--skip-schema`; folds legacy `slots.player_name_1/2` → `player_text` and legacy `players` → `users`).
- [x] Data loaded: **357 rows, all counts match** (users 37, slots 132, bookings 4, payments 17, audit_logs 116, notifications 39, booking_requests 5, import_batches 2, expenses 2, court_defaults 3; results/comments/conversion_requests empty). Dry-run clean: 0 orphans, 0 dupes.
- [x] All **17 route files** + `middleware/auth.js` + `middleware/audit.js` (now promise-returning) + `ensure-admin.js` + `seed.js` + `index.js` converted to async `db.js`. One-off scripts (`import-day.js`, `migrate-*.js`, …) still use legacy `database.js` (JSON-only, fine).
- [x] `server/.env.example` documents `DB_*`; local `server/.env` (gitignored) has `DB_*` + `IMPORT_SECRET` (copied from root `.env` so local `admin-import-db` works; fixes pre-existing local 403).
- [x] JSON backend smoke: **28/28 PASS**.
- [x] Pre-existing bugs found (not caused by migration): `auth.js` called `auditUpdate` without importing it (import added); `imports.js` payments-commit searches `users` by booking `ref` (preserved as-is); `inserts.sql`/`ddl.sql` stale; `booking_requests.decided_at` copy-pasted values in old snapshot.
- [x] Fixed along the way: knex lazy env read (module-level `dbConfig` captured empty env), loader `server/.env` overlay, schema-apply splitter (comment `;` + stale-DB `DROP DATABASE` first), `DB_PASSWORD` passthrough.
- [x] **MySQL read-type parity fix** (`server/src/db.js`): central `normalizeFromMysql` row normalizer — `Date` → `'YYYY-MM-DD'` (DATE cols) / `'YYYY-MM-DD HH:MM:SS'` (DATETIME cols, local getters); DECIMAL → `Number()`; JSON cols left parsed. Hooked into MySQL backend: `findAll`, `get`, `exportAll`. Write-path `normalizeForMysql` unchanged (bool→0/1).
- [x] **Route-level JSON guards** (3 edits): `bookings.js` `parseIfString()` for `sessions_json`; `booking-requests.js` payload spread guarded; `results.js` + `reports.js` `sideA`/`sideB` wrapped with `Array.isArray()`.
- [x] **Both backends 28/28 PASS** with timing instrumentation (`smoke.mjs` — `performance.now()` per check). JSON: 970ms total, MySQL: 711ms total. No bottlenecks; login (bcrypt) dominates both.
- [x] **Deep parity — export-db diff**: 81 cosmetic diffs (all type-shape: `dob: "" vs null`, `sessions_json` string vs parsed object, `target_id` int vs string, `decided_at` datetime vs date, `password_hash` drift from `ensure-admin` re-hashing, extra audit row from double-auth). Zero data corruption. Slots, payments, results, comments, notifications, expenses, court_defaults, import_batches, conversion_requests all **IDENTICAL**.
- [x] **Deep parity — booking lifecycle**: create → list → slots → status update → delete → gone → slots cleaned. All 7 steps identical on both backends (same status transitions, same slot cleanup).
- [x] **Timing instrumentation** added to `smoke.mjs`: `performance.now()` per check, slowest/fastest summary printed.
- [x] **Results ↔ Users ID relationship** — replaced free-text player name references with user ID linkage:
  - `server/schema.sql`: added `sideA_ids JSON` and `sideB_ids JSON` columns to `results` table
  - `server/src/db.js`: added `sideA_ids`/`sideB_ids` to `JSON_COLS`
  - `server/src/routes/results.js`: added `resolveIds()` helper, POST/PUT accept `sideA_ids`/`sideB_ids`, auto-resolve from names if missing
  - `server/src/routes/imports.js`: results import resolves player names → user IDs
  - `server/src/routes/reports.js`: player stats use ID-based matching (`id:N` keys) with name fallback for legacy data
  - `scripts/migrate-json-to-mysql.js`: added new columns to column spec
  - `src/pages/admin/Results.jsx`: uses `PlayerSearchInput` (was plain text), captures IDs via `onPlayerSelect`, sends `sideA_ids`/`sideB_ids`
  - `src/pages/Profile.jsx`: PlayerResultModal tracks IDs, auto-fills `sideA_ids[0]` with current user ID
- [x] **MySQL → PostgreSQL migration completed** — all local data migrated from MySQL (`localhost:5175`) to pg (`localhost:5432`, `mmacademy`):
  - `server/.env`: `DB_ENABLED=true`, `DB_PORT=5432`, `DB_USER=postgres`, `DB_PASSWORD=root`
  - `server/src/sql.js`: Knex/pg connection (was mysql2); `mysql2` dependency removed, `pg` added
  - `server/src/db.js`: pg↔app column mapping adapter (`PG_TO_APP`/`APP_TO_PG`) — transparent to all route files
  - `server/schema.sql`: rewritten for pg (`CREATE TABLE ... IF NOT EXISTS`, triggers, pg-native types)
  - `scripts/migrate-mysql-to-pg.js`: one-time migration (413 rows, 13 tables, JSONB stringification)
  - 413 rows migrated, verified counts across all 13 tables
- [x] **Full API endpoint test sweep — 99/99 PASS** (`server/e2e-all.cjs`):
  - 88 unique endpoints tested across every frontend page
  - All temp E2E records cleaned up after each run
  - payments DELETE 500 regression: **verified fixed**
  - `oxlint`: 0 errors (only pre-existing warnings)
- [x] **Real bugs fixed during API sweep:**
  - `server/src/routes/slots.js:68`: `PUT /slots/court-defaults` — `requireRole` ran before `authenticate` middleware → crash; added `authenticate` before `requireRole`
  - `server/src/db.js:28-33`: `POST /results` 500 on pg — pg schema has lowercase `sidea`/`sideb` but app uses camelCase `sideA`/`sideB`; added `results` PG_TO_APP mapping
  - `server/src/db.js:94-97`: `POST /results` 500 on pg — `JSON_COLS` checked app column names after pg mapping; updated to use pg column names
  - pg schema: `slots` table missing `coach_id` column → `ALTER TABLE slots ADD COLUMN coach_id integer`
  - pg schema: `slots.time` varchar(10) too narrow for import `HH:MM-HH:MM` → `ALTER COLUMN time TYPE varchar(20)`
  - `server/src/index.js:78`: `actionLimiter` max:20 too low for 5 shared route groups (bookings+comments+conversion-requests+booking-requests+payments) → increased to 100/min

---

## Security Hardening Pass — Completed (2026-09-18)

**Scope:** 15/16 findings fixed (1 cancelled for v2), single batch implementation.

- [x] **#1 cookie-parser + refresh/logout**: installed `cookie-parser`, added middleware in `index.js`, fixed refresh route to use `req.cookies`, fixed logout to revoke server-side
- [x] **#2 Atomic balance ops**: wrapped `deductBalance`/`deductBalanceAllowNegative` in `db.transaction`, added `CHECK` constraints on `users.private_balance`, `users.group_balance`, `payments.amount`
- [x] **#3 PII scoping**: added `requireRole('superadmin', 'admin', 'coach')` to all `GET` routes in `players.js` (list, detail, sessions)
- [x] **#4 JSON error middleware**: added 404 JSON handler for `/api/*` routes, global error handler that returns JSON only (never stack traces)
- [x] **#5 ensure-admin create-only**: rewritten to create-if-missing only; no longer resets password/role on existing accounts
- [x] **#6 Import file cleanup**: `imports.js` now calls `unlinkSync(req.file.path)` immediately after `XLSX.readFile`
- [x] **#7 Weak secrets**: replaced all `Math.random` in `users.js` (reset-password, export-credentials) and `bookings.js` (genRef) with `crypto.randomInt`
- [x] **#8 Password policy**: min-10, max-72 across all paths — `auth.js` (signup, change, force-change), `users.js` (create), frontend (`SignUp.jsx`, `App.jsx`, `Profile.jsx`)
- [x] **#9 Payment delete clamp**: `DELETE /payments/:id` now checks for negative balance (409 response), wraps get+update+delete in `db.transaction`, logs before/after balances
- [x] **#11 async bcrypt**: converted all `bcrypt.hashSync` → `await bcrypt.hash` and `bcrypt.compareSync` → `await bcrypt.compare` in `auth.js`, `users.js`, `ensure-admin.js`, `seed.js`
- [x] **#12 admin-import-db hardened**: pre-replace backup to `server/data/backups/`, preserve `audit_logs` (append-preserve, never replace), require `{confirm:'REPLACE-ALL'}`, `ALLOW_IMPORT_DB=false` prod guard, sanity abort if >50% rows deleted
- [x] **Sessions hardened**: access token 15m→1d, refresh 7d→30d (env-driven), cookie MaxAge from env (not hardcoded), persistent revocation store (`refresh_denylist` table replaces in-memory Map)
- [x] **Cookie-based boot**: `initAuth()` in `api.js` now tries `POST /auth/refresh` (httpOnly cookie) → `GET /auth/me` before returning null
- [x] **Schedule UX**: removed Quick Dates chips, added "Awaiting Your Confirmation" banner for players with `schedule_approved` slots
- [x] **Gitignore cleanup**: added `server/data/uploads/`, `server/data/backups/`, `server/*.log`, `export-credentials.xlsx`
- [x] **Verification**: `oxlint` 0 new warnings, `vite build` clean, e2e 87/89 (2 pre-existing fixture failures)

---

## DB-Driven Roles — Completed (2026-09-18)

**Scope:** roles table in PostgreSQL + JSON backend, DB-backed permissions with per-user overrides, superadmin-only management.

- [x] **`server/src/utils/modules.js`** — single source of truth: `ALL_MODULES` (9 modules), `DEFAULT_ROLE_PERMISSIONS`, `ROLE_HIERARCHY`, `SYSTEM_ROLES`
- [x] **`server/schema.sql`** — `roles` table: `id`, `name UNIQUE`, `display_name`, `level`, `permissions JSONB`, `is_system`, timestamps; 4 seed rows with `ON CONFLICT DO NOTHING`
- [x] **`server/src/database.js`** — JSON backend: `roles` collection added to `data`/`DEFAULTS`, 4 system roles seeded on boot
- [x] **Boot-time ensure** — `index.js`: creates `roles` table via Knex if missing (pg), seeds 4 system roles if table empty
- [x] **`server/src/db.js`** — `roles` added to `TABLES`, `JSON_COLS`, `DATE_COLS`
- [x] **`server/src/routes/admin-import-db.js`** — `roles` added to `COLLECTIONS`
- [x] **`server/src/middleware/rbac.js`** — rewritten: `getRole(name)` with 60s in-memory cache, `getUserPermissions(user)` now **async** (union of role.permissions + user.permissions), `requirePermission` now async, superadmin short-circuits to all 9 modules
- [x] **`server/src/routes/auth.js`** — all 3 `getUserPermissions` calls updated to `await`
- [x] **`server/src/routes/roles.js`** — new route: `GET /api/roles` (any auth), `PUT /api/roles/:name` (superadmin only, validates modules, locked superadmin row)
- [x] **`server/src/routes/users.js`** — `validRoles` derived from DB instead of hardcoded, escalation guard: only superadmin may assign superadmin role
- [x] **`server/src/index.js`** — mounted `rolesRoutes` at `/api/roles`
- [x] **`src/pages/admin/Roles.jsx`** — new page: 4-role grid, per-module toggles, superadmin row read-only, save via `PUT /roles/:name`
- [x] **`src/App.jsx`** — `/admin/roles` route (superadmin-only)
- [x] **`src/pages/admin/AdminLayout.jsx`** — "Roles" nav link (superadmin-only, ShieldCheck icon)
- [x] **`src/pages/admin/Users.jsx`** — role dropdown fed from `GET /roles`, baseline hint text ("Modules granted by the role are shown in green")
- [x] **Verification**: `oxlint` 0 new warnings, `vite build` clean, server boots with 4 roles seeded

---

## Supabase Migration — Completed (2026-09-19)

**Scope:** Migrate local PostgreSQL to Supabase (hosted Postgres).

- [x] Supabase project created: `ptakjxykexvwhympkwfg`, user `postgres.ptakjxykexvwhympkwfg`
- [x] `scripts/migrate-local-pg-to-supabase.js` — schema apply + data load + verify
- [x] Pooler resolved: `aws-1-eu-west-1.pooler.supabase.com:6543` (IPv4-compatible; `aws-0` dead; direct host IPv6-only)
- [x] Data load: **1292 rows, 19 tables** — all counts verified
- [x] Live write test: signup/login/delete via pooler — **PASS**
- [x] `server/schema.sql` fixed: `app_sessions` placement, `created_at`/`updated_at`, `refresh_denylist`, `coach_daily_hours`, `coach_payments`
- [x] Repo made public, history rewritten (purged dumps/uploads/hashes), `.gitignore` hardened

---

## Railway Deploy — Completed (2026-09-19)

**Scope:** Deploy backend to Railway (replaces local `:5174` as production).

- [x] Railway service: `mm-academy-api-production`, root dir `server/`, watch `server/**`, healthcheck `/api/health`
- [x] `server/package.json` — added `engines: { node: ">=20" }` for Railway Node 20
- [x] Railway env vars: `DATABASE_URL` (pooler), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CORS_ORIGINS`
- [x] `VITE_API_BASE` repo variable set → `https://mm-academy-api-production.up.railway.app/api`
- [x] Pages redeployed — bundle verified: Railway URL in, `localhost:5174` out
- [x] CORS `FRONTEND_URL=https://diegoo91.github.io` set on Railway
- [x] `render.yaml` committed (inert — Railway deprecated config-as-code)
- [x] Frontend: `base: '/mmacademysql/'`, router `basename` from `BASE_URL`, `public/CNAME`

---

## Production PG Bug Fixes — Completed (2026-09-19)

- [x] `PUT /api/users/:id` 500 — removed nonexistent `permissions` column, added 409 duplicate email guard (`5dee471`)
- [x] Import commit 500 — `slots.time VARCHAR(10)` too narrow → widened to `VARCHAR(20)` + boot migration (`c00278c`)
- [x] Schedule import overwrite → merge: group players combine into one slot (`b85f3dc`, `e93d6e8`)
- [x] `db.findAll` predicate bug — raw knex rows (Date objects) never `===` strings → normalize before filter (`4d591d4`)
- [x] Added `authenticate` middleware to 9 protected slot routes (`760ad90`)
- [x] Schedule import merge verified working — group pairs merge into one slot with both players

---

## Next (in order)

1. **Stop local `:5174` server** — no longer needed; Railway is the production backend
2. **Custom domain `www.mmacademy.com`** — DNS verification pending (CNAME in `public/CNAME`)
3. **`api.mmacademy.com`** — optional custom API domain (point CNAME to Railway)
4. **Rotate Supabase DB password** — appeared in plain text in chat
5. **Rotate `IMPORT_SECRET`** — appeared in plain text in chat

---

## Environment / commands

- **Production backend**: Railway dashboard → `mm-academy-api-production` (service `mm-academy-api`)
- **Frontend**: GitHub Pages at `https://diegoo91.github.io/mmacademysql/`
- **`VITE_API_BASE`**: set as repo variable → `https://mm-academy-api-production.up.railway.app/api` (baked into bundle at build time)
- **Railway config**: Root Directory `server`, Watch Paths `server/**`, healthcheck `/api/health`
- **Railway env vars**: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CORS_ORIGINS`
- Boot: Railway auto-runs `npm ci && npm start` from `server/`
- Frontend build: `npx vite build` from repo root (Pages uses `deploy.yml` workflow)
- e2e: `node e2e-all.cjs` from `server/` (tests Railway endpoint via env vars)

---

## Data state right now

- **Supabase** (source of truth): `ptakjxykexvwhympkwfg` — 1292 rows, 19 tables, pooler `aws-1-eu-west-1.pooler.supabase.com:6543`
- **Railway**: `mm-academy-api-production` connected to Supabase via pooler
- **Local pg** (`localhost:5432/mmacademy`): legacy — no longer used for production
- **JSON backend** (`server/data/academy.db.json`): legacy fallback — `DB_ENABLED` is `true` on Railway

---

## Session Polish & UX — Completed (2026-09-25)

- [x] Logo component `src/components/Logo.jsx` + `public/images/logo-badge.png` — used in Navbar, Footer, LoginModal, Login, DeclineChoiceModal, Book (both themes verified)
- [x] Unified time format `src/lib/time.js` (`canonTime`, `formatSlotTime` — handles range times like `10:00-12:00`) wired into 10 pages/components
- [x] Reports totals fix: All-Time preset default, approved-only totals, "Received (Filtered)" — verified live (all = 96,400 EGP)
- [x] Schedule Manager: per-cell dropdown menu + two-step delete confirm
- [x] Scroll-to-top on route change (`ScrollToTop.jsx` in `Layout.jsx`)
- [x] `oxlint` 0 new warnings, `vite build` clean

---

## Balance Integrity & UserDetail Rework — Completed (2026-09-25)

- [x] **Phase 0 audit** — `scripts/balance-audit.js` (read-only): all stored balances correct (stored == FIFO for 33 players); bug was display-only (private counted 3× as group); 3 mis-attributed confirmed slots; orphan segments `john smith`/`jane doe`
- [x] **True-total display** — `users.js` `enrichPlayer` + both `reports.js` builders + `dashboard.js`: `group_balance` = real credits, new `group_from_private`; UI notes in Reports/UserDetail/Profile; ScheduleManager group check now `grp + priv*2` — verified live (Titos 5 priv / 0 group / remaining 5 / fromPrivate 10)
- [x] **Prod fixes applied** — `scripts/apply-balance-fixes.js` (validations, optimistic locks, tx, backups, audit rows):
  - slot 216 `Eyad / Youssef` → `Eyad Dawish / Youssef Dawish` + 1 group deducted each (id11/id27: 4→3, `balance_status='deducted'`)
  - slot 214 → `Ammar Abd El Ghany / Adham`
  - orphan user 26 `Youssef` deleted (prod + local)
  - slot 213 **skipped** — user rejected (Zein stays 6)
  - first run rolled back cleanly on `audit_logs` column mismatch (`before`→`rec_before`), fixed + re-ran; 5 audit rows written
- [x] **Post-fix verify** — audit re-run clean (stored == FIFO, no dupes), live API (Eyad 0/3, Youssef Dawish 0/3, bare Youssef gone, Titos 5/0), lint + build clean
- [x] **UserDetail restructure** — Amount Owed + Total Paid moved to top; Remaining Private + Remaining Group merged into one `REMAINING PRIVATE / GROUP` card (`1P · 2G`, full-width on mobile); Balances panel full-width below

---

## Coach Hours Backfill — Completed (2026-09-25)

- [x] Preflight: Coach Laila = `user_id 36`, Coach Omar = `user_id 37` (only coaches in system); zero existing rows for 2026-09-20..23
- [x] Backup: `scripts/payments-backups/coach-daily-hours-2026-09-25T16-05-48.json` (13 rows)
- [x] Inserted 7 rows + 7 `audit_logs` rows in one transaction (notes `Backfill 2026-09-25`, source `admin`):
  - Laila (36): 09-20=7, 09-21=6, 09-22=6, 09-23=7 → **26h**
  - Omar (37): 09-20=7, 09-22=6, 09-23=5 → **18h** (21-9 skipped per confirmation)
- [x] API verify: `GET /reports/coach-hours?from=2026-09-20&to=2026-09-23` ASSERT PASS (26/18); `GET /reports/coach-balance` → Laila **73**, Omar **44** (all-time, paid 0)

---

## Data state right now (updated 2026-09-25)

- **Player balances (prod):** Eyad Dawish 0/3, Youssef Dawish 0/3, Titos 5/0; totals 33 = 10 private + 23 group; remaining orphan segments: `zein`, `john smith`, `jane doe`
- **Coach balances (prod):** Laila 73 earned / 0 paid; Omar 44 earned / 0 paid
- **Audit trail:** 5 rows from balance fixes + 7 rows from coach backfill (2026-09-25)
