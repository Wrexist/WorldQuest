CREATE TABLE friend_challenges (
  id TEXT PRIMARY KEY, invite_hash TEXT NOT NULL UNIQUE,
  creator TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  guest TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK(locale IN ('en','sv')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  questions TEXT NOT NULL, answers TEXT NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
  CHECK(guest IS NULL OR guest<>creator)
);
CREATE INDEX challenge_creator ON friend_challenges(creator,expires_at);
CREATE INDEX challenge_guest ON friend_challenges(guest,expires_at);
CREATE TABLE challenge_plays (
  challenge_id TEXT NOT NULL REFERENCES friend_challenges(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL, finished_at INTEGER, score INTEGER, payload TEXT,
  PRIMARY KEY(challenge_id,account_id)
);
CREATE TABLE challenge_hides (
  challenge_id TEXT NOT NULL REFERENCES friend_challenges(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY(challenge_id,account_id)
);
CREATE TABLE social_blocks (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY(account_id,target_id), CHECK(account_id<>target_id)
);
CREATE TABLE social_reports (
  challenge_id TEXT NOT NULL REFERENCES friend_challenges(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(reason IN ('unwanted','cheating','other')),
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','resolved')),
  PRIMARY KEY(challenge_id,account_id)
);
CREATE INDEX social_report_queue ON social_reports(status,created_at);
CREATE TABLE social_restrictions (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  restricted_until INTEGER NOT NULL
);
