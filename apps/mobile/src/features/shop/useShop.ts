/**
 * What the user owns, and what they are wearing.
 *
 * ## Optimistic, never authoritative
 *
 * A purchase is a coin spend, and coins are server-authoritative (ADR 0006) for the
 * same reason XP is: a client that debits its own wallet is a client that can mint
 * one. So `buy()` writes the item locally so the row flips to "Owned" in the same
 * frame, and calls `purchase_item` to perform the spend. `reconcileOwned` replaces the
 * local list with the server's on the next visit.
 *
 * Every sentence of that paragraph was true except the two that mattered. `buy()` wrote
 * the row and fired the analytics event and stopped: there was no spend, no endpoint to
 * spend against, and `setOwned` — described here as the reconcile — had no callers
 * anywhere in the repository. `coin_ledger` had never held a negative row and `inventory`
 * had never held any row, so the shop was free, permanently, for everyone. A comment
 * describing a mechanism is not the mechanism.
 *
 * The failure that matters is the reverse one — a user who bought something, went
 * offline, and found it gone. That is why ownership is written to device storage
 * rather than held in React state, and why nothing here ever REMOVES an item on its
 * own. A local row can be stale; it must not be able to lose a purchase.
 *
 * ## Equipping is purely local, and that is correct
 *
 * Which title you wear is a display preference, like the daily goal. It has no value,
 * nobody can cheat by changing it, and it should work instantly with no network. It
 * syncs upward so a new device shows the same hat; it is never read back as truth.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { readJson, writeJson } from '../../lib/storage.js'
import { track } from '../../lib/analytics.js'
import { currentUser, isConfigured, supabase } from '../../lib/supabase.js'
import { invalidateProgress } from '../../lib/query.js'
import type { ShopItem } from '@worldquest/engines'

const OWNED_KEY = 'shop.owned.v1'
const EQUIPPED_KEY = 'shop.equipped.v1'

type Stored = {
  readonly owned: readonly string[]
  readonly equippedId: string | null
}

function read(): Stored {
  const owned = readJson<string[]>(OWNED_KEY)
  const equipped = readJson<{ id: string | null }>(EQUIPPED_KEY)
  return {
    // Defensive on shape, not just on JSON: a hand-edited array of numbers would
    // otherwise reach a Set and silently own nothing recognisable.
    owned: Array.isArray(owned) ? owned.filter((i) => typeof i === 'string') : [],
    equippedId: typeof equipped?.id === 'string' ? equipped.id : null,
  }
}

const listeners = new Set<() => void>()
let cached: Stored | null = null

const snapshot = (): Stored => (cached ??= read())
const emit = (): void => {
  for (const l of listeners) l()
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * Records a purchase locally. Called after the spend is enqueued, never before —
 * the order matters only for the crash case, where an item owned but never paid for
 * is a better outcome than a payment with nothing to show for it.
 */
function own(itemId: string): void {
  const next = snapshot()
  if (next.owned.includes(itemId)) return
  const owned = [...next.owned, itemId]
  cached = { ...next, owned }
  writeJson(OWNED_KEY, owned)
  emit()
}

function equip(id: string | null): void {
  cached = { ...snapshot(), equippedId: id }
  writeJson(EQUIPPED_KEY, { id })
  emit()
}

/** Replaces local ownership with the server's list. The only thing that may shrink it. */
export function setOwned(ids: readonly string[]): void {
  cached = { ...snapshot(), owned: [...ids] }
  writeJson(OWNED_KEY, [...ids])
  emit()
}

/**
 * Actually spend the coins.
 *
 * `purchase_item` is the one server action a client initiates directly, and it is safe to
 * expose because it takes only an item id: the price comes from `shop_items` and the user
 * from `auth.uid()`, so the worst a modified client can do is buy something it can afford.
 * Overdraft is refused by the `coins >= 0` check on the wallet, which rolls back the
 * ledger row and the inventory row together.
 *
 * Failure does NOT remove the local row, deliberately, and that is the same rule the
 * module header states: a stale "Owned" is recoverable on the next reconcile, and a
 * purchase that vanishes from under a ten-year-old is not. The server's answer is
 * authoritative in one direction here — it can only ever tell us we own MORE than we
 * thought, until `reconcileOwned` runs.
 */
async function spend(itemId: string): Promise<void> {
  if (!isConfigured()) return
  try {
    await currentUser()
    const { data } = await supabase().rpc('purchase_item', { p_item_id: itemId })
    const status = (data as { status?: string } | null)?.status
    // The wallet moved, so whatever is showing a coin balance is now wrong.
    if (status === 'purchased') invalidateProgress()
  } catch {
    // Swallowed on purpose. The item stays owned locally, `reconcileOwned` will correct
    // it, and there is no version of "your purchase failed, try again" that belongs in
    // front of a child mid-session.
  }
}

/**
 * Replace local ownership with what the server says this user actually owns.
 *
 * The reconcile the module header has described since the shop was built, and which had
 * no implementation and no caller — `setOwned` was exported, documented as "the only
 * thing that may shrink it", and referenced by nothing in the repository.
 */
export async function reconcileOwned(): Promise<void> {
  if (!isConfigured()) return
  try {
    await currentUser()
    const { data, error } = await supabase().from('inventory').select('item_id')
    if (error || !data) return
    setOwned(data.map((row) => row.item_id))
  } catch {
    // Offline, or no session yet. The local list stands, which is the safe direction.
  }
}

export type ShopState = {
  readonly owned: ReadonlySet<string>
  readonly equippedId: string | null
  /** `balanceAfter` is for the event only — the server computes the real one. */
  readonly buy: (item: ShopItem, balanceAfter: number) => void
  readonly equip: (id: string | null, kind?: string) => void
}

export function useShop(): ShopState {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot)

  return {
    owned: new Set(stored.owned),
    equippedId: stored.equippedId,
    buy: useCallback((item: ShopItem, balanceAfter: number) => {
      // The client does NOT decide affordability here — the screen already asked the
      // engine, and the server asks it again against the authoritative wallet.
      own(item.id)
      // `coins_spent` already existed in the registry, unused, waiting for a shop.
      // A parallel `shop_item_purchased` would have split the sink metric in two.
      track('coins_spent', { amount: item.price, item_id: item.id, balance_after: balanceAfter })
      // And THEN actually spend them. This line is what the comment above has claimed
      // since the shop was built: the optimistic write was real and the spend behind it
      // never existed, so every item in this shop was free.
      void spend(item.id)
    }, []),
    equip: useCallback((id: string | null, kind = 'title') => {
      equip(id)
      track('cosmetic_equipped', { item_id: id ?? 'level_title', kind })
    }, []),
  }
}
