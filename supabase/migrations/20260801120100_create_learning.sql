-- The learning engine's persistence.
--
-- review_log is APPEND-ONLY and authoritative; user_facts is a derived cache that
-- rebuild() can reproduce exactly. That is what makes an algorithm change safe.
-- Spec: docs/systems/learning-engine.md

create type mastery_level as enum
  ('unseen','learning','familiar','proficient','mastered','burnished');

create table user_facts (
  user_id        uuid not null references profiles(id) on delete cascade,
  fact_id        text not null,
  stability      real not null check (stability > 0),
  difficulty     real not null check (difficulty between 1 and 10),
  reps           int  not null default 0,
  lapses         int  not null default 0,
  last_review_at timestamptz,
  due_at         timestamptz not null,
  mastery        mastery_level not null default 'learning',
  avg_ms         int,
  suspended      boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (user_id, fact_id)
);

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
  -- Client-generated UUID used as the primary key. A replayed offline submit
  -- collides here and becomes a no-op returning the original result — this one
  -- line is what makes the offline queue safe.
  id             uuid primary key,
  user_id        uuid not null references profiles(id) on delete cascade,
  kind           text not null,
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

-- THE hot path: "what should this user see next?" Target p95 < 50ms.
-- If this query is slow the app feels dead, so it gets a partial index.
create index user_facts_due_idx on user_facts (user_id, due_at)
  where suspended = false and mastery <> 'burnished';
create index user_facts_mastery_idx on user_facts (user_id, mastery);
create index review_log_user_time_idx on review_log (user_id, created_at desc);
create index review_log_fact_idx on review_log (user_id, fact_id, created_at desc);
create index lessons_user_time_idx on lessons (user_id, completed_at desc);

alter table user_facts enable row level security;
alter table review_log enable row level security;
alter table lessons    enable row level security;

-- Read-only for the owner. All writes happen in edge functions as service_role.
create policy own_facts_select   on user_facts for select using (auth.uid() = user_id);
create policy own_reviews_select on review_log for select using (auth.uid() = user_id);
create policy own_lessons_select on lessons    for select using (auth.uid() = user_id);
