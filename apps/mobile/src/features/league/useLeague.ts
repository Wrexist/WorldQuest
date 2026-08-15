/**
 * This week's cohort, and whether the reader is in one at all.
 *
 * Server state, so TanStack Query rather than anything hand-rolled — and the standings
 * are the one screen in this app where a stale cache is genuinely wrong: a leaderboard
 * from yesterday is a different set of numbers presented as today's. It refetches on
 * focus for that reason.
 *
 * ## Placement is the server's job, not this hook's
 *
 * Nothing here creates a cohort or joins one. `league_members` has no client write
 * policy at all — the absence IS the control (`supabase/CLAUDE.md` rule 3) — so a user
 * appears in a cohort because the server placed them, and the client's entire role is
 * to read the result. That is also why "not in a league" is an ordinary state rather
 * than an error: until the weekly placement job runs, nobody is.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchLeague, type LeagueCohort } from '@worldquest/api'
import {
  DIVISIONS,
  LEAGUE_TIERS,
  rankFromIndex,
  standings,
  type LeagueRank,
  type Standing,
} from '@worldquest/engines'
import { currentUser, isConfigured, supabase } from '../../lib/supabase.js'
import { queryKeys } from '../../lib/query.js'
import { readOnboarding } from '../onboarding/useOnboarding.js'

export type LeagueStatus = 'loading' | 'ready' | 'error'

export type UseLeague = {
  /** The ordered cohort with positions and outcomes, or null when there is no league. */
  readonly rows: readonly Standing[] | null
  readonly rank: LeagueRank | null
  readonly weekId: string | null
  readonly status: LeagueStatus
  readonly refetch: () => void
}

/** The stored tier/division → the engine's rank. Unknown falls back to Bronze III. */
function rankOf(cohort: LeagueCohort): LeagueRank {
  const tier = LEAGUE_TIERS.find((t) => t === cohort.tier)
  const division = DIVISIONS.find((d) => d === cohort.division)
  // `rankFromIndex(0)` is Bronze III — the bottom, which is where an unrecognised value
  // belongs: it can only under-state the reader's rank, never inflate it.
  return tier === undefined || division === undefined ? rankFromIndex(0) : { tier, division }
}

export function useLeague(): UseLeague {
  /**
   * Under-13 accounts never ask.
   *
   * The RLS policy and the `league_member_is_not_a_child` trigger already make this
   * impossible server-side, and this is the second lock rather than the only one: a
   * child's device should not send a leaderboard query at all, whatever the answer
   * would be. `useOnboarding` explains why the flag is stored rather than recomputed.
   */
  const isChild = readOnboarding().isChild === true

  const query = useQuery({
    queryKey: queryKeys.league,
    queryFn: async (): Promise<LeagueCohort | null> => {
      await currentUser()
      return fetchLeague(supabase())
    },
    enabled: isConfigured() && !isChild,
    // A leaderboard from ten minutes ago is a different set of numbers presented as
    // now. Short, and refetched when the screen comes back into view.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const cohort = query.data ?? null
  const rank = cohort === null ? null : rankOf(cohort)

  return {
    // `standings()` does the removal of inactive members and the tie-break, in the
    // engine, where it is tested — including the kindness rule that somebody's bad week
    // does not become thirty people's leaderboard.
    rows: cohort === null || rank === null ? null : standings(cohort.members, rank),
    rank,
    weekId: cohort?.weekId ?? null,
    status:
      !isConfigured() || isChild
        ? 'ready'
        : query.isPending && query.data === undefined
          ? 'loading'
          : query.isError && query.data === undefined
            ? 'error'
            : 'ready',
    refetch: () => void query.refetch(),
  }
}
