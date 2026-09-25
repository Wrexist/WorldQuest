-- In-app fact reports (G08; content-pipeline §6). Forward-only after application.
-- Rollback: deploy the prior Worker; it ignores this table.
-- A reason from a fixed list and the fact it is about. No free text, so nothing a child
-- types is stored. Erased with the account; triaged by fact.
CREATE TABLE reports (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  report_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('wrong', 'unclear', 'outdated', 'offensive', 'other')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, report_id)
);
CREATE INDEX reports_by_fact ON reports(fact_id, created_at);
