# Data model

Postgres via Supabase. Summary in
[`../../PROJECT.md §9`](../../PROJECT.md#9-database-schema); this is the reference.

## Principles

1. **Content is not in the database.** Packs ship with the app and via CDN. The DB
   stores content *IDs* and *user state*. This keeps the DB small, makes content
   hotfixes instant, and means offline works.
2. **Ledgers, not balances.** XP and coins are append-only. A balance is a sum you can
   audit, replay, and correct. A mutable balance column is a bug waiting to be
   irreversible.
3. **`review_log` is the source of truth.** `user_facts` is a derived cache that can be
   rebuilt from it. Progress survives algorithm changes.
4. **RLS on every table, default deny.** A policy per role.
5. **No client writes to reward tables.** Edge functions only.
6. `timestamptz` everywhere, always UTC. Local-day logic uses the stored IANA timezone.
7. Migrations are **forward-only**. Never edit a landed migration.

---

## Identity

```sql
create type user_role as enum
  ('guest','user','premium','teacher','parent','admin','moderator','support');

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  handle        citext unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name  text,
  avatar_id     text not null default 'avatar.default',
  locale        text not null default 'en',
  timezone      text not null default 'UTC',      -- IANA, e.g. 'Europe/Stockholm'
  birth_year    smallint,                          -- year only: age gating with minimal PII
  role          user_role not null default 'user',
  is_child      boolean not null default false,    -- derived at creation, then immutable
  parent_id     uuid references profiles(id),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz                        -- soft delete, 30-day grace
);

create table entitlements (
  user_id     uuid references profiles(id) on delete cascade,
  product     text not null,                       -- premium | family | classroom
  source      text not null,                       -- revenuecat | grant | trial
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  rc_id       text,
  primary key (user_id, product)
);
```

`birth_year` (not a full date of birth) is deliberate: enough to gate, minimal PII.
`is_child` is computed once at signup and never recomputed from a client-supplied
value — a user cannot age out of protection by editing a field.

---

## The learning engine

```sql
create type mastery_level as enum
  ('unseen','learning','familiar','proficient','mastered','burnished');

-- FSRS state. Derived from review_log; rebuildable.
create table user_facts (
  user_id        uuid not null references profiles(id) on delete cascade,
  fact_id        text not null,                    -- 'geo.JP.capital'
  stability      real not null,
  difficulty     real not null,
  reps           int  not null default 0,
  lapses         int  not null default 0,
  last_review_at timestamptz,
  due_at         timestamptz not null,
  mastery        mastery_level not null default 'learning',
  avg_ms         int,
  suspended      boolean not null default false,   -- leeches
  updated_at     timestamptz not null default now(),
  primary key (user_id, fact_id)
);

-- APPEND-ONLY. The source of truth.
create table review_log (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  fact_id      text not null,
  template_id  text not null,
  rating       smallint not null check (rating between 1 and 4),
  was_correct  boolean not null,
  elapsed_ms   int not null,
  lesson_id    uuid,
  created_at   timestamptz not null default now()
);

create table lessons (
  id             uuid primary key,                 -- client UUID = idempotency key
  user_id        uuid not null references profiles(id) on delete cascade,
  kind           text not null,                    -- lesson|quest|review|challenge|event
  topic_id       text,
  items          smallint not null,
  correct        smallint not null,
  hearts_lost    smallint not null default 0,
  xp_awarded     int not null default 0,
  coins_awarded  int not null default 0,
  started_at     timestamptz not null,
  completed_at   timestamptz,
  client_version text
);
```

`lessons.id` being a **client-generated UUID** is what makes offline replay safe: a
duplicate submit is a primary-key conflict, which the edge function treats as a no-op
and returns the original result.

---

## Economy

```sql
create table xp_ledger (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  amount     int  not null,                        -- always > 0; XP never decreases
  reason     text not null,                        -- 'correct_answer','daily_quest',…
  ref_id     text,
  created_at timestamptz not null default now()
);

create table coin_ledger (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  amount     int  not null,                        -- signed: negative = spend
  reason     text not null,
  ref_id     text,
  created_at timestamptz not null default now()
);

-- Cached aggregates. Rebuildable from the ledgers at any time.
create table wallets (
  user_id             uuid primary key references profiles(id) on delete cascade,
  xp_total            bigint not null default 0,
  coins               int    not null default 0,
  gems                int    not null default 0,
  hearts              smallint not null default 5,
  hearts_updated_at   timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table inventory (
  user_id     uuid references profiles(id) on delete cascade,
  item_id     text not null,                       -- 'avatar.explorer-hat'
  acquired_at timestamptz not null default now(),
  source      text not null,                       -- purchase|reward|event|gift
  primary key (user_id, item_id)
);
```

**Hearts are computed, not stored ticking.** `hearts_updated_at` plus the regen rate
gives the current value on read — no cron job, and clock manipulation gains nothing
because the server owns both timestamps.

---

## Progression

```sql
create table streaks (
  user_id                uuid primary key references profiles(id) on delete cascade,
  current                int not null default 0,
  longest                int not null default 0,
  last_active_date       date,                     -- in the user's timezone
  freezes_held           smallint not null default 0,
  freeze_used_on         date,
  repair_available_until timestamptz,
  last_repair_at         timestamptz
);

create table user_achievements (
  user_id        uuid references profiles(id) on delete cascade,
  achievement_id text not null,
  progress       int  not null default 0,
  tier           text,
  unlocked_at    timestamptz,
  primary key (user_id, achievement_id)
);

create table user_collections (
  user_id       uuid references profiles(id) on delete cascade,
  collection_id text not null,
  owned_count   int not null default 0,
  total_count   int not null,
  completed_at  timestamptz,
  primary key (user_id, collection_id)
);

-- Denormalised for the Explore screen. Recomputed on lesson submit.
create table region_mastery (
  user_id        uuid references profiles(id) on delete cascade,
  region_id      text not null,                    -- 'EU' | 'AS' | 'JP'
  region_kind    text not null,                    -- continent|subregion|country
  mastered_facts int not null default 0,
  total_facts    int not null,
  primary key (user_id, region_id)
);
```

---

## Social & live-ops *(v2.0)*

```sql
create table leagues (
  id         uuid primary key,
  tier       text not null,                        -- 'gold_i'
  band       smallint not null,                    -- activity band
  season_id  text not null,
  week_start date not null,
  created_at timestamptz not null default now()
);

create table league_members (
  league_id  uuid references leagues(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  xp_week    int not null default 0,
  final_rank smallint,
  outcome    text,                                 -- promoted|held|demoted
  primary key (league_id, user_id)
);

create table friendships (
  user_id    uuid references profiles(id) on delete cascade,
  friend_id  uuid references profiles(id) on delete cascade,
  status     text not null,                        -- pending|accepted|blocked
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table challenges (
  id           uuid primary key,
  from_user    uuid not null references profiles(id) on delete cascade,
  to_user      uuid not null references profiles(id) on delete cascade,
  seed         text not null,                      -- same questions for both
  topic_id     text,
  from_score   int, to_score int,
  from_done_at timestamptz, to_done_at timestamptz,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create table user_quests (
  user_id      uuid references profiles(id) on delete cascade,
  quest_id     text not null,
  quest_date   date not null,
  progress     jsonb not null default '{}',
  completed_at timestamptz,
  primary key (user_id, quest_id, quest_date)
);

create table liveops_events (
  id         uuid primary key,
  slug       text unique not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  enabled    boolean not null default true,        -- the kill switch
  config     jsonb not null
);
```

---

## Orgs — classroom & family *(v2.0)*

```sql
create table orgs (
  id         uuid primary key,
  kind       text not null,                        -- classroom|family
  name       text not null,
  owner_id   uuid not null references profiles(id),
  join_code  text unique not null,                 -- no student emails, ever
  settings   jsonb not null default '{}',          -- social_enabled: false, …
  created_at timestamptz not null default now()
);

create table org_members (
  org_id      uuid references orgs(id) on delete cascade,
  user_id     uuid references profiles(id) on delete cascade,
  member_role text not null,                       -- owner|teacher|student|parent|child
  joined_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table assignments (
  id           uuid primary key,
  org_id       uuid references orgs(id) on delete cascade,
  topic_id     text not null,
  target_mastery mastery_level not null default 'proficient',
  due_at       timestamptz,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
```

---

## Moderation & compliance

```sql
create table content_reports (
  id          bigserial primary key,
  reporter_id uuid references profiles(id),
  fact_id     text,
  target_user uuid references profiles(id),
  kind        text not null,                       -- incorrect_fact|handle|behaviour
  note        text,
  status      text not null default 'open',
  resolved_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table consent_records (
  user_id     uuid references profiles(id) on delete cascade,
  kind        text not null,                       -- parental|analytics|marketing
  granted     boolean not null,
  method      text,
  granted_at  timestamptz not null default now(),
  primary key (user_id, kind)
);

create table audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  action     text not null,
  target     text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
```

---

## Indexes

```sql
-- THE hot path: "what should this user see next?"  Target p95 < 50 ms.
create index user_facts_due_idx
  on user_facts (user_id, due_at)
  where suspended = false and mastery <> 'burnished';

create index user_facts_mastery_idx on user_facts (user_id, mastery);
create index review_log_user_time_idx on review_log (user_id, created_at desc);
create index review_log_fact_idx      on review_log (user_id, fact_id, created_at desc);
create index xp_ledger_user_time_idx  on xp_ledger  (user_id, created_at desc);
create index coin_ledger_user_time_idx on coin_ledger (user_id, created_at desc);
create index lessons_user_time_idx    on lessons (user_id, completed_at desc);
create index league_members_rank_idx  on league_members (league_id, xp_week desc);
create index user_quests_date_idx     on user_quests (user_id, quest_date desc);
create index liveops_active_idx       on liveops_events (starts_at, ends_at)
  where enabled = true;
```

The partial index on `user_facts` is the single most important index in the schema —
it backs every lesson start.

---

## Row-level security

Default deny on every table. Representative policies:

```sql
alter table profiles      enable row level security;
alter table user_facts    enable row level security;
alter table xp_ledger     enable row level security;
alter table review_log    enable row level security;

-- Read your own row.
create policy own_profile_select on profiles
  for select using (auth.uid() = id and deleted_at is null);

-- Update a safe subset of your own profile. (Column control is enforced in the
-- edge function + a trigger; RLS alone cannot restrict columns.)
create policy own_profile_update on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Learning state: read-only for the owner. Writes happen in edge functions
-- (service role), never from a client.
create policy own_facts_select on user_facts
  for select using (auth.uid() = user_id);

create policy own_xp_select on xp_ledger
  for select using (auth.uid() = user_id);

create policy own_reviews_select on review_log
  for select using (auth.uid() = user_id);

-- Teachers read members of orgs they own; students never read each other.
create policy teacher_reads_members on org_members
  for select using (
    exists (select 1 from orgs o
            where o.id = org_members.org_id and o.owner_id = auth.uid())
  );

-- A parent reads a linked child's aggregate progress only (a view, not raw reviews).
create policy parent_reads_child_progress on region_mastery
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles c
               where c.id = region_mastery.user_id and c.parent_id = auth.uid())
  );
```

**No `insert`/`update`/`delete` policy exists for `xp_ledger`, `coin_ledger`,
`user_facts`, `review_log`, `league_members`, or `entitlements`.** The absence *is*
the security control — there is no client code path to abuse.

**Test the policies.** `supabase/tests/rls.test.sql` asserts, per table, that user A
cannot read or write user B's rows. RLS bugs are silent and catastrophic; they need
tests like any other logic.

---

## Migrations

```
supabase/migrations/20260801120000_create_profiles.sql
supabase/migrations/20260801120100_create_learning_tables.sql
…
```

- Forward-only. Never edit a landed file — add a new one.
- Every migration is reversible in principle; write the down-step in a comment.
- Additive first: add a column nullable → backfill → set not-null in a later migration.
- Renaming a column is: add new → dual-write → backfill → migrate readers → drop old.
  Four migrations, never one.
- Types regenerate into `packages/api/src/database.types.ts` (`pnpm db:types`) and are
  committed, so CI catches drift.

---

## Data retention & erasure

| Data | Retention |
|---|---|
| `review_log` | Life of the account (it *is* the progress) |
| `lessons` | 24 months, then aggregated |
| Analytics events | 14 months (PostHog), 90 days raw |
| `audit_log` | 24 months |
| Soft-deleted accounts | 30 days, then hard purge |
| Child account data | Minimum viable; purged 30 days after deletion, no exceptions |

`delete-user` cascades everything and writes a tombstone to `audit_log` containing no
personal data. Export via `export-user-data` returns a JSON archive of everything we
hold — GDPR Art. 15 and 20. Both are edge functions, both are tested.
