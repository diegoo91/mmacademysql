-- ============================================================================
-- MM Padel Academy — Users per-user module overrides
-- Date: 2026-09-30
-- Database: mmacademy (Postgres)
--
-- Purpose: the Users modal "Module Access" writes users.permissions
--          (per-user module overrides, unioned with the role row by
--          getUserPermissions). schema.sql created users without this
--          column, so every save containing permissions failed with
--          "column users.permissions does not exist".
--
-- Safe to re-run (IF NOT EXISTS). No rollback needed: dropping the column
-- would lose overrides; keep it.
-- ============================================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;

COMMIT;
