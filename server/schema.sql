-- ============================================================================
-- MM Padel Academy — PostgreSQL schema
-- Matches existing pg DDL + adds columns the app code needs.
-- Database: mmacademy (localhost:5432, user: postgres)
--
-- Column naming follows YOUR pg conventions:
--   users.user_id (not id), notifications.is_read (not read),
--   conversion_requests.from_type/to_type (not from/to),
--   audit_logs.rec_before/rec_after (not before/after)
--   created_by/updated_by on all tables
--   updated_at triggers auto-fires (app does NOT set updated_at)
-- ============================================================================

-- ----------------------------------------------------------------- users ---
-- NOTE: app_sessions is (re)created AFTER this cleanup block — do not create it above.
DROP TABLE IF EXISTS journey_items CASCADE;
DROP TABLE IF EXISTS journey_reports CASCADE;
DROP TABLE IF EXISTS assessment_templates CASCADE;
DROP TABLE IF EXISTS refresh_denylist CASCADE;
DROP TABLE IF EXISTS app_sessions CASCADE;
DROP TABLE IF EXISTS coach_payments CASCADE;
DROP TABLE IF EXISTS coach_daily_hours CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS court_defaults CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS booking_requests CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS conversion_requests CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS slots CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS results CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS session_transfers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------ app_sessions ---
-- Created here (after all cleanup DROPs above) so it is never dropped twice.
CREATE TABLE app_sessions (
    session_id BIGSERIAL PRIMARY KEY,
    refresh_token VARCHAR(510) NOT NULL,
    refresh_expires_at TIMESTAMP NULL DEFAULT NULL,
    user_id INT,
    loggedin_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    loggedout_at TIMESTAMP NULL DEFAULT NULL,
    last_req_at TIMESTAMP NULL DEFAULT NULL,
    is_active VARCHAR(2) NOT NULL DEFAULT '1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER SEQUENCE app_sessions_session_id_seq START WITH 1000;

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid(),
    user_code VARCHAR(50),
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    dob VARCHAR(50),
    password_hash VARCHAR(255),
    role VARCHAR(50),
    skill_level VARCHAR(50),
    member_since VARCHAR(10),
    force_password_change SMALLINT DEFAULT 0,
    member_code VARCHAR(50),
    is_claimed SMALLINT DEFAULT 0,
    private_balance INT DEFAULT 0,
    group_balance INT DEFAULT 0,
    balance_zero_since TIMESTAMP NULL,
    notes TEXT,
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    position VARCHAR(64),
    permissions JSONB,
    avatar VARCHAR(255),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_users_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_timestamp();

-- ---------------------------------------------------------------- players ---
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    dob VARCHAR(50),
    skill_level VARCHAR(50),
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER players_updated_at_trigger
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- -------------------------------------------------------- import_batches ---
CREATE TABLE import_batches (
    id SERIAL PRIMARY KEY,
    kind VARCHAR(50),
    filename VARCHAR(255),
    row_count INT,
    error_count INT,
    by_user INT,
    status VARCHAR(50),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER import_batches_updated_at_trigger
BEFORE UPDATE ON import_batches
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- --------------------------------------------------------------- results ---
CREATE TABLE results (
    id SERIAL PRIMARY KEY,
    date DATE,
    format VARCHAR(50),
    sideA JSONB,
    sideB JSONB,
    sideA_ids JSONB,
    sideB_ids JSONB,
    side_a TEXT,
    side_b TEXT,
    player_a VARCHAR(255),
    player_b VARCHAR(255),
    score_a INT,
    score_b INT,
    score_side_a VARCHAR(50),
    score_side_b VARCHAR(50),
    score_text VARCHAR(32),
    winner_side VARCHAR(10),
    winner VARCHAR(255),
    status VARCHAR(50),
    submitted_by INT,
    court INT,
    court_time VARCHAR(128),
    competition VARCHAR(100),
    notes TEXT,
    import_batch INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER results_updated_at_trigger
BEFORE UPDATE ON results
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- --------------------------------------------------------------- bookings --
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    ref VARCHAR(50),
    user_id INT,
    session_type VARCHAR(50),
    mode VARCHAR(50),
    sessions_json JSONB,
    sessions TEXT,
    total DECIMAL(10,2),
    status VARCHAR(50),
    player_name VARCHAR(255),
    private_remaining INT,
    group_remaining INT,
    deducted_from INT,
    deducted_count INT,
    paid SMALLINT DEFAULT 0,
    amount_paid DECIMAL(10,2),
    payment_method VARCHAR(32),
    payment_date DATE,
    import_batch INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER bookings_updated_at_trigger
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ------------------------------------------------------------------ slots ---
CREATE TABLE slots (
    id SERIAL PRIMARY KEY,
    date DATE,
    time VARCHAR(20),
    court INT,
    player_name_1 VARCHAR(255),
    player_name_2 VARCHAR(255),
    player_text VARCHAR(255),
    booking_id INT,
    user_id INT,
    session_type VARCHAR(50),
    status VARCHAR(50),
    balance_status VARCHAR(20),
    coach_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER slots_updated_at_trigger
BEFORE UPDATE ON slots
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ---------------------------------------------------------------- comments ---
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(255),
    text TEXT,
    rating INT,
    status VARCHAR(50),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER comments_updated_at_trigger
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ----------------------------------------------------------- notifications ---
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT,
    kind VARCHAR(50),
    title VARCHAR(255),
    body TEXT,
    link VARCHAR(255),
    is_read SMALLINT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER notifications_updated_at_trigger
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ---------------------------------------------------- conversion_requests ---
CREATE TABLE conversion_requests (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(255),
    from_type VARCHAR(50),
    to_type VARCHAR(50),
    count INT,
    status VARCHAR(50),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER conversion_requests_updated_at_trigger
BEFORE UPDATE ON conversion_requests
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ---------------------------------------------------------------- expenses ---
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    date DATE,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(10,2),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER expenses_updated_at_trigger
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ------------------------------------------------------- booking_requests ---
CREATE TABLE booking_requests (
    id SERIAL PRIMARY KEY,
    kind VARCHAR(50),
    slot_id INT,
    booking_id INT,
    player_id INT,
    player_name VARCHAR(255),
    payload JSONB,
    status VARCHAR(50),
    decided_by INT,
    decided_at TIMESTAMP,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER booking_requests_updated_at_trigger
BEFORE UPDATE ON booking_requests
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ---------------------------------------------------------------- payments ---
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    ref VARCHAR(50),
    date DATE,
    player_name VARCHAR(255),
    player_id INT,
    method VARCHAR(50),
    amount DECIMAL(10,2),
    private_sessions INT,
    group_sessions INT,
    notes TEXT,
    status VARCHAR(50),
    booking_id INT,
    -- settlement record (null on pre-settlement rows): what the payment
    -- offset from legacy debt and what it credited into the cycle
    settled_private INT,
    settled_group INT,
    credited_private INT,
    credited_group INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER payments_updated_at_trigger
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ------------------------------------------------------------ audit_logs ---
-- v2: business events + HTTP request envelope. Append-only, no FKs.
-- Actors may be system/null; targets are polymorphic.
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(36),
    timestamp TIMESTAMP,
    method VARCHAR(10),
    path VARCHAR(255),
    query_string VARCHAR(512),
    actor_id INT,
    actor_name VARCHAR(255),
    actor_role VARCHAR(50),
    ip VARCHAR(50),
    user_agent VARCHAR(512),
    action VARCHAR(255),
    target_type VARCHAR(100),
    target_id VARCHAR(100),
    status_code SMALLINT,
    duration_ms INT,
    request_body TEXT,
    rec_before JSONB,
    rec_after JSONB,
    error TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER audit_logs_updated_at_trigger
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- --------------------------------------------------------- court_defaults ---
CREATE TABLE court_defaults (
    id SERIAL PRIMARY KEY,
    court INT,
    coach_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER court_defaults_updated_at_trigger
BEFORE UPDATE ON court_defaults
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ------------------------------------------------------- roles ---------------
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    permissions JSONB DEFAULT '[]'::jsonb,
    is_system BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (name, display_name, level, permissions, is_system) VALUES
  ('superadmin', 'Super Admin', 4, '["dashboard","bookings","schedule","players","results","users","imports","comments","conversions"]'::jsonb, true),
  ('admin',      'Admin',       3, '["dashboard","bookings","schedule","players","results","imports","comments","conversions"]'::jsonb, true),
  ('coach',      'Coach',       2, '["schedule","players","results"]'::jsonb, true),
  ('player',     'Player',      1, '[]'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------- refresh_denylist ---
-- Persistent refresh-token revocation store (replaces the old in-memory Map).
CREATE TABLE refresh_denylist (
    jti VARCHAR(50) PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_denylist_expires ON refresh_denylist(expires_at);

-- ------------------------------------------------- coach_daily_hours ---
CREATE TABLE coach_daily_hours (
    id SERIAL PRIMARY KEY,
    coach_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hours NUMERIC NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    source VARCHAR(32) DEFAULT 'manual',
    created_by INT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    UNIQUE (coach_id, date)
);

-- ---------------------------------------------------- coach_payments ---
CREATE TABLE coach_payments (
    id SERIAL PRIMARY KEY,
    coach_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hours_deducted NUMERIC NOT NULL DEFAULT 0,
    amount NUMERIC DEFAULT 0,
    notes TEXT DEFAULT '',
    created_by INT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT now()
);

-- ------------------------------------------------ session_transfers ---
CREATE TABLE session_transfers (
    id SERIAL PRIMARY KEY,
    from_player_id INT NOT NULL REFERENCES users(user_id),
    to_player_id INT NOT NULL REFERENCES users(user_id),
    session_type VARCHAR(20) NOT NULL,
    count INT NOT NULL,
    from_balance_before INT,
    from_balance_after INT,
    to_balance_before INT,
    to_balance_after INT,
    notes TEXT,
    created_by INT REFERENCES users(user_id),
    updated_by INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------- balance CHECK constraints ---
-- Balances may go negative (admin "Deduct Anyway"). Do NOT add >=0 checks on users.
ALTER TABLE payments ADD CONSTRAINT chk_payment_amount CHECK (amount >= 0);

-- --------------------------------------------------- Foreign Keys ---
ALTER TABLE app_sessions ADD CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_import_batch FOREIGN KEY (import_batch) REFERENCES import_batches(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE slots ADD CONSTRAINT fk_slots_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE slots ADD CONSTRAINT fk_slots_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE slots ADD CONSTRAINT fk_slots_coach FOREIGN KEY (coach_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE booking_requests ADD CONSTRAINT fk_breq_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE booking_requests ADD CONSTRAINT fk_breq_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE booking_requests ADD CONSTRAINT fk_breq_player FOREIGN KEY (player_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE booking_requests ADD CONSTRAINT fk_breq_decided_by FOREIGN KEY (decided_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT fk_payments_player FOREIGN KEY (player_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE import_batches ADD CONSTRAINT fk_import_batches_by_user FOREIGN KEY (by_user) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE results ADD CONSTRAINT fk_results_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE results ADD CONSTRAINT fk_results_import_batch FOREIGN KEY (import_batch) REFERENCES import_batches(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE court_defaults ADD CONSTRAINT fk_court_defaults_coach FOREIGN KEY (coach_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE comments ADD CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE conversion_requests ADD CONSTRAINT fk_conv_requests_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------- FK Indexes ---
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

-- ---------------------------------------------------------- tournaments ---
-- One row per tournament; skill_level is ONE of the 8 values (multi-division
-- events = separate rows sharing a name prefix). bracket_size is the knockout
-- target: exactly 4, 8, 16, 32 or 64 (byes fill any unused slots).
CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    skill_level VARCHAR(16) NOT NULL,
    format VARCHAR(20) NOT NULL,                 -- 'knockout' | 'groups_knockout'
    status VARCHAR(30) NOT NULL DEFAULT 'draft', -- draft | registration_open | registration_closed | in_progress | completed | cancelled
    bracket_size INT NOT NULL,                   -- 4 | 8 | 16 | 32 | 64
    groups_count INT,                            -- format 'groups_knockout' only
    teams_per_group INT,                         -- format 'groups_knockout' only
    advance_per_group INT,                       -- format 'groups_knockout' only
    match_format VARCHAR(20) NOT NULL DEFAULT 'short', -- short | long | tiebreak
    entry_fee NUMERIC DEFAULT 0,
    count_to_records SMALLINT NOT NULL DEFAULT 0, -- 0/1 (app normalizes booleans to 1/0)
    registration_open_at TIMESTAMP,
    registration_close_at TIMESTAMP,
    notes TEXT,
    created_by INT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT chk_tournament_skill CHECK (skill_level IN ('Beginners','Low D','D','Low C','C','B','A','Open')),
    CONSTRAINT chk_tournament_format CHECK (format IN ('knockout','groups_knockout')),
    CONSTRAINT chk_tournament_status CHECK (status IN ('draft','registration_open','registration_closed','in_progress','completed','cancelled')),
    CONSTRAINT chk_tournament_bracket_size CHECK (bracket_size IN (4,8,16,32,64)),
    CONSTRAINT chk_tournament_match_format CHECK (match_format IN ('short','long','tiebreak')),
    CONSTRAINT chk_tournament_fee CHECK (entry_fee IS NULL OR entry_fee >= 0)
);

-- --------------------------------------------------- tournament_signups ---
-- Raw player entries during the signup window. player2_id NULL = solo signup
-- (admin pairs two solos at finalize). Locks to a pair after draw = rows are
-- promoted into tournament_teams and signups are no longer writable.
CREATE TABLE tournament_signups (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_name VARCHAR(160),                       -- optional; display name generated if null
    player1_id INT NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    player2_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | withdrawn
    payment_id INT,                               -- 0-session entry-fee payment (see payments.tournament_id)
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT chk_signup_status CHECK (status IN ('pending','approved','rejected','withdrawn')),
    CONSTRAINT chk_signup_distinct_players CHECK (player2_id IS NULL OR player2_id <> player1_id)
);

-- ---------------------------------------------------- tournament_teams ---
-- Finalized teams (from approved signups + admin pairing). Locked once draw
-- is finalized: no substitutions. seed = knockout seed (1 = strongest, gets
-- byes first); group_label = 'A','B',... for format 'groups_knockout'.
CREATE TABLE tournament_teams (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_name VARCHAR(160) NOT NULL,              -- auto "Name1 & Name2" if none given
    player1_id INT NOT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    player2_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    seed INT,
    group_label VARCHAR(4),
    source VARCHAR(20) NOT NULL DEFAULT 'signup', -- signup | admin | paired_solo
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active | withdrawn | eliminated
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT chk_team_status CHECK (status IN ('active','withdrawn','eliminated')),
    CONSTRAINT chk_team_source CHECK (source IN ('signup','admin','paired_solo')),
    CONSTRAINT chk_team_distinct_players CHECK (player2_id IS NULL OR player2_id <> player1_id)
);

-- -------------------------------------------------- tournament_matches ---
-- Every fixture for both formats. next_match_id points at the match whose
-- empty team slot receives this winner (NULL = final / last group match).
-- phase 'group': group_label set, round_no unused (pairing index = slot_index).
-- phase 'knockout': round_no 1..n, slot_index within round.
CREATE TABLE tournament_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    phase VARCHAR(20) NOT NULL,                   -- group | knockout
    group_label VARCHAR(4),
    round_no INT NOT NULL DEFAULT 1,
    slot_index INT NOT NULL DEFAULT 0,
    next_match_id INT REFERENCES tournament_matches(id) ON DELETE SET NULL,
    team_a_id INT REFERENCES tournament_teams(id) ON DELETE SET NULL,
    team_b_id INT REFERENCES tournament_teams(id) ON DELETE SET NULL,
    format VARCHAR(20),                           -- defaults to tournaments.match_format
    score_a INT,
    score_b INT,
    winner_team_id INT REFERENCES tournament_teams(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled | completed | bye | tbd
    court INT,
    scheduled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT chk_match_phase CHECK (phase IN ('group','knockout')),
    CONSTRAINT chk_match_status CHECK (status IN ('scheduled','completed','bye','tbd')),
    CONSTRAINT chk_match_scores CHECK (
        (score_a IS NULL AND score_b IS NULL)
        OR (score_a >= 0 AND score_b >= 0 AND score_a <> score_b)
    )
);

-- payments.tournament_id: entry fees only. Hard DB guarantee that a
-- tournament payment can NEVER carry sessions (0-session path — the
-- settle-then-credit creditCycle logic has nothing to act on).
ALTER TABLE payments ADD COLUMN tournament_id INT REFERENCES tournaments(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT chk_tournament_payment_sessions
    CHECK (tournament_id IS NULL OR (COALESCE(private_sessions,0) = 0 AND COALESCE(group_sessions,0) = 0));

-- ------------------------------------------------ tournament FK Indexes ---
CREATE INDEX IF NOT EXISTS ix_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS ix_tournaments_skill ON tournaments(skill_level);
CREATE INDEX IF NOT EXISTS ix_tsignups_tournament ON tournament_signups(tournament_id);
CREATE INDEX IF NOT EXISTS ix_tsignups_player1 ON tournament_signups(player1_id);
CREATE INDEX IF NOT EXISTS ix_tsignups_player2 ON tournament_signups(player2_id);
CREATE INDEX IF NOT EXISTS ix_tteams_tournament ON tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS ix_tteams_player1 ON tournament_teams(player1_id);
CREATE INDEX IF NOT EXISTS ix_tteams_player2 ON tournament_teams(player2_id);
CREATE INDEX IF NOT EXISTS ix_tmatches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS ix_tmatches_next ON tournament_matches(next_match_id);
CREATE INDEX IF NOT EXISTS ix_tmatches_team_a ON tournament_matches(team_a_id);
CREATE INDEX IF NOT EXISTS ix_tmatches_team_b ON tournament_matches(team_b_id);
CREATE INDEX IF NOT EXISTS ix_payments_tournament_id ON payments(tournament_id);

-- Tournament tables share the generic update_timestamp() trigger (created above)
CREATE TRIGGER tournaments_updated_at_trigger
    BEFORE UPDATE ON tournaments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tournament_matches_updated_at_trigger
    BEFORE UPDATE ON tournament_matches
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tournament_signups_updated_at_trigger
    BEFORE UPDATE ON tournament_signups
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tournament_teams_updated_at_trigger
    BEFORE UPDATE ON tournament_teams
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ============================================== coaching journey ========
-- Assessment skills (seeded once by ensureJourneyTables boot migration).
CREATE TABLE IF NOT EXISTS assessment_templates (
    id SERIAL PRIMARY KEY,
    pillar INT NOT NULL,
    section VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_tpl_pillar CHECK (pillar IN (1, 2, 3, 4)),
    CONSTRAINT chk_tpl_active CHECK (active IN (0, 1))
);

-- One journey report row = initial self-assessment OR one monthly report.
CREATE TABLE IF NOT EXISTS journey_reports (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL DEFAULT 'monthly',
    report_number INT NOT NULL DEFAULT 0,
    maximum_reports INT NOT NULL DEFAULT 10,
    report_month VARCHAR(7),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    overall_score NUMERIC(4, 1),
    general_user_comment TEXT,
    general_admin_comment TEXT,
    created_by INT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    CONSTRAINT chk_journey_kind CHECK (kind IN ('initial', 'monthly')),
    CONSTRAINT chk_journey_status CHECK (status IN ('draft', 'submitted', 'in-review', 'returned', 'reviewed', 'published')),
    CONSTRAINT chk_journey_reports_max CHECK (maximum_reports >= 1),
    CONSTRAINT uq_journey_report UNIQUE (user_id, kind, report_number)
);

-- One row per skill per report (template-cloned).
CREATE TABLE IF NOT EXISTS journey_items (
    id SERIAL PRIMARY KEY,
    report_id INT NOT NULL REFERENCES journey_reports(id) ON DELETE CASCADE,
    template_id INT NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
    user_score INT,
    user_comment TEXT,
    admin_score INT,
    admin_comment TEXT,
    final_score INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_item_user_score CHECK (user_score IS NULL OR (user_score >= 1 AND user_score <= 10)),
    CONSTRAINT chk_item_admin_score CHECK (admin_score IS NULL OR (admin_score >= 1 AND admin_score <= 10)),
    CONSTRAINT chk_item_final_score CHECK (final_score IS NULL OR (final_score >= 1 AND final_score <= 10)),
    CONSTRAINT uq_journey_item UNIQUE (report_id, template_id)
);

-- ------------------------------------------------ journey FK Indexes ---
CREATE INDEX IF NOT EXISTS ix_journey_reports_user ON journey_reports(user_id);
CREATE INDEX IF NOT EXISTS ix_journey_reports_status ON journey_reports(status);
CREATE INDEX IF NOT EXISTS ix_journey_items_report ON journey_items(report_id);
CREATE INDEX IF NOT EXISTS ix_journey_items_template ON journey_items(template_id);
CREATE INDEX IF NOT EXISTS ix_assessment_templates_pillar ON assessment_templates(pillar, sort_order);

-- Journey tables share the generic update_timestamp() trigger
CREATE TRIGGER journey_reports_updated_at_trigger
    BEFORE UPDATE ON journey_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER journey_items_updated_at_trigger
    BEFORE UPDATE ON journey_items
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER assessment_templates_updated_at_trigger
    BEFORE UPDATE ON assessment_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();