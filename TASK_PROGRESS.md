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

---

## Settle-then-credit payments + negative-balance write-off — Completed (2026-09-27)

- [x] **Settlement rule** (user-locked: 1P = 2G, own bucket first, then cross) — `planSettlement()` pure fn in `server/src/utils/cycle.js`; `creditCycle` settles negative legacy debt FIRST, remainder enters cycle. Example: pay 8P vs debt −5P/−2G → settled 5P+2G, credited **2P**, debt 0. 43/43 local scenarios + 12,100-combo property sweep (`verify-settlement.cjs`)
- [x] **payments cols** `settled_private/settled_group/credited_private/credited_group` (nullable; null = pre-settlement row → legacy delete semantics) — schema.sql + idempotent runtime migration (index.js); **verified in prod (all 4)**
- [x] **Delete = exact reversal** (settlement rows: pull back credited from cycle floor-at-remainder, reinstate forgiven debt; old rows keep floor-at-0); audit `payment.delete.reverse` with breakdown
- [x] **Write-off** `POST /users/:id/writeoff` `{reason}` — admin+superadmin, players only, negatives only, mandatory reason, audit `balance.writeoff`; `enrichPlayer` exposes `debt_private/debt_group`
- [x] **UI** — Payments.jsx: Balance Effect column + settlement alert + fixed delete wording; UserDetail.jsx: debt row + Write-off button on Balances panel **and inside Balance Control modal** (`b64fc2f` — option existed only on the page panel before; user was looking in the modal)
- [x] **Deployed** — `1c09bef` (feature) + `b64fc2f` (modal entry) pushed; GH Pages run 36324269898 ✓ (bundle `B2HquGAj` contains write-off strings); Railway auto-deploy `3de2964b` SUCCESS; prod verified: writeoff route = 401-unauth (live)
- [x] **Totos corrected to 2** — FIFO entitlement 8 bought − 5P − 2G(=1P) = 2; `POST /users/23/balance {cycle_private:2}`, audit **id 2421** (`balance.balance.profile_control`, 14:03:15); debt 0, not in unpaid report. His PAY-0022 (8P) predated the settlement feature and his −5/−2 debt had been zeroed by the Sep21 package rekey → manual correction applied the same math
- [x] **Two-ledger root cause (why Balance Control never cleared unpaid)** — unpaid report (`utils/sessionPaid.js`) = FIFO of **payment-row session counts** vs all slots (matched by `user_id` OR `player_text` for shared slots; private never borrows group pool, group borrows 1P=2G). Balance Control only writes balance columns → can never clear unpaid. Clearing = Add Payment with session counts (settlement absorbs debt in same op)
- [x] **Why Ismail deducted, Totos/Magdy not** — UI slot-assign flow writes `balance_status='deducted'` (Ismail Sep21/23 slots); Sep17–18 bulk schedule import created the old slots with `balance_status=null` and never touched balance
- [x] **Probe scripts** (machine-local `C:\Users\AHMED~1.FOU\AppData\Local\Temp\opencode\`): `slot-origins.cjs`, `orphan-slots.cjs`, `unpaid-now.cjs`, `audit-totos*.cjs`, `today-audit.cjs`, `totos-fix.cjs`, `verify-settlement.cjs` — run with workdir `server/` (dotenvx injects `.env`; `PROD_DATABASE_URL` = prod, read-only)
- [ ] **Magdy — awaiting user decision:** 4 unpaid private (Sep14/17/23 + Sep28 #551 created today 12:10) = **EGP 4,000**; fix = Cash payment with 4 private sessions (amount 4000 if real cash, else 0); settlement absorbs his −1P debt → end state legacy 0, cycle 3
- [ ] Optional: Balance Control modal hint — "unpaid sessions are covered via Add Payment, not balance edits"

## Gift unpaid sessions (0 EGP) UI — Completed (2026-09-27)

- [x] User chose **option 2 (4 sessions, EGP 0) as a UI button** rather than an API call
- [x] `src/lib/gift.js` — `giftUnpaidSessions()` posts a **0-EGP Cash payment** for the exact unpaid counts (Cash auto-approves → `creditCycle` runs settle-then-credit, so any negative balance is absorbed first); `confirmGift()` shared dialog showing counts + 0 EGP + current owed
- [x] **Reports.jsx** — "Gift (0 EGP)" button on every Unpaid Players row (`Gift` icon, per-row `giftingId` loading, `giftMsg` feedback line, refetches `/reports/unpaid`)
- [x] **UserDetail.jsx** — "Gift Unpaid at 0 EGP (nP + nG)" under Collect Payment, shown only when `amount_owed > 0 && canEdit && unpaidSessions.length > 0`; counts derived from `report.sessions` (`!s.paid`)
- [x] lint 0 errors (pre-existing warnings only) + `vite build` clean; pushed **`3d8c164`**, GH Pages run 36345820249
- [ ] Press the button for Magdy in prod → verify `/reports/unpaid` drops to 18 players and Magdy balance = legacy 0/+1, cycle 3/0

## Data state right now (updated 2026-09-27)

- **Totos (23):** cycle 2/0, legacy 0/0, debt 0/0, unpaid report clean ✓ (audit 2421)
- **Magdy (18):** raw legacy −1/+1 (player view clamped 0/1 + debt 1P), **4 unpaid private = EGP 4,000**, needs payment fix (decision pending)
- **Ismail (16):** legacy 0/+3, recent slots deducted, not in unpaid list
- **Unpaid report (prod):** 19 players, EGP 89,500 total
- **Deploys:** main `b64fc2f`; GH bundle `B2HquGAj`; Railway `3de2964b` (2026-09-27 16:58)
- **Audit:** `GET /api/audit-logs?limit=500` returns newest-first; actions: `balance.balance.profile_control`, `balance.payment.credit.cycle`, `balance.writeoff`, `payment.delete.reverse`

## Settle-first coverage audit + local = production sync — Completed (2026-09-27)

- [x] **Payment/credit-path audit (rule: every credit settles negative debt first)**
  - Safe already: Cash POST (`payments.js:76`), Instapay approve (`payments.js:150`), booking `payment_pending` → approve → `creditCycle`; imports update bookings only (no balance credit); `creditBalance`/`creditBalanceBoth` wrappers unused
  - **Gap found & fixed: `transfers.js`** — receiver was credited by direct `balance + count`, which nets same-bucket debt but never settles cross-bucket debt. Now runs `planSettlement` (own bucket → 1P=2G cross; remainder → legacy carryover as before); settlement breakdown added to the audit log + API response. 5/5 value-preservation cases pass (e.g. 4G into −1P → legacy 0/+2, value in/out equal)
- [x] Pushed **`f566791`**; Pages CI correctly skipped (workflow path filter = frontend only, commit was server-only); **Railway auto-deploy `490d81cd` SUCCESS** (2026-09-27 19:58 UTC)
- [x] **`git pull origin main`** → already up to date (backend + frontend parity with origin)
- [x] **DB pull prod → local:** `pg_dump -Fc -n public` from Supabase pooler (`sslmode=no-verify` → `require` for CLI compat) → dropped/recreated `public` on `localhost:5432/mmacademy` → `pg_restore --no-owner --no-privileges`
  - **21/21 table row counts identical, 0 mismatches** (users 39, payments 22, slots 194, audit_logs 2428, notifications 102, import_batches 33, …)
  - users balance totals identical: private 4 / group 23 / cycle_private 2 / cycle_group 0
  - role split identical: admin 1, coach 2, player 34, superadmin 2 (the smoke "FAIL players 34 vs 39" was a wrong expectation — 39 = all users; DB confirms both envs = 34 players)
  - pre-replace local backup: `C:\Users\AHMED~1.FOU\AppData\Local\Temp\opencode\local-before-pull.dump` (216 KB); prod dump: `prod-pull.dump` (221 KB)
- [x] **Local API restarted on current code** (port 5174) — `smoke-local.cjs`: login ✓, Totos cycle 2 / debt 0 ✓, unpaid report 19 players / EGP 89,500 ✓, Magdy 4 unpaid ✓, writeoff route 400-without-reason (live, no mutation) ✓, payments 22 rows ✓
- [ ] Press the **Gift (0 EGP)** button for Magdy in prod (unchanged pending item → unpaid list should drop to 18)

## Data state right now (updated 2026-09-27 post-sync)

- **Local == prod:** code at `f566791`, DB 21 tables identical, local API (5174) serving synced data
- **Deploys:** main `f566791`; GH Pages bundle `B2HquGAj` (last frontend run 36345820249); Railway `490d81cd` SUCCESS (2026-09-27 19:58 UTC)
- **Unpaid report (both envs):** 19 players, EGP 89,500 — Magdy gift button still pending
- **Totos (23):** cycle 2/0, debt 0 ✓ · **Magdy (18):** 4 unpaid private = EGP 4,000 · **Ismail (16):** clean

## Tournament system — Phase 1+2 PAUSED mid-build (2026-09-28) — LOCALHOST ONLY, nothing pushed

**Scope agreed:** knockout + groups→knockout formats, replacing both placeholder shells (`src/pages/Tournament.jsx` public, `src/pages/admin/Tournament.jsx` admin — routes already wired in `App.jsx:120/186`, admin sidebar `AdminLayout.jsx:10`). Full spec = the 16 answered questions + 2 additions (fixed sizes 4/8/16/32/64; skill_level one-per-row from 8 values). **No push, no prod DB, no commits until user approves.**

### DONE (Phase 1a/1b + 2a/2b)
- [x] **`server/schema.sql`** — appended: `tournaments`, `tournament_signups`, `tournament_teams`, `tournament_matches` (+CHECKs: skill allowlist, format, status, bracket_size ∈ 4/8/16/32/64, match_format, scores never tie, distinct players) + `payments.tournament_id` FK + **`chk_tournament_payment_sessions` (tournament payment MUST be 0-session)** + 13 indexes + `updated_at` triggers (generic `update_timestamp()` already exists in schema.sql:109)
- [x] **`server/src/index.js`** — import + mount `/api/tournaments` (actionLimiter, line ~121); `ensureTournaments()` idempotent runtime migration (4× `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, CHECK via `DO $$ ... duplicate_object` block, `CREATE OR REPLACE FUNCTION update_timestamp()`, guarded triggers, indexes) placed after payments-settlement migration (~line 329); **tournament sweep hook** (boot + 6h) after balance sweep (~line 460) importing `./utils/tournamentSweep.js` — **file NOT created yet → server will fail boot until 2c/2d done**
- [x] **`server/src/db.js`** — `TABLES` += 4 tournament tables (after users → correct delete/insert order for export/replaceAll); `DATE_COLS` += tournaments (registration_open_at/close_at), signups, teams, matches (scheduled_at); `DECIMAL_COLS.tournaments = ['entry_fee']`
- [x] **`server/src/utils/tournament.js`** (pure, no DB) — `BRACKET_SIZES/SKILL_LEVELS/FORMATS/MATCH_FORMATS`, `nextBracketSize`, `standardSeeding` (iterative doubling), `validateTournamentInput` (incl. G×TPG ∈ sizes, G×advance ∈ sizes, advance ≤ TPG), `signupCap`, `knockoutSizeFor`, `nextSlotOf`, `buildKnockoutRows` (seed→position via `seeding.indexOf`, rounds + next links), `roundRobinPairings` (circle method, odd→null pad), `buildGroupRows`, **`evaluateKnockout`** (read-time resolver: round-order, feeders by next links; bye/walkover cascade, dead slots → tbd; scheduled match = `resolved:false` so unplayed feeders don't fake byes), **`computeStandings`** (wins → H2H mini-table → game diff → games won), **`avoidSameGroupR1`** (Kuhn bipartite matching per cross-block, permutes weaker block only), `seedQualifierKnockout` (strength-sorted rank blocks → seeds → same-group fix), `autoDistributeIntoGroups`
- [x] **Phase 2b verify: `Temp\opencode\verify-tournament.cjs` → 107/107 PASS** (seeding 4–64 permutations/mirror/halves, validation cases, 3-team bye-to-final, 2-team/8 walkover cascade, byes=lowest seeds for n=3,5,7,9,13,17,33, RR completeness n=2–11, standings 4 cases incl. H2H-before-diff + 3-way cycle, adversarial same-group seeding G=2/G=4×2/G=4×4, advance=1)
- [x] **Key verifications:** `creditCycle(0,0)` = hard no-op (`cycle.js:294`) → existing Payments-tab approve of entry-fee payments is safe; `db.update` strips `updated_at` (needs triggers); `normalizeForPg` coerces boolean→1/0 (⇒ `count_to_records SMALLINT`)

### NOT DONE — resume here
- [ ] **Phase 2c — `server/src/utils/tournamentSweep.js`**: `runTournamentSweep()` — for `registration_open` with `registration_close_at < now` → status `registration_closed`, notify signed-up players (`/tournament`) + active admins (`/admin/tournament`) via `notifyUsers(ids, {kind, title, body, link})`; return `{closed: [names]}` (index.js expects `r.closed`)
- [ ] **Phase 2d — `server/src/routes/tournaments.js`** — design decided, not yet written:
  - Order: public `GET /` (exclude `draft`), `GET /:id` (tournament + teams + matches; hydrate `next_round/next_slot/next_side` from `next_match_id` graph for `evaluateKnockout`; standings via `computeStandings` when group rows exist), `POST /:id/signup` (authenticate), `GET /:id/my-signup` (authenticate) → then `router.use(authenticate)` + `requireRole('superadmin','admin')` for everything below
  - **Signup:** role must be `player`; status `registration_open`; `now < close`; requester ∈ pair; not already signed up (non-rejected); cap = `signupCap(t)`; fee>0 → insert `payments` row DIRECTLY (ref `PAY-####` via `db.count('payments')+1` like payments.js:21, method `Instapay`, `payment_pending`, `tournament_id`, sessions 0, `private/group_sessions: 0`) + `signup.payment_id` — **never through `POST /payments`, never `creditCycle`**; notify admins (`tournament_signup` + reuse `new_payment` kind when fee>0); `auditCreate(req, 'tournament_signup', ...)`
  - **Admin:** `POST /` (validateTournamentInput; groups format derives `bracket_size = G×advance`; open+close dates present → status registration_open else draft), `PUT /:id` (reject once teams exist), `POST /:id/open|close` (close = same notify as sweep), `DELETE /:id` (only draft/registration_open/closed-without-teams; FK cascade cleans tables, payments persist with `tournament_id→NULL`), `GET /manage` (all incl. draft + counts), `GET /:id/signups` (names + payment status join), `PUT /signups/:sid` (approve requires payment_approved when fee>0, or rejected), `POST /:id/pair-solos` `{signup_a_id, signup_b_id, team_name?}` (merge: a.player2 = b.player1, b→`withdrawn`; require BOTH payments approved when fee>0; sets a→approved), `POST /:id/teams` (admin add team source `admin`), `PUT/DELETE /teams/:tid` pre-draw
  - **Draw** `POST /:id/draw` (status must be `registration_closed`; no existing matches; ≥2 teams; ≤cap): materialize teams from approved signups (require `player2_id` set → 400 "pair solos first" if any solo; name = `team_name || "X & Y"`); knockout: `{mode:'manual'|'random', order?:[teamIds]}` → seeds = order/shuffle, `buildKnockoutRows` → insert **descending round order** (next ids exist); groups: `{mode, order?, groups?:{A:[ids]}}` or `autoDistributeIntoGroups` → teams get `group_label` + seed, `buildGroupRows` insert; status→`in_progress`; notify all players (`draw published`, link `/tournament`)
  - **Result** `PUT /matches/:mid` admin: `{score_a?, score_b?, court?, scheduled_at?}`; scores present → validate ints ≥0 ≠, knockout side resolution via hydrated `evaluateKnockout` (playable only), group via `team_a_id/team_b_id`; set scores/winner/`status='completed'`. Group phase: when ALL group matches completed → `computeStandings` → `seedQualifierKnockout` → `buildKnockoutRows` (bracketSize = G×advance, no byes) → insert (guard: knockout rows absent). Knockout final completed → status `completed` + notify
  - **Mirror** (only if `count_to_records`): helper writing `results` rows (status `confirmed`, `competition = tournament name`, `format = t.match_format`, `sideA/sideB + sideA_ids/sideB_ids` from teams' players, en-dash `score_text`, `winner_side`, `submitted_by` actor, `court`, `notes = "tournament:<id>:m<matchId>"` marker for dedupe); `PUT /:id/count-to-records {enabled}` (enabling post-completion mirrors now); optional `POST /:id/complete`
  - Getters hydrate rows: `next_round = linked.round_no`, `next_slot = linked.slot_index`, `next_side = slot_index % 2 === 0 ? 'a' : 'b'`
- [ ] **Phase 2e** — API smoke (login admin → create → signup window open/full/close rejections → fee payment 0-session + CHECK proof → draw → results → group→knockout auto-build → standings → complete/mirror → sweep auto-close)
- [ ] **Phase 2f** — oxlint + restart local API (boot currently BROKEN until 2c+2d exist) + health + report for UI approval
- [ ] Phase 3–5 (after approval): admin UI wizard/signup/draw/result; public UI + `Countdown/BracketView/GroupTable`; final verify + checkpoint; **push only on explicit approval**

### Data state / temp artifacts
- **Verify script:** `C:\Users\AHMED~1.FOU\AppData\Local\Temp\opencode\verify-tournament.cjs` (107/107, run anywhere — pure module, no DB)
- **Modified files (uncommitted):** `server/schema.sql`, `server/src/index.js`, `server/src/db.js`, `server/src/utils/tournament.js` (new), `TASK_PROGRESS.md`
- **Local DB:** has NO tournament tables yet (migration runs on next server boot); prod untouched
- **Local API on 5174:** running OLD code (pre-tournament) — do NOT assume boot works after restart until 2c+2d complete
- **Repo state at pause:** HEAD `59d875f` (docs) / working tree dirty with the 4 files above


---

### CHECKPOINT 2026-09-28 -- Phase 1+2 COMPLETE (backend), awaiting UI approval

**Status: all backend phases 1a-2e DONE and verified. Phase 2f report delivered. WAITING for user approval before Phase 3-5 (UI). Still NO commits, NO push, NO prod contact until explicit approval.**

**Delivered files:**
- `server/schema.sql` -- tournaments, tournament_signups (updated_at+trigger), tournament_teams (updated_at+trigger), tournament_matches, payments.tournament_id FK, `chk_tournament_payment_sessions` (0-session proof: direct psql inserts with private_sessions=1 and group_sessions=1 both rejected 23514; private_sessions=0 accepted)
- `server/src/index.js` -- mount `/api/tournaments` (actionLimiter 100/min), `ensureTournaments()` idempotent migration (CREATE TABLE + ADD COLUMN IF NOT EXISTS for updated_at x4 tables + 4 triggers), sweep hook (boot + every 6h)
- `server/src/utils/tournament.js` -- pure logic (validation, seeding, brackets, round-robin, standings, evaluator, same-group avoidance, group build, `parseDbTs()`)
- `server/src/utils/tournamentSweep.js` -- auto-close sweep (parseDbTs deadline), notify players + admins
- `server/src/routes/tournaments.js` -- full API: public list/detail, signup (fee = direct payments insert, 0-session, never creditCycle), my-signup, manage, signups CRUD, pair-solos, teams CRUD, open/close, draw (knockout + groups), match results, group->knockout auto-build, standings, count-to-records mirror, complete
- `server/src/db.js` -- TABLES/DATE_COLS updated for all 4 tournament tables (updated_at included)

**Bugs found+fixed during Phase 2e smoke (all regression-covered):**
1. signups/teams missing `updated_at` column -> 500s (schema + ensure CREATE + ALTER)
2. timezone-naive deadline parse -> false "deadline passed" (`parseDbTs()` everywhere)
3. mirrorToResults skipped later knockout rounds (null sides) -> resolve via evaluateKnockout + persist team_a/b_id at record time
4. `buildGroupRows` emitted ARRAY team ids in round-vs-pair rows -> pg integer cast error (flattened)
5. evaluateKnockout state-key collision: group rows share round_no=1/slot_index with knockout R1 -> write path fed ALL rows (read path filtered) -> "teams not ready" on playable knockout matches (phase-scoped keys + route filters to knockout)
6. signup cap did not count pre-drawn teams; NaN param guards added (404/400)

**Test results (all green):**
- Logic suite `Temp\opencode\verify-tournament.cjs`: **136/136 PASS** (incl. byes regression 4-into-8/7-into-8, avoidSameGroupR1 hole-skip, mixed-row evaluator)
- API smoke `Temp\opencode\smoke-tournament.mjs` (localhost:5174): **104/104 PASS** -- validation rejects, signups (pair/solo/dup/cap/deadline), fee payment 0-session + settlement untouched balance, pair-solos, close/draw/results/409 conflicts, groups 12 matches -> auto knockout bracket 4 (G2xTPG4, advance 2 => Gxadv=4 qualifiers), standings, count_to_records mirror 3/15 + dedupe, RBAC, draft delete
- Sweep standalone: **9/9 PASS** (expired closed, future kept, idempotent 2nd run, admin notified)
- `npx oxlint`: 0 errors (pre-existing warnings only, untouched pages)
- Local DB cleaned of ALL smoke residue (tournaments/users/payments/results/matches/teams/signups/notifications/audit = 0)

**Gotchas for next session:**
- Server start: shell-timeout kills Start-Process children; use WMI: `Invoke-CimMethod -ClassName Win32_Process -MethodName Create` with `cmd /c node src/index.js > "%TEMP%\opencode\api-boot.log" 2> "%TEMP%\opencode\api-boot.err"`, cwd=server; check `Get-NetTCPConnection -LocalPort 5174`
- PowerShell inline `node -e` breaks -- use temp script files; `rg` unavailable
- actionLimiter = 100/min on /api/tournaments: smoke auto-waits 61s on 429
- Group knockout size = G x advancePerGroup (NOT max bracket); qualifier count always equals bracket size in normal draws (uneven manual groups could create byes -- handled+tested)

**Next: Phase 3-5 UI (admin wizard + public Tournament page + Countdown/BracketView/GroupTable) -- ONLY after user approves; then final verify; push ONLY on explicit approval.**




### CHECKPOINT 2026-09-28 (2) - Phase 3-5 UI COMPLETE (frontend), full feature done, STILL uncommitted

**Status: tournament system fully built (backend + both UI pages), all test suites green, local DB scrubbed. NOTHING committed/pushed - waiting for user's explicit push approval.**

**New/changed frontend files (uncommitted):**
- `src/lib/tournament.js` (NEW) - shared constants (SKILL_LEVELS/BRACKET_SIZES/FORMATS/STATUS/SIGNUP/PAYMENT maps), `parseDbTs` (naive-UTC parse, mirrors server), `toApiDateTime` (datetime-local input to ISO; server stores naive UTC), `toInputValue` (DB value to datetime-local), `fmtDateTime/fmtDate`, `signupCap`, `formatSummary`, `statusPill`, `roundLabel`
- `src/components/TournamentCountdown.jsx` (NEW) - 1s ticker with cleanup, gold pulse, "Registration closed" after deadline
- `src/components/BracketView.jsx` (NEW) - round columns (Final/Semi/Quarter labels), match cards, winner highlight, bye/tbd/ready badges, champion banner
- `src/components/GroupStandings.jsx` (NEW) - per-group table (P/W/L/Games +/-/Pts), `highlight` = advance positions (brand tint)
- `src/components/PlayerSearchInput.jsx` (MOD) - added `endpoint` + `minChars` props (defaults unchanged; public page uses `/tournaments/players/search?q=`)
- `src/pages/admin/Tournament.jsx` (REWRITTEN, ~1250 lines) - list (manage) + detail with 4 tabs:
  - Overview: facts, countdown, Edit modal (create/validation mirrored client-side incl. G*TPG and G*ADV in sizes), open/close registration, delete, manual complete, count-to-records toggle (shows mirrored count)
  - Signups and Teams: table (approve/reject/withdraw, payment badge + fee hint "approve in Payments first"), pair-solos (2 selects + optional name), add team (PlayerSearchInput strict), teams table (inline rename/delete pre-draw)
  - Draw: checklist (close/pendings/solos), roster preview with seed-order up/down, group-assignment selects (manual groups) or auto/random; buttons send `{order:[player1_ids]}` / `{groups:{A:[player1_ids]}}` / `{mode:'random'}`
  - Matches: group stage (GroupStandings + per-group rows with ScoreInputs court+scores), knockout (BracketView + result rows, disabled until `playable`), banners for knockout_built/tournament_completed/mirrored
- `src/pages/Tournament.jsx` (REWRITTEN) - public list (skill chips, cards, countdown, fee/cap) + detail (info grid, notes, registration box: sign-in CTA via openLoginModal, role/deadline/full guards, team name + partner search, my-signup status card, fee payment note), GroupStandings, read-only group matches, BracketView, refresh buttons (repo has no polling)

**New server endpoints/semantics (2 additions, all tested):**
1. `GET /api/tournaments/players/search?q=` - authenticate only (members), returns max 10 `{id, full_name}` of active players (no email/phone), q<2 returns [], 401 unauthenticated. Needed because `GET /users` is admin/coach-only and public pairs must sign up together.
2. `POST /:id/draw` extended - `order` accepts team ids OR player1 ids (pre-draw: signups materialize into teams inside the same call); `groups` values accept team ids OR player1 ids (mapped per-id, then validated for exact roster coverage).

**Test results (final, all green against current code):**
- Logic `verify-tournament.cjs`: **136/136**
- API smoke `smoke-tournament.mjs`: **104/104**
- Sweep standalone: **9/9**
- New UI-API `smoke-ui-api.mjs` (Temp\opencode): **35/35** - search auth/shape/no-match/short, naive-UTC close_at round-trip from datetime-local to ISO to DB, pair signup, player-id order to seeds, player-id groups to group_label, double-draw 409
- 0-session CHECK proofs (psql): private=1 rejected, group=1 rejected, private=0 accepted
- `npx oxlint`: **0 errors** (only pre-existing warnings incl. set-state-in-effect on reset-effects)
- `npm run build`: OK (chunk-size warning pre-existing); `dist/index.html` build side-effect was reverted to keep tree minimal
- Local DB: ALL test residue deleted (tournaments/test-users/payments/results/matches/teams/signups/notifications = 0)

**Timezone contract (UI and server):** datetime-local input (local tz) -> `toApiDateTime` -> ISO-with-Z -> `normalizeForPg` -> naive UTC in DB; reads are naive UTC -> `parseDbTs` (+Z) -> render local. Verified end-to-end in smoke-ui-api.

**Resume here:** everything ready for review. Possible next steps: (a) user visual review on localhost (backend :5174 already running with latest code; frontend `npm run dev`), (b) commit+push ONLY on explicit approval (single commit or split feat/fix - ask), (c) prod deploy touches Railway+Pages+Supabase - needs separate explicit OK.

---

## Checkpoint: Registration fee -> Payment redirect

**Request:** pressing the sign-up button showing the fee (e.g. 700 EGP) must redirect the player to the payment page with the tournament fee amount.

**What changed:**
- `server/src/routes/tournaments.js`: signup response now includes `payment: { id, ref, amount }` (null for free tournaments); `GET /:id/my-signup` attaches `payment_ref` + `payment_status` per signup (resume-payment path).
- `src/pages/Tournament.jsx`: successful signup with `payment_required` now does `navigate('/payment', { state: { purpose: 'tournament', tournamentName, entryFee, paymentRef, paymentId, returnTo: '/tournament' } })`; pending fee signup card got a "Pay {fee} EGP" button (hidden once payment is approved); submit button label -> "Sign up & Pay (700 EGP)".
- `src/pages/Payment.jsx`: tournament mode via `state.purpose === 'tournament'` - amount shown everywhere = `entryFee` (InstaPay card, Total Amount Due, confirm button, success grid); summary shows "Tournament Entry" + tournament name + Entry Fee badge instead of the session breakdown; "I Have Completed Payment" does NOT POST /bookings (row was created at signup) -> success screen with payment reference + WhatsApp proof message incl. tournament name and amount; back/return go to `/tournament`. Booking mode unchanged (still `location.state`-only, no query params).

**Flow:** signup (fee>0) creates `payment_pending` 0-session row (already existed) -> immediate redirect -> player pays via InstaPay -> "I Have Completed Payment" -> WhatsApp screenshot -> admin approves in Payments -> signup still needs approval in Signups tab. Free tournaments: no redirect (`payment: null` asserted).

**Tests (all green):**
- New `smoke-pay-redirect.mjs` (Temp\opencode): **22/22** - payment object shape, amount 700, pending status, my-signup ref/status/id match, /payments row notes + tournament_id + 0-session, free-tournament payment null
- Regression: API smoke **104/104**, UI-API **35/35**, logic **136/136**
- `npx oxlint`: 0 errors (pre-existing warnings only); `npm run build`: OK (dist/index.html side-effect reverted)
- Backend restarted (WMI method) with new routes; vite dev :5173 (HMR live) + API :5174 both UP.

**DB note:** test residue scrubbed again (tournaments/test-users/audit = 0). User manual repro restored intact: tournament "Test" (id 38, fee 700), signup 63 pending for Magdy, payment 72 PAY-0023 payment_pending, admin notifications 768-770 (new_payment) + 963-965 (tournament_signup). `payments` also holds 22 pre-existing real historical payments - never touched.

**Resume here:** user reviews on localhost (the "Test" tournament signup or create a new fee tournament). Commit/push ONLY on explicit approval - prod deploy (Railway+Pages+Supabase) needs a separate OK.

---

## Design/UX pass + verification (2026-09-29) - localhost only

**Design doc:** `Stragent.md` rewritten gym -> padel academy design agent (3-court identity, slot/payment/tournament UX rules, 6 themes, naming `mm-padel-*`, localhost verification section).

**Frontend:**
- `src/pages/Book.jsx`: day grid 2 -> 3 courts (`COURTS`/`COURT_LIST`, `grid-cols-4`); week mode got a court picker (was hardcoded `court: 1`); new group partner field (`PlayerSearchInput`, endpoint `/tournaments/players/search?q=`, free-text fallback when logged out) passed as `partner` through `/payment` state and from-balance POST.
- `src/pages/Payment.jsx`: forwards `partner` to `POST /bookings`; WhatsApp confirm message includes partner.
- `server/src/routes/bookings.js`: `slotPlayerText()` - group slots store `player_text: "You / Partner"` on `POST /` and `POST /from-balance` (display only, no billing change).
- `src/pages/Home.jsx`: pricing cards derived from `PRICING` (`PricingTierCard`, single source of truth); gallery filter buttons `aria-pressed` + decorative video `aria-hidden`.
- `src/pages/Schedule.jsx`: week cell renders per-court status badges (occupied mine/pending/awaiting/free) instead of one joined string; empty week state added.
- `src/components/Footer.jsx`: removed dead Instagram/Facebook icon spans + dead Privacy/Terms spans (no URLs exist; WhatsApp + tel links kept).
- `src/pages/admin/ScheduleManager.jsx`: removed always-failing "Toggle Private/Group" menu item (`toggle-type` route 400s since `validatePlayerCount` landed - private<=1 name, group 2-4, so no transition is legal); Edit flow still changes type with players in one validated request. User-approved decision.

**Verification (all green):**
- `server/e2e-all.cjs`: **100/100** (was 82/3 then 99/1 during fixes). Real suite bugs fixed: name collisions (signup name reused by later tests), slots test lacked `balanceOverride: 'free'`, results sideB user was deleted before use, and an unmarked `force-change-password` was silently resetting the ADMIN password to `TestPass123!` every run (now restores `adminPass`; admin hash restored to `.env` value). Cleanup runner added (was never executed despite the header comment) + reject-payment and import-slot cleanup - two consecutive runs leave **0 residue** (verified).
- `npx oxlint`: 0 errors; `npm run build`: OK.
- DB scrub: 74 stale E2E records removed (6 users, 4 payments, 44+10 notifications, 10 import batches); residue check = 0 everywhere.
- Ports left DOWN (API 5174 stopped after sweep; PG 5432 untouched). Temp scripts/logs removed; `backend.log.prev`/`frontend.log.prev` deleted.

**Resume here:** nothing in-flight; all changes uncommitted (commit ONLY on explicit approval; no prod contact).

---

## Home visible upgrades + full UI audit + Wave 1 fixes (2026-09-30) - localhost only

**Home (visible):** hero (glass eyebrow pill + two-line headline + gold-check glass chips), pricing cards (`approx X EGP / session` + gold BEST chip/ring on cheapest rate rows), gallery lightbox (prev/next, Esc/arrow keys, scroll-lock, Maximize2 hover badge), section nav dots (label `animate-fadeIn`, hides near footer). TDZ crash fixed (lightbox effect moved below `filteredGallery`).

**Full audit:** 5 parallel explore agents over 40 UI files vs `Stragent.md` -> ~90 findings (30 high / 50 med / 10 low) reported in 8 groups (domain, money-trust, a11y, theming, states, nav/roles, dates, UX details). Key claims personally verified (missing themes, @theme gaps, coach guard, effective_group).

**Wave 1 fixes (all verified):**
- Domain: Court 4 removed from GuestBooking/admin Payments/Profile (now `COURT_OPTIONS` from `COURTS=3`); Book tierTag from `PRICING`; Home/Footer `COURTS` + EGP; `CONTACT.whatsappUrl/whatsappLabel` in siteConfig (Footer + Payment FAB use it).
- Money-trust: Payment ref-copy button + rate breakdown + error fallback copy; Profile `user.effective_group` (server truth for group tier cap); conversion-requests GET `converted_count` + ScheduleManager uses it; Book inline `balanceError` (no more alert()).
- A11y: id/htmlFor in Login/LoginModal/SignUp, skill radiogroup + password 8->10, AdminLayout aria-labels/aria-expanded, Dashboard propose send/cancel + two-step Deny confirm, Expenses/Results delete aria-labels, Navbar fmtStamp + coach Dashboard link -> /admin/schedule + Unread badge + aria-expanded on theme/bell/hamburger, Home review form (star aria-pressed, textarea aria-label, disabled reason, status colors), Book session cards -> radiogroup/keyboard.
- PlayerSearchInput rewritten: combobox ARIA (aria-expanded/controls/activedescendant), listbox/option roles, status rows (empty/error), onChange now fires on every keystroke; strict callers in Tournament.jsx + admin Tournament.jsx now clear stale selection on edit; ScheduleManager handlers verified safe.
- Theming: `@theme inline { --color-surface/theme/muted }` replaces plain token classes (hover:bg-surface etc. now compile - verified in dist CSS); 5 missing palettes built (.theme-ocean/forest/sunset/royal/contrast = dark-family, full var sets + slate overrides); ThemeContext THEMES 2->7 + applyTheme removes all classes (desktop picker picks them up automatically); index.html pre-paint already aligned. Reduced-motion extended (animate-fadeIn/pulse-glow/pulse/bounce + scroll-behavior auto).
- States: Payments delete -> consequence modal (ref/player/EGP/credited/settled + Escape/backdrop); Reports unpaid players loading/error/empty split (Retry); Expenses fetch error state + Retry + delete error surfaced.

**Verification:** `npx oxlint` 0 errors; `npm run build` OK (x4 checkpoints); dist CSS confirmed to contain hover\:bg-surface:hover + theme-* palettes; frontend :5173 UP (200), API :5174 down (start for e2e).

**Not done (Wave 2+):** pagination (Users/Payments), UserDetail tabs/layout/balance note, admin modal a11y sweep, KPI rework, date helpers (formatDateShort ambiguity), server quote endpoint for conversions, Profile totalPrivateRemaining, `bg-brand text-white` -> `text-slate-900` contrast sweep (45 matches, user decision), rose-500 destructive buttons 3.7:1, remaining native alert()/confirm() sweep, e2e suite rerun (needs API up).

**Resume here:** Wave 1 complete, all uncommitted (commit ONLY on explicit approval; no prod contact).

**Correction (same day):** user does not like the new background/palette colors -> FULL revert of the theming-wave color changes: `@theme inline` block removed + original plain token classes restored (`.bg-surface/.bg-theme/.text-theme/.text-muted/.border-theme/.divide-theme`), the 5 `.theme-*` palettes deleted from index.css, ThemeContext back to Dark/Light only (plus guard: unknown stored `mm_padel_theme` value resets to `dark`), index.html pre-paint clamped to dark/light. Reduced-motion additions kept (not color). Non-color Wave 1 fixes (a11y, modals, states, money-trust, domain) kept. Verified: oxlint 0 errors, build OK, dist CSS has plain `.bg-surface` and no `theme-ocean`. **e2e-all.cjs: 100/100, 0 residue** (API :5174 was already running; vite :5173 UP).

---

## Nav tweaks + Home simplification pass (2026-09-30) - localhost only

**Nav:** "Guest Booking" tab removed from header (guest flow stays inside /book -> /guest-booking link); "Schedule" link now signed-in only (Navbar navLinks + Footer quick link).

**Home auto-scroll:** guided tour on load (1 section / 4.5s), pauses on wheel/touch/key/mousedown, resumes after 10s idle, stops at last section, skips while lightbox open/footer visible/tab hidden (lastInteractionRef persists across effect re-runs).

**Home simplification (simpler / professional / attractive):**
- Removed marquee strip + marqueeItems; hero overlays cut 8->4 (no float blobs), chips row removed, shine animation + btn-sheen + hover-scale dropped (headline keeps static gradient), gold CTA simplified.
- Method + Why MM merged into single #method section (steps x3 + why x4); LEVEL_PATHS block, TV card, levelIcons, id="why" topic removed (HOME_TOPICS now 9 entries - rail + auto-scroll follow).
- Uniform section headers: eyebrow + h2 (3xl/4xl) + one-line sub, mb-14 everywhere; backgrounds plain except Pricing tint.
- One CTA system: green primary (bg-brand) for all section CTAs, surface+hairline outline secondary, gold reserved for hero + Best Value; btn-sheen gone.
- Cards unified: glass-card rounded-2xl + hover:-translate-y-1 (team/method/why/programs/reviews/contact); dead bg-surface/60 overrides removed (unlayered .glass-card always won anyway).
- Pricing: computed featuredType (lower best-rate) gets gold ring + "Best Value" badge replacing per-card badge; per-row Best chips unchanged.
- Gallery: "Evening Play" filter dropped (All shows all 6), static Live-Clip dot; Reviews: top 3 default + Show More (>3), header sub added; FAQ/Contact header subs + normalized card bg; CTA band -> bg-brand/10, green primary + brand outline secondary; icon-bounce removed page-wide.

**Verification:** oxlint 0 errors (only pre-existing set-state-in-effect warning), npm run build OK. Frontend :5173 HMR live. Visual pass = user review.

**Resume here:** all uncommitted (commit ONLY on explicit approval; no prod contact).

---

## Wave 2a: native dialogs removed + modal a11y (2026-09-30) - localhost only

**New shared feedback system** (`src/context/FeedbackContext.jsx`, mounted in App.jsx):
- `useFeedback()` -> `{ confirm, prompt, toast }`.
- `confirm({title, description, details, confirmLabel, tone})` -> Promise<boolean>; promise-based in-app modal (role=dialog, aria-modal, labelled, Escape + backdrop cancel, focus on confirm, body scroll lock, danger/success/default tones).
- `prompt({title, label, defaultValue, ...})` -> Promise<string|null> with input field (replaces native prompt()).
- `toast.info/success/error/warning` -> non-blocking stack top-right (role=status, aria-live=polite, 5s auto-dismiss, dismiss button, whitespace-pre-line).

**Native dialog sweep (38 -> 0):** all alert()/confirm()/prompt() in src replaced:
- alert -> toast.error (errors) / toast.success (Payments settlement info).
- confirm -> await confirm({...}) in Payments (reject), UserDetail (expire), Tournament admin (8: open/close reg, delete, complete, signup, pair, remove team, publish draw), ScheduleManager surfaced 4 previously silent `catch {}` + toast errors.
- prompt -> await prompt (UserDetail write-off x2, incl. reason field).
- `lib/gift.js` confirmGift(confirm, {playerName, priv, grp, amountOwed}) now returns the shared modal promise (both Reports + UserDetail callers updated).
- Also converted native alerts in Profile, Schedule, Users (export), Expenses, Reports.

**Modal a11y sweep (30 modals):**
- All 30 `fixed inset-0 z-50` backdrops now have role="dialog" + aria-modal + aria-labelledby -> id on their title (scripted pass + manual fixes for 4 distant titles).
- `useEscapeKey` hook (`src/lib/hooks.js`) wired: Users (5 modals), UserDetail (PaymentModal + 4 inline confirm dialogs), Results (3), ScheduleManager (addSlot/balanceWarning/pendingOverride + EditSlot pendingOverride-first Escape), Tournament form, Schedule/Book flyer modals, LoginModal (guarded by isLoginModalOpen), Profile PlayerResultModal, DeclineChoiceModal (guarded while loading), Expenses (Add + delete), BalanceControl.
- ExpenseModal/EditSlotModal/BalanceControl also got backdrop-click close (panel stopPropagation).
- Skipped: ForcePasswordChange overlay (intentionally undismissable), Home lightbox (done in Wave 1).

**Verification:** oxlint 0 errors; `npm run build` OK. e2e unaffected (backend untouched).

**Resume here (Wave 2 backlog):** pagination Users/Payments, UserDetail tabs/layout, Dashboard KPI rework, date-helper dedupe, `bg-brand text-white` contrast decision (3.08:1 - fails AA; needs user choice), rose-500 destructive buttons consistency. All uncommitted (commit ONLY on explicit approval; no prod contact).

## Wave 2b: date helpers dedupe + contrast decision (2026-09-30) - localhost only

- **Contrast decision (user):** keep `bg-brand` + white text as-is (3.08:1 accepted; do not re-raise, do NOT sweep to dark text / do NOT darken brand).
- **Date helpers centralized** in `src/lib/time.js`: added `formatDateShort` (d/m) and `formatDateMed` (02 Sep 2026, fixed en-GB so output is locale-independent + null/invalid -> em dash).
- Removed duplicate `formatDateShort` from Schedule.jsx and ScheduleManager.jsx (identical copies) -> both now import from lib/time.
- Replaced inline `new Date(x).toLocaleDateString()` (browser-locale dependent) in admin Dashboard (created_at), Users (created_at), UserDetail (joined + cycle_expires_at) with `formatDateMed`.
- Left as-is: lib/tournament.js fmtDate/fmtDateTime (tournament-scoped), Navbar fmtStamp, receiptPDF generated date.
- Verification: oxlint 0 errors, npm run build OK.

**Still open (Wave 2 backlog):** pagination for admin Users list (backend already supports page/limit in routes/users.js) + Payments (route has none - needs route work), UserDetail tabs/layout (880-line single scroll), Dashboard KPI rework, rose-500 destructive-button consistency. All uncommitted (commit ONLY on explicit approval; no prod contact).

## 2026-09-30 � Wave 2c: pagination + Profile debt/credits

- **Users + Payments tables paginated (client-side):** `PAGE_SIZE = 25` in both; page state resets on search/filter change; footer shows `Showing X�Y of Z` + Prev / `Page N of M` / Next (hidden when under 25 rows). Instant search kept (all rows still in memory, only 25 in DOM). No backend change � Payments route has no page/limit, client-side avoided route work; Users route already supports it if ever needed.
- **Profile `totalPrivateRemaining` + debt (Stragent.md:167 "remaining private/group, cycle, debt"):**
  - Cards now render `totalPrivateRemaining` / `totalGroupRemaining` (was duplicate inline `max(0, cycle+legacy)` math � same value, single source now).
  - `/auth/me` (`server/src/routes/auth.js` `safeUserPayload`) now returns `debt_private` / `debt_group` (>= 0 magnitudes, same convention as `users.js` enrichPlayer).
  - Profile shows `Outstanding: X private � Y group owed � settle at the academy.` (rose) inside the credits panel AND inside the "No active package" empty state � debt was previously invisible to players (auth payload clamps legacy to >= 0, so client could not detect it).
  - Verified: oxlint 0 errors, client build OK, `node --check auth.js` OK.
- Server stayed up throughout (localhost only). No commits.

## 2026-09-30 - Wave 2d: UserDetail tabs, Dashboard KPIs, conversion quote endpoint (localhost only)

- **UserDetail tabs (Stragent.md:453 "Avoid displaying all information simultaneously. Use sections/tabs"):**
  - Added `tab` state + tab bar (matches ScheduleManager pill style, `role=tablist`/`role=tab`/`aria-selected`): **Overview | Balances | Sessions | Payments** (Payments tab only when `canPay`).
  - Top stays always-visible per spec: header/quick actions, contact grid, then money row now `sm:grid-cols-3` = Amount Owed + Total Paid + **new merged Remaining card** (`5P � 0G`, "1P = 2G � this month X/Y", full-width on mobile per Stragent:434).
  - Overview: used-sessions stats (4 tiles; removed the duplicate "Remaining" tile now shown in the merged card) + Notes. Balances: legacy/cycle/debt/expiry/write-off panel. Sessions: session history. Payments: payment history (empty state now shows instead of hiding the panel).
- **Dashboard KPI rework:**
  - KPI grid `xl:grid-cols-6` -> `sm:grid-cols-2 lg:grid-cols-3` (no more 6-across squeeze); StatCard gained a `sub` line: Users "N players", Bookings "N active", Revenue "approved payments", Occupancy now `27%` big + "12 of 45 slots filled" (was unreadable `12/45 (27%)`).
  - `handleDecide` silent `catch {}` (old line 71) now surfaces `toast.error` via FeedbackContext.
  - Session Credits table: group cell now shows `� up to X as group` when `group_from_private > 0` (same money-truth note as Reports/UserDetail/Profile).
- **Server quote endpoint for conversions:** `GET /api/conversion-requests/quote?from=private|group&count=N[&player_id=]` in `server/src/routes/conversion-requests.js`.
  - Mirrors **approval math** (legacy buckets only - cycle package stays as-is, matching PUT /:id/approve): returns `{max, yields, allowed, reason, legacy_*, effective_*}`. player_id != self requires `conversions` permission (getUserPermissions).
  - Fixes the client-side gap where the form's max used effective balances (cycle credits) but approval converts legacy only - now the UI gets `allowed:false` + reason ("Active package credits stay with this cycle...") and the submit button disables.
  - Profile `ConversionRequestButton` wired: fetches quote on open/from/count change, uses `quote.max`/`quote.yields`, shows `quote.reason`, disables submit when not allowed. Fallbacks keep old client math if the fetch fails.
  - Live-verified: login OK, `quote?from=private` + `from=group` return expected JSON, `GET /` list unaffected.
- **e2e suite rerun: 100 passed, 0 failed, 0 skipped** (e2e-all.cjs needs ADMIN_EMAIL/ADMIN_PASSWORD exported from server/.env in the shell - it does not load .env itself).
- **rose-500 destructive buttons (3.7:1 white-on-rose):** keep as-is by the same user decision as `bg-brand` (do not sweep to dark text / do not darken).
- **Concurrent-writer note:** another session/writer touched AuthContext/App/AdminLayout/Dashboard during this work (RBAC split: `canEdit`(users)/`canPay`(dashboard)/`canConvert`(conversions) + `hasPermission(module)`); user chose "continue everywhere, accept conflicts". UserDetail tab work coexists with those edits; lint+build green after merge.
- Verified: oxlint 0 errors, client build OK, `node --check` on edited server files, e2e 100/100. All uncommitted (commit ONLY on explicit approval; no prod contact).
- **Remaining backlog:** none of the original Wave 2 items are open. Candidates (not started, no audit spec): PlayerSearchInput/other UX polish, e2e re-run after future server changes.

## 2026-09-30 - Coaches moved off Home to its own nav tab (localhost only)

- **Home:** removed the "Meet the Coaches" / OUR TEAM section (`id="team"`), the `coaches` state + `/users/public/coaches` fetch, the `fileUrl` import, and the `team` entry from `HOME_TOPICS` (8 topics now; scroll-spy dep cleaned from `[coaches.length]` -> `[]`). No other page linked to `#team`.
- **New page `src/pages/Coaches.jsx` (route `/coaches`):** featured **Head Coach Mahmoud Moharam** card (gold ring/badge, bio blurb + pull-quote "Every rally has a lesson - train with purpose."), then "The Coaching Team" grid from the public coaches API (same card style as Home; filters out a DB coach row named Mahmoud Moharam so he never shows twice).
- **Nav tab:** `Coaches` added to Navbar `navLinks` immediately after `Book a Session` (desktop pill nav + mobile menu both map from navLinks) and to Footer Quick Links right after Book Session.
- **App.jsx:** import + `<Route path="/coaches" element={<Coaches />} />` (public, inside Layout).
- Verified: oxlint 0 errors (only pre-existing warnings elsewhere), `npm run build` OK. All uncommitted.

## 2026-09-30 - Home pass: simple/useful/professional + Explore rework (localhost only)

- **Explore the Academy (gallery) reworked:**
  - Filters REMOVED (they were also broken: "Evening Play" category had no matching button, so that item was unreachable except via All). Section header now centered like every other section (eyebrow "Inside the Academy").
  - Gallery data cleaned: dropped the pricing-flyer item (duplicated the pricing section) and the duplicate court item (same image as Court 1) -> 4 distinct items, one clean row on desktop (`lg:grid-cols-4`).
  - Card chrome simplified: removed the "Live Clip / Photo" status pill; kept bottom gradient + tag + title + maximize affordance + full lightbox (arrows/Escape/scroll-lock).
- **Programs section REMOVED** - it restated the same two packages already shown in the Pricing section (long price-string blobs, ~700px of scroll). Hero secondary CTA retargeted `#programs` -> `#pricing` ("See pricing"); `HOME_TOPICS` now 7 entries (auto-tour/navigator adjust automatically).
- **Method section:** removed the redundant "Book Your Path" button (pricing + final CTA band still cover conversion).
- Cleanup: dropped `PROGRAMS`/`CheckCircle2` imports, `galleryFilter` state, `filteredGallery` selector (now plain `GALLERY_IMAGES`), fixed exhaustive-deps warning on the lightbox effect.
- Home section order now: Hero / Method / Pricing / Explore / Reviews / FAQ / Contact / CTA.
- Verified: oxlint 0 errors (only the pre-existing set-state-in-effect warning in useCountUp), `npm run build` OK. Left untouched: auto-scroll guided tour (was a deliberate earlier feature), hero, pricing, reviews, FAQ, contact, CTA. All uncommitted.

## 2026-10-01 - Feature: User Coaching Journey & Progress Reports (Phase 15, localhost only)

- **Plan first:** inspected repo (dual pg/JSON db.js, comments/tournaments route conventions, Profile single-scroll, UserDetail tabs), locked decisions with user: report authorship = admins+coaches via existing `players` permission (no RBAC changes); completed session = `player_confirmed` slot on/before today (mirrors enrichPlayer name matching); assessment-first gate (monthly reports 400 until initial assessment published). Plan saved to `docs/journey-plan.md`.
- **DB (new tables only; users/slots/bookings untouched):**
  - `assessment_templates` (33 canonical skills: P1 Shots 19 across 5 sections / P2 Fitness 4 / P3 Movement 5 / P4 Intelligence 5), `journey_reports` (kind `initial|monthly`, statuses `draft|submitted|in-review|returned|reviewed|published`, `UNIQUE(user_id,kind,report_number)`, `maximum_reports` default 10, `overall_score NUMERIC(4,1)`, general user/admin comments, `published_at`), `journey_items` (user/admin/final scores + comments, all 1-10 CHECKs, `UNIQUE(report_id,template_id)`).
  - Wiring: `ensureJourneyTables()` in `server/src/index.js` (idempotent pg CREATE + triggers + indexes + seed; runs before `loadActorColumns` so created_by/updated_by stamp), `schema.sql` DDL + DROPs, `db.js` TABLES/DATE_COLS/DECIMAL_COLS, `database.js` DEFAULTS. Initial assessment = kind `initial`, report_number 0; monthly numbered 1..N (max+1).
- **API `server/src/routes/journey.js`** (mounted `/api/journey` with actionLimiter, `authenticate` globally):
  - GET `/templates` (33 + pillars), GET `/` (self: published monthlies full, returned full for editing, other monthlies metadata-only; assessment always theirs), GET `/:userId` (`players` perm, full), GET `/reports/:id`, POST `/assessment` (409 dup), POST `/reports` (gates: assessment published / no active / month unique / number<=max / 400-409 messages), PUT `/reports/:id` (owner fields user_* only while initial draft|returned or monthly returned; admin fields admin_*/final any status; comment length via LIMITS), POST `/:id/:action` = submit (owner; 33 self-scores required; initial->submitted, monthly->in-review) | start-review (admin; initial from submitted, monthly from draft) | return (admin; +comment, notify player) | reviewed (admin; admin+final complete) | publish (admin; final complete, sets published_at, notifies player).
  - Math on read: overall = avg(final ?? admin ?? user) rounded 1dp (published = final lens), pillar averages grouped via templates, progress = round(published_monthlies/max*100). `storeOverall` persists report.overall_score on edits/transitions. Sessions = player_confirmed slots date<=today matching user_id or player_text name list.
- **Shared UI `src/components/Journey.jsx`:** default `MyJourneySection` + named `JourneyTab`. Summary cards render exact spec strings (label+value one line; `Report X of Y` its own card; progress bar under grid), pillar chips, grouped skill lists (pillar->section; user mode = score+comment inputs; admin mode = admin+final inputs + coach comment; view = badges + comments), empty state (explanation, Sessions completed line, Start Your Journey + Initial Assessment buttons both bootstrapping the draft), timeline (create/submit/return/publish events, max 30), collapsible report cards with status pills, per-report editors + resubmit (returned), admin create-report month picker with gating hints, "Finals <- admin scores" helper, return via `prompt()` with comment.
- **Wiring:** Profile.jsx `<MyJourneySection />` (players) after SessionHistoryPanel; UserDetail.jsx `journey` tab (TrendingUp) inside isPlayer tab bar + `<JourneyTab userId={id} />` block.
- **Verify:** oxlint 0 errors, 0 warnings in Journey.jsx (47 pre-existing elsewhere); `npm run build` OK; e2e `[journey]` block added (41 checks incl. player 403s on /journey/:userId + POST /journey/reports, 400 score rejects, owner-edit-after-submit 403, review/publish completeness gates, active/duplicate month 409, draft-items hidden from player, progress 10% after 1 of 10, notifications, edit-published) -> **141 passed / 0 failed**. Smoke test earlier 57/57 (temp script in %TEMP%, admin self-journey rows cleaned via psql; e2e temp player cascades on user delete; 33 templates remain by design).
- Docs: `docs/journey-plan.md` created; task_complete.md Phase 15 + File Changes rows. All uncommitted (user handles git).

## 2026-10-01 - Fixes: journey UI corruption, per-report state, admin-start-assessment

- **"Failed to fetch" root cause:** three duplicate backend chains (npm run dev x3, node --watch x2) were fighting over port 5174. Killed all, restarted ONE with log capture (`%TEMP%\opencode\server.log`). Exact player submit flow reproduced clean (57-check style smoke: signup -> journey -> assessment -> PUT 33 scores -> submit, all 2xx).
- **Journey.jsx encoding:** file had 361 double-encoded UTF-8 chars (arrows/dashes rendered as "�"/"—" in UI). Fixed byte-wise via windows-1252 reverse-map script (`%TEMP%\opencode\fix-mojibake.cjs`, backup `Journey.jsx.bak`); 0 mojibake left.
- **Per-report state bug (admin panel):** opening a previous monthly report showed the ACTIVE report's numbers because adminValues was not reloaded per report. Fixed: report header click now reloads that report's saved values into adminValues.
- **Player old scores now visible to admin:** SkillsList admin mode shows "player X" self-score chip next to admin/final inputs, and the player's per-skill comment (read-only) in the coach-comment row.
- **Admin starts initial assessment (feature):** POST /api/journey/assessment accepts optional `user_id`; non-self requires `players` permission (403 otherwise), 404 unknown user, 409 duplicate, notifies the player ("Your coach started your initial assessment"). JourneyTab empty state replaced with "Start initial assessment" button + handler `startAssessmentForPlayer`.
- **Verify:** node --check OK; oxlint 0 errors (0 Journey warnings); build OK; dedicated 11-check admin-start smoke ALL PASSED (incl. player-for-other-user 403, duplicate 409, notification delivered, player PUT+submit after admin start); **e2e 141/141**.
- **Answered user questions:** "Finals <- admin scores" button copies admin scores into empty final fields (review-then-save shortcut); final = locked published number, admin = working numbers during review.
- All uncommitted (user handles git).

## 2026-10-01 - Redesign: Journey report interface (both surfaces, R1-R6)

- Plan approved by user via options (both surfaces; all pain points: length/scroll, visual style, confusing workflow, mobile). UI-only: no API/DB/RBAC/status changes, exact spec strings kept (Sessions completed:, Report X of Y, Overall score: X/10, Journey progress: N%), no new deps. All work in src/components/Journey.jsx (1138 -> ~1450 lines).
- R1 SkillsList rewrite: dense rows instead of stacked cards. Per-row responsive grid (admin: Skill | Player | Admin | Final | Note; user: Skill | Your score | Comment; view: Skill | Score). Collapsible pillar blocks with live counters (Admin 7/9 . Final 5/9 / n/33 scored), sticky pillar headers (top-0 inside admin <main overflow-auto> scrollport, top-20 under site navbar for player window scroller), section subheaders, auto-collapse pillars already fully scored. Mobile: col-span-2 name + labeled score cells + 42px steppers; Enter jumps to next visible score input ([data-skills] + data-score-input filter by offsetParent).
- ScoreInput: added -/+ stepper buttons (sm:hidden, 42px targets, lucide Minus/Plus), data-field attr, Enter-to-next nav; base bg switched to utilities where hover/focus pairing needed (unlayered .bg-surface/.border-theme beat layered hover:/focus: utilities - known trap, documented).
- R2 ScoreRing (SVG, stroke-brand + neutral track, center value /10) added to player hero (92px, aria-label); PillarRow chips replaced with mini bars (per-pillar color + value text, never color-only).
- R3: column legend above admin tables (Player = self-assessment read-only / Admin = working / Final = published); Fill finals button now shows live count "Fill finals (n empty)" (n = admin set + final empty, disabled at 0 with title) and after clicking focuses first still-empty final (focusFirstEmptyFinal via tableId); "Mark reviewed" disabled count now skips __general key (pre-existing bug: typing a general comment disabled Mark reviewed with wrong reason) and title shows "N skills still need an admin + final score".
- R4: player hero (ring + Report X of Y + status pill + context line + "Continue scoring (n/33)" CTA, becomes "Review & submit" at 33/33); report-card headers gained mini score "7.2/10"; Timeline collapsed into <details> "Journey history (n)" on both surfaces.
- R5: StatusPill/ScoreBadge kept (already match repo chip/badge conventions); ActionButton ghost tone fixed (bg-surface + hover pairs were dead -> bg-white/dark:bg-slate-900 + hover bg works).
- R6: both spinners replaced by SkeletonPanel (aria-busy pulse blocks); load failures now render ErrorPanel with message + Try again (retry()) instead of blank screen; toast kept.
- Fixed dead no-op classes in touched code: bg-surface/60, bg-surface/50, hover:bg-surface/60 -> bg-white/50 dark:bg-slate-900/40 or bg-white/dark:bg-slate-900 + slate hover variants. Removed overflow-hidden from admin monthly panel (it silently disabled sticky action bar + sticky pillar headers inside it).
- Sticky action bars (z-30, backdrop blur, rounded-b, negative-margin bleed): player assessment (Save draft / Submit / n/33 hint), player returned report (Resubmit), admin assessment (Save scores / Fill finals / status actions), admin monthly (Save report / Fill finals / status actions). Status actions moved from assessment header into its sticky bar (no duplicate button sets).
- Verify: oxlint 0 errors, 0 Journey findings (52 pre-existing warnings elsewhere); mojibake 0 (arrows/emdashes/middots valid UTF-8); npm run build OK; vite dev transform of Journey.jsx 200 with new symbols; backend health 200; **e2e 141/141**. Left uncommitted for user review on :5173 (Profile > My Journey; Admin > Users > player > Journey tab).

## 2026-10-01 - Addendum: journey redesign full-file review pass

- Read all 1440 lines of Journey.jsx end-to-end hunting runtime bugs (lint/build/e2e can't): none found. Confirmed every new Tailwind class actually emitted in built CSS (arbitrary grid-cols, min-h-[42px], group-open, sticky offsets, focus-visible rings).
- ARIA polish: ScoreRing role="img", SkeletonPanel role="status".
- Re-verified: oxlint 0 errors / 0 Journey findings, mojibake 0, build OK, api 200, vite transform 200, e2e 144/144 (141 journey-era checks + 3 court-default checks added by the concurrent slots workstream; journey block untouched).
- Still local-only, uncommitted.

Session: professional report analytics with charts (player + admin)
- Journey.jsx: added round1/lensValue/trendPoints, TrendChart + TrendPanel (SVG score progression), PillarRadar (4-axis pillar profile), ReportAnalytics (ring + radar + score bands + strongest/focus). Hand-rolled SVG, no new deps.
- Wired 6 touchpoints: player main (trend), player assessment view, player full report view, admin journey top (trend), admin assessment block, admin monthly block. Live updates from drafts.
- Verification: oxlint 0 errors / 0 Journey findings; build OK; vite transform 200; api 200; e2e 144/144; mojibake 0; new classes in dist CSS.
- INCIDENT: e2e failed (POST /journey/assessment 500, null value in column id). Root cause: local PG journey tables recreated externally without identity, FKs, CHECKs, UNIQUEs; orphan rows accumulated.
- DB repaired: identity on journey_reports/journey_items/assessment_templates id columns; 13 constraints restored; orphans purged.
- Hardened server/src/index.js ensureJourney: boot self-heal restores missing id identity + all 13 journey constraints; both branches tested (skip 13->13, add 12->13); CREATE DDL FKs named to match ensure names.
- Post-repair: e2e 144/144 twice; post-run orphans=0 (ON DELETE CASCADE verified).
- Uncommitted (local only): src/components/Journey.jsx, server/src/index.js, dist artifacts.
