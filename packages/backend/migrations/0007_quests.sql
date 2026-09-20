-- Daily quests are composed on the device and pinned here.
--
-- The server cannot compose one: `generateDailyQuest` reads the learner's own memory to
-- decide what is due, so only the device knows what a real quest for today was. What the
-- server can do is refuse to store a shape that is not a quest, and refuse to pay for one
-- until the account's own rows say the work happened. See `src/quests.ts`.
--
-- Forward-only after application.
-- Rollback: deploy the prior Worker; restore a database export into a NEW D1 DB.
CREATE TABLE quests (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  day TEXT NOT NULL,
  -- The canonical quest exactly as validated, so a second device and a reinstall see the
  -- same five tasks rather than a fresh set to farm.
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, day)
);
-- One row per slot ever paid, plus one for the all-five bonus under slot '*'.
--
-- The primary key IS the payout uniqueness. A replayed submission, a retry after a lost
-- response and two devices submitting at once all attempt the same three columns and are
-- ignored, so no arrangement of timing can pay a slot twice.
CREATE TABLE quest_claims (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  day TEXT NOT NULL,
  slot TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK (xp >= 0),
  batch_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, day, slot)
);
CREATE INDEX quest_claims_batch ON quest_claims(batch_id);
