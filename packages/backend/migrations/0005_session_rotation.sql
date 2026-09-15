-- Keep only active bearers in sessions. Retired hashes authorize an exact
-- renewal acknowledgement or family logout, never account/learning access.
ALTER TABLE sessions ADD COLUMN family_id TEXT;
UPDATE sessions SET family_id = token_hash;
CREATE INDEX sessions_family ON sessions(family_id);
CREATE TABLE session_rotations (
  token_hash TEXT PRIMARY KEY,
  next_hash TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  family_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX session_rotations_family ON session_rotations(family_id);
CREATE INDEX session_rotations_account ON session_rotations(account_id);
CREATE INDEX session_rotations_expiry ON session_rotations(expires_at);
