/**
 * What the user owns, and what they are wearing.
 *
 * ## Optimistic, never authoritative
 *
 * A purchase is a coin spend, and coins are server-authoritative (ADR 0006) for the
 * same reason XP is: a client that debits its own wallet is a client that can mint
 * one. So `buy()` writes the item locally so the row flips to "Owned" in the same
 * frame, and enqueues the spend for the server to actually perform. The server's
 * answer overwrites this on the next reconcile.
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
      // engine, and the server asks it again with the authoritative wallet. This is
      // the optimistic write plus the event, nothing more.
      own(item.id)
      // `coins_spent` already existed in the registry, unused, waiting for a shop.
      // A parallel `shop_item_purchased` would have split the sink metric in two.
      track('coins_spent', { amount: item.price, item_id: item.id, balance_after: balanceAfter })
    }, []),
    equip: useCallback((id: string | null, kind = 'title') => {
      equip(id)
      track('cosmetic_equipped', { item_id: id ?? 'level_title', kind })
    }, []),
  }
}
