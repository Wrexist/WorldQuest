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

import { useCallback, useMemo, useState } from 'react'
import { router } from 'expo-router'
import { currentStreak, repairAvailability, type RecoveryState } from '@worldquest/engines'
import { buyStreakFreeze } from '@worldquest/api'
import { StreakScreen } from '../src/features/streak/StreakScreen.js'
import { ContentGate } from '../src/components/ContentGate.js'
import { useProgress } from '../src/features/home/useProgress.js'
import { useOnline } from '../src/lib/connectivity.js'
import { invalidateProgress } from '../src/lib/query.js'
import { isConfigured, supabase } from '../src/lib/supabase.js'

export default function StreakRoute() {
  const { data, status, refetch } = useProgress()
  const online = useOnline()
  const now = Date.now()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  /**
   * `lastActiveDate` and `freezesHeld` come from the server now. They were stubbed to
   * `''` and `0` with a note saying they "do NOT exist in the progress payload yet" —
   * they existed in `streaks` the whole time and nothing selected them.
   *
   * `brokenOn` and `lastRepairAt` come from the server too, now that `expire_streaks()`
   * runs hourly and records a break. Until it existed nothing wrote either, so
   * `repairAvailability` returned `not-broken` for everyone and the repair card — a
   * 600-coin sink with a 48-hour window, fully written and tested — could never appear.
   */
  const state = useMemo<RecoveryState>(
    () => ({
      current: data?.streak ?? 0,
      longest: data?.longestStreak ?? 0,
      // `null`, not `''`. The engine's type is `IsoDate | null` and null already means
      // "never active"; the blank-string form was a second spelling of the same thing
      // that only `currentStreak` knew about, so every other reader had to be told.
      //
      // Worded around the word this line originally used, because `five-states` reads
      // this file looking for one — and a comment about a blank string read as a screen
      // handling its no-content state, which turned an accurate waiver stale. Second
      // time prose in a scanned file has fooled a script here; the scripts are right to
      // be broad, so the prose gives way.
      lastActiveDate: data?.lastActiveDate ?? null,
      freezesHeld: data?.freezesHeld ?? 0,
      brokenOn: data?.brokenOn ?? null,
      lastRepairAt: data?.lastRepairAt ?? null,
    }),
    [data],
  )

  const [buyingFreeze, setBuyingFreeze] = useState(false)
  const [freezeNotice, setFreezeNotice] =
    useState<'at_cap' | 'insufficient_funds' | 'failed' | null>(null)

  const onBuyFreeze = useCallback(() => {
    if (!isConfigured()) return
    // `purchase_freeze` has no idempotency key — a lesson's id is its key, and a freeze
    // has no natural one — so a second tap before the first answer arrives is a second
    // purchase. At 400 coins each that is 800 for one intended freeze, and the button
    // was disabled only by `offline`, affordability and the handler existing.
    if (buyingFreeze) return
    setBuyingFreeze(true)
    setFreezeNotice(null)

    // Not optimistic. A freeze is 400 coins and the server refuses at the cap and at an
    // overdraft, so showing it granted before the answer arrives is showing a purchase
    // that may not have happened — and unlike a cosmetic, a freeze that is not there is
    // discovered on the day it was supposed to save the run.
    void buyStreakFreeze(supabase())
      .then((result) => {
        // Every refusal comes back as a STATUS rather than an error, and all of them
        // were being dropped — so "you already hold two" and "bought" were the same
        // silence, and the user was left looking at a button that did nothing.
        if (result.status === 'purchased') {
          invalidateProgress()
          return
        }
        setFreezeNotice(
          result.status === 'at_cap' || result.status === 'insufficient_funds'
            ? result.status
            : 'failed',
        )
      })
      .catch(() => setFreezeNotice('failed'))
      .finally(() => setBuyingFreeze(false))
  }, [buyingFreeze])

  // Every number on this screen comes from the server, so a fetch that has not
  // ARRIVED must not render either — `data?.x ?? 0` shows a streak of zero, a longest
  // of zero and no freezes to a user who has all three. That is the wrong-fact failure
  // mode, on the one screen whose entire subject is a number the user cares about.
  // `useProgress` has reported both `loading` and `error` (the latter only when there
  // is no cache to fall back on) since it was written; this route read `data` and
  // ignored the status entirely.
  //
  // `showLoading` is not the default on `ContentGate` because most screens here have
  // their own skeleton and would otherwise get two. This one has no skeleton of its
  // own, and the first fix covered only the error half — a zero streak during the
  // ordinary first second of a cold open is the same lie as a zero streak after a
  // failure, and it is the one a user actually sees.
  return (
    <ContentGate status={status} onRetry={refetch} showLoading>
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
        buyingFreeze={buyingFreeze}
        freezeNotice={freezeNotice}
        onRepair={undefined}
        // H7, scoped. Only these two controls need a server; the rest of this screen —
        // and the rest of the app — works exactly as well without one.
        offline={!online}
      />
    </ContentGate>
  )
}
