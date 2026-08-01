/**
 * Home's data.
 *
 * A thin wrapper over TanStack Query rather than a hand-rolled fetch: the cache is
 * persisted, so a returning user sees their real streak in the first frame instead of
 * a skeleton and then a jump, and going offline needs no special case in the screen.
 *
 * Nothing writes progress on the client. The server is authoritative for XP, coins and
 * streaks (ADR 0006), and a client that can write them is a client that can be edited.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchProgress, type Progress } from '@worldquest/api'
import { currentUser, isConfigured, supabase } from '../../lib/supabase.js'
import { queryKeys } from '../../lib/query.js'

export type ProgressStatus = 'loading' | 'ready' | 'error'

export type UseProgress = {
  readonly data: Progress | null
  readonly status: ProgressStatus
  /** True when the numbers on screen came from the cache rather than the server. */
  readonly isStale: boolean
  readonly refetch: () => void
}

export function useProgress(): UseProgress {
  const query = useQuery({
    queryKey: queryKeys.progress,
    queryFn: async (): Promise<Progress> => {
      await currentUser()
      return fetchProgress(supabase())
    },
    // No backend configured — a fresh checkout with no .env.local. The app still runs
    // lessons; it just cannot sync them, and a spinner that never resolves is a worse
    // answer than an honest empty state.
    enabled: isConfigured(),
  })

  const status: ProgressStatus = !isConfigured()
    ? 'ready'
    : query.isPending && query.data === undefined
      ? 'loading'
      : // Cached data is still worth showing. Only a user with nothing cached gets the
        // error state — for everyone else this is a stale badge, not a wall.
        query.isError && query.data === undefined
        ? 'error'
        : 'ready'

  return {
    data: query.data ?? null,
    status,
    // `isStale` here means "what you are looking at did not come from the server just
    // now", which is exactly what the offline banner is telling the user.
    isStale: query.data !== undefined && (query.isError || query.isStale),
    refetch: () => void query.refetch(),
  }
}
