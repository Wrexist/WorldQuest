-- Ledgers, not balances.
--
-- A balance you can only compute is a balance you can audit, replay and correct.
-- A mutable balance column is a bug waiting to become irreversible.
-- Spec: docs/systems/xp-economy.md

create table xp_ledger (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  -- XP is a permanent progression score: it never decreases, so no negative
  -- entries are possible. Spending it would corrupt levels and leagues (ADR 0011).
  amount     int  not null check (amount > 0),
  reason     text not null,
  ref_id     text,
  created_at timestamptz not null default now()
);

create table coin_ledger (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  amount     int  not null,          -- signed: negative is a spend
  reason     text not null,
  ref_id     text,
  created_at timestamptz not null default now()
);

create table wallets (
  user_id           uuid primary key references profiles(id) on delete cascade,
  xp_total          bigint   not null default 0 check (xp_total >= 0),
  coins             int      not null default 0 check (coins >= 0),
  gems              int      not null default 0 check (gems >= 0),
  hearts            smallint not null default 5 check (hearts between 0 and 5),
  -- Hearts are computed from this timestamp on read, not ticked by a job. Clock
  -- manipulation gains nothing because the server owns both timestamps.
  hearts_updated_at timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table inventory (
  user_id     uuid references profiles(id) on delete cascade,
  item_id     text not null,
  acquired_at timestamptz not null default now(),
  source      text not null,
  primary key (user_id, item_id)
);

create table streaks (
  user_id                uuid primary key references profiles(id) on delete cascade,
  current                int not null default 0,
  longest                int not null default 0,
  last_active_date       date,
  freezes_held           smallint not null default 0,
  freeze_used_on         date,
  repair_available_until timestamptz,
  last_repair_at         timestamptz
);

create index xp_ledger_user_time_idx   on xp_ledger   (user_id, created_at desc);
create index coin_ledger_user_time_idx on coin_ledger (user_id, created_at desc);

alter table xp_ledger   enable row level security;
alter table coin_ledger enable row level security;
alter table wallets     enable row level security;
alter table inventory   enable row level security;
alter table streaks     enable row level security;

create policy own_xp_select        on xp_ledger   for select using (auth.uid() = user_id);
create policy own_coins_select     on coin_ledger for select using (auth.uid() = user_id);
create policy own_wallet_select    on wallets     for select using (auth.uid() = user_id);
create policy own_inventory_select on inventory   for select using (auth.uid() = user_id);
create policy own_streak_select    on streaks     for select using (auth.uid() = user_id);
-- Deliberately no client write policy on any of the above. There is no endpoint
-- that accepts "give me 500 XP".
