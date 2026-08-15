-- Twelve more titles for the shop.
--
-- `shop_items` is a projection of `packs/shop/titles.v1.json` and `BALANCE.prices`, and
-- `packages/engines/src/shop/shop.test.ts` reads the migrations, the pack and the balance
-- table and asserts all three agree. An item in the pack that is not in this table is an
-- item the server refuses to sell, which the user experiences as a Buy button that does
-- nothing — so the pack and the seed move together or neither moves.
--
-- ## Why a new file rather than an edit
--
-- `supabase/migrations/` is forward-only by repo rule: never edit a landed file. Adding
-- rows to a table another migration created is exactly what a second migration is for,
-- and `on conflict do nothing` makes it safe to run against a database that somehow
-- already has them.
--
-- ## Why the shop needed stocking
--
-- Six titles at 1,000 coins is 6,000 of stock against a regular player earning 26,310
-- coins in ninety days (`pnpm engines:simulate`). There was nothing left to want by about
-- week three, on the only screen in the app that gives coins a purpose.
--
-- All still at `BALANCE.prices.titleUnlock`. `priceFor('title')` returns one number and
-- `catalogue.ts` drops any row that disagrees with it — deliberately, so a pack cannot
-- give the shop away or price something out of reach. Varying title prices is an economy
-- change and belongs in the balance table behind a simulation run, not in a seed.

insert into shop_items (item_id, kind, price) values
  ('title.compass-rose',     'title', 1000),
  ('title.border-hopper',    'title', 1000),
  ('title.peak-seeker',      'title', 1000),
  ('title.river-reader',     'title', 1000),
  ('title.timezone-tamer',   'title', 1000),
  ('title.atlas-apprentice', 'title', 1000),
  ('title.coast-watcher',    'title', 1000),
  ('title.dune-walker',      'title', 1000),
  ('title.star-steerer',     'title', 1000),
  ('title.cloud-spotter',    'title', 1000),
  ('title.deep-diver',       'title', 1000),
  ('title.long-way-round',   'title', 1000)
on conflict (item_id) do nothing;
