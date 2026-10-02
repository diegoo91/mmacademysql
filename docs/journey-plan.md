# Coaching Journey & Progress Reports — Build Plan

**Date:** 2026-09-30 · **Mode:** build · **Source of truth:** local repo (`D:\SQL\mm-padel-academy mysql`)

## 0. Ground rules (from your instructions)
- No rebuilds, no duplicate dashboards, no design-system replacement.
- `My Journey` lives inside the existing user dashboard (`src/pages/Profile.jsx`); admin tooling lives as a `Journey` tab inside `src/pages/admin/UserDetail.jsx`.
- Reuse: Tailwind tokens + `glass-panel`/`glass-card`, `useFeedback` toasts, modal pattern (`role=dialog` + `useEscapeKey`), `formatDateMed`, `api` client, audit + notify helpers, e2e suite.
- Localhost only. No commits without explicit approval.

## 1. Locked decisions (you confirmed)
| # | Decision |
|---|---|
| 1 | Report authorship: **admins + coaches** via the existing `players` permission (coaches already hold it; zero RBAC changes) |
| 2 | Completed session = **`player_confirmed` slot** (matches existing `used_sessions` semantics) |
| 3 | **Assessment-first gate**: monthly reports blocked (400) until the initial assessment is published |

## 2. Database (new tables only — users/slots/bookings untouched)
- `assessment_templates` (id, pillar, section, name, description, sort_order, active) — boot-seeded once with the **33 skills**: P1 Shots 19 (Starts & Baseline 4, Net Control 4, Overheads 4, Wall & Finesse 5, Technical Metrics 2) · P2 Fitness 4 · P3 Movement 5 · P4 Game Intelligence 5.
- `journey_reports` (id, user_id, kind `initial|monthly`, report_number, maximum_reports default **10**, report_month, status, general_user_comment, general_admin_comment, created_by/updated_by, created_at/updated_at/published_at; `UNIQUE(user_id, kind, report_number)`).
- `journey_items` (id, report_id, template_id, user_score, user_comment, admin_score, admin_comment, final_score, updated_at).
- Wiring: `schema.sql` DDL + idempotent `ensureJourneyTables()` in `server/src/index.js` (tournaments precedent) + `db.js` `TABLES` + `database.js` `DEFAULTS` (JSON fallback) + router mount with standard limiters.
- Initial assessment = a `journey_reports` row with `kind='initial'`, `report_number=0`; monthly reports numbered 1..N.

## 3. API (`server/src/routes/journey.js`, comments/tournaments conventions)
- `GET /journey/templates` · `GET /journey` (self) · `GET /journey/:userId` (`players` perm).
- Assessment: create draft → edit (draft or returned only) → submit; admin: start-review → return ↔ → mark-reviewed → publish.
- Monthly: `POST /journey/reports {userId, reportMonth}` (assessment-first gate; template-cloned items; `report_number`=max+1 in `db.transaction`); edit; transitions; **edit-published allowed (audit-logged, `published_at` kept)**.
- Status values: assessment `draft|submitted|in-review|returned|reviewed|published`; monthly `draft|in-review|returned|reviewed|published`. Only `published` visible to players (server-filtered).
- Validation: integer 1–10; drafts partial OK; submit/review/publish require all 33; `finalScore` required at publish (+ "confirm all from admin scores"); one active report per user.
- Math (computed on read, never stored): overall = avg(final) 1 decimal; pillar avgs same; progress = `round(published/max*100)`.
- Side effects: `notifyUser` on submit/return/publish; `auditCreate/auditUpdate` per transition; standard `{error}` + status codes.

## 4. Frontend (existing components/tokens only)
- New shared `src/components/Journey.jsx`: `JourneySummary` (exact formats — `Sessions completed: 8`, `Report 3 of 10`, `Overall score: 7.2/10`, `Journey progress: 30%`, score and count shown separately + pillar averages), `AssessmentForm` (1–10 inputs, optional comments, Save draft/Submit), `ReportDetail` (`Report N of 10`, month, status pill, per-skill `7/10` grouped by pillar/section, user/admin/general comments, created/updated/published dates), `JourneyTimeline`, empty state (`Start Your Journey` button + explanation + sessions count).
- `Profile.jsx`: insert section between SessionHistoryPanel and Session Credits; counts from existing `mySlots`.
- `UserDetail.jsx`: `journey` tab in the existing pill `tablist` (same gate pattern as Payments); full admin workflow wired to the endpoints above.

## 5. Verification & docs
1. `npx oxlint` (0 errors) → 2. `npm run build` → 3. `node --check` server files → 4. new journey block in `server/e2e-all.cjs` (lifecycle, validation rejects, visibility, math) with full suite green on localhost → 5. new row in `task_complete.md` + session record in `TASK_PROGRESS.md`.

## 6. Status
- Plan approved, build order locked: DB → API → UI → verify → docs.
