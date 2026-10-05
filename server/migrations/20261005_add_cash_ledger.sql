-- Cash ledger (Best-Package Rule): signed cash gap for package shortfalls
-- and prepaid cash. Applied automatically at server startup (index.js) —
-- this file documents the change for manual/dbctl application.
--
-- users.cash_balance: negative = shortfall the player owes next month
-- (package value beyond what was paid), positive = prepaid carried forward.
-- payments.cash_gap:  the signed delta this payment applied to
-- users.cash_balance (after = before + gap), so reversal/delete restore exactly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_gap NUMERIC(12,2) NOT NULL DEFAULT 0;
