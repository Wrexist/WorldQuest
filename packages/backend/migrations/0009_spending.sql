-- Coin spending: freezes, streak repair, lesson continues and cosmetics (S06, A04).
-- Forward-only after application. Rollback: deploy the prior Worker; it ignores these.
-- Every spend is keyed by a client request id and recorded once in `spends`; its coins
-- also land in `ledger` as a negative row ('spend:' || request id), so the ledger still
-- sums to `accounts.coins`. All writes share the account revision guard with lessons.
ALTER TABLE accounts ADD COLUMN streak_broken_on TEXT;
ALTER TABLE accounts ADD COLUMN streak_restorable INTEGER NOT NULL DEFAULT 0 CHECK (streak_restorable >= 0);
ALTER TABLE accounts ADD COLUMN last_repair_at INTEGER;
CREATE TABLE spends (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('freeze', 'repair', 'continue', 'item')),
  subject TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL CHECK (json_valid(result)),
  PRIMARY KEY (account_id, request_id)
);
CREATE TABLE inventory (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  item_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (account_id, item_id)
);
