-- Historical awards have no trustworthy server timestamp and are not backdated.
ALTER TABLE ledger ADD COLUMN earned_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX ledger_week ON ledger(account_id, earned_at);
CREATE TABLE league_preferences (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  opted_out INTEGER NOT NULL DEFAULT 1 CHECK(opted_out IN (0,1))
);
CREATE TABLE league_members (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  week INTEGER NOT NULL, rank INTEGER NOT NULL CHECK(rank BETWEEN 0 AND 20),
  band INTEGER NOT NULL, slot INTEGER NOT NULL, handle TEXT NOT NULL,
  PRIMARY KEY(account_id, week), UNIQUE(week, rank, band, slot), UNIQUE(week, handle)
);
CREATE INDEX league_cohort ON league_members(week, rank, band, slot);
CREATE TABLE league_results (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  week INTEGER NOT NULL, next_rank INTEGER NOT NULL,
  coins INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
  PRIMARY KEY(account_id, week)
);
CREATE TABLE league_closures (
  week INTEGER NOT NULL, rank INTEGER NOT NULL, band INTEGER NOT NULL, cohort INTEGER NOT NULL,
  PRIMARY KEY(week, rank, band, cohort)
);
