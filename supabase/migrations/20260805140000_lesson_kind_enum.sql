-- `lessons.kind` was `text not null` with no constraint, and nothing validated it.
--
-- `parseBody` in `submit-lesson` declares it as a union of five strings and never checks
-- it — the type is a claim about the wire, not a guard on it. So an arbitrary string
-- reached two places:
--
--   · `lessons.kind`, which `pnpm content:stats` and every future analytics query group
--     by;
--   · `xp_ledger.reason`, as `'lesson:' || kind`. The ledger's `reason` is what somebody
--     reads when a user asks where their XP came from, and a field a client can write
--     free text into is a field that cannot answer that question.
--
-- An enum rather than a check constraint: the five values are a closed set the engine
-- already models, and the generated `database.types.ts` turns it into a union the client
-- is compiled against — so the next endpoint gets the guard for free instead of needing
-- to remember it.

create type lesson_kind as enum ('lesson', 'quest', 'review', 'challenge', 'event');

-- Every existing row was written by `submit-lesson` from a client that sent one of the
-- five, so this cast cannot fail on real data. It is written as an explicit `using`
-- rather than left implicit because a silent cast failure mid-migration is the kind of
-- thing that only shows up against production volume.
alter table lessons
  alter column kind type lesson_kind using kind::lesson_kind;
