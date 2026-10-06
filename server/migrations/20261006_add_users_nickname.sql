-- Nickname + mobile-number login. Applied automatically at server startup
-- (index.js) — this file documents the change for manual/dbctl application.
--
-- users.nickname: optional display alias shown instead of name when set.
--   Unique among non-null values, case-insensitive (blank stored as NULL).
-- users.phone:    indexed for login lookup; matched after normalization
--   (digits only, optional leading +), so "010 1234-5678" == "+20..." is
--   handled by the app layer (routes/auth.js normalizePhone).

ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(30);
UPDATE users SET nickname = NULLIF(TRIM(nickname), '') WHERE nickname IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_nickname ON users (LOWER(nickname)) WHERE nickname IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_phone ON users (phone) WHERE phone IS NOT NULL;
