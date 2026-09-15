-- Development foundation. Forward-only after application.
-- Rollback: deploy the prior Worker; restore a database export into a NEW D1 DB.
-- D1 is private to the Worker binding; it does not implement PostgreSQL RLS.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  audience TEXT NOT NULL DEFAULT 'unknown' CHECK (audience IN ('unknown','protected','eligible')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  day TEXT NOT NULL DEFAULT '',
  daily_xp INTEGER NOT NULL DEFAULT 0,
  lessons_today INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE tickets (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_id TEXT NOT NULL,
  slots TEXT NOT NULL CHECK (json_valid(slots)),
  PRIMARY KEY (account_id, lesson_id)
);
CREATE TABLE receipts (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  result TEXT NOT NULL CHECK (json_valid(result)),
  PRIMARY KEY (account_id, lesson_id)
);
CREATE TABLE memories (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  fact_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (json_valid(state)),
  revision INTEGER NOT NULL,
  PRIMARY KEY (account_id, fact_id)
);
CREATE TABLE reviews (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  fact_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, lesson_id, slot)
);
CREATE TABLE ledger (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_id TEXT NOT NULL,
  xp INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  PRIMARY KEY (account_id, lesson_id)
);
-- A CHECK failure aborts the whole D1 batch. Successful batches leave no guard row.
CREATE TABLE transaction_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CONSTRAINT wq_revision_guard CHECK (valid = 1)
);
