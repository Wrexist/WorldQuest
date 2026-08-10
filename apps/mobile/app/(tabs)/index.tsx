/**
 * Home — the daily entry point, and the app's default route.
 *
 * Routes stay thin: fetch, compose, delegate. All of Home's layout lives in
 * `features/home/HomeScreen`, which is what the screenshot tooling renders and what
 * component tests mount. This file connects it to navigation and to data.
 */

import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { HomeScreen, type HomeProgress } from '../../src/features/home/HomeScreen.js'
import { useContent } from '../../src/lib/content.js'
import { useOnline } from '../../src/lib/connectivity.js'
import { useOptimisticProgress } from '../../src/features/home/useOptimisticProgress.js'
import { useDailyGoal } from '../../src/features/home/useDailyGoal.js'
import { useDailyQuest } from '../../src/features/quests/useDailyQuest.js'
import { SLOT_TITLE } from '../../src/features/quests/slots.js'
import { useT } from '../../src/lib/i18n.js'
import { worldProgress } from '@worldquest/engines'

/**
 * Zeroed rather than invented. A first launch shows the real empty state — and a
 * failed fetch shows it too, rather than numbers that would be a lie.
 */
const COLD_START: HomeProgress = {
  xpTotal: 0,
  coins: 0,
  streak: 0,
}

export default function HomeRoute() {
  const router = useRouter()
  const { shown, status, refreshFailed } = useOptimisticProgress()
  const online = useOnline()

  // The SAME call Explore makes, rather than a second count assembled here. Two
  // places counting the same thing agree until one of them changes — and these two
  // already disagreed: Home carried a hardcoded `factsTotal: 10` beside a comment
  // saying "the packs are five countries deep today". They are 65 countries and 259
  // facts, and nothing rendered the number, so nobody saw it was wrong.
  const { index, memory } = useContent()
  const world = useMemo(
    () => (index === null ? undefined : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  // The daily goal, finally connected to something. It was asked for in onboarding,
  // stored, shown in Settings, and read by nothing — `lessonsPerDay()` sat unused in
  // the engine, so choosing 5 minutes or 20 minutes changed precisely nothing.
  //
  // Behind a hook now rather than computed here, because the target has to HOLD for the
  // day: recomputed inline it moved every time the measured pace did, so finishing a
  // lesson could make the day's target bigger and the bar the user was filling longer.
  // See `useDailyGoal` for the whole story.
  const goal = useDailyGoal()

  /**
   * What the quest card actually says.
   *
   * `questTitle` was a prop on `HomeProgress` that nothing ever passed, so the card fell
   * through to `home:quest.empty` — "Start your first lesson" — on every render for every
   * user for ever. The app's default screen told somebody with a 40-day streak to start
   * their first lesson.
   *
   * The producer existed the whole time: `useDailyQuest()` composes today's five tasks on
   * the device and already drives the Quests tab and the lesson runner. The next
   * unfinished one is the answer to "what am I about to do", which is the question a card
   * with a Continue button under it is asking.
   *
   * The old sentence survives as the genuine first-launch case — no quest at all, or
   * nothing done anywhere yet — where it is true and is a warmer greeting than a task
   * name.
   */
  const t = useT()
  const { quest } = useDailyQuest()
  const started = (shown?.xpTotal ?? 0) > 0 || goal.done > 0
  const nextTask = quest?.tasks.find((task) => !task.complete)
  const questTitle =
    quest === null || !started
      ? undefined
      : nextTask === undefined
        ? t('quests:complete.title')
        : t(SLOT_TITLE[nextTask.slot])

  // `shown`, not the raw server row: it is the server's figures plus any lesson the
  // queue has not delivered yet. Before this, a lesson finished offline moved nothing on
  // this screen — the XP the summary card had just celebrated was invisible the second
  // the user tapped through to Home. See `useOptimisticProgress`.
  const progress: HomeProgress = shown
    ? {
        xpTotal: shown.xpTotal,
        // The prediction, not the spendable balance. Nothing on Home takes coins — the
        // Shop and the freeze button do, and both read `coins` — so this is a record,
        // and a record that ignored the lesson just finished disagreed with Profile,
        // which shows the same wallet one tab away.
        coins: shown.coinsIncludingPending,
        streak: shown.streak,
        ...(questTitle !== undefined ? { questTitle } : {}),
      }
    : COLD_START

  return (
    <HomeScreen
      progress={progress}
      loading={status === 'loading'}
      // The radio first, and the failed refresh second. This read
      // `isStale || status === 'error'`, and `staleTime` is 60 seconds — so Home told
      // anyone who left the tab open for a minute that they were offline. Meanwhile a
      // user who actually WAS offline saw nothing until the cache aged out, and a
      // build with no backend configured could never show the banner at all, which is
      // why every screenshot ever taken of this screen looked fine.
      //
      // `useOnline` is the same source the Shop's "buying is paused" notice reads, so
      // two screens can no longer disagree about whether the device is connected.
      isOffline={!online || refreshFailed || status === 'error'}
      onOpenStreak={() => router.push('/streak')}
      onStartLesson={() => router.push('/lesson')}
      goal={goal}
      world={world}
      onOpenWorld={() => router.push('/explore')}
    />
  )
}
