-- Keep immutable presentation and request identity for offline/restart replay.
ALTER TABLE tickets ADD COLUMN request_json TEXT;
ALTER TABLE tickets ADD COLUMN questions_json TEXT;
ALTER TABLE tickets ADD COLUMN issued_at INTEGER;
CREATE INDEX reviews_revision ON reviews(account_id, revision, slot);
