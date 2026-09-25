-- Server-paid achievements (B04). Forward-only after application.
-- Rollback: deploy the prior Worker; it ignores this column.
-- Per-account progress against the shipped catalogue, keyed by achievement id, in the
-- engines' AchievementProgress shape. Written in the lesson's own guarded batch, so a
-- tier and its reward land together or not at all.
ALTER TABLE accounts ADD COLUMN achievements TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(achievements));
