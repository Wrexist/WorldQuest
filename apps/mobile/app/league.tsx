/**
 * The league route.
 *
 * Reached from the chip on Home, and from nowhere else — a leaderboard is something you
 * choose to look at, never something the app puts in front of you.
 */

import { useMemo } from 'react'
import { router } from 'expo-router'
import { weekEnd } from '@worldquest/engines'
import { LeagueScreen } from '../src/features/league/LeagueScreen.js'
import { useLeague } from '../src/features/league/useLeague.js'
import { useOnline } from '../src/lib/connectivity.js'

export default function LeagueRoute() {
  const league = useLeague()
  const online = useOnline()

  /**
   * Whole hours until the week turns over, rounded UP.
   *
   * Up rather than down so "1 hour left" never means four minutes — a countdown that
   * expires early is a countdown that lied. Recomputed only when the week changes,
   * which is also why it is not a live ticker: `notifications.md` and this feature's
   * spec both refuse to count down in seconds, because a clock ticking on a
   * leaderboard is pressure rather than information.
   */
  const hoursLeft = useMemo(() => {
    const now = Date.now()
    const remaining = weekEnd(now) - now
    return remaining > 0 ? Math.ceil(remaining / 3_600_000) : undefined
  }, [league.weekId])

  return (
    <LeagueScreen
      rows={league.rows}
      rank={league.rank}
      status={league.status}
      offline={!online}
      {...(hoursLeft !== undefined ? { hoursLeft } : {})}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRetry={league.refetch}
    />
  )
}
