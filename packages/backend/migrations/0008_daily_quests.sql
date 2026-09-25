-- Server-composed daily quests (B05/S04). Forward-only after application.
-- Rollback: deploy the prior Worker; it ignores this table and column.
-- One row per account and local day. `quest` is the day's five tasks as composed,
-- at zero progress; progress is derived from `credited` (distinct quest facts
-- answered correctly that day) and `perform_done`, so a fact counts once and a
-- replayed lesson cannot advance anything. Clients never submit tasks or slots.
CREATE TABLE quest_days (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  day TEXT NOT NULL,
  quest TEXT NOT NULL CHECK (json_valid(quest)),
  credited TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(credited)),
  perform_done INTEGER NOT NULL DEFAULT 0 CHECK (perform_done IN (0, 1)),
  PRIMARY KEY (account_id, day)
);
-- The accuracy that scales tomorrow's fifth task. Last graded lesson, 0 before any.
ALTER TABLE accounts ADD COLUMN recent_accuracy REAL NOT NULL DEFAULT 0 CHECK (recent_accuracy BETWEEN 0 AND 1);
