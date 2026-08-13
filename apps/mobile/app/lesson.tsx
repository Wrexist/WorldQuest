/**
 * The lesson runner, as a full-screen route outside the tabs.
 *
 * `/lesson` is deep-linkable on purpose — the daily reminder notification opens it
 * directly, and a push that lands the user on Home instead of in a lesson is a push
 * that costs a tap for no reason.
 */

import { router, useLocalSearchParams } from 'expo-router'
import { LessonScreen } from '../src/features/lesson/LessonScreen.js'
import { useProgress } from '../src/features/home/useProgress.js'
import { useEntitlement } from '../src/features/paywall/useEntitlement.js'
import { parseFocusParams } from '../src/features/lesson/focusParams.js'
import { useLessonFocus } from '../src/features/lesson/useLessonFocus.js'

export default function LessonRoute() {
  // `/lesson?mode=speed`. A query param rather than a second route: it is the same
  // runner, the same items and the same scoring — only the clock differs.
  const { mode, taster, facts, attr, entity, region, min, max, len } = useLocalSearchParams<{
    mode?: string
    taster?: string
    facts?: string
    attr?: string
    entity?: string
    region?: string
    min?: string
    max?: string
    len?: string
  }>()

  /**
   * What this lesson is allowed to ask about.
   *
   * Read from the URL so a focused lesson is a LINK: `/practise` builds one, the country
   * page sends `?entity=SE`, the region page sends `?region=EU`, and none of them has to
   * write to a store the runner reads back. Absent params mean the mixed lesson, which is
   * every existing caller and every existing notification.
   *
   * Which of those answers wins, and when onboarding's stored answers get to fill a gap,
   * is policy and lives in `useLessonFocus`. This route hands it the params.
   */
  const focus = useLessonFocus({ facts, attr, entity, region, min, max, len })
  // `length` is not focus and not policy — it is one URL param read straight through to
  // the runner, so it stays here rather than riding along in the hook's return.
  const { length } = parseFocusParams({ len })
  // Fetched here rather than in the screen: server state belongs to the route, and
  // the runner should stay mountable without a QueryClientProvider.
  const { data } = useProgress()
  // Read here so the hand-off can skip the ask entirely for someone who has already
  // paid. Asking an existing subscriber to subscribe is the fastest way to make a
  // paying user feel like a target, and it earns nothing.
  const { isPremium } = useEntitlement()

  return (
    <LessonScreen
      mode={mode === 'speed' ? 'speed' : 'normal'}
      {...(focus ? { focus } : {})}
      {...(length !== undefined ? { length } : {})}
      // Set only by the onboarding hand-off. Finishing this one lesson is the single
      // biggest predictor of a user coming back, so it gets its own event rather than
      // being inferred later from "first lesson_completed", which is wrong for anyone
      // who reinstalls.
      isTaster={taster === '1'}
      coins={data?.coins ?? 0}
      onExit={(summary) => {
        // The taster is the value moment, and this is the instant after it: a real
        // lesson finished, a real summary read, and the user has never been asked for
        // anything. Paywalls placed after a measurable value moment get 2.1× the trial
        // starts of an immediate hard gate, and this one is still only three minutes
        // from install — so it is both "at the start" and "after the value".
        //
        // `replace`, not `push`: the taster is over and there is nothing to go back to.
        // The paywall is dismissible on its first frame and never gates a lesson.
        if (taster === '1' && !isPremium) {
          // The ids travel, not the count: page 1 shows the flags of the countries
          // this user just placed, and a number cannot draw a flag.
          router.replace(
            `/paywall?source=onboarding&countries=${encodeURIComponent(summary.practised.join(','))}`,
          )
          return
        }
        // The day's ritual, finished. AFTER the summary rather than instead of it: the
        // summary is about the lesson — what you got right and what it earned — and the
        // celebration is about the day. Collapsed into one screen the quest bonus would
        // read as part of the lesson's XP, which is the one thing it is not.
        //
        // `replace`, so the lesson is off the stack before the celebration draws and
        // "back" from it cannot return the user to a summary they have dismissed.
        if (summary.questCompleted) {
          router.replace('/quest-complete')
          return
        }
        // Opened from a notification there is no history to pop, and `back()` would
        // do nothing at all — leaving the user stuck on the summary.
        if (router.canGoBack()) router.back()
        else router.replace('/')
      }}
    />
  )
}
