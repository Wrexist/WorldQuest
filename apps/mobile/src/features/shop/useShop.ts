/** Server-confirmed ownership, account-scoped persistence and local equipment preferences. */
import { onStorageScopeChange, captureStorage } from '../../lib/storage.js'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { readJson, writeJson } from '../../lib/storage.js'
import { track } from '../../lib/analytics.js'
import { isConfigured } from '../../lib/supabase.js'
import { withAccount } from '../../lib/backend.js'
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

/** Cache a purchase only after server confirmation. */
function own(itemId: string): void {
  const next = snapshot()
  if (next.owned.includes(itemId)) return
  const owned = [...next.owned, itemId]
  cached = { ...next, owned }
  writeJson(OWNED_KEY, owned)
  emit()
}

function equip(id: string | null): void {
  if (id !== null && !snapshot().owned.includes(id)) return
  cached = { ...snapshot(), equippedId: id }
  writeJson(EQUIPPED_KEY, { id })
  emit()
}

/** Replaces local ownership with the server's list. The only thing that may shrink it. */
export function setOwned(ids: readonly string[]): void {
  cached = { ...snapshot(), owned: [...ids] }
  writeJson(OWNED_KEY, [...ids])
  if (cached.equippedId !== null && !ids.includes(cached.equippedId)) equip(null)
  emit()
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
    const ids = await withAccount((account) => account.fetchInventory())
    setOwned(ids)
  } catch {
    // Offline, or no session yet. The local list stands, which is the safe direction.
  }
}

export type ShopState = {
  readonly owned: ReadonlySet<string>
  readonly equippedId: string | null
  /** `balanceAfter` is for the event only — the server computes the real one. */
  readonly buy: (item: ShopItem, balanceAfter: number) => Promise<void>
  readonly pendingId: string | null
  readonly purchaseError: boolean
  readonly equip: (id: string | null, kind?: string) => void
}

export function useShop(): ShopState {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot)

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [purchaseError, setPurchaseError] = useState(false)
  const busy = useRef(false)

  return {
    pendingId, purchaseError,
    owned: new Set(stored.owned),
    equippedId: stored.equippedId,
    buy: useCallback(async (item: ShopItem, balanceAfter: number) => {
      if (busy.current || snapshot().owned.includes(item.id)) return
      const scope = captureStorage()
      busy.current = true
      setPendingId(item.id)
      setPurchaseError(false)
      try {
        if (!isConfigured()) throw new Error('Purchase requires a configured account service')
        const result = await withAccount(account => account.purchaseItem(item.id))
        if (!scope.isCurrent()) return
        if (result.status !== 'purchased' && result.status !== 'owned') throw new Error('Purchase declined')
        own(item.id)
        invalidateProgress()
        if (result.status === 'purchased') track('coins_spent', { amount: item.price, item_id: item.id, balance_after: balanceAfter })
      } catch {
        if (scope.isCurrent()) setPurchaseError(true)
      } finally {
        busy.current = false
        setPendingId(null)
      }
    }, []),
    equip: useCallback((id: string | null, kind = 'title') => {
      if (id !== null && !snapshot().owned.includes(id)) return
      equip(id)
      track('cosmetic_equipped', { item_id: id ?? 'level_title', kind })
    }, []),
  }
}

onStorageScopeChange(() => {
  cached = null
  emit()
})
