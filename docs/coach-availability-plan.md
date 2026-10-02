# Coach-Assignment & Availability System — Implementation Plan

## Goal
Add a coach **availability** layer (weekly working hours + date-specific days off) with admin management UI in the Schedule page, and enforce it (plus coach double-booking detection) wherever coaches are assigned to slots — blocking with an explicit "assign anyway" override.

## Verified current state (all re-checked this session)

**Data (local PG `mmacademy:5432` — live backend, `DB_ENABLED=true`):**
- Coach users exist: `Coach Laila` (36), `Coach Omar` (37), both `role='coach'`; `roles` table has coach (level 2).
- `slots`: 242 rows (2026-01-14 → 2026-09-30), **36 with `coach_id`**; time format is mixed `HH:MM` and `HH:MM-HH:MM` (e.g. `19:00`, `15:00-16:00`, `10:00-12:00`); statuses: `player_confirmed` 234, `available` 6, null 2.
- `court_defaults`: 4 rows (courts 1,2,3,6); only court 2 → coach 37.
- Coach payroll already live: `coach_daily_hours` (25 rows, 2 coaches).
- **No availability schema anywhere** (PG `mmacademy`, `mmacademy_fkcheck`, `postgres`; MySQL `localhost:5175 mmacademy`; repo code). Confirmed via information_schema scans.
- MySQL:5175 `mmacademy` is an older/divergent snapshot (14 tables, no `slots.coach_id`) — **out of scope**; feature targets the live PG backend only.

**Code:**
- Coach assignment UI already complete in `src/pages/admin/ScheduleManager.jsx`: Add/Edit slot coach select, court-defaults panel (`superadmin`-gated) with apply-to-future, grid shows `coach_name`, `suggestNextSlotTime` avoids coach overlap **when suggesting** only.
- Server `server/src/routes/slots.js` validates **court** conflicts only (409 "Slot already exists"); **no coach-conflict and no availability checks** on POST `/` (line ~402) or PUT `/:id` (line ~253).
- Coach users can reach `/admin/schedule` (`ProtectedRoute module="schedule"`, coach permissions include `schedule`).

## Design decisions (confirmed with user)
1. **Storage:** weekly working hours per coach + date overrides (day-offs). 
2. **Enforcement:** hard block with structured error; admin can tick **"Assign anyway"** → retry with `force: true`. Existing violating slots are flagged visually in the grid.
3. **UI:** new **"Coaches" tab** inside ScheduleManager (next to Schedule / Upload / Conversions).
4. **Writes:** admin-only (`superadmin`/`admin`); coaches may read nothing extra (tab hidden for coach role).

## Schema (PG, boot migration — mirror `ensureJourneyTables` pattern)

New block in `server/src/index.js` (`ensureCoachAvailabilityTables()`, run with the other boot migrations, gated `db.backend === 'pg'`):

```sql
CREATE TABLE IF NOT EXISTS coach_availability (
  id SERIAL PRIMARY KEY,
  coach_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time VARCHAR(5) NOT NULL,   -- 'HH:MM'
  end_time   VARCHAR(5) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_coach_weekday UNIQUE (coach_id, weekday)
);
CREATE TABLE IF NOT EXISTS coach_unavailable_dates (
  id SERIAL PRIMARY KEY,
  coach_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_coach_date UNIQUE (coach_id, date)
);
```
+ add both tables to `TABLES` in `server/src/db.js` (after `users` — required for actor-column cache / delete ordering).

**Semantics (documented in code):**
- Coach with **zero** weekly rows → no restriction (backward compatible, current behaviour preserved).
- Coach with rows → only listed windows are available; unlisted weekdays are off; `coach_unavailable_dates` further subtracts whole days.
- Slot start (parsed from first 5 chars of `slots.time`; end = explicit range end or start+1h) must **overlap** a working window and not land on a day-off.

## API — new `server/src/routes/coach-availability.js` (mounted `app.use('/api/coach-availability', ...)`)

| Method | Path | Auth | Body / returns |
|---|---|---|---|
| GET | `/` | `requirePermission('schedule')` | `{ coaches: [{ id, name, weekly: [...], dates: [...] }] }` — all coach users |
| PUT | `/:coachId` | `requireRole('superadmin','admin')` | `{ weekly: [{weekday, start_time, end_time}] }` — full replace (empty = clear = unrestricted) |
| POST | `/:coachId/dates` | `requireRole('superadmin','admin')` | `{ date, note? }` |
| DELETE | `/dates/:id` | `requireRole('superadmin','admin')` | — |

Validation: coachId must exist with `role='coach'`; weekday 0–6; `HH:MM` regex; `end_time > start_time`; date `YYYY-MM-DD`.

## Enforcement — `server/src/utils/coachAvailability.js` + `slots.js`

New pure-ish helpers (db-injected like other utils):
- `checkCoachSlot(db, { coach_id, date, time, excludeSlotId })` →
  - `{ ok:false, code:'COACH_UNAVAILABLE', message }` — outside weekly window / day-off.
  - `{ ok:false, code:'COACH_CONFLICT', message, conflict:{date,time,court} }` — another slot same coach/date/time-overlap **with a player booked** (status not `available`/null), different court, `id ≠ excludeSlotId`.
  - `{ ok:true }`
- Hook into `POST /api/slots` and `PUT /api/slots/:id`: when `coach_id` present and `req.body.force !== true`, run check → `409 { error, code, details }`. With `force:true` → proceed (audit already logs the write).

Player booking routes untouched (players book pre-created slots; later availability changes surface as grid warnings, not blocks).

## Frontend

**1. `src/lib/coachAvailability.js` (new, pure):**
`weekdayIndex(dateStr)`, `slotRange(time)` → `[start, end]`, `isCoachAvailable(weekly, dates, date, time)`, `coachConflict(slots, coachId, date, time, excludeId)` — shared by grid warnings + modal live hints.

**2. ScheduleManager — "Coaches" tab:**
- Tab entry `{ id: 'coaches', label: 'Coaches', icon: Users }`, rendered only when `isSuperAdmin || hasPermission('users')` (coaches never see it).
- New `CoachesAvailability` section component (in ScheduleManager file or `src/pages/admin/CoachesAvailability.jsx` if large): coach cards/select → weekly editor (Sun–Sat: enable checkbox + start/end `<input type="time">`), "Restrictions: none" badge when empty, day-off list (date + note + delete, add-date row), Save → `PUT`/`POST`/`DELETE` + toasts. Destructive clear ("no restrictions") confirm.
- Availability fetched on mount alongside `fetchCoachesAndDefaults` (single `GET /api/coach-availability`).

**3. Schedule grid warnings:**
Booked slot violates availability or double-books a coach → red ring (`ring-2 ring-rose-500`) + `title` tooltip ("Coach Laila — outside working hours" / "Coach Laila also on Court 2 at 19:00"). Legend chip in grid header.

**4. Add/Edit slot modals:**
- Live hint under Coach select when current date/time unavailable (client helper, amber text).
- On save, catch `409` with `code: COACH_*` → inline confirm: message + **"Assign anyway"** button → retry same request with `force: true`.

## Files touched
| File | Change |
|---|---|
| `server/src/index.js` | `ensureCoachAvailabilityTables()` + mount route |
| `server/src/db.js` | add 2 tables to `TABLES` |
| `server/src/routes/coach-availability.js` | **new** |
| `server/src/utils/coachAvailability.js` | **new** |
| `server/src/routes/slots.js` | POST/PUT checks + `force` |
| `src/lib/coachAvailability.js` | **new** |
| `src/pages/admin/ScheduleManager.jsx` | tab, Coaches UI, grid warnings, modal force-retry |
| `server/_smoke-coach-availability.mjs` | **new** end-to-end smoke |

## Verification
1. Restart backend → boot log shows `coach_availability` / `coach_unavailable_dates` ensured; tables exist (information_schema check).
2. `node server/_smoke-coach-availability.mjs` (server on :5174, admin login from `server/.env`): set Sunday-off for coach 36 → create Sunday slot with coach 36 → expect `409 COACH_UNAVAILABLE`; same with `force:true` → 200; create overlapping slot other court → `409 COACH_CONFLICT`; force → 200; clear availability → normal 200; **cleanup all test rows**, assert DB back to start (slot count / availability rows).
3. `npm run lint` (exit 0, no new warnings) and `npm run build`.
4. Manual smoke of Coaches tab via running frontend (dev server) if reachable; otherwise rely on build + API smoke.

## Risks / notes
- **Backward compat:** empty availability = unrestricted ⇒ deploying the feature cannot break existing flows until admin opts in per coach.
- Mixed `slots.time` formats handled by range parsing (first 5 chars + optional end).
- MySQL:5175 cutover schema lags (no `slots.coach_id`) — not part of this work; note for later migration.
- Weekday computed from `date` string (`Date.UTC` parse + `getUTCDay`) to avoid TZ drift.
