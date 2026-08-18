-- The 600-coin sink that has been fully built, fully tested, and unreachable.
--
-- `repairAvailability` and `repair` in `packages/engines/src/time/streak-recovery.ts`
-- decide a window, a cooldown and a price; `StreakScreen` renders the card, the hours
-- remaining and the "you are 200 coins short" line. `app/streak.tsx` passes
-- `onRepair={undefined}`, so the button rendered DISABLED with no explanation next to it.
--
-- That was honest while nothing wrote `broken_on`: the route's own comment said so. It
-- stopped being true when `expire_streaks()` landed and started recording a break hourly
-- per user timezone — from that point `repairAvailability` returns `available: true` for
-- a real user, and the screen offers a purchase that cannot be made and does not say why.
-- A control that names a price and refuses every tap is worse than no control, and it is
-- worst on the screen a user reaches after losing a two-hundred-day streak.
--
-- ## What the server decides, and why it is not the caller
--
-- Everything. The price comes from `shop_items`, the window and the cooldown from the
-- clock, and the length restored from `streaks.longest` — NOT from a parameter. The
-- client's `restoreTo` prop exists so the button can say "restore your 214-day streak";
-- a `p_restore_to` argument would let a modified client name any number and buy it for
-- 600 coins, which is a leaderboard entry for the price of a cosmetic.
--
-- ## The rules are the engine's, restated
--
-- 48 hours, once every 30 days, nothing to restore below two days. Restated here rather
-- than shared, for the reason `purchase_freeze` restates `MAX_FREEZES`: a Postgres
-- function cannot import TypeScript. `streak-recovery.test.ts` asserts the engine's
-- copies against the balance table, and this file names the engine constant beside each
-- number so a change to one is findable from the other.
--
-- ## Why the repaired day counts as active
--
-- `repair()` sets `lastActiveDate` to today and states the reason: "the user has just
-- paid to be considered present, and making them also complete a lesson to keep the
-- streak they just bought is the kind of small betrayal that gets remembered."
--
-- Spec: docs/systems/xp-economy.md · docs/systems/progression.md

insert into public.shop_items (item_id, kind, price)
values ('consumable.streak-repair', 'consumable', 600);

create or replace function public.repair_streak()
returns jsonb
language plpgsql
security definer
-- Empty search_path: SECURITY DEFINER, and it writes the coin ledger and a streak.
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_price  int;
  v_tz     text;
  v_today  date;
  v_streak public.streaks%rowtype;
  -- `REPAIR_WINDOW_HOURS` in streak-recovery.ts.
  c_window   constant int := 48;
  -- `REPAIR_COOLDOWN_DAYS`. Any more often and the streak stops meaning anything.
  c_cooldown constant int := 30;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  select price into v_price from public.shop_items where item_id = 'consumable.streak-repair';
  if not found then
    return jsonb_build_object('status', 'not_for_sale');
  end if;

  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_user;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;

  -- `for update`: the whole decision below is a read-then-write on this row, and
  -- `expire_streaks` runs hourly against the same one.
  select * into v_streak from public.streaks where user_id = v_user for update;
  if not found then
    return jsonb_build_object('status', 'no_streak');
  end if;

  if v_streak.broken_on is null then
    return jsonb_build_object('status', 'not_broken');
  end if;

  -- Nothing to sell back. Charging 600 coins to restore a one-day streak would be taking
  -- money for a rounding error — `repairAvailability`'s `nothing-to-restore`.
  if v_streak.current <= 1 and v_streak.longest <= 1 then
    return jsonb_build_object('status', 'nothing_to_restore');
  end if;

  -- The window, measured from UTC midnight of the day it broke, exactly as the engine
  -- measures it.
  if now() > (v_streak.broken_on::timestamp at time zone 'UTC') + make_interval(hours => c_window) then
    return jsonb_build_object('status', 'window_expired');
  end if;

  if v_streak.last_repair_at is not null
     and (v_today - (v_streak.last_repair_at at time zone v_tz)::date) < c_cooldown then
    return jsonb_build_object(
      'status', 'cooldown',
      'availableInDays', c_cooldown - (v_today - (v_streak.last_repair_at at time zone v_tz)::date)
    );
  end if;

  -- Checked before the ledger row, like every other purchase here: a refusal must never
  -- arrive after the coins have gone.
  insert into public.coin_ledger (user_id, amount, reason, ref_id)
  values (v_user, -v_price, 'shop:repair', v_streak.broken_on::text);

  update public.streaks
  set current          = greatest(longest, current),
      last_active_date = v_today,
      broken_on        = null,
      last_repair_at   = now()
  where user_id = v_user;

  return jsonb_build_object(
    'status', 'repaired',
    'spent', v_price,
    'current', greatest(v_streak.longest, v_streak.current),
    'coins', (select coins from public.wallets where user_id = v_user)
  );
exception
  -- The `coins >= 0` check on `wallets`. The transaction is already rolled back here, so
  -- nothing was charged and no streak was restored.
  when check_violation then
    return jsonb_build_object('status', 'insufficient_funds');
end;
$$;

-- The third purchase a signed-in user initiates directly, and safe for the same reason as
-- the other two: no user parameter, no price parameter, and now no LENGTH parameter.
revoke all on function public.repair_streak() from public;
revoke all on function public.repair_streak() from anon;
grant execute on function public.repair_streak() to authenticated;
