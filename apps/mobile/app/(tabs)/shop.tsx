/**
 * The shop — data in, screen out.
 *
 * The FIFTH TAB, and it used to be a route on the reasoning that "a shop is not a
 * destination people visit daily". That is true of a shop nobody can find: it held the
 * only sink for a currency every lesson pays out, behind one row on Profile, and the
 * economy simulation has a regular player earning 26,310 coins in ninety days.
 *
 * Still five tabs (PROJECT.md §7). Settings took its place at `app/settings.tsx`, behind
 * the gear on Profile — see the note there.
 */

import { useEffect } from 'react'
import { ShopScreen } from '../../src/features/shop/ShopScreen.js'
import { CATALOGUE } from '../../src/features/shop/catalogue.js'
import { reconcileOwned, useShop } from '../../src/features/shop/useShop.js'
import { useProgress } from '../../src/features/home/useProgress.js'
import { useOnline } from '../../src/lib/connectivity.js'
import { levelProgress } from '@worldquest/engines'

export default function ShopRoute() {
  // Server state, behind TanStack Query. The wallet is authoritative there — the
  // number shown here is what the server last said, not a local tally.
  const { data, status, refetch } = useProgress()
  const shop = useShop()
  const online = useOnline()

  const coins = data?.coins ?? 0
  const level = levelProgress(data?.xpTotal ?? 0)

  // On entry, not on every purchase. Opening the shop is when a stale "Owned" would
  // actually mislead somebody — a device restored from backup, or a purchase that failed
  // to reach the server — and it is the one moment the round trip costs nothing, because
  // the wallet query is already in flight beside it.
  useEffect(() => {
    void reconcileOwned()
  }, [])

  return (
    <ShopScreen
      catalogue={CATALOGUE}
      coins={coins}
      owned={shop.owned}
      equippedId={shop.equippedId}
      levelTitleKey={level.titleKey}
      loading={status === 'loading'}
      isOffline={!online}
      error={status === 'error'}
      onRetry={() => void refetch()}
      // `coins - price` is for the analytics event only. The server computes the real
      // balance; sending our guess lets the funnel be read before the sync lands, and
      // it is corrected on the next reconcile like every other optimistic number.
      onBuy={(item) => shop.buy(item, coins - item.price)}
      onEquip={(id) => shop.equip(id)}
    />
  )
}
