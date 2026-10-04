import { LessonIntroduction } from './LessonIntroduction.js'
import { visualQuestion } from './visualQuestion.js'
import { createThemeStyles } from '@worldquest/design'
/**
 * The lesson screen — mockup screens 5 and 6.
 *
 * Phase 1 is deliberately ugly: real logic, real data, minimal polish. Design lands
 * in weeks 3–6 (docs/plan/build-order.md). What is NOT deferred is anything that is
 * expensive to retrofit — every string is a key, every colour is a token, every
 * control is labelled, and the five states are all present.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  AnswerOption,
  Button,
  ClaySurface,
  layout,
  ProgressBar,
  radius,
  Skeleton,
  space,
  Spacer,
  squircle,
  text,
  useRiseIn,
} from '@worldquest/design'
import {
  answeringMs,
  canRevive,
  currentRun,
  inReview,
  lastAnswerOf,
  lessonLength,
  MAX_TYPED_LENGTH,
  placementLevel,
} from '@worldquest/engines'
import type { LessonFocus } from '@worldquest/engines'
import type { ContentIndex, GradeResult, LessonState, Question } from '@worldquest/engines'
import { Art } from '../../components/Art.js'
import { FailureState } from '../../components/FailureState.js'
import { Flag } from '../../components/Flag.js'
import { LessonAtlas, lessonShowsAtlas } from '../atlas/LessonAtlas.js'
import { useLesson } from './hooks/useLesson.js'
import { useAnswerCues } from './hooks/useAnswerCues.js'
import { LessonSummary, type PractisedCountry } from './LessonSummary.js'
import { SPEED_SECONDS } from './modes.js'
import { OutOfHearts } from './OutOfHearts.js'
import { payForContinue } from './continuePurchase.js'
import { Paused } from './Paused.js'
import { recordPace, useItemPace } from './usePace.js'
import { recordAccuracy, recentAccuracy } from './useAccuracy.js'
import { hapticCelebrate, hapticSelect } from '../../lib/haptics.js'
import { soundLevelUp } from '../../lib/sound.js'
import { recordLessonForAchievements, recordQuestCompleted } from '../achievements/progress.js'
import { queueUnlocks } from '../achievements/pending.js'
import { todaysQuest } from '../quests/useDailyQuest.js'
import { recordQuestEvent } from '../quests/questProgress.js'
import { useContent } from '../../lib/content.js'
import { currentLocale, tContent, useT } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { recordLessonCompleted } from '../profile/useWeekActivity.js'
import { rememberDailyChest } from '../streak/dailyChest.js'
import { useDailyGoal } from '../home/useDailyGoal.js'
import { recordSessionHour } from '../../lib/notifications.js'
import { localDay } from '../../lib/day.js'
import { recordPredictedAward } from '../../lib/awards.js'
import { enqueueLesson } from '../../lib/sync.js'
import { isD1 } from '../../lib/backendConfig.js'
import { prefetchLessons, submitLesson as submitD1Lesson } from '../../lib/d1-lessons.js'
import { useScreenReaderStatus } from '../../lib/screenReader.js'
import { useDifficultyRamp } from './useDifficultyRamp.js'
import { usePreferences } from '../settings/usePreferences.js'
import { useD1Lesson } from './hooks/useD1Lesson.js'
import { ReportSheet } from './ReportSheet.js'
import { TypedAnswer } from './TypedAnswer.js'
import { PairsBoard } from './PairsBoard.js'
import { withAccount } from '../../lib/backend.js'
import { Icon } from '../../components/Icon.js'
import { Stat } from '../../components/Stat.js'
import { EarnedReward } from './EarnedReward.js'
import { AdventureArt } from '../../components/AdventureArt.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'

type ScreenState = 'loading' | 'error' | 'unavailable' | 'empty' | 'offline-start' | 'ready'

/**
 * The rail down the leading edge of the answers.
 *
 * Four, because every multiple-choice template in the pack is two or four options and
 * `BADGES[index]` is undefined past the end — which `AnswerOption` reads as "no badge"
 * rather than as an empty circle. A five-option template would get four badges and one
 * bare row, which is visibly wrong in a screenshot and is the right way for it to fail:
 * loudly, in the place someone is looking, rather than by crashing a lesson.
 */
const BADGES = ['A', 'B', 'C', 'D'] as const

/**
 * How many right in a row before the feedback is allowed to call it a roll.
 *
 * Three, because two is a coincidence. Below this the praise says something true and
 * unremarkable instead — see the copy note on `lesson:feedback.correct.streak`.
 *
 * The progress bar takes its run colour at the same count, so the bar and the sentence
 * under "Perfect!" never disagree about whether this is a roll.
 */
const STREAK_PRAISE = 3

/**
 * The revealed flag on the feedback sheet.
 *
 * Smaller than `FLAG_PROMPT_WIDTH`: as a prompt the flag is the question and gets the
 * room to be studied, and here it shares a sheet with a verdict, two reward chips, a
 * mascot and the way onward. Big enough to read the design, small enough not to push
 * the Continue button off a 320.
 */
const REVEAL_WIDTH = 96

/**
 * How wide a flag drawn as an ANSWER is.
 *
 * Smaller than the reveal and much smaller than the prompt, because there are four of
 * them stacked and they compete with nothing: the question is already read, and what is
 * being asked of the eye is a comparison between four pictures rather than a study of
 * one.
 *
 * 64 rather than 72, because these sit two to a row now. A cell is 48 % of the content
 * column, which at 320 wide is about 121pt once the card's own padding is taken out, and
 * the badge and its gap claim 42 of those. 64 leaves margin at the tightest size the app
 * supports; 72 fit only by rounding, and a flag that overflows its cell is a flag with a
 * cropped hoist, which on a question about what a flag looks like is the answer being
 * damaged.
 */
const OPTION_FLAG_WIDTH = 64

/**
 * How wide the flag in an image question is drawn.
 *
 * 200pt, and the asset is rasterised at exactly 3x of it (`scripts/build-flags.cjs`)
 * so it is never upscaled. Big enough that the question is a fair one — telling Mexico
 * from Italy is a question about the coat of arms, and at tile size that is a smudge —
 * and small enough that the four answers below it stay on screen at 320pt.
 */
const FLAG_PROMPT_WIDTH = 200

/**
 * How wide the mascot is, as a fraction of the sheet.
 *
 * A ratio rather than a constant: 150 points is 38 % of a 390 screen and 47 % of a 320
 * one, and the small phone got a mascot half the width of the sheet. Against the SHEET's
 * width, not the window's: above `maxContentWidth` the sheet stops growing, and a mascot
 * that kept scaling with a tablet's screen would burst out of it.
 *
 * He stands beside the words, in the layout. He used to be pinned behind the Continue
 * button, to lean out from behind it as the reference does, and the button covered his lower
 * half: on a miss, a head and shoulders over a bar. That needed a latch that swapped his
 * side when the reward chips wrapped into his column; in flow there is nothing to collide
 * with, so the latch is gone and the chips just wrap inside their own column.
 */
const MASCOT_OF_SHEET = 0.3

/**
 * Smaller on a phone as short as an SE: the sheet is as tall as its mascot, and at 0.3 the
 * sheet took the fourth option's row at 320 x 568. Measured, not chosen — the 0.22 that
 * leaves all four options above the sheet is the largest that does.
 */
const MASCOT_OF_SHORT_SHEET = 0.22
const VERY_SHORT_SCREEN = 640

/**
 * A phone short enough that the question does not fit at its comfortable size.
 *
 * Measured, not chosen: at 320 wide the prompt, a locator map and four options need about
 * 690pt. So anything under 700 is short — which includes every 320-wide phone there is
 * (iPhone SE 1 is 320×568) and the 375×667 generation, iPhone SE 2 and 3 and the 8.
 *
 * This number is the correction to a claim that was written twice below and was wrong
 * both times: "four answers still fit below it at 320pt". They fit at 320×700, which is
 * the height this repo's screenshot harness happens to use and is a height no 320-wide
 * phone has ever had. At 320×568 the fourth option sat at 559–618 of 568 — reachable by
 * scrolling, and on a quiz an option you cannot see is one you do not consider.
 */
const SHORT_SCREEN = 900

/** Compact question layout for the shortest phones; answers still submit on tap. */
const SHORT_QUESTION_HEIGHT = 600

/*
 * The locator's size used to be four width constants (208/132/240/180) for a fixed 4:3
 * picture. The atlas spans the column instead and takes its HEIGHT from the screen —
 * see `atlasHeight` below, which keeps the same budget those constants defended.
 */

/**
 * What the lesson tells whoever mounted it on the way out.
 *
 * The route decides where the user goes next, and after the taster that decision
 * depends on what just happened — the paywall's first page is about the countries
 * this lesson covered. Passing the count out beats the route re-deriving it from
 * content it does not have.
 */
export type LessonExit = {
  /** Entity ids, in the order they were practised. Stable codes, safe in a URL. */
  readonly practised: readonly string[]
  /**
   * Whether THIS lesson finished the daily quest.
   *
   * Computed here because this is where it is known — the runner is what advances the
   * quest, and `recordQuestEvent` returns `becameComplete` for exactly this reason. It
   * used to be consumed by a `track()` call and dropped, so the one moment the whole
   * daily loop builds to reached nothing that could show it to the user.
   *
   * Carried out rather than acted on: this screen does not navigate, the route does.
   */
  readonly questCompleted: boolean
  /**
   * Finished rather than ended early. Only a finished lesson is the day's activity, so
   * only a finished lesson earns the streak beat that follows the summary.
   */
  readonly completed: boolean
  /** The lesson's id — the ticket's on a D1 build — for asking after its receipt. */
  readonly lessonId: string
}

export function LessonScreen({
  onExit,
  onLeave,
  mode = 'normal',
  coins = 0,
  isTaster = false,
  focus,
  focusIsExplicit = false,
  courseNode,
  length,
  placement,
}: {
  onExit: (summary: LessonExit) => void
  /**
   * Leave a lesson that never started — offline with nothing saved, a failure, or a focus
   * with nothing in it.
   *
   * The route is a full-screen modal with the back gesture off (so a swipe cannot discard
   * answers), which left those three screens with no way out on iOS but Retry. A course
   * step is an explicit focus, so pressing Home's primary action on a plane before its
   * lesson was saved lands on one of them; it has to lead back. Absent draws no button.
   */
  onLeave?: (() => void) | undefined
  /** `speed` runs the same items against a clock. Scoring is unchanged. */
  mode?: 'normal' | 'speed'
  /**
   * The user's coin balance, for the out-of-hearts fork.
   *
   * A prop rather than a `useProgress()` call inside: that is server state behind
   * TanStack Query, and fetching it here would make the whole lesson runner
   * unmountable without a QueryClientProvider — for a number one rare branch reads.
   * Routes fetch, screens delegate (apps/mobile/CLAUDE.md).
   */
  coins?: number
  /**
   * True only for the one lesson handed over from onboarding.
   *
   * Finishing it is the single biggest predictor of a user coming back, so it gets
   * its own event. Inferring it later from "the first `lesson_completed` we ever saw"
   * would be wrong for every reinstall, and activation numbers that quietly count
   * reinstalls are worse than no activation numbers.
   */
  isTaster?: boolean
  /**
   * What the user chose to practise, from the picker. Absent means the mixed lesson.
   *
   * The runner does nothing with it beyond handing it to the composer — the same items,
   * the same scheduler, the same scoring, drawn from a smaller pool. A focused lesson is
   * not a different mode; it is the same lesson about less.
   */
  focus?: LessonFocus | undefined
  /**
   * Whether `focus` is the learner's own choice (a country, region, topic or difficulty
   * from a picker or a link) rather than one implied by onboarding or the daily quest.
   * On a D1 build only an implied focus may start from a saved lesson when offline.
   */
  focusIsExplicit?: boolean | undefined
  /**
   * The course step this lesson is for, when it was started from the path (a step, or
   * practice of a finished one). Sent with the D1 ticket so the Worker counts the lesson
   * for that step: its focus alone may be another step's too.
   */
  courseNode?: string | undefined
  /**
   * How many questions, when the user asked for a number.
   *
   * Absent keeps the measured default: `lessonLength(itemMs)` sizes a lesson to about two
   * minutes for THIS user, which is what makes "five minutes a day" a real promise. A
   * chosen length overrides that on purpose — someone with four minutes on a bus has told
   * us something the pace estimate cannot know.
   */
  length?: number | undefined
  /**
   * This lesson is the level check: ten questions across the five levels, issued by the Worker,
   * played with no hearts (a check that costs hearts measures nerve), and on finishing it sets
   * where lessons start. It is otherwise a lesson like any other — graded, scheduled and
   * rewarded by the same code — so what the learner answers still counts.
   */
  placement?: boolean | undefined
}) {
  const { colors, styles } = useThemeValues()
  const { set: setPreference } = usePreferences()
  const t = useT()
  const dailyGoal = useDailyGoal()
  const { index, memory, status, reload, isOffline } = useContent()
  const [studying, setStudying] = useState(false)
  const [screen, setScreen] = useState<ScreenState>('loading')
  // "Report a problem" open over the answer just given. Only where a backend takes
  // reports (the Worker): a link that could only fail is a link not to show.
  const [reporting, setReporting] = useState(false)

  // The sheet stops widening at `maxContentWidth`, so the mascot measures against that
  // rather than against a tablet's whole screen.
  const { width, height } = useWindowDimensions()
  const sheetWidth = Math.min(width, layout.maxContentWidth)
  /**
   * Short phones get a tighter question, so all four options are on screen at once.
   *
   * Height rather than width, because this is the one screen in the app whose content
   * must fit rather than scroll: an answer the user has to scroll to find is an answer
   * they answer without. Everything it changes is decoration and breathing room; nothing
   * it changes is a target size, so the 44pt floor holds at both settings.
   */
  const compact = height < SHORT_SCREEN
  const shortQuestion = height < SHORT_QUESTION_HEIGHT
  // The atlas spans the content column, as the reference draws it, and stops widening
  // where the rest of the lesson does.
  const atlasWidth = Math.min(width - space[4] * 2, layout.maxContentWidth)

  /**
   * Bringing the answer back into view when the feedback sheet arrives.
   *
   * The sheet is a sibling below the scroll view, not an overlay — so when it appears it
   * takes real height and the scroll viewport shrinks by that much. On a phone the
   * question, its map and four options already overflow, so the options the user was
   * just looking at get pushed under the sheet: read off a device, "japansk yen" — the
   * CORRECT answer, freshly marked — was behind the card that had just said "Perfekt!".
   *
   * A learning app that hides which one was right at the exact moment it says whether
   * you were right has failed at the only thing the screen is for. Scrolling the options
   * block to the top of what is left is the cheapest correct answer: after answering, the
   * prompt and the illustration have done their job and the options are the content.
   *
   * Not `scrollToEnd`, which was the first attempt — it pins the LAST option to the
   * bottom, so with four options and a short viewport the first two go off the top, and
   * the correct one is hidden again whenever it happens to be first.
   */
  /**
   * Set by the end-of-lesson effect when this lesson landed the quest's last task.
   *
   * A ref rather than state: it is read by the summary's exit handler and setting it
   * must not re-render the summary while its own entrance is playing.
   */
  const questCompleted = useRef(false)
  const scroller = useRef<ScrollView>(null)
  const [globeGestureActive, setGlobeGestureActive] = useState(false)
  const optionsTop = useRef(0)
  const optionsBottom = useRef(0)
  /** The scroll view's own height: it shrinks when the feedback sheet mounts below it. */
  const viewport = useRef(0)
  const mascot = Math.round(sheetWidth * (height < VERY_SHORT_SCREEN ? MASCOT_OF_SHORT_SHEET : MASCOT_OF_SHEET))


  // Sized from the user's own pace, not a hardcoded ten. `lessonLength` aims at a
  // two-minute lesson so that "five minutes a day" is a real promise rather than a
  // number in Settings — see features/lesson/usePace.ts for why this was inert.
  const itemMs = useItemPace()
  /**
   * Where the questions come from.
   *
   * A D1 build plays a lesson the server issued, because the Worker grades only lessons
   * it issued (the answer key never has to be trusted from a device). A legacy build
   * composes its own. Decided at bundle time, so it cannot change under a lesson.
   */
  const remoteLessons = isD1()
  // Asked for only once the platform has said whether a screen reader is on: the
  // server issues the lesson for one presentation, and it cannot be recomposed after.
  const screenReaderStatus = useScreenReaderStatus()
  const screenReaderOn = screenReaderStatus === true
  // The plain way of asking first for someone just starting, harder shapes as they go.
  const { maxModifier, introduceFrom } = useDifficultyRamp()
  const remote = useD1Lesson(remoteLessons && screenReaderStatus !== null, {
    count: length ?? lessonLength(itemMs),
    locale: currentLocale() === 'sv' ? 'sv' : 'en',
    screenReader: screenReaderOn,
    maxModifier,
    introduceFrom,
    focus,
    explicitFocus: focusIsExplicit,
    node: courseNode,
    ...(placement === true && remoteLessons ? { placement: true as const } : {}),
  })
  const issued = useMemo<readonly Question[]>(() => {
    if (remoteLessons) return remote.lesson?.questions ?? []
    if (status !== 'ready' || !index) return []
    return index.compose({
      count: length ?? lessonLength(itemMs),
      maxModifier,
      introduceFrom,
      ...(focus ? { focus } : {}),
    })
  }, [remoteLessons, remote.lesson, status, index, itemMs, focus, length, maxModifier, introduceFrom])
  // A speed round is a race against a clock per question, and a board is one sitting over four.
  // Each of a board's questions is also a plain four-option question with the same answer key, so
  // the round simply plays them as that: nothing about grading or the ticket changes.
  const questions = useMemo<readonly Question[]>(
    () => (mode === 'speed' ? issued.map(({ group: _group, ...q }) => q) : issued)
      .map(question => visualQuestion(question, index?.index, screenReaderOn)),
    [issued, mode, index, screenReaderOn],
  )

  const handleComplete = useCallback((state: LessonState, optimistic: GradeResult) => {
    /**
     * Today's quest, composed once and used twice.
     *
     * It goes UP with the submission as well as advancing the local copy below, because
     * the reward is the server's to pay and the server cannot compose the quest itself:
     * generation partitions facts by what was due at that moment, and these very answers
     * have moved those dates. The first submission of a local day pins these five tasks
     * server-side and everything that pays is decided from `review_log` and `lessons`.
     *
     * `memory` is the pre-lesson memory, which is exactly what the screen composed from —
     * so what is sent is the quest the user was actually shown.
     */
    const quest =
      index === null ? null : todaysQuest(index.index, memory, Date.now(), recentAccuracy())

    // The level check: where lessons start follows what was answered, set once, and only if
    // enough was answered to say (leaving early changes nothing). Written here, with the other
    // things that happen exactly once when a lesson ends.
    if (placement === true && state.phase === 'summary') {
      const level = placementLevel(state.answers, state.questions)
      if (level !== null) setPreference('startLevel', level)
    }

    if (remoteLessons) {
      // The Worker grades what it issued: the answers go to the D1 queue under the
      // ticket's id — durably before this returns, never waiting on the network — and a
      // few more lessons are fetched for the next offline start. An early exit sends
      // the answered prefix; the server decides whether it was a finished lesson.
      if (remote.lesson) {
        void submitD1Lesson(remote.lesson, state.answers).then(() =>
          prefetchLessons({ count: remote.lesson!.request.count, locale: remote.lesson!.request.locale, screenReader: screenReaderOn, maxModifier, introduceFrom }),
        )
      }
    } else {
      // Enqueue, never await. A lesson finishing must not depend on the network —
      // the queue replays it whenever connectivity returns.
      enqueueLesson({
        lessonId: state.lessonId,
        kind: 'lesson',
        startedAt: state.startedAt ?? Date.now(),
        answers: state.answers,
        heartsLost: state.heartsLost,
        ...(quest !== null
          ? {
              quest: {
                // The day the device composed it for. The server decides which day to
                // RECORD under and only compares this — a lesson that spans local midnight
                // arrives on a new day carrying the old day's tasks, and pinning those
                // would make the new day's quest unpayable.
                date: quest.date,
                tasks: quest.tasks.map((task) => ({
                  slot: task.slot,
                  target: task.target,
                  factIds: task.factIds,
                  // `exactOptionalPropertyTypes` — `goal` is only on the perform slot, and
                  // spreading an explicit `undefined` is not the same as omitting it.
                  ...(task.goal !== undefined ? { goal: task.goal } : {}),
                })),
              },
            }
          : {}),
      })
    }
    // Local, immediate, and independent of the queue. The weekly chart on Profile
    // must be right the moment the lesson ends — waiting for the server round trip
    // would show an empty week to anyone who finishes a lesson offline.
    if (state.phase === 'summary') {
      recordLessonCompleted()
      rememberDailyChest({ day: localDay(new Date()), lessonId: state.lessonId,
        xp: optimistic.xpAwarded, coins: optimistic.coinsAwarded })
    }
    // What time of day this person actually practises, which is what the daily
    // reminder's hour is learned from (`notifications.md` §6). Recorded here rather
    // than derived from the activity log because that log stores a DAY and a count —
    // the hour is a different fact and was never being kept.
    recordSessionHour()
    /**
     * The same argument as the line above, for the numbers rather than the chart.
     *
     * `optimistic` is the full local grade — the figures the summary card is about to
     * render as "+14 XP" — and until now it went no further than this screen. XP, coins
     * and the streak all came from the server and nowhere else, so a lesson finished on
     * a plane moved nothing anywhere: Profile said "Nothing to show yet" to somebody who
     * had just done one.
     *
     * `may render optimistically; may never decide` (ADR 0006) is the rule, and this is
     * the half that had never been built — `reconcile()` has always existed to correct a
     * prediction and nothing produced one. The server still decides; this is what the
     * user looks at while it does.
     */
    recordPredictedAward({
      lessonId: state.lessonId,
      xp: optimistic.xpAwarded,
      coins: optimistic.coinsAwarded,
      localDay: localDay(new Date()),
    })
    hapticCelebrate()
    soundLevelUp()
    // The user's pace, from the answers just given. Sizes every later lesson.
    recordPace(state.answers)
    // And how well they did, which scales the quest's fifth slot. Recorded AFTER the
    // quest above was composed, deliberately: `recentAccuracy` excludes today so the
    // figure cannot move mid-day, and taking the sample before composing would not
    // change that but would make the ordering look like it mattered when it does not.
    recordAccuracy(state.answers)

    // Achievements, evaluated on device. Optimistic like the XP above — the server
    // is still the authority on the coins an unlock pays out (ADR 0006). Without
    // this the achievements screen could never show a single unlock.
    const durationMs = Date.now() - (state.startedAt ?? Date.now())
    const unlocked = recordLessonForAchievements({
      accuracy: optimistic.accuracy,
      durationMs,
      at: Date.now(),
    })
    // Queued rather than announced. Until this line an unlock produced an analytics event
    // and nothing a user could see — the whole reward loop for thirty achievements was a
    // row in a dashboard. The after-lesson chain reads the queue when the summary's
    // Continue is pressed and gives each unlock a card of its own (`afterLesson.ts`).
    //
    // Not on a D1 build: there the server decides each tier exactly once per account and
    // its receipts queue the cards (`d1-lessons.ts`). Queuing the device's own reading
    // too would celebrate one badge twice, once from each side.
    if (!remoteLessons) queueUnlocks(unlocked.map((u) => ({ achievementId: u.achievementId, tier: u.tier })))
    for (const unlock of unlocked) {
      // `days_to_unlock` is not sent. We would have to know when the user started,
      // and nothing records that — a number derived from "first lesson we happen to
      // have logged locally" would read as install-to-unlock and be wrong for every
      // reinstall. Better absent than confidently wrong.
      track('achievement_unlocked', { achievement_id: unlock.achievementId, tier: unlock.tier })
    }

    // Today's quest, advanced locally so the screen moves in the same frame. The server
    // decides what it PAYS; this is the prediction, like the XP above.
    if (quest !== null) {
      // The answers first, because that is the order they happened in, and then the
      // lesson. Either path can be the one that finishes the quest — the last
      // outstanding requirement is often a fact answer, and that loop's result used to
      // be thrown away, so the quest finished in silence.
      let finished = false
      for (const answer of state.answers) {
        if (answer.chosenOptionId === null) continue
        finished ||= recordQuestEvent(quest, {
          type: 'fact_answered',
          factId: answer.factId,
          correct: answer.wasCorrect,
        }).becameComplete
      }
      finished ||= recordQuestEvent(quest, {
        type: 'lesson_completed',
        accuracy: optimistic.accuracy,
        durationMs,
      }).becameComplete

      // The QUEST finishing, not a task. `completed` is the list of tasks this event
      // finished, so testing it non-empty announced a five-task quest complete the first
      // time any one task landed — and again for each of the others.
      if (finished) {
        // Held for the exit, as well as tracked. The route pushes the celebration; a
        // ref rather than state because it is read by the exit handler and must not
        // cause a render in the middle of the summary's own entrance.
        questCompleted.current = true
        track('quest_completed', { quest_id: quest.date })
        // `ach.quest.regular` counts `daily_quest_completed` and had no producer at all,
        // so all three of its tiers were permanently zero. The quest engine has known
        // when a quest finishes since it was built; nothing forwarded it.
        for (const unlock of recordQuestCompleted(Date.now())) {
          track('achievement_unlocked', { achievement_id: unlock.achievementId, tier: unlock.tier })
        }
      }
    }

    track('lesson_completed', {
      lesson_id: state.lessonId,
      kind: 'lesson',
      items: optimistic.items,
      correct: optimistic.correct,
      accuracy: optimistic.accuracy,
      duration_ms: Date.now() - (state.startedAt ?? Date.now()),
      // The cumulative count, the same figure `enqueueLesson` sends. `5 - state.hearts`
      // is the BALANCE, not the history: a lesson that spent three hearts and had two
      // restored reported one. Two numbers for one lesson, and the dashboard's was the
      // wrong one. (It also spelled the heart maximum as a literal.)
      hearts_lost: state.heartsLost,
      xp_awarded: optimistic.xpAwarded,
      was_offline: isOffline,
    })

    // Fired ALONGSIDE `lesson_completed`, never instead of it. The taster is a real
    // lesson and belongs in the lesson numbers too; this is an extra fact about it,
    // not a different kind of thing.
    if (isTaster) {
      track('taster_lesson_completed', {
        accuracy: optimistic.accuracy,
        duration_ms: Date.now() - (state.startedAt ?? Date.now()),
      })
    }
  }, [isOffline, index, memory, isTaster, remoteLessons, remote.lesson, screenReaderOn])

  const timeLimitMs = mode === 'speed' ? SPEED_SECONDS * 1000 : null
  const lesson = useLesson({
    questions,
    memory,
    timeLimitMs,
    onComplete: handleComplete,
    ...(placement === true ? { heartsEnabled: false } : {}),
  })
  // Haptic, sound and `question_answered`, from the GRADED answer — whether Check graded
  // it or the speed round's clock did. See the hook for why not from a tap.
  useAnswerCues(lesson.state, itemMs)

  /**
   * Screen-reader focus to the verdict when the sheet arrives.
   *
   * The Check button the user just pressed unmounts in the same render — the sheet takes
   * its place — so without this VoiceOver's cursor falls to wherever the platform puts
   * it, usually the top of the screen, and the verdict is never read. When a tap WAS the
   * answer this did not arise: focus stayed on the option, whose label changed to
   * "Paris, correct answer" under the cursor. From the verdict, the next swipes read the
   * explanation, the reward and Continue, in that order.
   *
   * Native only. react-native-web implements neither half — `setAccessibilityFocus` is
   * an empty function there and `sendAccessibilityEvent` does not exist — and web is not
   * a platform this app ships a screen reader experience on.
   */
  const verdict = useRef<Text>(null)
  const answeredCount = lesson.state.answers.length
  /**
   * A matching board is answered whole and then simply left behind.
   *
   * `ANSWER_GROUP` parks the machine on the board's last question in `answered`, the phase every
   * answer leaves it in so that CONTINUE, REVIVE and the out-of-hearts fork keep working
   * unchanged. Four answers at once have no verdict to read out that the board did not just show
   * (the tick on every pair), so unless the learner has run out of hearts — which is the fork,
   * and must be shown — it moves on by itself. Above the early returns: a hook after one is a
   * different number of hooks on the loading render and the question render.
   */
  const boardAnswered =
    lesson.state.phase === 'answered' &&
    lesson.state.questions[lesson.state.index]?.group !== undefined &&
    !lesson.state.outOfHearts
  const advanceBoard = lesson.advance
  useEffect(() => {
    if (boardAnswered) advanceBoard()
  }, [boardAnswered, advanceBoard, lesson.state.index])
  useEffect(() => {
    if (lesson.state.phase !== 'answered' || Platform.OS === 'web') return
    if (verdict.current !== null) AccessibilityInfo.sendAccessibilityEvent(verdict.current, 'focus')
  }, [lesson.state.phase, answeredCount])

  /**
   * On the transition into feedback, put the options back on screen. See `scroller`.
   *
   * Keyed on `answered` alone rather than on the answer, so it runs once per question at
   * the moment the sheet mounts and not again while the user reads it. `animated`, and
   * deliberately not gated on reduced motion: this is not decoration — it is the screen
   * showing the user the thing they asked to be shown, and the alternative under reduced
   * motion is the same movement without the tween, which `scrollTo` gives us anyway on a
   * platform that honours the setting.
   *
   * ABOVE every early return, and that is not a style preference. It first sat next to
   * the JSX it affects, which is below `if (!question) return <LoadingState />` — so the
   * hook count changed between the loading render and the question render and React threw
   * "Rendered more hooks than during the previous render" on all fourteen lesson tests.
   * A conditional hook is a crash, not a lint note.
   */
  const revealOptions = useCallback(() => {
    const view = viewport.current
    // The gap the body puts between its blocks, so the stop lands in the gap above the
    // options rather than inside the prompt. Stopping `space[3]` above them cut through
    // the prompt's letters, or its map, wherever the gap was narrower than that.
    const gap = compact ? space[3] : space[5]
    // Every option is already above the sheet: nothing moves and the prompt stays whole,
    // which is most questions on most phones (round-3 design review).
    if (view > 0 && optionsBottom.current + gap <= view) return
    scroller.current?.scrollTo({ y: Math.max(0, optionsTop.current - gap), animated: true })
  }, [compact])

  useEffect(() => {
    if (lesson.state.phase !== 'answered') return
    revealOptions()
  }, [lesson.state.phase, revealOptions])

  /**
   * Every new question starts at the top.
   *
   * The scroll view outlives the question, so the offset `revealOptions` left behind
   * carried into the next one: on a short phone the new prompt arrived half scrolled off
   * the top, and the first thing a user saw of a question was its answers. Not animated —
   * this is a new page, not movement within one.
   */
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false })
  }, [lesson.state.index])

  /**
   * Watch this number. If it is high the mechanic is too punishing — which is the
   * whole reason the balance table caps hearts per lesson rather than per day.
   *
   * Keyed on the flag rather than fired from the answer handler so it cannot double-
   * fire on a re-render, and `outOfHearts` only ever goes false again via REVIVE.
   */
  useEffect(() => {
    if (!lesson.state.outOfHearts) return
    track('hearts_depleted', { at_item: lesson.state.index })
  }, [lesson.state.outOfHearts, lesson.state.index])

  useEffect(() => {
    // On D1 the screen's state is the issued lesson's: waiting for it, offline with none
    // saved, a focus too narrow for a lesson (the empty state), or ready.
    const source = remoteLessons
      ? remote.status === 'ready' ? 'ready' : remote.status === 'idle' ? 'loading' : remote.status
      : status
    if (source === 'loading') return setScreen('loading')
    if (source === 'error') return setScreen('error')
    if (source === 'unavailable') return setScreen('unavailable')
    if (source === 'offline') return setScreen('offline-start')
    if (source === 'too-narrow' || questions.length === 0) return setScreen('empty')
    setScreen('ready')
    if (lesson.state.phase === 'idle') {
      // The ticket's id on D1: it is the idempotency key the server issued under.
      lesson.start(remoteLessons && remote.lesson ? remote.lesson.lessonId : makeUuid())
      track('lesson_started', {
        lesson_id: 'pending',
        kind: 'lesson',
        item_count: questions.length,
        source: 'home',
        was_offline: isOffline,
      })
    }
  }, [status, questions, lesson, isOffline, remoteLessons, remote.status, remote.lesson])

  if (screen === 'loading') return <LoadingState />
  if (screen === 'error') return <ErrorState onRetry={remoteLessons ? remote.retry : reload} onLeave={onLeave} />
  if (screen === 'unavailable') return <ErrorState unavailable onRetry={remote.retry} onLeave={onLeave} />
  if (screen === 'offline-start') return <OfflineStartState onRetry={remote.retry} onLeave={onLeave} />
  if (screen === 'empty') return <EmptyState onLeave={onLeave} />

  if (studying) {
    return <LessonIntroduction questions={lesson.state.questions} onBegin={() => {
      setStudying(false)
      lesson.resume()
    }} />
  }

  if (lesson.state.phase === 'summary' || lesson.state.phase === 'abandoned') {
    const practised = practisedCountries(index?.index, lesson.state.answers)
    return (
      <LessonSummary
        {...(placement === true
          ? { placement: { level: placementLevel(lesson.state.answers, lesson.state.questions) } }
          : {})}
        result={lesson.optimistic}
        practised={practised}
        dailyGoal={dailyGoal}
        timeMs={answeringMs(lesson.state)}
        // The two phases arrive here for very different reasons and the screen says so.
        // Running out of hearts is NOT one of them — the machine sends that to
        // `summary`, because the lesson ended rather than the user leaving it.
        wasAbandoned={lesson.state.phase === 'abandoned'}
        isOffline={isOffline}
        onExit={() =>
          onExit({
            practised: practised.map((c) => c.id),
            questCompleted: questCompleted.current,
            completed: lesson.state.phase === 'summary',
            lessonId: lesson.state.lessonId,
          })
        }
      />
    )
  }

  // In place of the runner, like `Paused`, so the question is not left in the
  // accessibility tree. Only while the answer is on screen: the fact is the one just
  // answered, and the verdict has already been graded, so nothing here can change it.
  const reportedFact = lesson.state.questions[lesson.state.index]?.item.factId
  if (reporting && lesson.state.phase === 'answered' && reportedFact !== undefined) {
    return (
      <ReportSheet
        onSend={(reason) => withAccount(async (account) => {
          if (!account.reportFact) throw new Error('Reports are not available on this backend')
          await account.reportFact(reportedFact, reason)
        })}
        onClose={() => setReporting(false)}
      />
    )
  }

  // Replaces the runner rather than covering it: an overlay leaves the question in
  // the accessibility tree, which is a free look at an item about to be scored.
  if (lesson.state.phase === 'paused') {
    return (
      <Paused
        answered={lesson.state.answers.length}
        onResume={lesson.resume}
        onFinish={() => {
          // Where we lose people, and why. "paused" and "out_of_hearts" are very
          // different products problems and a single drop-off number hides both.
          track('lesson_abandoned', {
            lesson_id: lesson.state.lessonId,
            at_item: lesson.state.index,
            of_items: lesson.state.questions.length,
            reason: 'paused',
          })
          lesson.abandon()
        }}
      />
    )
  }

  const question = lesson.question
  if (!question) return <LoadingState />
  // Replay only for a new question, including a repeated item in review. The atlas
  // stays outside these entrances so its GL context and camera survive the change.
  const questionScene = `${lesson.state.lessonId}:${lesson.state.index}`

  const answered = lesson.state.phase === 'answered'
  // Study is an explicit choice before the first answer, never a placement answer key.
  // Pause/resume preserves this exact lesson and keeps study time out of grading.
  const canStudy = mode === 'normal' && placement !== true &&
    lesson.state.phase === 'presenting' && lesson.state.index === 0 && lesson.state.answers.length === 0

  /**
   * Whether the ANSWERS are pictures — which changes the layout of half this screen.
   *
   * Asked of the options rather than of the modality, because `modality` describes the
   * PROMPT: a flag-answer question is `text` modality (its prompt is a sentence) and is
   * the one case here that is not a list of words. `asset` is set by `buildQuestion`
   * only for options that are fact values, so this is exactly "the answers are things
   * you look at" and nothing else.
   *
   * `some`, not `every`: if the pack ever produced a mixed set the grid is still the
   * right shape, and a picture in a full-width row next to a word in one would be the
   * worse failure.
   */
  const pictureOptions = question.options.some((option) => option.asset !== undefined)

  /**
   * How many the user has just got right in a row, counting back from the last answer.
   *
   * Decides whether the praise under "Perfect!" may mention a roll, and whether the
   * progress bar wears the run colour. Derived from the answer log, which is already the
   * truth — and in the end-of-lesson review it counts the review's own answers, so a run
   * from the graded questions is not praised again in practice.
   */
  const correctRun = currentRun(lesson.state)

  // The answer on screen: in the end-of-lesson review it is the review round's, which is
  // practice and earns nothing, so it shows no reward either.
  const reviewing = inReview(lesson.state)
  const lastAnswer = lastAnswerOf(lesson.state)
  /**
   * What that answer was actually worth.
   *
   * The card rendered `"+10"` and `"+5"` as string literals, which broke the rule that
   * reward numbers live only in the balance table — and, more to the point, was false.
   * The real figure is 2 for a known fact the scheduler did not ask for, 12 for one it
   * did, 14 with the speed bonus, and a quarter of any of those past the daily cap.
   *
   * `awardForAnswer` is the same function the grader and the server run, so the number
   * under a user's thumb is the number that lands in the ledger.
   */
  const lastAward = lastAnswer && !reviewing ? lesson.awardFor(lastAnswer) : null

  /**
   * A typed question is answered with a keyboard, which changes two things about this screen.
   * Check is enabled by having typed something rather than by having picked something, and it
   * sits INSIDE the scroll view under the field: a footer pinned to the screen's bottom edge is
   * under the keyboard on iOS, and the one button the learner needs would be the one they
   * cannot see. The scroll view lifts itself above the keyboard (`automaticallyAdjustKeyboardInsets`).
   */
  const typedQuestion = question.typed !== undefined
  /**
   * A matching board, while it is being played: shown when the board's FIRST question is up and
   * nothing has been answered. Its four questions are answered together by `ANSWER_GROUP`, which
   * leaves the machine on the board's last one — and unless that ran the learner out of hearts
   * there is nothing to say about it that the board has not already shown, so the screen moves
   * straight on (below) rather than raising a sheet for four answers at once.
   */
  const boardMembers =
    question.group?.position === 0 ? lesson.state.questions.slice(lesson.state.index, lesson.state.index + question.group.size) : null
  const showBoard = boardMembers !== null && !answered
  const boardSettled = question.group !== undefined && answered && !lesson.state.outOfHearts
  const typedValue = answered ? (lastAnswer?.typedText ?? lesson.state.typedText) : lesson.state.typedText
  const noSelection = typedQuestion
    ? lesson.state.typedText.trim() === ''
    : lesson.state.selectedOptionId === null
  const checkButton = (
    <Button
      label={t('lesson:check.label')}
      variant="discovery"
      onPress={lesson.check}
      disabled={noSelection}
      // Why it is dimmed, read after "Check, dimmed" — a disabled control with no
      // reason is a dead end to a screen-reader user.
      {...(noSelection
        ? { accessibilityHint: typedQuestion ? t('lesson:check.needsTyping') : t('lesson:check.needsAnswer') }
        : {})}
      testID="lesson-check"
    />
  )

  return (
    <View style={styles.screen}>
      {isOffline && <OfflineBanner />}

      <View style={styles.header}>
        {/* The catalogue lists this control first (§5) and it had never been built,
            so a user who started a lesson could not leave it except by answering ten
            questions — the route disables the back gesture on purpose, so killing the
            app was the only other way out. It pauses rather than quitting, which is
            what makes a mis-tap recoverable. */}
        <Pressable
          role="button"
          aria-label={t('lesson:close')}
          onPress={lesson.pause}
          hitSlop={space[2]}
          style={styles.close}
        >
          <Icon name="close" size={20} color={colors.text.secondary} />
        </Pressable>
        {/* The combo glow: from the third right answer in a row the bar takes the flame
            colour, the moment the feedback starts saying "on a roll". A miss returns it
            to the ordinary green, never to a red one. Colour only, so nothing moves under
            Reduce Motion and nothing new is announced; the sheet says it in words. */}
        <ProgressBar
          current={lesson.progress.current}
          total={lesson.progress.total}
          accessibilityLabel={t('lesson:progress.label')}
          valueText={t('lesson:progress.value', {
            current: lesson.progress.current,
            total: lesson.progress.total,
          })}
          tone={correctRun >= STREAK_PRAISE ? 'streak' : 'progress'}
          style={styles.lessonProgress}
        />
        <Stat
          kind="hearts"
          value={lesson.state.hearts}
          accessibilityLabel={t('lesson:hearts.remaining', { count: lesson.state.hearts })}
        />
        {mode === 'speed' && (
          <Countdown
            key={lesson.state.index}
            seconds={SPEED_SECONDS}
            running={lesson.state.phase === 'presenting'}
          />
        )}
        {canStudy && <Pressable
          role="button"
          aria-label={t('lesson:intro.open')}
          onPress={() => {
            hapticSelect()
            lesson.pause()
            setStudying(true)
          }}
          style={styles.study}
          testID="lesson-study"
        >
          <Text style={styles.studyLabel}>{t('lesson:intro.open')}</Text>
        </Pressable>}
      </View>

      <ScrollView
        scrollEnabled={!globeGestureActive}
        ref={scroller}
        testID="lesson-scroll"
        // A tap on Check (or anywhere else) while the keyboard is up is a tap, not "dismiss the
        // keyboard first" — and the view lifts itself clear of the keyboard on iOS.
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={typedQuestion}
        contentContainerStyle={[styles.body, compact && styles.bodyShort, shortQuestion && styles.bodyTiny]}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.height
          // The sheet arriving is what shrinks this; ask again with the new height.
          if (answered) revealOptions()
        }}
      >
        {/* Centred by spacers, not by `justifyContent` — see `Spacer`. A two-option
            question should not cling to the top of a tall phone, and at 320×568 the
            prompt plus a map plus four options overflow, which is where centring with
            `justifyContent` puts the prompt above scroll position zero and out of reach.
            Measured before the change: option four sat at 535–594 of 568. */}
        <Spacer />
        {reviewing && (
          // Duolingo's "previous mistake" tag: this one came back because it was missed.
          <View>
          <Text style={styles.reviewTag}>{t('lesson:review.tag')}</Text>
          <Text style={styles.feedbackBody}>{t('lesson:review.purpose')}</Text>
          </View>
        )}
        {!reviewing && (boardMembers !== null ? boardMembers.some((member) => member.isNew) : question.isNew) && (
          // And its "new word": this is the first time, so not knowing it is expected —
          // which is also why a new fact never costs a heart.
          <Text style={[styles.reviewTag, styles.newTag]}>{t('lesson:new.tag')}</Text>
        )}
        {!showBoard && !boardSettled && (
          <SceneEntrance replayKey={questionScene} testID="lesson-prompt-arrival">
            <Text style={styles.prompt} role="heading">
              {/* The prompt key and its params come from the question template in the
                  content pack, so they are validated by `pnpm content:validate` rather
                  than by the compiler. */}
              {tContent(question.promptKey, question.promptParams)}
            </Text>
          </SceneEntrance>
        )}
        {showBoard && boardMembers !== null && (
          <SceneEntrance replayKey={questionScene} testID="lesson-board-arrival">
            <PairsBoard key={boardMembers[0]!.item.id} members={boardMembers} onDone={lesson.answerGroup} />
          </SceneEntrance>
        )}

        {/* The picture the prompt is asking about — "Which country's flag is this?".
            Present only for image-modality templates, which the composer only selects
            when `PRESENTABLE` says this app can draw one (src/lib/content.ts).

            Labelled, unlike every other flag in the app. Elsewhere a flag illustrates
            something the surrounding text already says; here it IS the question, and
            an unannounced image would leave a reader with four country names and no
            question. It should not arise — a reader user gets the described sibling
            template instead — but "should not arise" is not a reason to ship an
            unlabelled image, and the label is what makes that true rather than
            assumed. */}
        {question.promptAsset !== undefined && (
          <SceneEntrance replayKey={questionScene} style={styles.promptArt} testID="prompt-art">
            <Flag
              path={question.promptAsset}
              width={compact ? 180 : FLAG_PROMPT_WIDTH}
              label={tContent(question.promptKey, question.promptParams)}
            />
          </SceneEntrance>
        )}

        {/* Where in the world you are, beside the question.
            Context, never the subject: `locator` is absent whenever the answer IS the
            country, so this can never hand over "which country is this?". That rule
            lives in the composer (packages/engines/src/content/index.ts) rather than
            here, because every screen would otherwise have to remember it.

            Decorative to a screen reader. The prompt already names the country in
            words — "What is the capital of Japan?" — so a reader announcing the map
            would repeat it, and a reader user is not being shown anything a sighted
            user is not also told. */}
        {question.locator !== undefined && lessonShowsAtlas(question, index?.index, answered) && (
          <View
            style={styles.promptArt}
            testID={question.modality === 'map' ? 'prompt-map' : 'prompt-locator'}
          >
            {/* The atlas, or its flat fallback, under ONE disclosure policy
                (features/atlas/scene/lessonScene.ts): a capital question shows the
                country and pins the capital only once graded; "which country is this?"
                names nothing until graded; a question the map would answer by itself
                (continent, coast, neighbours) gets no map until graded. Answers are
                still given with the options below — the map selects nothing. */}
            <LessonAtlas
              onGestureActiveChange={setGlobeGestureActive}
              question={question}
              sceneKey={questionScene}
              index={index?.index}
              selected={lesson.state.selectedOptionId !== null}
              answered={answered}
              chosenOptionId={lastAnswer?.chosenOptionId ?? null}
              width={atlasWidth}
              height={atlasHeight(height, {
                shortQuestion,
                compact,
                isPrompt: question.modality === 'map',
                pictureOptions,
              })}
            />
          </View>
        )}

        {!showBoard && !boardSettled && (
        <SceneEntrance
          replayKey={questionScene}
          testID="lesson-options-arrival"
          /**
           * A 2x2 grid when the answers are pictures, a column when they are words.
           *
           * Four flag rows are four full-width cards about ninety points tall, which on
           * a 320x568 phone is most of the screen: the map got pushed above the fold and
           * the auto-scroll to the options finished the job, so the question a user
           * actually saw was four flags and a sliver of Mexico.
           *
           * Words have to stay a column — a country name is read left to right and four
           * of them in two columns is a word search. A flag is not read, it is compared,
           * and comparing is easier in a block than down a list. So the layout follows
           * what the option IS, which is the same signal `AnswerOption` uses to decide
           * between drawing art and drawing text.
           */
          style={[styles.options, pictureOptions && styles.optionsGrid]}
          // Measured rather than assumed: the prompt is one or two lines, the
          // illustration is present or not, and both move this by tens of points.
          onLayout={(event) => {
            optionsTop.current = event.nativeEvent.layout.y
            optionsBottom.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height
            // Scrolled from HERE as well as from the effect, and this is the call that
            // actually lands. The sheet is a sibling, so mounting it shrinks the scroll
            // viewport and the two Spacers inside the content redistribute — which moves
            // this block. The effect fires on the phase change, before that relayout, so
            // on its own it scrolls to where the options USED to be and leaves the first
            // one clipped under the header. This fires after the new position is known.
            if (answered) revealOptions()
          }}
        >
          {typedQuestion && (
            <TypedAnswer
              // Remounted per question, so a field left readonly by the last verdict is a
              // fresh, editable one for the next.
              key={question.item.id}
              value={typedValue}
              onChange={lesson.type}
              onSubmit={() => {
                if (!noSelection) lesson.check()
              }}
              state={!answered ? 'idle' : lastAnswer?.wasCorrect ? 'correct' : 'wrong'}
              maxLength={MAX_TYPED_LENGTH}
            />
          )}
          {!typedQuestion && question.options.map((option, index) => {
            const state = optionState(
              option.isCorrect,
              option.id,
              answered,
              lastAnswer?.chosenOptionId,
              lesson.state.selectedOptionId,
            )
            return (
            <AnswerOption
              key={option.id}
              label={option.label}
              state={state}
              // Half the row, less the gap. `AnswerOption`'s card is `alignSelf:
              // 'stretch'`, which is right for a column and would make every cell a full
              // row here; the caller's style lands last in the array, so this is the
              // documented way to override it rather than a second prop on the
              // primitive.
              {...(pictureOptions ? { style: styles.optionCell } : {})}
              // A, B, C, D. From the RENDER order, not from the option's identity —
              // `buildQuestion` shuffles with the injected rng precisely so that
              // position never becomes the answer, and a badge derived from anything
              // stable would hand that back.
              badge={BADGES[index]}
              // The state, spoken. `AnswerOption` documents this prop with the example
              // "Japan, correct answer" and nothing had ever passed it — so the mark
              // was `aria-hidden` artwork, the surface colour did the rest, and a
              // screen-reader user heard "Berlin" with no indication it was the one
              // they got wrong. Colour plus an unlabelled icon was the entire signal.
              accessibilityLabel={
                state === 'correct'
                  ? t('lesson:answer.correct', { answer: option.label })
                  : state === 'wrong'
                    ? t('lesson:answer.wrong', { answer: option.label })
                    : undefined
              }
              // The answer as a PICTURE, when the option is one.
              //
              // "Hur ser Belgiens flagga ut?" used to offer four written descriptions —
              // "tre lodräta band — svart, gult, rött" — so the one question in the app
              // that is literally about what something looks like was answered by
              // reading. `buildQuestion` attaches `asset` only to options that are fact
              // VALUES, which is what keeps this from becoming the giveaway the
              // `promptAsset` note refuses; see `AnswerOption.asset`.
              //
              // Undefined for every other attribute, so a capital or currency option is
              // the same text row it has always been.
              art={
                option.asset !== undefined ? (
                  <Flag path={option.asset} width={OPTION_FLAG_WIDTH} />
                ) : undefined
              }
              // The non-colour half of the signal, as artwork rather than a character.
              // The wrong-answer mark used to be `→`, which points the same way in an
              // RTL layout as in an LTR one — an arrow that means "the right answer is
              // over there" and gets it backwards for half the world's readers.
              mark={
                state === 'correct' ? (
                  <Icon name="check" size={20} color={colors.feedback.correct} />
                ) : state === 'wrong' ? (
                  <Icon name="forward" size={20} color={colors.text.secondary} />
                ) : undefined
              }
              // Commit atomically; the reducer ignores further answers until Continue.
              onPress={() => lesson.answer(option.id)}
              // So tests can select answers POSITIVELY. The helper used to take every
              // button that was not labelled "Continue", which silently swallowed the
              // close button the moment one existed and made two tests click pause
              // while believing they were answering.
              testID="answer-option"
            />
            )
          })}
        </SceneEntrance>
        )}

        {typedQuestion && !answered && !showBoard && checkButton}

        <Spacer />
      </ScrollView>

      {boardSettled || !answered ? null : (
        <RiseIn key={answeredCount} style={[styles.footer, styles.feedbackFooter]}>
          {/* Out of hearts is a fork, not a wall. The engine has held the flag since
              the machine was written and nothing rendered it — so the lesson simply
              carried on at zero hearts, which made the whole mechanic decorative. */}
          {lesson.state.outOfHearts ? (
            <OutOfHearts
              coins={coins}
              // False on the last item: `REVIVE` resumes at the NEXT question, and there
              // is not one. The machine sends that case to the summary rather than
              // presenting an index past the end, and this stops the offer being made
              // for something already over.
              canRevive={canRevive(lesson.state)}
              offline={isOffline}
              onRevive={() => {
                // Paid FIRST, then resumed — the reverse of `useShop.buy()`, and for the
                // opposite reason. A cosmetic that is owned but unpaid is recoverable on
                // the next reconcile; a continue is consumed the instant it is taken and
                // nothing can correct it afterwards. The call does not block the resume:
                // it is fire-and-forget, so the next question still arrives in this frame.
                void payForContinue(makeUuid())
                lesson.revive()
              }}
              onFinish={() => {
                // Hearts ending the session is a completion in both the machine
                // and the server grader. Abandoning here withheld offline course
                // credit until reconnect and incorrectly logged a voluntary exit.
                lesson.advance()
              }}
            />
          ) : (
            /* The verdict, the reward and the way onward as ONE pinned sheet.

               Measured off the reference rather than eyeballed: the mascot is 37.5 % of
               the screen wide, sits ~7 % in from the edge, and its lower body is
               OCCLUDED BY THE BUTTON rather than cropped by the panel — it leans out
               from behind the furniture, which is what makes it read as arriving rather
               than as a sticker placed in a box.

               The first reading of that reference was wrong and the measurement caught
               it: the mascot's top is 89 px BELOW the panel edge, so it does not break
               the top edge at all. Two of the three grafted mechanics would have been
               built around a thing that was not happening.

               This block used to sit in the scroll flow with the button pinned beneath
               it, so the praise and the way onward were two objects with a gap between
               them. One sheet is the mechanic worth taking. */
            <View
              // The verdict's tint, and it is calm on both sides: the success surface
              // for right, the muted plum `feedback.wrong` for wrong — never red — and
              // the plain raised surface when the clock ran out, because that one is
              // not a verdict on the user at all. The ring draws the edge a dark tint
              // alone would not have (R10). Colour is never the only carrier: the
              // headline, the tick on the option and the haptic all say the same thing.
              style={[
                styles.sheet,
                lastAnswer?.wasCorrect === true
                  ? styles.sheetCorrect
                  : lastAnswer?.chosenOptionId == null
                    ? styles.sheetNeutral
                    : styles.sheetWrong,
              ]}
              testID="answer-sheet"
            >
              <ClaySurface transparent radius={radius.lg} />
              <ScrollView testID="lesson-feedback-scroll" style={styles.feedbackScroll}>
              {/* The thing the question was ABOUT, now that it can be shown.

                  "Hur ser Japans flagga ut?" is asked in words and answered in words,
                  so before this the flag never appeared at all: four sentences, a
                  locator map for context, and a user who finishes a flag question
                  without ever seeing the flag. In an app whose first promise is "flags,
                  capitals and landmarks", that is the fact not being taught.

                  It cannot go beside the prompt — drawing the flag next to "what does
                  Japan's flag look like?" hands the answer to anyone who can see it,
                  silently and only to sighted users. After grading there is nothing
                  left to give away: the correct option is already marked, and the
                  engine only sets `revealAsset` when the picture is not already on
                  screen (see Question.revealAsset).

                  Labelled, like the flag prompt and unlike every decorative flag in the
                  app: here the picture is the answer being taught, so a reader that
                  skipped it would be skipping the lesson. */}
              {question.revealAsset !== undefined && (
                <View style={styles.reveal} testID="reveal-asset">
                  <Flag
                    path={question.revealAsset}
                    width={REVEAL_WIDTH}
                    label={tContent(question.promptKey, question.promptParams)}
                  />
                </View>
              )}

              {/* The mascot stands BESIDE the words, in the layout, and the button sits
                  below the pair. It used to be absolutely positioned behind the button, so
                  the Continue button covered his lower half and on a wrong answer he
                  showed as a head and shoulders over a bar. Nothing paints over him now.
                  Decorative: the sheet already says what happened and reads out the
                  reward, and a screen reader announcing the mascot after every answer is
                  the definition of noise.

                  He appears on BOTH verdicts. `encouraging` and not `celebrate` on a
                  miss: the register changes, the presence does not.

                  Start side on a correct answer, end side on a miss — that copy is a full
                  sentence naming the right answer, and a sentence reads better against
                  the start edge. When the reward chips wrap into two rows he swaps to the
                  end side, which hands the chips the full start edge. */}
              <View style={[styles.sheetRow, lastAnswer?.wasCorrect === true ? styles.sheetRowStart : styles.sheetRowEnd]}>
              <View style={{ width: mascot }} pointerEvents="none">
                <AdventureArt
                  name="explorer"
                  mood={lastAnswer?.wasCorrect === true ? 'celebrate' : 'encouraging'}
                  style={{ width: mascot, height: mascot }}
                />
              </View>
              <View style={styles.sheetText}>
                {lastAnswer?.wasCorrect ? (
            <>
              <Text ref={verdict} style={styles.feedbackTitleOk}>
                {lastAnswer.typedMatch === 'near' ? t('lesson:typed.near.title') : t('lesson:feedback.correct.title')}
              </Text>
              {/* One warm line under the headline, and it tells the truth.

                  `feedback.correct.body` — "You found {entityName} 🎉" — has been in the
                  catalogue since the first week, with a translator note saying "shown
                  under the celebration headline", and NOTHING HAS EVER RENDERED IT. The
                  correct branch was a single word and a reward chip, which is why the
                  reference's version of this sheet reads warmer than ours: it has the
                  sentence we already wrote.

                  The reference also says "Great job! You're on a roll." after every
                  correct answer, including the first of the lesson. That is flattery,
                  and the voice spec is explicit that we state the truth — so the roll
                  line is a SECOND key, shown only once `correctRun` says there is
                  actually a roll. Below three in a row, the honest sentence names what
                  the user just learned instead, which is the better praise anyway. */}
              <Text style={styles.feedbackBody}>
                {lastAnswer.typedMatch === 'near'
                  ? t('lesson:typed.near.body', { correct: question.options.find((o) => o.isCorrect)?.label ?? '' })
                  : correctRun >= STREAK_PRAISE
                    ? t('lesson:feedback.correct.streak')
                    : t('lesson:feedback.correct.discovery')}
              </Text>
              <View style={styles.rewards}>
                <EarnedReward
                  kind="xp"
                  amount={lastAward?.xp ?? 0}
                />
                <EarnedReward
                  kind="coin"
                  amount={lastAward?.coins ?? 0}
                />
              </View>
            </>
          ) : (
            // Never "Wrong!". State the truth, name the right answer, move on.
            <>
              <Text ref={verdict} style={styles.feedbackTitle}>
                {/* A timeout has no chosen option. "That's undefined." is what the
                    normal branch would render, and the clock running out is not the
                    user choosing wrongly — it deserves its own neutral sentence. */}
                {lastAnswer?.chosenOptionId == null
                  ? t('lesson:speed.timeUp')
                  : lastAnswer.typedText !== undefined
                    ? t('lesson:typed.wrong.title', { typed: lastAnswer.typedText })
                    : t('lesson:feedback.wrong.title', {
                        chosen: chosenLabel(question, lastAnswer.chosenOptionId),
                      })}
              </Text>
              <Text style={styles.feedbackBody}>
                {question.hint
                  ? t('lesson:feedback.wrong.body', {
                      correct: question.options.find((o) => o.isCorrect)?.label ?? '',
                      hint: question.hint,
                    })
                  : t('lesson:feedback.wrong.bodyPlain', {
                      correct: question.options.find((o) => o.isCorrect)?.label ?? '',
                    })}
              </Text>
            </>
          )}
              </View>
              </View>
              </ScrollView>
              <Button variant="discovery" label={t('common:continue')} onPress={lesson.advance} />
              {remoteLessons && (
                <Button label={t('lesson:report.cta')} variant="ghost" size="sm" onPress={() => setReporting(true)} />
              )}
            </View>
          )}
        </RiseIn>
      )}

    </View>
  )
}

/**
 * How tall the atlas is, from the space the question actually has.
 *
 * Short screens reserve more room for the answer options. A map question keeps
 * more space because the map is the prompt; picture options free two rows for it.
 *
 * Never so small the country is a speck — the floor is where a coastline still reads.
 */
export function atlasHeight(
  screenHeight: number,
  { shortQuestion, compact, isPrompt, pictureOptions }: { shortQuestion: boolean; compact: boolean; isPrompt: boolean; pictureOptions: boolean },
): number {
  const share = shortQuestion ? 0.25 : compact ? 0.26 : 0.3
  const floor = shortQuestion ? 132 : 150
  const ceiling = compact ? 240 : 340
  const boost = (isPrompt ? 1.15 : 1) * (pictureOptions ? 1.15 : 1)
  return Math.round(Math.min(ceiling * boost, Math.max(floor, screenHeight * share * boost)))
}

/**
 * The answer sheet's entrance: up from below, into the place it occupies.
 *
 * Remounted per answer by its key, so every verdict arrives rather than the first one
 * arriving and the rest simply being there. Never blocks input — the Continue button
 * inside is pressable from the first frame, and a user who knows the drill can tap
 * through the slide. Under reduced motion the sheet is in place from the start.
 */
function RiseIn({ children, style }: { children: ReactNode; style: StyleProp<ViewStyle> }) {
  const rise = useRiseIn('base')
  return (
    <Animated.View style={[style, rise.style]} onLayout={rise.onLayout}>
      {children}
    </Animated.View>
  )
}

/**
 * The clock, as a bar that empties.
 *
 * A bar rather than a number counting down: digits ticking demand attention that
 * belongs on the question, and a bar is read peripherally. It is keyed on the question
 * index by the caller, so each question gets a fresh one rather than an animation
 * resuming mid-flight.
 *
 * The accessible label is the seconds remaining, available on demand — never
 * announced every second, which would make the mode unusable with a screen reader.
 */
function Countdown({ seconds, running }: { seconds: number; running: boolean }) {
  const { styles } = useThemeValues()
  const t = useT()
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(tick)
  }, [running])

  return (
    <View
      accessible
      accessibilityLabel={t('lesson:speed.remaining', { seconds: left })}
      style={styles.clockTrack}
    >
      <View style={[styles.clockFill, { width: `${(left / seconds) * 100}%` }]} />
    </View>
  )
}

function optionState(
  isCorrect: boolean,
  optionId: string,
  answered: boolean,
  chosenId: string | null | undefined,
  selectedId: string | null,
) {
  if (!answered) return optionId === selectedId ? ('selected' as const) : ('idle' as const)
  if (isCorrect) return 'correct' as const
  if (optionId === chosenId) return 'wrong' as const
  return 'disabled' as const
}

const chosenLabel = (q: Question, id: string | null | undefined): string =>
  q.options.find((o) => o.id === id)?.label ?? ''

/**
 * A v4 UUID, client-side.
 *
 * Two callers, both of them idempotency keys the server dedupes on: the lesson id, and
 * the per-offer id behind a paid continue. Named for the shape rather than for the first
 * caller — the second one is not a lesson, and a lesson-named factory minting a purchase
 * key reads as a copy-paste rather than as a decision.
 */
const makeUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

// ── the five states ─────────────────────────────────────────────────────────

/** Skeleton, never a spinner, on primary content — no layout shift on arrival. */
function LoadingState() {
  const { styles } = useThemeValues()
  const t = useT()

  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.header}>
        <Skeleton width="70%" height={8} />
      </View>
      <View style={styles.body}>
        <Skeleton width="80%" height={28} />
        <View style={styles.options}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} borderRadius={radius.md} />
          ))}
        </View>
      </View>
    </View>
  )
}

/**
 * The countries behind the answers just given, in the order they were asked.
 *
 * Lives in the screen rather than in `LessonSummary` because it needs the content
 * index, and the summary is presentational — it is handed things to draw. The index
 * is optional so the summary still renders if content failed to load; a lesson that
 * somehow finished without it should end with fewer flags, not a crash.
 *
 * Deduplicated by entity: a lesson can ask two facts about Sweden, and two identical
 * flags in the row looks like a bug rather than like emphasis.
 */
function practisedCountries(
  index: ContentIndex | undefined,
  answers: readonly LessonState['answers'][number][],
): readonly PractisedCountry[] {
  if (index === undefined) return []
  const locale = currentLocale()
  const seen = new Set<string>()
  const out: PractisedCountry[] = []

  for (const answer of answers) {
    const entityId = index.facts.get(answer.factId)?.entity
    if (entityId === undefined || seen.has(entityId)) continue
    const entity = index.entities.get(entityId)
    if (entity === undefined) continue
    seen.add(entityId)
    out.push({
      id: entity.id,
      flagPath: entity.assets?.['flag']?.path,
      // A country name is a fact from the pack, never a translated string. English is
      // the fallback, and never a machine translation.
      name: entity.names?.[locale] ?? entity.names?.['en'] ?? entity.id,
    })
  }

  return out
}

function ErrorState({ onRetry, onLeave, unavailable = false }: { onRetry: () => void; onLeave: (() => void) | undefined; unavailable?: boolean }) {
  if (unavailable) return <FailureState titleKey="common:error.service.title" bodyKey="common:error.service.body"
    ctaKey={onLeave ? 'common:back' : 'common:retry'} onPress={onLeave ?? onRetry} />
  return (
    <FailureState titleKey="common:error.generic.title" bodyKey="common:error.generic.body" ctaKey="common:retry" onPress={onRetry}>
      <LeaveButton onLeave={onLeave} />
    </FailureState>
  )
}

/**
 * The quiet way back from a lesson that never started. Ghost, not a second primary: the
 * screen's own action (Retry) is still the thing it recommends.
 */
function LeaveButton({ onLeave }: { onLeave: (() => void) | undefined }) {
  const t = useT()
  if (onLeave === undefined) return null
  return <Button label={t('common:back')} variant="ghost" onPress={onLeave} testID="lesson-leave" />
}

/** Never a dead end — an empty queue is celebrated, then offers what is next. */
function EmptyState({ onLeave }: { onLeave: (() => void) | undefined }) {
  const { styles } = useThemeValues()
  const t = useT()

  return (
    <View style={[styles.screen, styles.centered]}>
      {/* The telescope pointed at a calm starfield — "peaceful, accomplished, restful".
          `lesson:empty.title` is "You're all caught up", which is the phrase this asset
          was briefed against, and the one empty state in the app that is a reward
          rather than a gap. */}
      <Art name="states/empty-caught-up" size={160} />
      <Text style={styles.prompt}>{t('lesson:empty.title')}</Text>
      <Text style={styles.feedbackBody}>{t('lesson:empty.body')}</Text>
      <LeaveButton onLeave={onLeave} />
    </View>
  )
}

/**
 * Offline, on a D1 build, with no lesson saved for offline use.
 *
 * The one lesson this device cannot start: lessons are issued by the server, and a few
 * are kept for offline starts once there has been a connection. Says what to do and
 * offers the retry; answers already given are safe in the queue either way.
 */
function OfflineStartState({ onRetry, onLeave }: { onRetry: () => void; onLeave: (() => void) | undefined }) {
  const { styles } = useThemeValues()
  const t = useT()

  return (
    <View style={[styles.screen, styles.centered]} testID="lesson-offline-start">
      <Art name="states/offline" size={160} />
      <Text style={styles.prompt}>{t('lesson:offlineStart.title')}</Text>
      <Text style={styles.feedbackBody}>{t('lesson:offlineStart.body')}</Text>
      <Button label={t('common:retry')} onPress={onRetry} style={styles.retry} />
      <LeaveButton onLeave={onLeave} />
    </View>
  )
}

function OfflineBanner() {
  const { styles } = useThemeValues()
  const t = useT()

  return (
    <View style={styles.offline} role="alert">
      <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
    </View>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  clockTrack: {
    width: 56,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    overflow: 'hidden',
  },
  clockFill: { height: '100%', backgroundColor: colors.status.streak },
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[3] },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  lessonProgress: { flex: 1, minWidth: space[8] + space[4] },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] },
  study: {
    minHeight: 44, minWidth: 44, marginStart: 'auto',
    paddingHorizontal: space[2], paddingVertical: space[2],
    justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
  },
  studyLabel: { ...text('caption'), color: colors.text.primary },
  // `flexGrow` + `center` so a question shorter than the screen sits in the middle of
  // it rather than jammed under the progress bar with half the display empty beneath.
  // On a tablet that empty half was 45 % of the screen; on a phone the content is
  // taller than the viewport, `flexGrow` has nothing to grow into, and this is inert —
  // which is why it is safe to apply everywhere instead of behind a width test.
  body: { gap: space[5], paddingBottom: space[6], flexGrow: 1 },
  // The gap and the tail, tightened. `space[6]` of padding under the last option exists so
  // the feedback sheet does not appear to grow out of it; on a short screen that padding
  // is the difference between four options and three, and the sheet has a surface and a
  // shadow of its own to separate it.
  bodyShort: { gap: space[3], paddingBottom: space[4] },
  bodyTiny: { gap: space[1] },
  prompt: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  reviewTag: { ...text('caption'), color: colors.text.secondary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  newTag: { color: colors.reward.gem },
  promptArt: { alignItems: 'center' },
  options: { gap: space[2] },
  /**
   * The picture-answer layout: two across, wrapping to two rows.
   *
   * `justifyContent: 'space-between'` rather than a gap on the main axis, because the
   * cells are sized as a PERCENTAGE and a percentage plus a gap overflows the row by the
   * gap. The cross-axis gap below still separates the two rows.
   */
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  /**
   * Half the row, less enough for the gutter between the two columns.
   *
   * `alignSelf: 'auto'` undoes the primitive's `stretch`, which is correct for a column
   * of full-width rows and would make each cell claim the whole row here. Stated rather
   * than left to the width alone: `stretch` on a wrapping row container stretches the
   * CROSS axis, so without this the two cells in a row would also be forced to equal
   * height by their own alignment rather than by the row's.
   */
  optionCell: { width: '48%', alignSelf: 'auto' },
  feedback: { gap: space[2] },
  // A positioning context for the confetti, which is drawn behind the card and is
  // deliberately allowed to overflow it — nothing here clips.
  // The pinned sheet: verdict, reward and the way onward in one block.
  // `overflow: hidden` so the mascot is clipped by the sheet's own rounded corners rather
  // than hanging outside it, and `position: relative` so its absolute child measures
  // against this rather than the screen.
  sheet: {
    position: 'relative',
    flexShrink: 1,
    overflow: 'hidden',
    gap: space[3],
    padding: space[4],
    // Taller at the top than the sides, so the mascot has room to stand up to the
    // heading rather than topping out at the reward chips. Measured against the
    // reference, whose panel is a quarter of the screen tall where ours was a fifth.
    paddingTop: space[5],
    borderRadius: radius.lg,
    ...squircle,
    borderWidth: 2,
  },
  sheetCorrect: {
    backgroundColor: colors.feedback.correctSurface,
    borderColor: colors.feedback.correctEdge,
  },
  sheetWrong: { backgroundColor: colors.feedback.wrong, borderColor: colors.feedback.wrongEdge },
  sheetNeutral: { backgroundColor: colors.feedback.neutral, borderColor: colors.border.subtle },
  // The mascot and the words side by side, in flow. `row-reverse` puts him on the end side
  // and mirrors with the writing direction, which a physical edge would not.
  sheetRow: { alignItems: 'center', gap: space[3] },
  sheetRowStart: { flexDirection: 'row' },
  sheetRowEnd: { flexDirection: 'row-reverse' },
  // `flex: 1` and `minWidth: 0` so a long answer wraps inside its column rather than
  // pushing the mascot off the sheet.
  sheetText: { flex: 1, minWidth: 0, gap: space[2] },
  // Start-aligned with the sheet's text column rather than centred: the mascot owns one
  // side of this sheet, and a centred picture would sit under him.
  reveal: { alignItems: 'flex-start' },
  feedbackTitle: { ...text('h3'), color: colors.text.primary },
  feedbackTitleOk: { ...text('h2'), color: colors.feedback.correct },
  // Start-aligned, not centred. It was centred when this lived in a centred card; the
  // sheet is a left-anchored column now and a centred sentence under a left-aligned
  // heading reads as two blocks that were never introduced.
  feedbackBody: { ...text('body'), color: colors.text.secondary },

  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { ...text('h3'), color: colors.text.secondary },
  // `flex-start` and wrapping, for the same reason: the chips belong to the column
  // beside the mascot, and centring them in the sheet's full width floated them away
  // from the heading they belong to. Wrapping because at 200 % text two chips do not
  // share a row that is already 150 points narrower than the sheet.
  rewards: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  footer: { paddingBottom: space[4] },
  feedbackFooter: { maxHeight: '65%', flexShrink: 0 },
  feedbackScroll: { flexGrow: 0 },
  retry: { marginTop: space[4] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
    ...squircle,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
  return { colors, styles }
})
