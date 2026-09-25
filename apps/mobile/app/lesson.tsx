/**
 * The lesson runner, as a full-screen route outside the tabs.
 *
 * `/lesson` is deep-linkable on purpose — the daily reminder notification opens it
 * directly, and a push that lands the user on Home instead of in a lesson is a push
 * that costs a tap for no reason.
 */

import { useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { LessonScreen } from '../src/features/lesson/LessonScreen.js'
import { useProgress } from '../src/features/home/useProgress.js'
import { useEntitlement } from '../src/features/paywall/useEntitlement.js'
import { useOnboarding } from '../src/features/onboarding/useOnboarding.js'
import { SELLING } from '../src/features/paywall/purchases.js'
import { hrefFor, planAfterLesson } from '../src/features/lesson/afterLesson.js'
import { lessonsEverCompleted, lessonsToday } from '../src/features/profile/useWeekActivity.js'
import { peekUnlocks } from '../src/features/achievements/pending.js'
import {
  mayOfferProfileAfterNextLesson,
  profileAsksShown,
  shouldOfferProfile,
} from '../src/features/account/profileAsk.js'
import { useAccountStatus } from '../src/features/account/useAccountStatus.js'
import { useOnline } from '../src/lib/connectivity.js'
import { isD1 } from '../src/lib/backendConfig.js'
import { receiptSoon } from '../src/lib/d1-lessons.js'
import { parseFocusParams } from '../src/features/lesson/focusParams.js'
import { useLessonFocus } from '../src/features/lesson/useLessonFocus.js'
import { loadCourse } from '../src/features/course/course.js'
import { courseLesson } from '../src/features/course/courseLesson.js'
import { recordCourseLesson } from '../src/features/course/progress.js'

/**
 * How long the summary's Continue waits for the server's receipt on a D1 build.
 *
 * Long enough for one round trip on an ordinary connection, short enough that a slow
 * one is not felt: past it, the device's own reading decides and nothing is lost.
 */
const RECEIPT_WAIT_MS = 1500

export default function LessonRoute() {
  // `/lesson?mode=speed`. A query param rather than a second route: it is the same
  // runner, the same items and the same scoring — only the clock differs.
  const { mode, taster, facts, attr, entity, region, min, max, len, node, review } = useLocalSearchParams<{
    mode?: string
    taster?: string
    facts?: string
    attr?: string
    entity?: string
    region?: string
    min?: string
    max?: string
    len?: string
    /** A step on the Home course path — `courseLesson.ts`. */
    node?: string
    /** A finished course's review. */
    review?: string
  }>()

  /**
   * A lesson started from the course path: which step, and what that step asks about.
   *
   * The URL names the NODE and the course supplies its focus, so a link cannot play one
   * step and credit another (`courseLesson.ts`). Resolved once per mount — the course is
   * static and the params cannot change under a lesson.
   */
  const [fromCourse] = useState(() => {
    const loaded = loadCourse()
    return loaded.ok ? { course: loaded.course, lesson: courseLesson(loaded.course, { node, review }) } : null
  })
  const courseStep = fromCourse?.lesson

  /**
   * What this lesson is allowed to ask about.
   *
   * Read from the URL so a focused lesson is a LINK: `/practise` builds one, the country
   * page sends `?entity=SE`, the region page sends `?region=EU`, and none of them has to
   * write to a store the runner reads back. Absent params mean the mixed lesson, which is
   * every existing caller and every existing notification.
   *
   * Which of those answers wins, and when onboarding's stored answers get to fill a gap,
   * is policy and lives in `useLessonFocus`. This route hands it the params — a course
   * step's own focus in place of the URL's, as the same `entity`/`attr` strings.
   */
  const focus = useLessonFocus(
    courseStep !== undefined ? { ...courseStep.params, len } : { facts, attr, entity, region, min, max, len },
  )
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
  const { state: onboarding } = useOnboarding()
  // Read once, before the lesson can record itself: whether today already counted.
  // The device's own lesson log, not the server's streak, because the question is
  // "is this the first lesson finished today" and that is known here, offline or not.
  const [countedTodayBefore] = useState(() => lessonsToday() > 0)
  /**
   * Whether this lesson could end in "Create a profile" (`profileAsk.ts`).
   *
   * Read once, before the lesson records itself, and used to decide whether to look the
   * account up at all: the answer only matters for an adult guest's first two lessons,
   * and a round trip on every lesson for the sake of those two would be waste. Starting
   * it now gives the lookup the whole lesson to arrive.
   */
  const [profileMayAsk] = useState(() =>
    mayOfferProfileAfterNextLesson({
      lessonsEndedBefore: lessonsEverCompleted(),
      timesShown: profileAsksShown(),
      isChild: onboarding.isChild,
    }),
  )
  const account = useAccountStatus({ enabled: profileMayAsk })
  const online = useOnline()
  const leaving = useRef(false)

  return (
    <LessonScreen
      mode={mode === 'speed' ? 'speed' : 'normal'}
      {...(focus ? { focus } : {})}
      // A place, topic or band in the link is the learner's choice; quest facts and
      // onboarding's start region are the app's suggestion (see `useLessonFocus`). A
      // course step is the learner's next task, so it is a choice too: on a D1 build it
      // starts offline only from a ticket saved for that step, and otherwise says it
      // needs a connection rather than playing some other lesson under its name. Review
      // of a finished course is the app's suggestion. Legacy builds compose locally and
      // read none of this.
      focusIsExplicit={
        courseStep !== undefined
          ? courseStep.explicit
          : [attr, entity, region, min, max].some((value) => value !== undefined)
      }
      {...(length !== undefined ? { length } : {})}
      // Set only by the onboarding hand-off. Finishing this one lesson is the single
      // biggest predictor of a user coming back, so it gets its own event rather than
      // being inferred later from "first lesson_completed", which is wrong for anyone
      // who reinstalls.
      isTaster={taster === '1'}
      coins={data?.coins ?? 0}
      // Out of a lesson that never started (offline with nothing saved, a failure, an
      // empty focus). Nothing was answered, so there is nothing to record or celebrate.
      onLeave={() => {
        if (router.canGoBack()) router.back()
        else router.replace('/')
      }}
      onExit={(summary) => void (async () => {
        // One exit per lesson: the wait below must not let a second tap navigate twice.
        if (leaving.current) return
        leaving.current = true
        // On a D1 build, what the server decided wins: whether this lesson finished the
        // quest (its coins are paid only then) and whether it extended the streak. Asked
        // for briefly; offline, the device's own reading below stands.
        const receipt = isD1() ? await receiptSoon(summary.lessonId, RECEIPT_WAIT_MS) : null
        // Finished rather than ended early — the server's reading when it answered in
        // time, the device's otherwise. The after-lesson plan and the course path read the
        // same value, so a lesson cannot move the path without also counting as the day's.
        const completed = receipt?.finished ?? summary.completed
        // A step on the course path earns its lesson here, before Home is shown again, so
        // the path Home draws is the one this lesson produced. Only a finished lesson, and
        // only on a step that is open (`creditLesson` refuses a locked one).
        if (completed && fromCourse !== null && courseStep?.kind === 'node') {
          recordCourseLesson(fromCourse.course, courseStep.nodeId)
        }
        // Duolingo's rhythm: the lesson (summary, already shown), then the day (the
        // streak), then the daily quest, then any badge, then anything we want from the
        // learner. The order and its reasons live in `afterLesson.ts`.
        //
        // Badges waiting to be seen — this lesson's, or a server unlock that arrived
        // while nobody was looking. Read, not taken: the card that shows them clears
        // them, so closing the app here loses nothing.
        const unlocked = peekUnlocks()
        // The paywall follows the taster only when there is something to sell. The
        // purchase port is not installed in this build, and ending a first lesson on
        // "there's nothing to buy here yet" is a dead end App Review rejects (2.1) and
        // a learner reads as a bait-and-switch. Never to a subscriber, never to a child.
        const steps = planAfterLesson({
          completed,
          countedTodayBefore: receipt?.streak ? !receipt.streak.extended : countedTodayBefore,
          questCompleted: receipt?.quest ? receipt.quest.coins > 0 : summary.questCompleted,
          unlocked: unlocked.length,
          // Asked now rather than at the start, because this lesson has just been counted
          // and the account lookup has had the whole lesson to answer.
          offerProfile:
            profileMayAsk &&
            shouldOfferProfile({
              lessonsEnded: lessonsEverCompleted(),
              timesShown: profileAsksShown(),
              isChild: onboarding.isChild,
              account: !account.known ? 'unknown' : account.linked ? 'linked' : 'guest',
              online,
            }),
          offerPaywall: taster === '1' && SELLING && !isPremium && onboarding.isChild !== true,
        })
        if (steps.length > 0) {
          // `replace`, so "back" from a celebration cannot return to a dismissed summary.
          router.replace(hrefFor(steps, { countries: summary.practised, unlocks: unlocked }))
          return
        }
        // Opened from a notification there is no history to pop, and `back()` would
        // do nothing at all — leaving the user stuck on the summary.
        if (router.canGoBack()) router.back()
        else router.replace('/')
      })()}
    />
  )
}
