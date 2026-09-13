-- Identity-provider records do not own progress. Only verified links map to owners.
CREATE TABLE auth_user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE auth_verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL UNIQUE, value TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX auth_verification_expiry ON auth_verification(expires_at);
CREATE TABLE identities (
  subject_id TEXT PRIMARY KEY REFERENCES auth_user(id),
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id), linked_at INTEGER NOT NULL
);
CREATE TABLE email_challenges (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  session_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('link','login','delete')),
  locale TEXT NOT NULL CHECK (locale IN ('en','sv')),
  state TEXT NOT NULL CHECK (state IN ('sending','pending','verifying','verified','consumed')),
  attempts INTEGER NOT NULL DEFAULT 0, sends INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sent_at INTEGER NOT NULL
);
CREATE INDEX email_challenges_account ON email_challenges(account_id);
CREATE INDEX email_challenges_expiry ON email_challenges(expires_at);
CREATE TABLE auth_budgets (
  bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX auth_budgets_expiry ON auth_budgets(expires_at);
