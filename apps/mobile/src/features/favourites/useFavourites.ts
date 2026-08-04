/**
 * Countries the user has starred.
 *
 * ## Why this is a store and not a `useState`
 *
 * Two screens show the same fact at once. Tapping the heart on `/country/SE` and then
 * going back to the collection must not show a stale grid, and a `useState` in each
 * screen guarantees exactly that. So there is one module-level set, `useSyncExternalStore`
 * over it, and every subscriber re-renders on the same write.
 *
 * ## Why it is local-only, and stays local-only for now
 *
 * A favourite is a preference, not progress. It is not XP, not a streak, not an
 * entitlement, so ADR 0006's server-authority rule does not apply — nothing here can
 * be cheated into an advantage. When accounts exist this syncs like any other
 * preference; until then, living on the device is the honest answer rather than a
 * feature that silently needs a login.
 *
 * ## What a favourite deliberately does NOT do
 *
 * It does not change what the scheduler picks. Boosting starred countries would mean
 * a user could starve their own review queue by starring six places, and "study what
 * you like" is precisely the instinct spaced repetition exists to overrule. A
 * favourite is a bookmark: it changes what you can *find*, never what you are *asked*.
 * Practising one on purpose is still one tap away from the country page.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { readJson, writeJson } from '../../lib/storage.js'

const KEY = 'favourites.countries.v1'

/**
 * A stable snapshot. `useSyncExternalStore` compares snapshots by reference and will
 * loop forever if `getSnapshot` builds a new one each call — so the set is replaced
 * only on a real write, and read back by identity in between.
 */
let snapshot: ReadonlySet<string> | null = null
const listeners = new Set<() => void>()

const load = (): ReadonlySet<string> => {
  // An id that is not a string cannot name a country, and a corrupt entry here would
  // otherwise render as a blank tile forever.
  const stored = readJson<unknown>(KEY)
  const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  return new Set(ids)
}

const read = (): ReadonlySet<string> => (snapshot ??= load())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function write(next: ReadonlySet<string>): void {
  snapshot = next
  // Sorted, so the stored file is stable and two devices that starred the same set in
  // a different order produce the same bytes when this eventually syncs.
  writeJson(KEY, [...next].sort())
  for (const listener of listeners) listener()
}

export type UseFavourites = {
  readonly favourites: ReadonlySet<string>
  readonly isFavourite: (entityId: string) => boolean
  /** Adds if absent, removes if present. Returns the state it left the entity in. */
  readonly toggle: (entityId: string) => boolean
}

export function useFavourites(): UseFavourites {
  const favourites = useSyncExternalStore(subscribe, read, read)

  const toggle = useCallback((entityId: string): boolean => {
    const next = new Set(read())
    const added = !next.delete(entityId)
    if (added) next.add(entityId)
    write(next)
    return added
  }, [])

  const isFavourite = useCallback(
    (entityId: string): boolean => favourites.has(entityId),
    [favourites],
  )

  return { favourites, isFavourite, toggle }
}

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetFavouritesCache(): void {
  snapshot = null
}
