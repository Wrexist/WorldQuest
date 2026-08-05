/**
 * `/streak` — the streak and the two purchases that protect it.
 *
 * Reached from the streak chip on Home and from Profile. Deep-linkable, because
 * "your streak is at risk" is a notification that has to open something.
 *
 * The freeze IS the transaction now — `purchase_freeze` takes the coins and grants the
 * freeze in one statement, with the cap checked before the ledger row so a purchase at
 * the cap cannot take coins for nothing. That was the reason this button was disabled,
 * and it was disabled for as long as the endpoint did not exist: `freezes_held` has been
 * 0 on every row this product ever created, so the kindness rule inside `applyActivity`
 * that forgives one missed day had never once run for a real user.
 *
 * Repair is still absent, and honestly so. It needs `brokenOn` and `lastRepairAt`, and
 * nothing writes either: recording a break requires noticing a day with NO activity, and
 * that is the one thing a client cannot do for itself. (The engine function for it is
 * named in scripts/reachability.ts rather than here — that script greps this tree for
 * engine export names, so writing the symbol in a comment would make it look wired.)
 */

import { useCallback, useMemo } from 'react'
import { router } from 'expo-router'
import { currentStreak, repairAvailability, type RecoveryState } from '@worldquest/engines'
import { buyStreakFreeze } from '@worldquest/api'
import { StreakScreen } from '../src/features/streak/StreakScreen.js'
import { useProgress } from '../src/features/home/useProgress.js'
import { useOnline } from '../src/lib/connectivity.js'
import { invalidateProgress } from '../src/lib/query.js'
import { isConfigured, supabase } from '../src/lib/supabase.js'

export default function StreakRoute() {
  const { data } = useProgress()
  const online = useOnline()
  const now = Date.now()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  /**
   * `lastActiveDate` and `freezesHeld` come from the server now. They were stubbed to
   * `''` and `0` with a note saying they "do NOT exist in the progress payload yet" —
   * they existed in `streaks` the whole time and nothing selected them.
   *
   * `brokenOn` and `lastRepairAt` are still honest defaults, and the consequence is still
   * correct: `repairAvailability` returns `not-broken`, so the repair card does not
   * appear. Nothing writes those two, because a break is the absence of activity and only
   * a scheduled job can notice one.
   */
  const state = useMemo<RecoveryState>(
    () => ({
      current: data?.streak ?? 0,
      longest: data?.longestStreak ?? 0,
      lastActiveDate: data?.lastActiveDate ?? '',
      freezesHeld: data?.freezesHeld ?? 0,
      brokenOn: null,
      lastRepairAt: null,
    }),
    [data],
  )

  const onBuyFreeze = useCallback(() => {
    if (!isConfigured()) return
    // Not optimistic. A freeze is 400 coins and the server refuses at the cap and at an
    // overdraft, so showing it granted before the answer arrives is showing a purchase
    // that may not have happened — and unlike a cosmetic, a freeze that is not there is
    // discovered on the day it was supposed to save the run.
    void buyStreakFreeze(supabase())
      .then(() => invalidateProgress())
      .catch(() => {})
  }, [])

  return (
    <StreakScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      // What the streak IS today, not what the database last wrote. `streaks.current` is
      // only updated when a lesson lands, so a user who missed two days was being shown
      // the number they had before they missed them, right up until the next lesson reset
      // it under them.
      current={currentStreak(state, now, timeZone)}
      longest={state.longest}
      freezesHeld={state.freezesHeld}
      coins={data?.coins ?? 0}
      repair={repairAvailability(state, now, timeZone)}
      // The pre-break length, which is what a repair restores. `current` has already
      // been reset to 1 by the time this screen can be reached.
      restoreTo={state.longest}
      now={now}
      onBuyFreeze={isConfigured() ? onBuyFreeze : undefined}
      onRepair={undefined}
      // H7, scoped. Only these two controls need a server; the rest of this screen —
      // and the rest of the app — works exactly as well without one.
      offline={!online}
    />
  )
}
