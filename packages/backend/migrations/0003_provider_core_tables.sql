-- Required by the provider schema validator. Sessionless verification keeps
-- these tables empty; WorldQuest sessions continue to contain only token hashes.
CREATE TABLE auth_session (
  id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  ip_address TEXT, user_agent TEXT
);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE auth_account (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token TEXT, refresh_token TEXT, id_token TEXT,
  access_token_expires_at INTEGER, refresh_token_expires_at INTEGER,
  scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX auth_account_user ON auth_account(user_id);
