-- Utility items a learner owns, and the receipts that prove what they paid.
--
-- Cosmetics are not here: they are a different question (owned/equipped, from a catalogue)
-- and the shop engine answers it. This table is the consumable side — a streak freeze is
-- bought once and spent once, so the count is what the streak rules read when a day is at
-- risk.
--
-- Forward-only after application.
-- Rollback: deploy the prior Worker; restore a database export into a NEW D1 DB.
CREATE TABLE inventory (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  item_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, item_id)
);
-- Purchase idempotency, the same shape as lesson receipts and for the same reason: the
-- client retries on a lost response, and a retried purchase must return what it already
-- bought rather than charge again. The second line of defence is `accounts.coins`, which
-- cannot go below zero.
CREATE TABLE inventory_receipts (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  purchase_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  coins_spent INTEGER NOT NULL CHECK (coins_spent >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, purchase_id)
);
