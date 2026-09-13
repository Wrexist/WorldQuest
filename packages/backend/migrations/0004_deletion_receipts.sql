-- A short-lived acknowledgment survives erasure without retaining an owner/email.
CREATE TABLE deletion_receipts (
  token_hash TEXT PRIMARY KEY,
  challenge_id TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX deletion_receipts_expiry ON deletion_receipts(expires_at);
