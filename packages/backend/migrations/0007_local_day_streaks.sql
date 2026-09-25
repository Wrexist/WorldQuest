-- Local-day rules and the streak (S14, B04). Forward-only after application.
-- Rollback: deploy the prior Worker; these columns are ignored by it.
-- `day` keeps its name and now holds the learner's LOCAL date of the latest counted
-- lesson. It only ever moves forward, so a time-zone change cannot re-open a day
-- that has already paid its first-lesson bonus.
ALTER TABLE accounts ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'UTC' CHECK (length(time_zone) BETWEEN 1 AND 64);
ALTER TABLE accounts ADD COLUMN streak_current INTEGER NOT NULL DEFAULT 0 CHECK (streak_current >= 0);
ALTER TABLE accounts ADD COLUMN streak_longest INTEGER NOT NULL DEFAULT 0 CHECK (streak_longest >= 0);
ALTER TABLE accounts ADD COLUMN streak_last_day TEXT;
ALTER TABLE accounts ADD COLUMN freezes_held INTEGER NOT NULL DEFAULT 0 CHECK (freezes_held BETWEEN 0 AND 2);
