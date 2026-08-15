/**
 * Leaving the league, and coming back.
 *
 * `docs/systems/social-and-leagues.md` §4: "**Leagues are opt-out in one tap.**" That is
 * a product rule with teeth — the only social surface in the app has to be leaveable
 * without a dialogue, a confirmation, or a "are you sure you want to lose your streak of
 * promotions" (there is no such streak, deliberately, and §4 says so too).
 *
 * Opting out does not delete the current week. The row stops the NEXT placement and the
 * week already running finishes on its own, because removing a member mid-week would
 * renumber twenty-nine other people's positions for a reason none of them can see.
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchLeagueOptOut, setLeagueOptOut } from '@worldquest/api'
import { currentUser, isConfigured, supabase } from '../../lib/supabase.js'
import { queryClient, queryKeys } from '../../lib/query.js'

export type UseLeagueOptOut = {
  /** True when the user is IN the league — the sense a Settings switch wants. */
  readonly joined: boolean
  readonly setJoined: (value: boolean) => void
}

export function useLeagueOptOut(): UseLeagueOptOut {
  const [optedOut, setOptedOut] = useState(false)

  useEffect(() => {
    if (!isConfigured()) return
    let cancelled = false
    void fetchLeagueOptOut(supabase())
      .then((value) => {
        if (!cancelled) setOptedOut(value)
      })
      // Swallowed: not knowing must not break Settings. Defaulting to "joined" is the
      // safe direction for a control — it shows the switch ON and the user can turn it
      // off, rather than showing OFF and hiding the fact that they are in a league.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const setJoined = useCallback((value: boolean): void => {
    // Optimistic, because this is a switch and a switch that waits for a round trip
    // reads as broken. The server is still the record; a failure restores it below.
    setOptedOut(!value)
    void (async () => {
      try {
        const { userId } = await currentUser()
        await setLeagueOptOut(supabase(), userId, !value)
        // The standings belong to a different answer now.
        void queryClient().invalidateQueries({ queryKey: queryKeys.league })
      } catch {
        setOptedOut(value)
      }
    })()
  }, [])

  return { joined: !optedOut, setJoined }
}
