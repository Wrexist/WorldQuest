/**
 * The progress figures every screen should show: the server's, plus what it has not
 * seen yet.
 *
 * One hook rather than three, because Home, Profile and Streak were each reading
 * `useProgress()` directly and each showing a user who had just finished a lesson
 * offline that nothing had happened. Three copies of the same combination would drift;
 * the whole point of this is that the number is the same wherever it appears.
 *
 * The rules live in `packages/engines/src/sync/optimistic.ts`, which is pure and tested.
 * This is the part with a clock, a cache and a subscription in it.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { optimisticProgress, type OptimisticProgress } from '@worldquest/engines'
import { useAwards, pruneSettledAwards } from '../../lib/awards.js'
import { queryKeys } from '../../lib/query.js'
import { localDay } from '../../lib/day.js'
import { useProgress, type UseProgress } from './useProgress.js'

export type UseOptimisticProgress = UseProgress & {
  /**
   * The figures to render. Null when there is nothing to render at all — no server data
   * and no queued work — which is the state the screens already treat as cold start.
   */
  readonly shown: OptimisticProgress | null
}

export function useOptimisticProgress(): UseOptimisticProgress {
  const progress = useProgress()
  const awards = useAwards()
  const client = useQueryClient()

  /**
   * When the authoritative figures were last read.
   *
   * From the query cache rather than from a local `Date.now()`, because that is the
   * question being asked: an award delivered before this instant is already inside the
   * totals in hand. `0` means they have never arrived — a first launch, or an offline
   * start — and `optimisticProgress` reads that as covering nothing, which is right.
   */
  const fetchedAt = client.getQueryState(queryKeys.progress)?.dataUpdatedAt ?? 0

  const shown =
    progress.data === null && awards.length === 0
      ? null
      : optimisticProgress({
          authoritative: {
            xpTotal: progress.data?.xpTotal ?? 0,
            coins: progress.data?.coins ?? 0,
            streak: progress.data?.streak ?? 0,
            lastActiveDate: progress.data?.lastActiveDate ?? null,
          },
          awards,
          progressFetchedAt: fetchedAt,
          today: localDay(new Date()),
        })

  // Retire rows the server has both accepted and reported back. In an effect because it
  // writes, and a write during render is how a "cannot update while rendering" warning
  // and an infinite loop start. `pruneSettledAwards` no-ops when there is nothing to do,
  // so this settles after one pass rather than looping on its own notification.
  useEffect(() => {
    if (fetchedAt > 0) pruneSettledAwards(fetchedAt)
  }, [fetchedAt, awards])

  return { ...progress, shown }
}
