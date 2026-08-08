/**
 * What the sync queue is still holding.
 *
 * Parked mutations are work that exhausted its retries. The engine keeps them rather
 * than dropping them — "I lost my progress" is the most trust-destroying bug a
 * learning app has — and until now nothing surfaced them, so that promise was only
 * half kept: preserved and unreachable.
 */

import { useSyncExternalStore } from 'react'
import { countUnsyncedProgress } from '@worldquest/engines'
import { onQueueChange, peekQueue, retryParkedMutation } from '../../lib/sync.js'

export type SyncStatus = {
  /**
   * Parked learning progress — retries exhausted. **Not** `queue.parked.length`.
   *
   * These two counts are what the Settings copy puts a number on, and that copy says
   * "lesson". The queue also holds purchases and settings changes, so the raw lengths
   * counted things the sentence does not name: a lesson finished offline plus one flipped
   * switch read "2 lessons are waiting to reach the server". `countUnsyncedProgress`
   * applies the same predicate `hasUnsyncedProgress` does, so the number and the section's
   * own visibility can no longer disagree about what progress is.
   */
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
 * `hasUnsynced` used to be a third field here, because with raw queue lengths the flag
 * and the counts answered different questions: the composition could change — a lesson
 * acknowledged, a setting queued — while both lengths stayed equal, and a flag read
 * outside the snapshot went stale. Now both come from `countUnsyncedProgress`, so any
 * change that could flip the flag has already moved one of these two numbers. The field
 * is derived rather than transported, which is the version of that fix that cannot rot.
 */
const queueSnapshot = (): string => {
  const { parked, pending } = countUnsyncedProgress(peekQueue())
  return `${parked}:${pending}`
}

export function useSyncStatus(): SyncStatus {
  const [parkedCount = '0', pendingCount = '0'] = useSyncExternalStore(
    onQueueChange,
    queueSnapshot,
    queueSnapshot,
  ).split(':')
  const parked = Number(parkedCount)
  const pending = Number(pendingCount)
  return {
    parked,
    pending,
    hasUnsynced: parked + pending > 0,
    // Every parked mutation, not only the ones counted above: a parked purchase is
    // surfaced nowhere else in the app, so this link is its one chance to be sent. The
    // counts are narrow because they carry a sentence that says "lesson"; the retry is
    // wide because a flush has no reason to be picky.
    onRetry: () => {
      for (const mutation of peekQueue().parked) retryParkedMutation(mutation.id)
    },
  }
}
