/**
 * What the sync queue is still holding.
 *
 * Parked mutations are work that exhausted its retries. The engine keeps them rather
 * than dropping them — "I lost my progress" is the most trust-destroying bug a
 * learning app has — and until now nothing surfaced them, so that promise was only
 * half kept: preserved and unreachable.
 */

import { useSyncExternalStore } from 'react'
import { hasUnsyncedProgress } from '@worldquest/engines'
import { onQueueChange, peekQueue, retryParkedMutation } from '../../lib/sync.js'

export type SyncStatus = {
  readonly parked: number
  /** Queued and still trying. Not parked — this is a lesson finished a minute ago. */
  readonly pending: number
  /**
   * Work the user would be upset to lose, whether parked or merely waiting.
   *
   * `hasUnsyncedProgress` has been in the engine since the queue was built, with a doc
   * comment saying "used to warn before sign-out or account deletion", and had no caller
   * — it was the last entry on the reachability gap list. `parked` is a narrower question:
   * a lesson finished thirty seconds ago on a train is not parked and is exactly what
   * signing out would throw away.
   */
  readonly hasUnsynced: boolean
  readonly onRetry: () => void
}

/**
 * `useSyncExternalStore` needs a snapshot it can compare by reference, and `peekQueue`
 * returns a fresh object shape on every commit — so the COUNT is the snapshot. A
 * number is stable between real changes, which is exactly the contract.
 */
/**
 * The snapshot, as one string.
 *
 * `useSyncExternalStore` compares by reference and `peekQueue` returns a fresh object on
 * every commit, so a PRIMITIVE is the snapshot. Not an object — that would be a new
 * reference every render and would loop.
 *
 * A string rather than the packed integer this used to be. `parked * 1_000 + pending`
 * silently corrupts the moment `pending` reaches 1000: the pending count carries into
 * the parked digits, `parked` becomes non-zero, and Settings switches to "waiting to
 * reach the server" with a retry link — for work that is still trying. The multiplier
 * bought nothing, because `useSyncExternalStore` compares with `Object.is` and any
 * primitive works, and a string has no ceiling.
 *
 * `hasUnsynced` is encoded here too, rather than read beside the snapshot. Read outside
 * it, the store only re-rendered when the packed number changed — so if the queue's
 * COMPOSITION changed while both lengths stayed equal, the flag kept a stale value.
 * Putting it in the snapshot removes that class of bug rather than the instance.
 */
const queueSnapshot = (): string => {
  const q = peekQueue()
  return `${q.parked.length}:${q.pending.length}:${hasUnsyncedProgress(q) ? 1 : 0}`
}

export function useSyncStatus(): SyncStatus {
  const [parked = '0', pending = '0', unsynced = '0'] = useSyncExternalStore(
    onQueueChange,
    queueSnapshot,
    queueSnapshot,
  ).split(':')
  return {
    parked: Number(parked),
    pending: Number(pending),
    hasUnsynced: unsynced === '1',
    onRetry: () => {
      for (const mutation of peekQueue().parked) retryParkedMutation(mutation.id)
    },
  }
}
