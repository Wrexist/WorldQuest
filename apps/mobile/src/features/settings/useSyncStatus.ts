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
 * The snapshot, as one number.
 *
 * `useSyncExternalStore` compares by reference and `peekQueue` returns a fresh object on
 * every commit, so a COUNT is the snapshot. Two counts are packed into one integer rather
 * than returned as an object for the same reason — an object would be a new reference
 * every render and would loop.
 */
const queueSnapshot = (): number => {
  const q = peekQueue()
  return q.parked.length * 1_000 + q.pending.length
}

export function useSyncStatus(): SyncStatus {
  const packed = useSyncExternalStore(onQueueChange, queueSnapshot, queueSnapshot)
  const parked = Math.floor(packed / 1_000)
  return {
    parked,
    pending: packed % 1_000,
    hasUnsynced: hasUnsyncedProgress(peekQueue()),
    onRetry: () => {
      for (const mutation of peekQueue().parked) retryParkedMutation(mutation.id)
    },
  }
}
