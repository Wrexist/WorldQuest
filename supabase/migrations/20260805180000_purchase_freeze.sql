-- A streak freeze is a coin spend, and there was nowhere to spend.
--
-- `grantFreeze` has been in `packages/engines/src/time/streak-recovery.ts` since streaks
-- were built, fully tested, with a doc comment describing "the common caller is a
-- purchase flow" — and no caller at all. `BALANCE.prices.streakFreeze` is 400 coins of
-- price for a thing nobody could buy. `streaks.freezes_held` has been 0 on every row this
-- product has ever created, which means the freeze branch inside `applyActivity` — the
-- kindness rule that quietly saves a run when somebody misses one day — has never once
-- executed for a real user.
--
-- That is the single most user-visible thing still missing from the streak: the mechanic
-- that forgives a missed day existed in the engine and could not be reached.
--
-- ## Why it does not go through `purchase_item`
--
-- A cosmetic is bought once and owned for ever; `purchase_item` refuses a second purchase
-- and writes an `inventory` row. A freeze is a CONSUMABLE — bought repeatedly, held up to
-- a cap, spent automatically by the streak engine. Bending the cosmetic path to carry it
-- would mean "already owned" starting to mean "you have two of these", which is the point
-- at which a shared function stops helping.
--
-- The cap is `MAX_FREEZES` in the engine, and this is the second copy of that number. The
-- alternative is passing it in from the caller, which is the same shape of hole the price
-- would be: a client that chooses its own cap is a client that holds nine freezes.
-- `streak-recovery.test.ts` reads this file and asserts the two agree.

create or replace function public.purchase_freeze(p_price int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_price  int;
  v_held   smallint;
  -- `MAX_FREEZES` in packages/engines/src/time/streak-recovery.ts. Two is not arbitrary:
  -- a freeze forgives a missed day, and somebody holding a week of them is not keeping a
  -- streak, they are buying one.
  c_max    constant smallint := 2;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  -- The price comes from `shop_items`, exactly as it does for a cosmetic, and for the
  -- same reason: a price the caller supplies is a price the caller chooses. `p_price`
  -- exists only so the signature can be called positionally by a future admin tool and
  -- is ignored — a parameter that is read would be the hole this whole design avoids.
  select price into v_price from public.shop_items where item_id = 'consumable.streak-freeze';
  if not found then
    return jsonb_build_object('status', 'not_for_sale');
  end if;

  select freezes_held into v_held from public.streaks where user_id = v_user for update;
  if not found then
    -- No streak row means the signup trigger has not run, which is not a state a
    -- purchase should create one out of.
    return jsonb_build_object('status', 'no_streak');
  end if;

  -- Checked BEFORE the ledger row. `grantFreeze` returns `granted: false` at the cap
  -- rather than throwing, and its comment gives the reason: "taking the coins and
  -- silently discarding the freeze is the worst possible outcome". Same rule here.
  if v_held >= c_max then
    return jsonb_build_object('status', 'at_cap', 'freezesHeld', v_held);
  end if;

  insert into public.coin_ledger (user_id, amount, reason, ref_id)
  values (v_user, -v_price, 'shop:freeze', null);

  update public.streaks set freezes_held = freezes_held + 1 where user_id = v_user;

  return jsonb_build_object(
    'status', 'purchased',
    'spent', v_price,
    'freezesHeld', v_held + 1,
    'coins', (select coins from public.wallets where user_id = v_user)
  );
exception
  -- The `coins >= 0` check on `wallets`, applied by the ledger trigger inside this same
  -- transaction. The rollback has already happened by the time we are here, so no coins
  -- were taken and no freeze was granted.
  when check_violation then
    return jsonb_build_object('status', 'insufficient_funds');
end;
$$;

-- The freeze is stock, so it lives in the catalogue like everything else the shop sells.
-- `kind` is `consumable` rather than a cosmetic kind, which is what keeps it out of
-- `CATALOGUE` on the client: `SELLABLE_KINDS` filters that list and does not contain it,
-- so the cosmetics grid cannot accidentally render a thing it would buy through the wrong
-- endpoint.
insert into public.shop_items (item_id, kind, price)
values ('consumable.streak-freeze', 'consumable', 400);

revoke all on function public.purchase_freeze(int) from public;
revoke all on function public.purchase_freeze(int) from anon;
grant execute on function public.purchase_freeze(int) to authenticated;
