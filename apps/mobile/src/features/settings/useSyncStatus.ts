/**
 * What the sync queue is still holding.
 *
 * Parked mutations are work that exhausted its retries. The engine keeps them rather
 * than dropping them — "I lost my progress" is the most trust-destroying bug a
 * learning app has — and until now nothing surfaced them, so that promise was only
 * half kept: preserved and unreachable.
 */

import { useSyncExternalStore } from 'react'
import { onQueueChange, peekQueue, retryParkedMutation } from '../../lib/sync.js'

export type SyncStatus = {
  readonly parked: number
  readonly onRetry: () => void
}

/**
 * `useSyncExternalStore` needs a snapshot it can compare by reference, and `peekQueue`
 * returns a fresh object shape on every commit — so the COUNT is the snapshot. A
 * number is stable between real changes, which is exactly the contract.
 */
const parkedCount = (): number => peekQueue().parked.length

export function useSyncStatus(): SyncStatus {
  const parked = useSyncExternalStore(onQueueChange, parkedCount, parkedCount)
  return {
    parked,
    onRetry: () => {
      for (const mutation of peekQueue().parked) retryParkedMutation(mutation.id)
    },
  }
}
