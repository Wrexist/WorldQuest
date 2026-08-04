/**
 * The shop's stock, from the content pack.
 *
 * Imported statically, like the achievements catalogue: it is six rows of JSON that
 * ship in the binary, and fetching it would put a network round trip in front of a
 * screen that has nothing else to wait for.
 *
 * ## Prices are checked, not trusted
 *
 * The pack carries a price so a sale or a regional adjustment can be a pack release.
 * But the balance table is the source of truth (`xp-economy.md`: "never a literal
 * reward value anywhere else"), so anything that disagrees with it is dropped rather
 * than sold. A pack that could quietly set `price: 1` is a pack that could give the
 * shop away, and a pack that could set `price: 999999` is one that could make an item
 * unbuyable while still advertising it.
 */

import { SELLABLE_KINDS, priceFor, type CosmeticKind, type ShopItem } from '@worldquest/engines'
import pack from '../../../../../packages/content/packs/shop/titles.v1.json'

type PackItem = { id: string; kind: string; nameKey: string; price: number }

/**
 * Everything the shop may actually sell, in pack order.
 *
 * Filtered rather than validated-and-thrown: a bad row should cost that row, not the
 * whole screen. The screen's empty state covers the case where every row is dropped.
 */
export const CATALOGUE: readonly ShopItem[] = (pack.items as readonly PackItem[]).flatMap(
  (item): ShopItem[] => {
    const kind = item.kind as CosmeticKind
    if (!SELLABLE_KINDS.includes(kind)) return []
    // The balance table decides. A pack price that disagrees is a content bug.
    if (item.price !== priceFor(kind)) return []
    return [{ id: item.id, kind, nameKey: item.nameKey, price: item.price }]
  },
)
