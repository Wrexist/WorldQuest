/**
 * The lesson screen — mockup screens 5 and 6.
 *
 * Phase 1 is deliberately ugly: real logic, real data, minimal polish. Design lands
 * in weeks 3–6 (docs/plan/build-order.md). What is NOT deferred is anything that is
 * expensive to retrofit — every string is a key, every colour is a token, every
 * control is labelled, and the five states are all present.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import {
  AnswerOption,
  Button,
  colors,
  layout,
  ProgressBar,
  radius,
  Skeleton,
  space,
  Spacer,
  squircle,
  text,
} from '@worldquest/design'
import { canRevive, deriveRating, lessonLength } from '@worldquest/engines'
import type { LessonFocus } from '@worldquest/engines'
import type { ContentIndex, GradeResult, LessonState, Question } from '@worldquest/engines'
import { Art } from '../../components/Art.js'
import { Flag } from '../../components/Flag.js'
import { CountryMap } from '../../components/CountryMap.js'
import { useLesson } from './hooks/useLesson.js'
import { LessonSummary, type PractisedCountry } from './LessonSummary.js'
import { SPEED_SECONDS } from './modes.js'
import { OutOfHearts } from './OutOfHearts.js'
import { payForContinue } from './continuePurchase.js'
import { Paused } from './Paused.js'
import { recordPace, useItemPace } from './usePace.js'
import { hapticCelebrate, hapticCorrect, hapticWrong } from '../../lib/haptics.js'
import { soundCorrect, soundLevelUp, soundWrong } from '../../lib/sound.js'
import { recordLessonForAchievements, recordQuestCompleted } from '../achievements/progress.js'
import { todaysQuest } from '../quests/useDailyQuest.js'
import { recordQuestEvent } from '../quests/questProgress.js'
import { useContent } from '../../lib/content.js'
import { currentLocale, tContent, useT } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { recordLessonCompleted } from '../profile/useWeekActivity.js'
import { recordSessionHour } from '../../lib/notifications.js'
import { localDay } from '../../lib/day.js'
import { recordPredictedAward } from '../../lib/awards.js'
import { enqueueLesson } from '../../lib/sync.js'
import { Icon } from '../../components/Icon.js'
import { Stat } from '../../components/Stat.js'

type ScreenState = 'loading' | 'error' | 'empty' | 'ready'

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
 * How wide the celebrating mascot is, as a fraction of the sheet.
 *
 * MEASURED off the reference — 320 of an 852-point screen — and kept as the RATIO rather
 * than the 146 points it works out to at 390. A constant was tried and 320pt is what
 * exposed it: 150 points is 38 % of a 390 screen and 47 % of a 320 one, so the small
 * phone got a mascot half the width of the sheet, the reward chips stacked into two rows
 * to fit beside it, and the sheet grew a third taller on the device with least room.
 *
 * Against the SHEET's width, not the window's: above `maxContentWidth` the sheet stops
 * growing, and a mascot that kept scaling with a tablet's screen would burst out of it.
 *
 * This replaces `celebration/burst-wide`, which was built for the frame this one deletes:
 * a confetti ribbon straddling the top edge of a card that is no longer a card in the
 * scroll flow. `atlas/celebrate` carries its own burst, which is the reference's mechanic
 * anyway — the confetti belongs to the character, not to the furniture. The ribbon master
 * stays; nothing draws it today.
 *
 * ## And what happens when even that ratio does not fit
 *
 * At 390 it does. At 320 it does not: measured off the render, the XP and coin chips
 * wrap into two rows and the lower one lands at `176–195 × 692–716`, inside the
 * mascot's `−18–190 × 661–800`. The coin reward is printed behind Atlas's arm, and a
 * picture of the sheet at 390 shows none of it — which is the argument for
 * photographing 320 first.
 *
 * No breakpoint, because a breakpoint would be wrong in the cases that matter most: a
 * locale with longer chip labels, or the 200 % text setting the Definition of Done
 * requires, both cram the row at widths where a "320" threshold says there is room.
 * The sheet asks the row whether it wrapped and believes the answer — see `WRAPPED_AT`.
 *
 * When it did, the mascot swaps sides at the SAME size: the text gives up its indent
 * and takes the sheet's full width, and he moves to the end edge, where a start-aligned
 * column of text and chips is not. Same bottom anchor, same occlusion by the button;
 * only the side changes, because the side was the only thing in the way. Shrinking him
 * instead was the first attempt and looked worse than the bug — he has to stand taller
 * than the button plus its offset to be seen at all, so a mascot small enough to clear
 * the chips was a hat peeking out from behind a button.
 */
const MASCOT_OF_SHEET = 0.375

/**
 * How much taller than one chip the reward row has to be before we call it wrapped.
 *
 * Compared against a CHIP's own measured height rather than a constant, so it holds at
 * any text scale — the thing being detected is "two rows of chips", and two rows are
 * always about twice one chip whatever a chip currently is. Half a chip of slack
 * absorbs the row's own line-height rounding without reaching a second row.
 */
const WRAPPED_AT = 1.5

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
const SHORT_SCREEN = 700

/**
 * The locator map beside a question.
 *
 * The same 200pt as the flag prompt, because it is now the same kind of object: the
 * map is framed on the country rather than on its continent, so it carries real
 * information at a glance instead of being a decorative smudge that had to be kept
 * small to avoid wasting space.
 *
 * 132 on a short screen. The map is CONTEXT — the prompt already names the country in
 * words — and the options are the interaction, so when there is not room for both at
 * full size it is the picture that gives way. Never zero: "where in the world is this"
 * is half of what the screen teaches.
 */
/**
 * 280, up from 200, on a tall screen.
 *
 * The reference draws the locator nearly the full content width and it is the single
 * biggest reason its question screen reads as a modern product rather than a form: the
 * map stops being a stamp beside the prompt and becomes the thing you look at while you
 * think. At 200 on a 390-wide phone it was 51 % of the content column with a third of
 * the screen empty above it.
 *
 * The SHORT variant does not move. The 320×568 budget has not changed — prompt, map and
 * four options need about 690pt there — and this is exactly the number that measurement
 * exists to protect.
 */
const LOCATOR_WIDTH = 280
const LOCATOR_WIDTH_SHORT = 132

/**
 * The short-screen locator when the answers are a 2x2 grid of pictures.
 *
 * 132 is the number that protects the 320x568 budget — prompt, map and four FULL-WIDTH
 * option rows need about 690pt there, so the map is what gives way. A picture-answer
 * question does not spend its screen that way: two rows of cells instead of four rows of
 * cards gives back the better part of two hundred points, and handing all of it to
 * empty space while the map stays a stamp would be keeping the tax after repealing it.
 *
 * Still short of the 280 a tall screen gets. The grid recovers most of the height, not
 * all of it, and the map is context here rather than the question.
 */
const LOCATOR_WIDTH_SHORT_GRID = 208

/**
 * A map question's map — the prompt itself rather than context beside one.
 *
 * 240 rather than the locator's 200: this is the only thing on screen carrying the
 * question, and the country is drawn at 46 % of the frame, so the shape a user has to
 * recognise is smaller than the picture.
 *
 * Shrinks less than the locator on a short screen, and that asymmetry is the point: this
 * map IS the question. 180 is the floor at which telling Norway from Sweden is still a
 * question about a coastline rather than about eyesight.
 */
// A map question's map IS the prompt, so it stays the larger of the two.
const MAP_PROMPT_WIDTH = 300
const MAP_PROMPT_WIDTH_SHORT = 180

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
}

export function LessonScreen({
  onExit,
  mode = 'normal',
  coins = 0,
  isTaster = false,
  focus,
  length,
}: {
  onExit: (summary: LessonExit) => void
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
   * How many questions, when the user asked for a number.
   *
   * Absent keeps the measured default: `lessonLength(itemMs)` sizes a lesson to about two
   * minutes for THIS user, which is what makes "five minutes a day" a real promise. A
   * chosen length overrides that on purpose — someone with four minutes on a bus has told
   * us something the pace estimate cannot know.
   */
  length?: number | undefined
}) {
  const t = useT()
  const { index, memory, status, reload, isOffline } = useContent()
  const [screen, setScreen] = useState<ScreenState>('loading')

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

  // Latched, never unlatched. Moving the mascot is what gives the row room to unwrap,
  // so a flag that followed the measurement would flip back the moment it took effect
  // and oscillate forever. Once the chips have told us they do not fit beside him, that
  // is a fact about this screen at this width and stays true until it remounts.
  const [rewardsWrapped, setRewardsWrapped] = useState(false)
  const chipHeight = useRef(0)
  const rowHeight = useRef(0)

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
  const optionsTop = useRef(0)
  // Called from BOTH `onLayout`s rather than only the row's, because their order is not
  // guaranteed — on web these come from a ResizeObserver, and a row that measured before
  // its chip would compare against a height of zero and conclude, permanently, that
  // nothing wrapped. Whichever arrives second is the one that decides.
  const measureRewards = useCallback(() => {
    if (chipHeight.current > 0 && rowHeight.current > chipHeight.current * WRAPPED_AT) {
      setRewardsWrapped(true)
    }
  }, [])
  const mascot = Math.round(sheetWidth * MASCOT_OF_SHEET)


  // Sized from the user's own pace, not a hardcoded ten. `lessonLength` aims at a
  // two-minute lesson so that "five minutes a day" is a real promise rather than a
  // number in Settings — see features/lesson/usePace.ts for why this was inert.
  const itemMs = useItemPace()
  const questions = useMemo<readonly Question[]>(() => {
    if (status !== 'ready' || !index) return []
    return index.compose({
      count: length ?? lessonLength(itemMs),
      ...(focus ? { focus } : {}),
    })
  }, [status, index, itemMs, focus, length])

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
    const quest = index === null ? null : todaysQuest(index.index, memory)

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
    // Local, immediate, and independent of the queue. The weekly chart on Profile
    // must be right the moment the lesson ends — waiting for the server round trip
    // would show an empty week to anyone who finishes a lesson offline.
    recordLessonCompleted()
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

    // Achievements, evaluated on device. Optimistic like the XP above — the server
    // is still the authority on the coins an unlock pays out (ADR 0006). Without
    // this the achievements screen could never show a single unlock.
    const durationMs = Date.now() - (state.startedAt ?? Date.now())
    for (const unlock of recordLessonForAchievements({
      accuracy: optimistic.accuracy,
      durationMs,
      at: Date.now(),
    })) {
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
  }, [isOffline, index, memory, isTaster])

  const timeLimitMs = mode === 'speed' ? SPEED_SECONDS * 1000 : null
  const lesson = useLesson({ questions, memory, timeLimitMs, onComplete: handleComplete })

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
    // A hair above the block, so the first option is not flush against the header.
    scroller.current?.scrollTo({ y: Math.max(0, optionsTop.current - space[3]), animated: true })
  }, [])

  useEffect(() => {
    if (lesson.state.phase !== 'answered') return
    revealOptions()
  }, [lesson.state.phase, revealOptions])

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
    if (status === 'loading') return setScreen('loading')
    if (status === 'error') return setScreen('error')
    if (questions.length === 0) return setScreen('empty')
    setScreen('ready')
    if (lesson.state.phase === 'idle') {
      lesson.start(makeUuid())
      track('lesson_started', {
        lesson_id: 'pending',
        kind: 'lesson',
        item_count: questions.length,
        source: 'home',
        was_offline: isOffline,
      })
    }
  }, [status, questions, lesson, isOffline])

  if (screen === 'loading') return <LoadingState />
  if (screen === 'error') return <ErrorState onRetry={reload} />
  if (screen === 'empty') return <EmptyState />

  if (lesson.state.phase === 'summary' || lesson.state.phase === 'abandoned') {
    const practised = practisedCountries(index?.index, lesson.state.answers)
    return (
      <LessonSummary
        result={lesson.optimistic}
        practised={practised}
        // The two phases arrive here for very different reasons and the screen says so.
        // Running out of hearts is NOT one of them — the machine sends that to
        // `summary`, because the lesson ended rather than the user leaving it.
        wasAbandoned={lesson.state.phase === 'abandoned'}
        isOffline={isOffline}
        onExit={() =>
          onExit({
            practised: practised.map((c) => c.id),
            questCompleted: questCompleted.current,
          })
        }
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

  const answered = lesson.state.phase === 'answered'

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
   * Only used to decide whether the praise under "Perfect!" is allowed to mention a
   * streak. Computed rather than tracked because the answer log is already the truth
   * and a second counter beside it is a second thing that can disagree with it.
   */
  const correctRun = (() => {
    let run = 0
    for (let i = lesson.state.answers.length - 1; i >= 0; i--) {
      if (lesson.state.answers[i]?.wasCorrect !== true) break
      run++
    }
    return run
  })()

  const lastAnswer = lesson.state.answers[lesson.state.answers.length - 1]
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
  const lastAward = lastAnswer ? lesson.awardFor(lastAnswer) : null

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
        <ProgressBar
          current={lesson.progress.current}
          total={lesson.progress.total}
          label={t('lesson:progress.label')}
          style={styles.flex}
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
      </View>

      <ScrollView ref={scroller} contentContainerStyle={[styles.body, compact && styles.bodyShort]}>
        {/* Centred by spacers, not by `justifyContent` — see `Spacer`. A two-option
            question should not cling to the top of a tall phone, and at 320×568 the
            prompt plus a map plus four options overflow, which is where centring with
            `justifyContent` puts the prompt above scroll position zero and out of reach.
            Measured before the change: option four sat at 535–594 of 568. */}
        <Spacer />
        <Text style={styles.prompt} role="heading">
          {/* The prompt key and its params come from the question template in the
              content pack, so they are validated by `pnpm content:validate` rather
              than by the compiler. */}
          {tContent(question.promptKey, question.promptParams)}
        </Text>

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
          <View style={styles.promptArt} testID="prompt-art">
            <Flag
              path={question.promptAsset}
              width={FLAG_PROMPT_WIDTH}
              label={tContent(question.promptKey, question.promptParams)}
            />
          </View>
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
        {question.locator !== undefined && (
          <View
            style={styles.promptArt}
            testID={question.modality === 'map' ? 'prompt-map' : 'prompt-locator'}
          >
            <CountryMap
              path={question.locator.path}
              contextPath={question.locator.contextPath}
              // A map question's map is the prompt, so it gets the same width as the
              // flag prompt does — big enough that telling Norway from Sweden is a
              // question about the coastline rather than about eyesight.
              width={
                question.modality === 'map'
                  ? compact
                    ? MAP_PROMPT_WIDTH_SHORT
                    : MAP_PROMPT_WIDTH
                  : compact
                    ? pictureOptions
                      ? LOCATOR_WIDTH_SHORT_GRID
                      : LOCATOR_WIDTH_SHORT
                    : LOCATOR_WIDTH
              }
              // Labelled ONLY when it is the question. Beside a capital-city question
              // the prompt already names the country in words, so a reader announcing
              // the map would repeat it. Here nothing else says what is on screen —
              // though a reader user should never reach this branch at all, because
              // `screenReaderOnly` swaps in tpl.location-of.mc4 before composing.
              {...(question.modality === 'map'
                ? { label: tContent(question.promptKey, question.promptParams) }
                : {})}
            />
          </View>
        )}

        <View
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
            // Scrolled from HERE as well as from the effect, and this is the call that
            // actually lands. The sheet is a sibling, so mounting it shrinks the scroll
            // viewport and the two Spacers inside the content redistribute — which moves
            // this block. The effect fires on the phase change, before that relayout, so
            // on its own it scrolls to where the options USED to be and leaves the first
            // one clipped under the header. This fires after the new position is known.
            if (answered) revealOptions()
          }}
        >
          {question.options.map((option, index) => {
            const state = optionState(
              option.isCorrect,
              option.id,
              answered,
              lastAnswer?.chosenOptionId,
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
              onPress={() => {
                // Fired from the option's own correctness rather than from the
                // state after dispatch: the reducer has not run yet at this point,
                // and reading `lastAnswer` here would buzz for the PREVIOUS question.
                // Sound and haptic together, both from the option's own correctness
                // rather than from the state after dispatch — the reducer has not run
                // yet, so reading `lastAnswer` here would fire for the PREVIOUS
                // question. Both are no-ops when their toggle is off.
                if (option.isCorrect) {
                  hapticCorrect()
                  soundCorrect()
                } else {
                  hapticWrong()
                  soundWrong()
                }

                // The richest event we have, and the one that sets lesson length
                // honestly: accuracy by POSITION is a measurement, not a guess.
                // Timed from `shownAt` for the same reason the countdown is —
                // the deadline belongs to when the question appeared.
                const elapsedMs = Date.now() - (lesson.state.shownAt ?? Date.now())
                track('question_answered', {
                  lesson_id: lesson.state.lessonId,
                  template_id: question.item.templateId,
                  fact_id: question.item.factId,
                  correct: option.isCorrect,
                  elapsed_ms: elapsedMs,
                  rating: deriveRating(option.isCorrect, elapsedMs, itemMs),
                  position: lesson.state.index,
                })

                lesson.answer(option.id)
              }}
              // So tests can select answers POSITIVELY. The helper used to take every
              // button that was not labelled "Continue", which silently swallowed the
              // close button the moment one existed and made two tests click pause
              // while believing they were answering.
              testID="answer-option"
            />
            )
          })}
        </View>

        <Spacer />
      </ScrollView>

      {answered && (
        <View style={styles.footer}>
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
                track('lesson_abandoned', {
                  lesson_id: lesson.state.lessonId,
                  at_item: lesson.state.index,
                  of_items: lesson.state.questions.length,
                  reason: 'out_of_hearts',
                })
                lesson.abandon()
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
            <View style={styles.sheet}>
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
                // Cleared of the mascot exactly like `sheetText` below, and for a
                // sharper reason. The mascot is bottom-anchored and painted after this
                // block, so on a correct answer he stands on the START edge — the same
                // edge `styles.reveal` aligns the flag to — and on a short sheet he
                // covers it. The one picture in this app that is not decorative, hidden
                // by the one that is.
                <View
                  style={[
                    styles.reveal,
                    lastAnswer?.wasCorrect === true && !rewardsWrapped
                      ? { paddingStart: mascot }
                      : { paddingEnd: mascot },
                  ]}
                  testID="reveal-asset"
                >
                  <Flag
                    path={question.revealAsset}
                    width={REVEAL_WIDTH}
                    label={tContent(question.promptKey, question.promptParams)}
                  />
                </View>
              )}

              {/* Behind the button because it is drawn BEFORE it and positioned to
                  overlap — later siblings paint on top, so the occlusion is the layout
                  rather than a mask. Decorative: the sheet already says what happened
                  and reads out the reward, and a screen reader announcing the mascot
                  after every answer is the definition of noise.

                  He appears on BOTH verdicts, which he did not before. Correct got
                  Atlas cheering and wrong got two lines of text and a button, so the
                  character turned up only when you were already pleased — and the
                  screen where "gentle settle, we don't punish" is the actual rule was
                  the coldest surface in the app. `encouraging` and not `celebrate`:
                  the register changes, the presence does not.

                  On the end side when wrong, because that copy is a full sentence
                  naming the right answer rather than one word of praise, and a sentence
                  reads better against the start edge than indented past a mascot. */}
              <View
                style={[
                  lastAnswer?.wasCorrect === true && !rewardsWrapped
                    ? styles.sheetMascot
                    : styles.sheetMascotEnd,
                  { width: mascot },
                ]}
                pointerEvents="none"
              >
                <Art
                  name={lastAnswer?.wasCorrect === true ? 'atlas/celebrate' : 'atlas/encouraging'}
                  size={mascot}
                />
              </View>
              <View
                style={
                  lastAnswer?.wasCorrect === true && !rewardsWrapped
                    ? [styles.sheetText, { paddingStart: mascot }]
                    : [styles.sheetText, { paddingEnd: mascot }]
                }
              >
                {lastAnswer?.wasCorrect ? (
            <>
              <Text style={styles.feedbackTitleOk}>{t('lesson:feedback.correct.title')}</Text>
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
                {correctRun >= STREAK_PRAISE
                  ? t('lesson:feedback.correct.streak')
                  : t('lesson:feedback.correct.body', {
                      entityName: question.options.find((o) => o.isCorrect)?.label ?? '',
                    })}
              </Text>
              <View
                style={styles.rewards}
                onLayout={(e) => {
                  rowHeight.current = e.nativeEvent.layout.height
                  measureRewards()
                }}
              >
                {/* One chip measures itself so the row above knows what one row is. */}
                <View
                  onLayout={(e) => {
                    chipHeight.current = e.nativeEvent.layout.height
                    measureRewards()
                  }}
                >
                  <Stat
                    kind="xp"
                    value={`+${lastAward?.xp ?? 0}`}
                    accessibilityLabel={t('lesson:reward.xp', { amount: lastAward?.xp ?? 0 })}
                  />
                </View>
                <Stat
                  kind="coin"
                  value={`+${lastAward?.coins ?? 0}`}
                  accessibilityLabel={t('lesson:reward.coins', { amount: lastAward?.coins ?? 0 })}
                />
              </View>
            </>
          ) : (
            // Never "Wrong!". State the truth, name the right answer, move on.
            <>
              <Text style={styles.feedbackTitle}>
                {/* A timeout has no chosen option. "That's undefined." is what the
                    normal branch would render, and the clock running out is not the
                    user choosing wrongly — it deserves its own neutral sentence. */}
                {lastAnswer?.chosenOptionId == null
                  ? t('lesson:speed.timeUp')
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
              <Button label={t('common:continue')} onPress={lesson.advance} />
            </View>
          )}
        </View>
      )}

    </View>
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
) {
  if (!answered) return 'idle' as const
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

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT()

  return (
    <View style={[styles.screen, styles.centered]}>
      <Text style={styles.prompt}>{t('common:error.generic.title')}</Text>
      <Text style={styles.feedbackBody}>{t('common:error.generic.body')}</Text>
      <Button label={t('common:retry')} onPress={onRetry} style={styles.retry} />
    </View>
  )
}

/** Never a dead end — an empty queue is celebrated, then offers what is next. */
function EmptyState() {
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
    </View>
  )
}

function OfflineBanner() {
  const t = useT()

  return (
    <View style={styles.offline} role="alert">
      <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  clockTrack: {
    width: 56,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    overflow: 'hidden',
  },
  clockFill: { height: '100%', backgroundColor: colors.status.streak },
  screen: { flex: 1, padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
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
  prompt: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
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
    overflow: 'hidden',
    gap: space[3],
    padding: space[4],
    // Taller at the top than the sides, so the mascot has room to stand up to the
    // heading rather than topping out at the reward chips. Measured against the
    // reference, whose panel is a quarter of the screen tall where ours was a fifth.
    paddingTop: space[5],
    borderRadius: radius.lg,
    ...squircle,
    backgroundColor: colors.bg.surfaceRaised,
  },
  // Anchored so the feet land INSIDE the button's band rather than on the sheet's floor.
  // The button is a later sibling in normal flow, so it paints over — that overlap is the
  // whole mechanic, and a mascot that stops neatly above the button is a sticker. At
  // `bottom: 0` the feet cleared the button's underside and reappeared in the sheet's
  // bottom padding as a smudge; 24 puts them safely behind it.
  //
  // Inset from the sheet's edge rather than flush to it, because the mascot's glow is
  // part of the art and `overflow: hidden` was slicing it off. 12 against the sheet's own
  // 16 of screen inset puts the mascot ~7 % in from the screen edge, which is where the
  // reference has it.
  sheetMascot: { position: 'absolute', insetInlineStart: space[3], bottom: space[5] },
  // The other side, for when the chips need the start edge. `insetInlineEnd` and not
  // `right`: this mirrors in RTL, and it has to — the text it is getting out of the way
  // of mirrors too, so a mascot pinned to a physical edge would be standing on the copy
  // in Arabic and nowhere near it in English.
  sheetMascotEnd: { position: 'absolute', insetInlineEnd: space[3], bottom: space[5] },
  // Clear of the mascot. The reference lets its text start 32px inside the mascot's
  // bounding box, because a mascot's box is wider than its shoulders — so this leans on
  // the same slack rather than adding the full width.
  sheetText: { gap: space[2] },
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
  retry: { marginTop: space[4] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
    ...squircle,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
