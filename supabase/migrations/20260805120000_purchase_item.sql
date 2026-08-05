-- Where coins finally go.
--
-- `useShop.buy()` carried this comment: "enqueues the spend for the server to actually
-- perform". It did not. It wrote the item into device storage and fired an analytics
-- event, and there was no endpoint to enqueue a spend to — `coin_ledger` has never held
-- a negative row, and `inventory` has never held any row at all. So the shop was free:
-- every item, for everybody, permanently, with the coin balance untouched.
--
-- `setOwned` — documented as "the only thing that may shrink" local ownership, the
-- mechanism by which the server was supposed to correct a stale device — had zero
-- callers in the entire repository.
--
-- That makes coins a currency with no sink, which Product Bible principle 10 names
-- directly, and which the economy simulation has been reporting healthy spend rates for
-- against a model of a shop that did not exist.
--
-- ## The overdraft check was already written
--
-- Nothing here compares a balance. `wallets.coins` carries `check (coins >= 0)` and
-- `apply_coins_to_wallet` adds every ledger row to it inside the same transaction — so a
-- spend somebody cannot afford violates the constraint and takes the whole transaction
-- with it, ledger row and inventory row together. `wallet_totals_from_ledgers` said so
-- when it declined to clamp: "the `coins >= 0` check on the table is what refuses an
-- overspend."
--
-- An application-level balance check would be a second answer to a question the schema
-- already answers, and a racy one — read, decide, write, with another purchase landing
-- in between. This has no window to race in.
--
-- ## Prices come from the server, and so does the item→kind mapping
--
-- `p_price` is not a parameter. A price the caller supplies is a price the caller
-- chooses, and the whole point of a server-authoritative economy is that it does not.
-- `shop_items` is a projection of packs/shop/titles.v1.json and BALANCE.prices, exactly
-- as `_content/answers.ts` is a projection of the geography packs for the grader — and
-- `shop.test.ts` reads this file, the pack and the balance table and asserts the three
-- agree, so the projection cannot go stale in silence.
--
-- Spec: docs/systems/xp-economy.md · docs/adr/0006-server-authoritative-progress.md

create table shop_items (
  item_id text primary key,
  kind    text not null,
  price   int  not null check (price > 0)
);

-- Readable by anyone signed in: it is the catalogue, it ships in the bundle already, and
-- a client that can see a price it cannot change is not a risk. No write policy, for the
-- usual reason — the absence is the control.
alter table shop_items enable row level security;
create policy shop_items_select on shop_items for select using (auth.uid() is not null);

insert into shop_items (item_id, kind, price) values
  ('title.flag-fanatic',      'title', 1000),
  ('title.capital-collector', 'title', 1000),
  ('title.night-owl',         'title', 1000),
  ('title.early-bird',        'title', 1000),
  ('title.island-hopper',     'title', 1000),
  ('title.map-nerd',          'title', 1000);

create or replace function public.purchase_item(p_item_id text)
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

  select price into v_price from public.shop_items where item_id = p_item_id;
  if not found then
    return jsonb_build_object('status', 'not_for_sale');
  end if;

  -- Never sell something twice. Checked before the ledger row rather than relying on the
  -- inventory primary key, because a second charge followed by a rolled-back insert is
  -- still a second charge in the eyes of whoever reads the ledger.
  if exists (select 1 from public.inventory where user_id = v_user and item_id = p_item_id) then
    return jsonb_build_object('status', 'already_owned');
  end if;

  -- A spend is a negative row. The wallet trigger applies it and the `coins >= 0` check
  -- refuses it if they cannot afford it — which aborts this whole function, so no
  -- inventory row survives a purchase that was never paid for.
  insert into public.coin_ledger (user_id, amount, reason, ref_id)
  values (v_user, -v_price, 'shop:purchase', p_item_id);

  insert into public.inventory (user_id, item_id, source)
  values (v_user, p_item_id, 'shop');

  return jsonb_build_object(
    'status', 'purchased',
    'itemId', p_item_id,
    'spent', v_price,
    'coins', (select coins from public.wallets where user_id = v_user)
  );
exception
  -- 23514 is the `coins >= 0` check. It is the overdraft answer, not an error — the
  -- caller gets a state, and the transaction is already rolled back by the time we are
  -- here, so nothing was charged and nothing was granted.
  when check_violation then
    return jsonb_build_object('status', 'insufficient_funds');
end;
$$;

-- Callable by the signed-in user, unlike every other function in this schema. It has to
-- be: this is the one server action a client legitimately initiates, and it reads
-- `auth.uid()` rather than taking a user id, so it can only ever spend the caller's own
-- coins on the caller's own inventory. service_role is not granted because no server-side
-- code calls it.
revoke all on function public.purchase_item(text) from public;
revoke all on function public.purchase_item(text) from anon;
grant execute on function public.purchase_item(text) to authenticated;
