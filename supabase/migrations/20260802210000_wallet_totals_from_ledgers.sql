-- Keep `wallets` in step with the ledgers.
--
-- The bug: `submit-lesson` wrote `xp_ledger` and `coin_ledger` rows and never touched
-- `wallets`, while `fetchProgress` reads `wallets.xp_total` and `wallets.coins`. A user
-- finished a lesson, got a successful reward response, and Home kept showing the old
-- balance — for ever. Every reward this product has ever awarded was invisible.
--
-- Fixed with a trigger rather than by adding two more writes to the edge function, for
-- two reasons. The totals stay correct for ANY writer — a future purchase path, a
-- migration backfill, an admin correction — instead of only for the one endpoint
-- somebody remembered. And the update lands inside the same transaction as the ledger
-- insert, so the two can never disagree even if the function dies between statements.
--
-- The ledgers stay the source of truth. `wallets` is a cache of their sum, and these
-- triggers are what make that claim true rather than aspirational.

create or replace function public.apply_xp_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, xp_total, updated_at)
  values (new.user_id, greatest(new.amount, 0), now())
  on conflict (user_id) do update
    set xp_total = public.wallets.xp_total + new.amount,
        updated_at = now();
  return new;
end;
$$;

create or replace function public.apply_coins_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No `greatest` on the update path on purpose. A spend is a negative row, and the
  -- `coins >= 0` check on the table is what refuses an overspend. Clamping here would
  -- silently let a user buy something they could not afford and quietly zero them.
  insert into public.wallets (user_id, coins, updated_at)
  values (new.user_id, greatest(new.amount, 0), now())
  on conflict (user_id) do update
    set coins = public.wallets.coins + new.amount,
        updated_at = now();
  return new;
end;
$$;

create trigger xp_ledger_to_wallet
  after insert on public.xp_ledger
  for each row execute function public.apply_xp_to_wallet();

create trigger coin_ledger_to_wallet
  after insert on public.coin_ledger
  for each row execute function public.apply_coins_to_wallet();

-- Backfill anyone who earned before the triggers existed. Sums the ledgers rather than
-- trusting the current column, because the current column is exactly what was wrong.
update public.wallets w
set xp_total = coalesce((select sum(amount) from public.xp_ledger l where l.user_id = w.user_id), 0),
    coins    = coalesce((select sum(amount) from public.coin_ledger c where c.user_id = w.user_id), 0),
    updated_at = now();
