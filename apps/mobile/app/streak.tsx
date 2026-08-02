/**
 * `/streak` — the streak and the two purchases that protect it.
 *
 * Reached from the streak chip on Home and from Profile. Deep-linkable, because
 * "your streak is at risk" is a notification that has to open something.
 *
 * The buy handlers are absent until the server owns the transaction. Freezes and
 * repairs spend coins and change a streak, and the client may never decide either
 * (ADR 0006) — an optimistic local purchase that the server later rejects takes coins
 * for nothing. The screen renders every state correctly and disables what it cannot
 * yet do, which is honest; a button that pretends to work is not.
 */

import { useMemo } from 'react'
import { repairAvailability, type RecoveryState } from '@worldquest/engines'
import { StreakScreen } from '../src/features/streak/StreakScreen.js'
import { useProgress } from '../src/features/home/useProgress.js'
import { useOnline } from '../src/lib/connectivity.js'

export default function StreakRoute() {
  const { data } = useProgress()
  const online = useOnline()
  const now = Date.now()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  /**
   * Streak length and coins come from the server. The recovery fields — freezes held,
   * the break date, the last repair — do NOT exist in the progress payload yet, so
   * they are stated as their honest defaults rather than guessed at.
   *
   * The consequence is visible and correct: `repairAvailability` returns `not-broken`,
   * so the repair card does not appear, and freezes read as zero held. Nothing lies.
   * When the columns land, this object is the only thing that changes.
   */
  const state = useMemo<RecoveryState>(
    () => ({
      current: data?.streak ?? 0,
      longest: data?.longestStreak ?? 0,
      lastActiveDate: '',
      freezesHeld: 0,
      brokenOn: null,
      lastRepairAt: null,
    }),
    [data],
  )

  return (
    <StreakScreen
      current={state.current}
      longest={state.longest}
      freezesHeld={state.freezesHeld}
      coins={data?.coins ?? 0}
      repair={repairAvailability(state, now, timeZone)}
      // The pre-break length, which is what a repair restores. `current` has already
      // been reset to 1 by the time this screen can be reached.
      restoreTo={state.longest}
      now={now}
      onBuyFreeze={undefined}
      onRepair={undefined}
      // H7, scoped. Only these two controls need a server; the rest of this screen —
      // and the rest of the app — works exactly as well without one.
      offline={!online}
    />
  )
}
