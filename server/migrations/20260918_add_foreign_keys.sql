-- ============================================================================
-- MM Padel Academy — Foreign Key Migration
-- Date: 2026-09-18
-- Database: mmacademy (Postgres)
--
-- Strategy: NOT VALID first (fast, no row lock) then VALIDATE (scans rows,
--           only SHARE UPDATE EXCLUSIVE lock — reads/writes continue).
--
-- Rollback: Run the DROP CONSTRAINT section at the bottom.
--
-- Pre-conditions: orphan cleanup must be complete (zero violations).
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART A: Schema fixes (safe to re-run with IF NOT EXISTS / IF EXISTS)
-- ============================================================================

-- A1. Add missing columns the app code writes but schema.sql omitted
ALTER TABLE slots ADD COLUMN IF NOT EXISTS coach_id INT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS import_batch INT;

-- A2. Fix type mismatch: app_sessions.user_id BIGINT → INT (match users.user_id)
ALTER TABLE app_sessions ALTER COLUMN user_id TYPE INT USING user_id::INT;

-- ============================================================================
-- PART B: Foreign Keys — added NOT VALID, then validated in Part C.
--         ON DELETE policy per confirmed relationship list.
-- ============================================================================

-- 1. app_sessions.user_id → users(user_id)  [SET NULL — session survives user delete]
ALTER TABLE app_sessions
  ADD CONSTRAINT fk_app_sessions_user
  FOREIGN KEY (user_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 2. bookings.user_id → users(user_id)  [SET NULL — booking history preserved]
ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_user
  FOREIGN KEY (user_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 3. slots.booking_id → bookings(id)  [CASCADE — code already manually deletes]
ALTER TABLE slots
  ADD CONSTRAINT fk_slots_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 4. slots.user_id → users(user_id)  [SET NULL — slot survives user delete]
ALTER TABLE slots
  ADD CONSTRAINT fk_slots_user
  FOREIGN KEY (user_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 5. slots.coach_id → users(user_id)  [SET NULL — optional assignment]
ALTER TABLE slots
  ADD CONSTRAINT fk_slots_coach
  FOREIGN KEY (coach_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 6. booking_requests.slot_id → slots(id)  [CASCADE — meaningless without slot]
ALTER TABLE booking_requests
  ADD CONSTRAINT fk_breq_slot
  FOREIGN KEY (slot_id) REFERENCES slots(id)
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 7. booking_requests.booking_id → bookings(id)  [CASCADE — matches slot cascade]
ALTER TABLE booking_requests
  ADD CONSTRAINT fk_breq_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 8. booking_requests.player_id → users(user_id)  [SET NULL — keep row + snapshot]
ALTER TABLE booking_requests
  ADD CONSTRAINT fk_breq_player
  FOREIGN KEY (player_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 9. booking_requests.decided_by → users(user_id)  [SET NULL — audit trail]
ALTER TABLE booking_requests
  ADD CONSTRAINT fk_breq_decided_by
  FOREIGN KEY (decided_by) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 10. payments.player_id → users(user_id)  [RESTRICT — money must not dangle]
ALTER TABLE payments
  ADD CONSTRAINT fk_payments_player
  FOREIGN KEY (player_id) REFERENCES users(user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;

-- 11. payments.booking_id → bookings(id)  [CASCADE — booking delete owns payment]
ALTER TABLE payments
  ADD CONSTRAINT fk_payments_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 12. payments.created_by → users(user_id)  [SET NULL — payment survives creator delete]
ALTER TABLE payments
  ADD CONSTRAINT fk_payments_created_by
  FOREIGN KEY (created_by) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 13. import_batches.by_user → users(user_id)  [SET NULL — batch survives admin delete]
ALTER TABLE import_batches
  ADD CONSTRAINT fk_import_batches_by_user
  FOREIGN KEY (by_user) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 14. results.submitted_by → users(user_id)  [SET NULL — result preserved]
ALTER TABLE results
  ADD CONSTRAINT fk_results_submitted_by
  FOREIGN KEY (submitted_by) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 15. results.import_batch → import_batches(id)  [SET NULL — result preserved]
ALTER TABLE results
  ADD CONSTRAINT fk_results_import_batch
  FOREIGN KEY (import_batch) REFERENCES import_batches(id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 16. court_defaults.coach_id → users(user_id)  [SET NULL — optional default]
ALTER TABLE court_defaults
  ADD CONSTRAINT fk_court_defaults_coach
  FOREIGN KEY (coach_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 17. comments.user_id → users(user_id)  [SET NULL — comment preserved via user_name]
ALTER TABLE comments
  ADD CONSTRAINT fk_comments_user
  FOREIGN KEY (user_id) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 18. notifications.user_id → users(user_id)  [CASCADE — inbox garbage after user gone]
ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_user
  FOREIGN KEY (user_id) REFERENCES users(user_id)
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

-- 19. conversion_requests.user_id → users(user_id)  [RESTRICT — blocks deleting debtor]
ALTER TABLE conversion_requests
  ADD CONSTRAINT fk_conv_requests_user
  FOREIGN KEY (user_id) REFERENCES users(user_id)
  ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;

-- 20. expenses.created_by → users(user_id)  [SET NULL — expense preserved]
ALTER TABLE expenses
  ADD CONSTRAINT fk_expenses_created_by
  FOREIGN KEY (created_by) REFERENCES users(user_id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 21. bookings.import_batch → import_batches(id)  [SET NULL — booking preserved]
ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_import_batch
  FOREIGN KEY (import_batch) REFERENCES import_batches(id)
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

COMMIT;

-- ============================================================================
-- PART C: Validate all constraints (non-blocking scan)
--         This can be run separately after Part B if preferred.
-- ============================================================================

ALTER TABLE app_sessions VALIDATE CONSTRAINT fk_app_sessions_user;
ALTER TABLE bookings VALIDATE CONSTRAINT fk_bookings_user;
ALTER TABLE bookings VALIDATE CONSTRAINT fk_bookings_import_batch;
ALTER TABLE slots VALIDATE CONSTRAINT fk_slots_booking;
ALTER TABLE slots VALIDATE CONSTRAINT fk_slots_user;
ALTER TABLE slots VALIDATE CONSTRAINT fk_slots_coach;
ALTER TABLE booking_requests VALIDATE CONSTRAINT fk_breq_slot;
ALTER TABLE booking_requests VALIDATE CONSTRAINT fk_breq_booking;
ALTER TABLE booking_requests VALIDATE CONSTRAINT fk_breq_player;
ALTER TABLE booking_requests VALIDATE CONSTRAINT fk_breq_decided_by;
ALTER TABLE payments VALIDATE CONSTRAINT fk_payments_player;
ALTER TABLE payments VALIDATE CONSTRAINT fk_payments_booking;
ALTER TABLE payments VALIDATE CONSTRAINT fk_payments_created_by;
ALTER TABLE import_batches VALIDATE CONSTRAINT fk_import_batches_by_user;
ALTER TABLE results VALIDATE CONSTRAINT fk_results_submitted_by;
ALTER TABLE results VALIDATE CONSTRAINT fk_results_import_batch;
ALTER TABLE court_defaults VALIDATE CONSTRAINT fk_court_defaults_coach;
ALTER TABLE comments VALIDATE CONSTRAINT fk_comments_user;
ALTER TABLE notifications VALIDATE CONSTRAINT fk_notifications_user;
ALTER TABLE conversion_requests VALIDATE CONSTRAINT fk_conv_requests_user;
ALTER TABLE expenses VALIDATE CONSTRAINT fk_expenses_created_by;

-- ============================================================================
-- PART D: Supporting indexes (FK columns need indexes for join performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS ix_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS ix_bookings_import_batch ON bookings(import_batch);
CREATE INDEX IF NOT EXISTS ix_slots_booking_id ON slots(booking_id);
CREATE INDEX IF NOT EXISTS ix_slots_user_id ON slots(user_id);
CREATE INDEX IF NOT EXISTS ix_slots_coach_id ON slots(coach_id);
CREATE INDEX IF NOT EXISTS ix_breq_slot_id ON booking_requests(slot_id);
CREATE INDEX IF NOT EXISTS ix_breq_booking_id ON booking_requests(booking_id);
CREATE INDEX IF NOT EXISTS ix_breq_player_id ON booking_requests(player_id);
CREATE INDEX IF NOT EXISTS ix_breq_decided_by ON booking_requests(decided_by);
CREATE INDEX IF NOT EXISTS ix_payments_player_id ON payments(player_id);
CREATE INDEX IF NOT EXISTS ix_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS ix_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS ix_import_batches_by_user ON import_batches(by_user);
CREATE INDEX IF NOT EXISTS ix_results_submitted_by ON results(submitted_by);
CREATE INDEX IF NOT EXISTS ix_results_import_batch ON results(import_batch);
CREATE INDEX IF NOT EXISTS ix_court_defaults_coach_id ON court_defaults(coach_id);
CREATE INDEX IF NOT EXISTS ix_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_conv_requests_user_id ON conversion_requests(user_id);
CREATE INDEX IF NOT EXISTS ix_expenses_created_by ON expenses(created_by);
CREATE INDEX IF NOT EXISTS ix_app_sessions_user_id ON app_sessions(user_id);

-- ============================================================================
-- PART E: Update schema.sql to match (DDL for fresh installs)
--         Applied separately — NOT in this transaction.
-- ============================================================================

-- ============================================================================
-- ROLLBACK — run this to remove all FKs if needed
-- ============================================================================
-- ALTER TABLE app_sessions DROP CONSTRAINT IF EXISTS fk_app_sessions_user;
-- ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_user;
-- ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_import_batch;
-- ALTER TABLE slots DROP CONSTRAINT IF EXISTS fk_slots_booking;
-- ALTER TABLE slots DROP CONSTRAINT IF EXISTS fk_slots_user;
-- ALTER TABLE slots DROP CONSTRAINT IF EXISTS fk_slots_coach;
-- ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS fk_breq_slot;
-- ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS fk_breq_booking;
-- ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS fk_breq_player;
-- ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS fk_breq_decided_by;
-- ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_player;
-- ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_booking;
-- ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_created_by;
-- ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS fk_import_batches_by_user;
-- ALTER TABLE results DROP CONSTRAINT IF EXISTS fk_results_submitted_by;
-- ALTER TABLE results DROP CONSTRAINT IF EXISTS fk_results_import_batch;
-- ALTER TABLE court_defaults DROP CONSTRAINT IF EXISTS fk_court_defaults_coach;
-- ALTER TABLE comments DROP CONSTRAINT IF EXISTS fk_comments_user;
-- ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_user;
-- ALTER TABLE conversion_requests DROP CONSTRAINT IF EXISTS fk_conv_requests_user;
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_created_by;
