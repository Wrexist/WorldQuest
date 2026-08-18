-- The 250 coins the "Keep going" button has always charged, and never once taken.
--
-- `BALANCE.prices.continueLesson` has been 250 since the balance table was written.
-- `OutOfHearts` reads it, prints it on the button, and refuses the offer when the wallet
-- is short of it — and then `lesson.revive()` dispatched `REVIVE` and stopped. There was
-- no client call, no RPC, and no `shop_items` row: grep for `continueLesson` and the only
-- hits were the balance table, a test asserting it is positive, and the label.
--
-- So the one paid convenience in the product was free and unlimited, which is the same
-- class of defect `purchase_item` was written for and for the same reason: a comment
-- describing a mechanism is not the mechanism. The economy simulation reports coin sinks
-- against a model in which this one exists.
--
-- ## Why the idempotency key is not the lesson id
--
-- A lesson can run out of hearts more than once — a revive restores the full set, and
-- five more review items can take them again. Keying on the lesson would refuse the
-- second continue as a replay and hand it over free, which is the bug this migration
-- exists to close, one layer down. The client mints a UUID per OFFER instead, so a
-- double-tap on one offer is a replay and a genuine second continue is not.
--
-- ## No inventory row
--
-- A continue is consumed at the instant it is bought; there is nothing to own and
-- nothing to restore on a new device. The ledger row IS the record, which is also what
-- makes the replay check above possible without a table of its own.
--
-- Spec: docs/systems/xp-economy.md · docs/adr/0006-server-authoritative-progress.md

-- `consumable`, like the streak freeze, and for the same reason: `SELLABLE_KINDS` on the
-- client filters the cosmetics grid to `title`, so a consumable can never be rendered as
-- a shop row and bought through the wrong endpoint.
insert into public.shop_items (item_id, kind, price)
values ('consumable.continue-lesson', 'consumable', 250);

create or replace function public.continue_lesson(p_continue_id uuid)
returns jsonb
language plpgsql
security definer
-- Empty search_path: SECURITY DEFINER, and it writes the coin ledger. Every object
-- below is schema-qualified.
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_price int;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  -- The price comes from the catalogue, never from the caller. A price a client supplies
  -- is a price a client chooses, which is the whole of what server-authoritative means.
  select price into v_price from public.shop_items where item_id = 'consumable.continue-lesson';
  if not found then
    return jsonb_build_object('status', 'not_for_sale');
  end if;

  -- The replay. Checked before the ledger row rather than left to a constraint, because
  -- a second charge that is later rolled back is still a second charge to anyone reading
  -- the ledger.
  if exists (
    select 1 from public.coin_ledger
    where user_id = v_user and reason = 'shop:continue' and ref_id = p_continue_id::text
  ) then
    return jsonb_build_object(
      'status', 'already_paid',
      'coins', (select coins from public.wallets where user_id = v_user)
    );
  end if;

  -- A spend is a negative row. `apply_coins_to_wallet` adds it to `wallets.coins` in this
  -- same transaction and the `coins >= 0` check refuses an overdraft, which aborts the
  -- whole function — so there is no window in which coins are taken without the caller
  -- being told.
  insert into public.coin_ledger (user_id, amount, reason, ref_id)
  values (v_user, -v_price, 'shop:continue', p_continue_id::text);

  return jsonb_build_object(
    'status', 'purchased',
    'spent', v_price,
    'coins', (select coins from public.wallets where user_id = v_user)
  );
exception
  -- 23514 is the `coins >= 0` check: the overdraft answer, not an error. The transaction
  -- is already rolled back by the time we are here, so nothing was charged.
  when check_violation then
    return jsonb_build_object('status', 'insufficient_funds');
end;
$$;

-- Callable by the signed-in user, like `purchase_item` and `purchase_freeze`, and safe
-- for the same reason: it takes no user and no price, reads `auth.uid()`, and can only
-- ever spend the caller's own coins.
revoke all on function public.continue_lesson(uuid) from public;
revoke all on function public.continue_lesson(uuid) from anon;
grant execute on function public.continue_lesson(uuid) to authenticated;
