/**
 * Onboarding — mockup screen 2.
 *
 * Language → three value slides → age gate → daily goal → continent → level → taster
 * lesson. The order is the product decision, not a layout one: **the user completes a real lesson before we
 * ask for an account**, which is the single highest-leverage conversion choice in the
 * app (screen-catalog.md 2). Ask first and most people leave; teach first and the
 * account is worth having.
 *
 * ## The age gate
 *
 * Neutral date entry. Never "are you over 13?" — a yes/no gate teaches a ten-year-old
 * that lying gets them in, which is both useless as compliance and a bad first thing
 * to teach a child. A birth year is answered honestly by people who have no reason to
 * think it matters, which is the point.
 *
 * Under-13 branches to the child experience, and the screen says what that means in
 * words a ten-year-old can read. It is framed as something we do FOR them, because it
 * is: no social, no third-party analytics, nothing shared. Not a punishment, not a
 * smaller app.
 *
 * ## Why it is one screen and not five routes
 *
 * Back should step within onboarding, not out of it, and a five-route stack makes
 * "back" ambiguous at every boundary. A single screen with an explicit step keeps the
 * whole flow reviewable in one file and testable without a router.
 *
 * That argument was made here long before the control existed: there was no back at all
 * for seven questions, each one final the moment it was answered. The reasoning was
 * written down and the feature was forgotten, which is a failure mode worth naming
 * because a comment describing a behaviour reads exactly like one implementing it.
 *
 * ## How a question is asked and answered
 *
 * Atlas asks it, out of a `SpeechBubble`, and a single-select answer IS the navigation —
 * no Continue underneath agreeing with a choice already made. `age` keeps a button
 * because a wheel is a scroll, `slides` because a carousel is not a question, and
 * `taster` because starting a lesson is a different kind of act.
 *
 * The rationale, the measurements and what was deliberately NOT taken from the donor are
 * in `docs/design/onboarding-transplant.md`.
 *
 * Purely presentational — what the user chose goes out through `onFinish`. The route
 * writes it to storage.
 *
 * ## What the August 2026 iOS pass changed, and why
 *
 * Five screenshots of this flow off TestFlight are what started that work, so most of
 * the findings in `docs/design/ios-native-audit.md` are findings about this file:
 *
 * · The carousel **did not swipe** (N6). Three slides, page dots underneath, and the
 *   only way forward was to tap. On iOS a page-dotted carousel that ignores a swipe is
 *   a broken carousel, and this is the first screen a new user ever sees.
 * · The **hero moved between slides** (O7), because two flex spacers redistributed
 *   around a one-line versus a two-line title. Invisible on a tapped carousel and
 *   unmissable on a swiped one — the picture would slide sideways and jump vertically
 *   at the same time. The art block is now a fixed height and the text hangs below it.
 * · The **age step overflowed at 320** (O5). See `WheelPicker`.
 * · **Two progress indicators disagreed** (O4): the four-step bar read `1 / 4` on both
 *   of the first two slides while the dot moved underneath it. The bar is now a 4 pt
 *   rule with no numeral — the dots count the slides, the bar counts the flow, and only
 *   one of them is loud.
 * · The **title ran to the frame edge** (O8) because only `body` carried horizontal
 *   padding.
 * · The goal step's three cards are now **one inset group** with hairline separators and
 *   a checkmark (N7, N8) — an iOS list rather than three floating rectangles.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import {
  Button,
  Card,
  ProgressBar,
  Spacer,
  colors,
  layout,
  radius,
  space,
  squircle,
  text,
  SpeechBubble,
  Slider,
  useAnimatedTo,
} from '@worldquest/design'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { hapticSelect } from '../../lib/haptics.js'
import { DAILY_GOALS, type DailyGoal, type LanguageChoice } from '../settings/usePreferences.js'
import { LANGUAGE_CHOICES } from '../settings/usePreferences.js'
import { LOCALE_ENDONYM, type Locale } from '@worldquest/i18n'
import {
  CONTINENT_ART,
  CONTINENT_SILHOUETTE,
  REGION_NAME,
  REGIONS,
  type RegionCode,
} from '../explore/ExploreScreen.js'
import { Art } from '../../components/Art.js'
import { WheelPicker, type WheelOption } from '../../components/WheelPicker.js'
import type { LevelChoice } from './levels.js'
import { PERKS } from './perks.js'
import type { ArtName } from '../../lib/art.generated.js'

/** The age at which the child branch applies. COPPA; GDPR-K varies by country and is stricter in places. */
export const CHILD_AGE = 13

export type OnboardingResult = {
  readonly birthYear: number
  readonly isChild: boolean
  readonly dailyGoalMinutes: DailyGoal
  /**
   * The language they picked. Already APPLIED by the time this arrives — the picker
   * writes the preference on tap so the next screen is in the new language — and
   * reported here so the route stores it alongside everything else rather than the
   * screen owning half the persistence.
   */
  readonly language: LanguageChoice
  /** The continent the first lessons stay in, or null for the whole world. */
  readonly startRegion: string | null
  readonly level: LevelChoice
}

export type OnboardingScreenProps = {
  /** Injected so the screen stays pure — no `new Date()` in a component. */
  readonly currentYear: number
  /**
   * The language in force right now, and how to change it.
   *
   * Props rather than `usePreferences()` inside the screen, which keeps the split this
   * file's header describes: everything the user sees lives here, everything that
   * persists lives in the route. It also keeps the flow mountable by a component test
   * and by the screenshot renderer, neither of which has device storage.
   *
   * `onLanguage` applies IMMEDIATELY rather than at the end. A language picker whose
   * effect arrives four screens later is a language picker nobody trusts they used.
   */
  readonly language: LanguageChoice
  readonly onLanguage: (choice: LanguageChoice) => void
  readonly onFinish: (result: OnboardingResult) => void
  readonly onSignIn?: (() => void) | undefined
}

type Step =
  | 'language'
  | 'slides'
  | 'age'
  | 'goal'
  | 'region'
  | 'level'
  | 'plan'
  | 'offer'
  | 'taster'

/**
 * The order, and why each step is where it is.
 *
 * **Language first**, before a single word of the pitch. Every other screen in this flow
 * assumes the user can read it; the one screen that must not is the one that fixes that.
 * It is also the cheapest possible first interaction — a tap on your own language, with
 * nothing to think about.
 *
 * **Slides before the questions.** Ask first and most people leave; show what the app is
 * for and the questions become worth answering.
 *
 * **Age before anything personalising.** It is the compliance gate, and everything after
 * it is allowed to differ for a child.
 *
 * **Region and level after the goal**, because both are about the CONTENT of the first
 * lesson and the goal is about the habit. Grouping the two content questions next to the
 * taster keeps the last thing before playing about what you are going to play.
 *
 * Every one of these questions changes something. That is the entry condition for being
 * on this list, and it is why there is no "how did you hear about us" and no reminder
 * time: nothing in this app would consume either answer today, and a question whose
 * answer goes nowhere is a form, not an onboarding.
 */
const STEPS: readonly Step[] = [
  'language',
  'slides',
  'age',
  'goal',
  'region',
  'level',
  'plan',
  'offer',
  'taster',
]

/**
 * The steps that still end in a button, and therefore still need a footer.
 *
 * `slides` has next/skip because a carousel is not a question. `age` has Continue
 * because a wheel is a scroll and a scroll that navigated on settling would advance
 * while the user was still looking for their year. `taster` has one because starting a
 * lesson is a different kind of act from answering a question.
 *
 * Everything else answers by being tapped.
 */
const HAS_ACTION = new Set<Step>(['slides', 'age', 'goal', 'level', 'plan', 'offer', 'taster'])

/**
 * The levels in scale order, which is the order the slider lays them out in.
 *
 * `Object.keys(LEVELS)` would do it today and is exactly the kind of thing that stops
 * being true silently: object key order is insertion order, so a level inserted in the
 * middle of `levels.ts` would reorder the track under the user without touching this
 * file. Written down, in the order a person would put them in.
 */
const LEVEL_STOPS = ['new', 'some', 'confident'] as const satisfies readonly LevelChoice[]

/**
 * Atlas's pose and his line, per question step.
 *
 * `voice-and-tone.md` says Atlas appears at first launch and that his range is
 * *excited → interested → encouraging*. He was already on three of these steps and
 * doing none of that: a picture above a heading is a mascot in the room, not a mascot
 * asking. Moving the question INTO his mouth is the whole graft — the same words in a
 * bubble beside a character are somebody asking you something, and on a heading they
 * are an app labelling a form.
 *
 * The poses are chosen for what the step is FOR, not for variety: `welcome` on the
 * first thing anybody sees, `thinking` where he is asking you to decide something,
 * `explorer` where the question is about the world, `encouraging` where the honest
 * answer might be "I don't know much" and nobody should feel graded for saying so.
 *
 * There is no line for `slides` or `taster`: the carousel has its own copy per page and
 * the taster hands off to a lesson, and Atlas talking over either would be a second
 * voice on a screen that already has one.
 */
const ASK = {
  language: { art: 'atlas/welcome', line: 'onboarding:language.title' },
  age: { art: 'atlas/thinking', line: 'onboarding:age.title' },
  goal: { art: 'atlas/thinking', line: 'onboarding:goal.title' },
  region: { art: 'atlas/explorer', line: 'onboarding:region.title' },
  level: { art: 'atlas/encouraging', line: 'onboarding:level.title' },
  // `celebrate`, because the questions are over and this is the payoff for answering
  // them — the one step that tells rather than asks.
  plan: { art: 'atlas/celebrate', line: 'onboarding:plan.title' },
  offer: { art: 'atlas/resting', line: 'onboarding:offer.title' },
} as const satisfies Partial<Record<Step, { art: ArtName; line: TranslationKey }>>

/**
 * How long an answer is allowed to land before the next question arrives.
 *
 * Not decoration and therefore not collapsed under reduced motion: this is the beat in
 * which the tick appears and the haptic fires, and cutting it would mean the screen
 * changed at the instant of the tap with no confirmation that the tap did anything.
 * `motion.base` is the same 260 ms the step transition itself uses, so the answer
 * registers and the step begins to leave as one movement rather than two.
 */
const ANSWER_BEAT_MS = 260

/**
 * The year the birth-year wheel opens on — a scroll position, not an answer.
 *
 * It used to open at the top, which is the current year, so a user born in 1990 spun
 * past three decades to reach themselves. 2000 is a round number near the middle of the
 * range anybody is plausibly answering with, so the average journey is short from either
 * direction.
 *
 * **Nothing is selected.** The empty "Choose a year" row is still what is checked and
 * Continue is still disabled until a real tap. That is not fussiness: this answer decides
 * whether a child gets the child experience — no social, no third-party analytics — and a
 * pre-filled adult year would make tapping through the fastest way for a ten-year-old to
 * be treated as twenty-six. `OnboardingScreen.test.tsx` asserts the empty row is what the
 * wheel opens checked on, and that test is the guard on this distinction.
 */
const OPENS_AT = 2000

/** Seven. Named because `goal * 7` in a template reads like a magic number. */
const DAYS_A_WEEK = 7


const LEVEL_COPY = {
  new: { label: 'onboarding:level.new', body: 'onboarding:level.newBody' },
  some: { label: 'onboarding:level.some', body: 'onboarding:level.someBody' },
  confident: { label: 'onboarding:level.confident', body: 'onboarding:level.confidentBody' },
} as const satisfies Record<LevelChoice, { label: TranslationKey; body: TranslationKey }>

/**
 * Atlas beside his own speech bubble, on a step where he is asking something.
 *
 * Smaller than the 104 it was when he sat above a heading, and smaller again than the
 * slides' hero. Those screens are a picture plus a sentence; these are a question the
 * user has to read and a list they have to pick from, and the speaker has to fit
 * BESIDE the words rather than above them — at 104 the bubble had about 190 pt of
 * width left on a 320 pt screen, which is four words a line.
 *
 * 72 is the largest that leaves the bubble a readable measure at 320. Verified in
 * `pnpm design:shots`, not chosen by eye.
 */
const ASK_ART = 148

/**
 * The same mascot on a phone too short to afford him at full size.
 *
 * The age step is the one that pays: its wheel is fixed-height control, and every point
 * Atlas takes comes out of it. Photographed, not predicted — the 390 shot of the same
 * step has room to spare, which is exactly why this is a height question and not a
 * width one.
 *
 * Shrinking the SPEAKER rather than dropping him keeps the question in his mouth on
 * every step. A flow where six questions are asked by a character and the seventh is a
 * bare heading reads as the seventh being broken.
 *
 * `SHORT_SCREEN` is `LessonScreen`'s number and is deliberately the same one: 700, from
 * the same measurement of what a 320-wide phone actually gives you.
 */
const ASK_ART_SHORT = 104
const SHORT_SCREEN = 700

/**
 * What Atlas does with an answer, in the beat before the next question.
 *
 * The beat already existed — 260 ms in which the tick lands and the haptic fires — and
 * nothing was using it but a timer. `voice-and-tone.md` gives him a range of *excited →
 * interested → encouraging* and eight poses were drawn for it; the flow was using four
 * and holding each one perfectly still.
 *
 * So the pose he asks in is one thing and the pose he receives an answer in is another.
 * It is the cheapest possible warmth: no new art, no new copy, one state.
 */
const REACTION: ArtName = 'atlas/celebrate'

/**
 * A continent's picture on the region step.
 *
 * Sized so seven of them plus their labels fit above the fold on a 320-wide phone in a
 * three-column grid — the whole point of showing pictures instead of a list is that the
 * user sees all seven at once and picks the one they recognise.
 */
const REGION_ART = 72

/**
 * The height the hero block occupies on every slide, whatever is drawn in it.
 *
 * Fixed, not intrinsic, and that is the whole point (O7): on a swiped carousel the
 * picture must not move vertically as the page moves horizontally. The three
 * illustrations have different subject boxes, so an intrinsic height would step between
 * them by 20-odd points and the eye reads that as the page snapping crookedly.
 */
const HERO = 220

/**
 * The three value slides, each with the illustration briefed for it.
 *
 * The art is a property of the slide rather than a lookup beside it, so a fourth slide
 * cannot be added without deciding what it shows — the failure mode of the parallel
 * array that used to live next door, where `SLIDE_TINT` had to be indexed defensively
 * because nothing guaranteed the two were the same length.
 *
 * Written out as literal key pairs rather than a number and string interpolation:
 * `t()` is typed per key — each one carries its own parameter type — so a computed key
 * erases exactly the checking the typed catalogue exists to provide. Written out, a
 * renamed or deleted string is a compile error here instead of a raw key on the first
 * screen a new user ever sees.
 */
const SLIDES = [
  { title: 'onboarding:slide.1.title', body: 'onboarding:slide.1.body', art: 'onboarding/explore' },
  { title: 'onboarding:slide.2.title', body: 'onboarding:slide.2.body', art: 'onboarding/learn' },
  { title: 'onboarding:slide.3.title', body: 'onboarding:slide.3.body', art: 'onboarding/conquer' },
] as const satisfies readonly { title: TranslationKey; body: TranslationKey; art: ArtName }[]

const GOAL_LABEL = {
  5: 'onboarding:goal.casual',
  10: 'onboarding:goal.regular',
  20: 'onboarding:goal.serious',
} as const

export function OnboardingScreen({
  currentYear,
  language,
  onLanguage,
  onFinish,
  onSignIn,
}: OnboardingScreenProps) {
  const t = useT()
  // `language`, not `slides`. Everything after this point assumes the user can read the
  // screen; this is the one step whose job is to make that true.
  const [step, setStep] = useState<Step>('language')
  const [slide, setSlide] = useState(0)
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const [goal, setGoal] = useState<DailyGoal>(10)
  // `null` is "anywhere", a real answer rather than a missing one — see the copy note
  // on `onboarding:region.anywhere`.
  const [startRegion, setStartRegion] = useState<RegionCode | null>(null)
  const [level, setLevel] = useState<LevelChoice>('some')

  /**
   * The page width, measured rather than assumed.
   *
   * The router caps every screen at `layout.maxContentWidth` and centres it, so on a
   * tablet the window is wider than this screen is. A carousel paged at the window's
   * width would advance by more than one page and land between slides. The window is
   * only the seed, for the frame before layout reports — and in jsdom, where it never
   * does.
   */
  const window = useWindowDimensions()
  const askArt = window.height < SHORT_SCREEN ? ASK_ART_SHORT : ASK_ART
  // Set for the length of the answer beat, cleared by the step change that follows.
  const [reacting, setReacting] = useState(false)
  const [page, setPage] = useState(Math.min(window.width, layout.maxContentWidth))
  const onFrameLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width
    if (width > 0 && Math.abs(width - page) > 1) setPage(width)
  }

  const pager = useRef<ScrollView>(null)

  /**
   * Onboarding instrumentation.
   *
   * This funnel is the one place the product can lose someone before they have
   * experienced anything, so `onboarding_abandoned` carries the step they left from:
   * "we lose 40 % of people" is a fact you cannot act on, and "we lose 40 % of people
   * on the age gate" is a Monday morning's work.
   *
   * The events fire from the screen rather than the route because the screen is what
   * holds the step state. `track()` no-ops for child accounts, and at this point in
   * the flow the age answer has not been stored yet — so the audience is still unknown
   * and `track` treats unknown as a child. That is the correct conservative default
   * and it means these events are only ever recorded for users we know are adults.
   */
  const finished = useRef(false)
  // Kept in a ref because the unmount cleanup below closes over the FIRST render's
  // `step`, and the step they abandoned on is the whole point of the event.
  const stepRef = useRef<Step>(step)
  stepRef.current = step

  useEffect(() => {
    if (step === 'slides') track('onboarding_slide_viewed', { index: slide })
  }, [step, slide])

  useEffect(
    () => () => {
      // A user who completed the flow left through `finish`, which sets this —
      // everyone else abandoned.
      if (!finished.current) track('onboarding_abandoned', { last_step: stepRef.current })
    },
    [],
  )

  const isChild = birthYear !== null && currentYear - birthYear < CHILD_AGE
  const stepIndex = STEPS.indexOf(step) + 1

  /**
   * The step change, given a direction.
   *
   * `setStep` used to swap the subtree and the screen changed in a single frame with no
   * indication that anything had moved (M3). A four-step flow whose steps do not
   * *arrive* reads as four unrelated screens. `useAnimatedTo` collapses to an instant
   * set under reduced motion, which is the correct behaviour rather than a compromise —
   * the movement here is decoration, not feedback.
   */
  /**
   * Which way the flow is travelling, so a step arrives from the side it came from.
   *
   * The entrance below interpolates on `stepIndex`, which is direction-blind: going
   * back animated the new step in from the right exactly as going forward does, so
   * "back" looked like "forward" and the one control whose entire job is to feel like
   * a reversal felt like another step deeper. A ref rather than state — it is read
   * during the render that the step change causes, and storing it in state would need
   * a second render to apply.
   */
  const direction = useRef<1 | -1>(1)

  const go = (next: Step): void => {
    direction.current = STEPS.indexOf(next) > STEPS.indexOf(step) ? 1 : -1
    setStep(next)
  }

  /**
   * One step back, and nothing to press on the first step.
   *
   * There was no back at all. Seven questions, each one final the moment it was
   * answered — and this file's own header argued about back SEMANTICS ("back should
   * step within onboarding, not out of it") as a reason for the single-screen design,
   * while no back control was ever built. The argument was won and the control was
   * never added, which is how a design decision becomes a missing feature.
   *
   * It matters more now than it did: every single-select step advances on tap, so an
   * answer commits without a confirming press. Auto-advance without a back is a trap;
   * the two ship together or neither does.
   */
  /**
   * Answer, feel it land, move on — the mechanic this whole pass is for.
   *
   * Every single-select step used to cost two taps: one on the answer, one on a
   * Continue that could not do anything except agree with the answer already given.
   * Four of the seven steps worked that way, so a user who changed nothing still paid
   * four presses to say "yes, that" — and the button sat at the bottom of the screen,
   * a thumb-length from the row they had just touched.
   *
   * The wheel step keeps its Continue and is not a bug in this rule: a wheel is a
   * scroll, and a scroll that navigates the moment it settles would advance while the
   * user is still looking for their year.
   */
  const advancing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(advancing.current), [])

  const answer = (next: Step, apply: () => void): void => {
    apply()
    hapticSelect()
    setReacting(true)
    // Cleared first, so a fast double-tap on two different rows lands on the LAST one
    // rather than firing two transitions.
    clearTimeout(advancing.current)
    advancing.current = setTimeout(() => {
      setReacting(false)
      go(next)
    }, ANSWER_BEAT_MS)
  }

  /**
   * Atlas, and the question he is asking, stacked.
   *
   * Written once and used on all five question steps. It was five copies of the same
   * three lines, which is how the region step ended up without the mascot the other
   * four had — the arrangement has to live in one place or it drifts.
   */
  /**
   * Atlas arriving, once, on the first thing anybody ever sees.
   *
   * The flow used to begin with a language list simply *being there*. Nothing announced
   * that a character was going to be asking the questions, so his appearance on step one
   * read as an illustration rather than as somebody walking up.
   *
   * Deliberately NOT on the splash. `SplashScreen`'s header is explicit that it is not a
   * brand moment and holds no minimum duration — "a splash held open so the logo can be
   * admired is an app made slower on purpose" — and an entrance there would cost every
   * user, on every cold start, forever. Here it costs the first screen of a flow that was
   * already going to be shown, and it happens while the user is reading.
   *
   * `useAnimatedTo` collapses to a zero-duration timing under reduced motion, so the
   * arrival still LANDS: Atlas ends up the same size in the same place, he just does not
   * travel. That is the design system's settled answer and re-deriving it here with a
   * hand-rolled spring would be a second one.
   */
  const [arrived, setArrived] = useState(false)
  useEffect(() => setArrived(true), [])
  const arrival = useAnimatedTo(arrived ? 1 : 0, 'expressive')
  const arrivalStyle = {
    opacity: arrival,
    transform: [
      { scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
      // Down from above rather than up from below: he is arriving INTO the frame, and
      // the bubble hangs off his feet, so a rise would push the question off the bottom
      // on the way in.
      { translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [-space[6], 0] }) },
    ],
  }

  const Ask = ({ step: at }: { step: keyof typeof ASK }) => (
    <View style={styles.ask}>
      {/* The arrival plays on the FIRST step only. Every later step already enters
          through `stepStyle`, and two entrances stacked on one element read as a
          stutter rather than as emphasis. */}
      <Animated.View style={at === 'language' ? arrivalStyle : undefined}>
        <Art name={reacting ? REACTION : ASK[at].art} size={askArt} />
      </Animated.View>
      <SpeechBubble from="top" style={styles.askBubble}>
        {t(ASK[at].line)}
      </SpeechBubble>
    </View>
  )

  const canGoBack = stepIndex > 1
  const back = (): void => {
    const previous = STEPS[STEPS.indexOf(step) - 1]
    if (previous === undefined) return
    hapticSelect()
    go(previous)
  }

  const entrance = useAnimatedTo(stepIndex, 'base')
  const stepStyle = {
    opacity: entrance.interpolate({
      inputRange: [stepIndex - 1, stepIndex],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateX: entrance.interpolate({
          inputRange: [stepIndex - 1, stepIndex],
          outputRange: [space[6] * direction.current, 0],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  }

  /** The wheel's rows: the empty one, then this year backwards. See `WheelPicker`. */
  const years = useMemo<readonly WheelOption<number>[]>(
    () => [
      { value: null, label: t('onboarding:age.none') },
      ...yearsFor(currentYear).map((year) => ({ value: year, label: String(year) })),
    ],
    [currentYear, t],
  )

  const goToSlide = (index: number): void => {
    setSlide(index)
    pager.current?.scrollTo({ x: index * page, animated: true })
  }

  const onPagerSettled = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, page))
    if (index !== slide && index >= 0 && index < SLIDES.length) setSlide(index)
  }

  const finish = (): void => {
    // `birthYear` cannot be null here — the age step is the only way past it — but the
    // type says it can, and a cast would be a lie that outlives this function.
    if (birthYear === null) return
    finished.current = true
    onFinish({ birthYear, isChild, dailyGoalMinutes: goal, language, startRegion, level })
  }

  return (
    <View style={styles.root} onLayout={onFrameLayout}>
      {/* 4 pt and no numeral. This used to be a 16 pt bar with an accent-green `1 / 4`
          beside it, which is a game HUD; iOS's own progress view is 4 (N5). The count is
          gone because the dots below already count, and the two disagreed — both of the
          first two slides read `1 / 4` while the dot moved (O4). The bar still carries
          the full step count for a screen reader, which is where a number belongs when
          the picture cannot hold one. */}
      {/* The label belongs ON the bar, not on a plain wrapper around it.

          A `View` carrying only `accessibilityLabel` is not an accessibility element —
          iOS never focuses it, so the step count was written, reviewed, and announced to
          nobody. `ProgressBar` is already `accessible` with `role="progressbar"`, so the
          same string reaches VoiceOver as the bar's name and value with no extra node,
          and the fourth platform-a11y prop in this repo to no-op silently gets to be the
          last. */}
      {/* Back and progress on ONE row, which is the arrangement every flow the user has
          already met uses — theirs is a chevron at the left of a bar, and putting the
          bar alone here made this the only multi-step flow on the phone with no way
          out of a step.

          The chevron holds its space when it is disabled rather than unmounting, so the
          bar does not grow by 44 pt between step one and step two — a progress bar that
          changes LENGTH as you advance is reporting two things at once and neither
          legibly. */}
      <View style={styles.progress}>
        <Pressable
          onPress={back}
          disabled={!canGoBack}
          aria-label={t('onboarding:back')}
          aria-disabled={!canGoBack}
          role="button"
          hitSlop={12}
          style={styles.back}
        >
          {/* A glyph, not an icon font: this is one character in a repo with no icon
              set, and the alternative is a third-party dependency for a chevron. Hidden
              from the reader because the Pressable is already named — otherwise the
              control announces its own arrowhead. */}
          <Text
            style={[styles.backGlyph, !canGoBack && styles.backGlyphOff]}
            aria-hidden
            importantForAccessibility="no-hide-descendants"
          >
            ‹
          </Text>
        </Pressable>

        <View style={styles.progressBar}>
          <ProgressBar
            current={stepIndex}
            total={STEPS.length}
            height={4}
            showCount={false}
            // As the VALUE, not the `label` — `label` renders visibly, and a written step
            // count beside the dots is the exact duplication finding O4 removed.
            valueText={t('onboarding:progress', { step: stepIndex, total: STEPS.length })}
          />
        </View>
      </View>

      <Animated.View style={[styles.stepFill, stepStyle]}>
        {step === 'slides' && (
          <>
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPagerSettled}
              style={styles.pager}
            >
              {SLIDES.map((s) => (
                <View key={s.title} style={[styles.slide, { width: page }]}>
                  {/* Full bleed, and `bleed` rather than `auto`.

                      `auto` gives whole-frame art a PANEL: the file's own 3:2 box, a
                      hairline border and a 28 pt radius, which is right for a portrait
                      dropped into a list and wrong for the hero of an onboarding slide.
                      `onboarding/explore` is genuinely a full-frame composition — Atlas
                      under a parachute at the top, the curve of the earth across the
                      bottom — so it is correctly measured as a panel and was still
                      rendering as a 200 pt bordered rectangle with the parachute clipped
                      at the top edge and the horizon at the bottom. It read as a
                      screenshot pasted into the layout, which is exactly the placeholder
                      look this flow already had (O2).

                      At the page's own width the box stops being a frame around the art
                      and becomes the art, which is what a value slide's hero is for. The
                      other two are cutouts and fill the same band with their subject, so
                      the three read as one sequence at one scale. */}
                  <Art name={s.art} size={page} height={HERO} frame="bleed" />
                  <View style={styles.slideText}>
                    <Text style={styles.title}>{t(s.title)}</Text>
                    <Text style={styles.body}>{t(s.body)}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Position, and a target — a carousel whose dots cannot be tapped is a
                carousel that traps anyone who overshoots. Now that the pages swipe, the
                dots are the second way in rather than the only one, which is why they
                keep their radio-ish semantics and their 44 pt slop. */}
            <View style={styles.dots} role="tablist">
              {SLIDES.map((s, i) => (
                <Pressable
                  key={s.title}
                  role="tab"
                  // `slide`, not `progress`. The bar above counts the flow's four
                  // steps and these count the three slides inside the first one, so
                  // sharing a string meant a reader heard "Step 2 of 4" and then
                  // "Step 1 of 3" about the same moment.
                  aria-label={t('onboarding:slide.position', { index: i + 1, total: SLIDES.length })}
                  aria-selected={i === slide}
                  // Pressable, not a View with onTouchEnd — see TabBar. onTouchEnd
                  // responds to a finger and to nothing else: no mouse, no keyboard,
                  // no screen-reader activation.
                  onPress={() => goToSlide(i)}
                  // The dot is 8pt of paint; the target has to be 44.
                  hitSlop={18}
                  style={[styles.dot, i === slide && styles.dotOn]}
                />
              ))}
            </View>
          </>
        )}

        {step === 'age' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {/* Two growing spacers, so a short step sits in the middle of its screen
                rather than hanging from the top of it — and `Spacer` rather than
                `justifyContent: 'center'`, because centring a scroll view's content puts
                its first child above scroll position zero when that content overflows,
                where no gesture on a phone can reach it. `pnpm scrollable` fails the
                other spelling and points at Spacer.tsx. */}
            <Spacer />

            {/* One heading, not three. This step used to run h1 → body → `Choose a
                year` (h2) → `DECADE` (overline) → chips, which is four levels of
                hierarchy for a single question (O6). The wheel is self-evident and the
                answer is legible in it, so the ladder is gone. */}
            {/* Atlas asks this one too. It is the most sensitive question in the flow —
                it decides whether a child gets the child experience — and a bare heading
                reading "When were you born?" is a form demanding an identity document,
                where the same words from a character are somebody asking. */}
            <Ask step="age" />
            <Text style={styles.body}>{t('onboarding:age.body')}</Text>

            <View style={styles.wheelWrap}>
              <WheelPicker
                options={years}
                value={birthYear}
                onChange={setBirthYear}
                label={t('onboarding:age.year')}
                // Opens AT 2000, selects nothing. See `restingIndex` and `OPENS_AT`.
                restingIndex={years.findIndex((year) => year.value === OPENS_AT)}
              />
            </View>

            {isChild && (
              <Card level={2} style={styles.childNote}>
                <Text style={styles.childTitle}>{t('onboarding:age.child.title')}</Text>
                <Text style={styles.body}>{t('onboarding:age.child.body')}</Text>
              </Card>
            )}

            <Spacer />
          </ScrollView>
        )}

        {step === 'goal' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Spacer />

            <Ask step="goal" />
            <Text style={styles.body}>{t('onboarding:goal.body')}</Text>

            {/* A track, like the level step and for the same reason: five, ten and twenty
                minutes are one axis with a direction, not three unrelated options. It
                opens on ten — the documented default — so the no-opinion path is to drag
                nothing and press Continue.

                Like `level` and unlike the tapped steps, it keeps its button: a drag
                passes through every value on its way to one. */}
            <Slider
              stops={DAILY_GOALS.map((minutes) => ({
                label: t('onboarding:goal.minutes', { minutes }),
              }))}
              value={DAILY_GOALS.indexOf(goal)}
              onChange={(index) => {
                const next = DAILY_GOALS[index]
                if (next === undefined || next === goal) return
                hapticSelect()
                setGoal(next)
              }}
              label={t('onboarding:goal.title')}
              style={styles.levelSlider}
            />

            {/* What the chosen pace MEANS, under the track it was chosen on — "Casual",
                "Regular", "Serious". The row version showed all three at once, which is
                three labels to weigh before answering; one at a time is the same
                information at the moment it is relevant. */}
            <Text style={styles.levelBody}>{t(GOAL_LABEL[goal])}</Text>

            <Spacer />
          </ScrollView>
        )}

        {step === 'language' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Spacer />
            {/* `welcome`, and it is the first thing anybody ever sees of this app. */}
            <Ask step="language" />
            <Text style={styles.body}>{t('onboarding:language.body')}</Text>

            <View style={styles.group} role="radiogroup" aria-label={t('onboarding:language.title')}>
              {LANGUAGE_CHOICES.map((choice, index) => {
                const chosen = language === choice
                return (
                  <Pressable
                    key={choice}
                    role="radio"
                    aria-checked={chosen}
                    // Applied on tap, and the step is left on the same tap.
                    //
                    // The redraw is not lost by advancing — it is better seen. The whole
                    // screen changes language during the beat, and then the NEXT
                    // question arrives already in it, which demonstrates the setting
                    // reaches the rest of the app rather than just this list.
                    onPress={() => answer('slides', () => onLanguage(choice))}
                    style={[styles.groupRow, index > 0 && styles.groupRowDivided]}
                  >
                    {/* The endonym, never a translation — see `LOCALE_ENDONYM`. The
                        system row is the exception and is deliberately in the current
                        language: it names a behaviour rather than a language. */}
                    <Text style={styles.goalMinutes}>
                      {choice === 'system'
                        ? t('onboarding:language.system')
                        : LOCALE_ENDONYM[choice as Locale]}
                    </Text>
                    <View style={styles.flex} />
                    <Text
                      style={[styles.tick, !chosen && styles.tickOff]}
                      aria-hidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      ✓
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Spacer />
          </ScrollView>
        )}

        {step === 'region' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Ask step="region" />
            <Text style={styles.body}>{t('onboarding:region.body')}</Text>

            {/* The continent artwork, at the one moment it is the subject rather than a
                tile background. Seven pictures of the world is the most premium this
                flow gets to look, and it costs nothing new: the same masters the Explore
                tab already ships. */}
            {/* One radiogroup around ALL eight options, grid and "anywhere" alike.
                "Anywhere" used to sit outside it. It is the same question, and it is the
                mutually exclusive answer that makes the other seven a choice rather than
                a toggle — but a screen reader announced it as a lone radio belonging to
                nothing: "radio, not checked", with no group name and no "8 of 8" to
                place it among the continents it competes with. */}
            <View
              style={styles.regionGroup}
              role="radiogroup"
              aria-label={t('onboarding:region.title')}
            >
              <View style={styles.regionGrid}>
                {REGIONS.map((code) => {
                  const chosen = startRegion === code
                  return (
                    <Pressable
                      key={code}
                      role="radio"
                      aria-checked={chosen}
                      aria-label={t(REGION_NAME[code])}
                      onPress={() =>
                        answer('level', () => {
                          setStartRegion(code)
                          track('onboarding_region_selected', { region: code })
                        })
                      }
                      style={[styles.regionCell, chosen && styles.regionCellOn]}
                    >
                      {/* Sky, then landmass, the same two layers the Explore tiles use.
                          The sky alone is seven coloured gradients — correct as atmosphere
                          and a map of nowhere, which is the exact gap the silhouettes were
                          delivered to close. Antarctica has no silhouette in the delivery
                          and renders as sky, which is what `CONTINENT_SILHOUETTE` being
                          `Partial` is for. */}
                      <View style={styles.regionArt}>
                        <Art name={CONTINENT_ART[code]} size={REGION_ART} frame="bleed" />
                        {CONTINENT_SILHOUETTE[code] !== undefined && (
                          <View style={styles.regionShape} pointerEvents="none">
                            <Art
                              name={CONTINENT_SILHOUETTE[code]}
                              size={Math.round(REGION_ART * 0.78)}
                              frame="bleed"
                            />
                          </View>
                        )}
                      </View>
                      <Text style={styles.regionLabel} numberOfLines={1}>
                        {t(REGION_NAME[code])}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Pressable
                role="radio"
                aria-checked={startRegion === null}
                onPress={() =>
                  answer('level', () => {
                    setStartRegion(null)
                    track('onboarding_region_selected', { region: 'world' })
                  })
                }
                style={[styles.anywhere, startRegion === null && styles.anywhereOn]}
              >
                <Text style={styles.goalMinutes}>{t('onboarding:region.anywhere')}</Text>
                <View style={styles.flex} />
                <Text
                  style={[styles.tick, startRegion !== null && styles.tickOff]}
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                >
                  ✓
                </Text>
              </Pressable>
            </View>

            <Spacer />
          </ScrollView>
        )}

        {step === 'level' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Spacer />
            <Ask step="level" />
            <Text style={styles.body}>{t('onboarding:level.body')}</Text>

            {/* A track, not three rows.
                These three answers are a SCALE — one axis with a direction, where the
                middle one is between the other two — and a radio group says nothing
                about that. The shape of the control now carries the shape of the
                question, which is the part a list could never do.

                It is also the one question that does not advance on being answered: a
                drag passes through the values on its way, so leaving on change would
                leave on the first stop crossed. Hence the button below. */}
            <Slider
              stops={LEVEL_STOPS.map((choice) => ({ label: t(LEVEL_COPY[choice].label) }))}
              value={LEVEL_STOPS.indexOf(level)}
              onChange={(index) => {
                const next = LEVEL_STOPS[index]
                if (next === undefined || next === level) return
                hapticSelect()
                setLevel(next)
              }}
              label={t('onboarding:level.title')}
              style={styles.levelSlider}
            />

            {/* What the chosen level actually means, under the track it was chosen on.
                The row version carried this per option and showed all three at once,
                which is three sentences to read before answering; one at a time is the
                same information at the moment it is relevant. */}
            <Text style={styles.levelBody}>{t(LEVEL_COPY[level].body)}</Text>

            <Spacer />
          </ScrollView>
        )}

        {step === 'plan' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Spacer />
            <Ask step="plan" />

            {/* Their own three answers, read back.
                Not a "performance" projection: this app has never measured what a week of
                it teaches, and PROJECT.md forbids shipping a number it cannot source. So
                the summary states what the user just chose, and the one number under it is
                arithmetic on their own answer rather than a claim about them. */}
            <View style={styles.group}>
              {(
                [
                  ['onboarding:plan.pace', t('onboarding:goal.minutes', { minutes: goal })],
                  [
                    'onboarding:plan.start',
                    startRegion === null ? t('onboarding:plan.world') : t(REGION_NAME[startRegion]),
                  ],
                  ['onboarding:plan.level', t(LEVEL_COPY[level].label)],
                ] as const
              ).map(([label, value], index) => (
                <View key={label} style={[styles.groupRow, index > 0 && styles.groupRowDivided]}>
                  <Text style={styles.planLabel}>{t(label)}</Text>
                  <View style={styles.flex} />
                  <Text style={styles.goalMinutes}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.planWeek}>
              {t('onboarding:plan.week', { minutes: goal * DAYS_A_WEEK })}
            </Text>
            <Text style={styles.body}>{t('onboarding:plan.body')}</Text>
            <Spacer />
          </ScrollView>
        )}

        {step === 'offer' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Spacer />
            <Ask step="offer" />

            {/* Leads with what is FREE, because that is both true and the most important
                thing on the screen. `paywall.json`'s own line is "Every lesson stays free.
                Always." — this step reuses that copy rather than inventing a pitch, and
                reuses the four perks rather than inventing features.

                No countdown, no "limited time", no price. The primary button below is
                Continue, so the free lesson is one tap away from here; PROJECT.md rule 7
                is the reason, and a child never reaches this step at all. */}
            <Text style={styles.body}>{t('onboarding:offer.body')}</Text>

            <View style={styles.group}>
              {PERKS.map((perk, index) => (
                <View key={perk} style={[styles.groupRow, index > 0 && styles.groupRowDivided]}>
                  <Text style={styles.goalMinutes}>{t(perk)}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.planWeek}>{t('onboarding:offer.later')}</Text>
            <Spacer />
          </ScrollView>
        )}

        {step === 'taster' && (
          <View style={styles.centred}>
            {/* Atlas waving from a globe. The taster is the handover into the first
                lesson, and this is the one frame briefed as "confident and inviting".
                It photographed as a small robot in an empty bordered box, because the
                build had measured this asset as a whole-frame panel — see
                `scripts/build-art.cjs` and Audit 4. */}
            <View style={styles.hero}>
              <Art name="atlas/welcome" size={HERO} />
            </View>
            <Text style={styles.title}>{t('onboarding:taster.title')}</Text>
            <Text style={styles.body}>{t('onboarding:taster.body')}</Text>
          </View>
        )}
      </Animated.View>

      {/* Rendered only when the step HAS a button.
          Four of the seven steps lost theirs when answering became the navigation, and
          an empty padded container is still 32 pt of reserved floor — a strip of nothing
          under the answers, exactly where the thumb has learned to expect a control.
          Photographed at 320 before this line existed: the list sat high with a void
          beneath it and read as a screen still loading its button. */}
      {HAS_ACTION.has(step) && <View style={styles.actions}>
        {step === 'slides' && (
          <>
            <Button
              label={slide < SLIDES.length - 1 ? t('onboarding:cta.next') : t('onboarding:cta.start')}
              onPress={() =>
                slide < SLIDES.length - 1 ? goToSlide(slide + 1) : go('age')
              }
            />
            <Button variant="ghost" label={t('onboarding:cta.skip')} onPress={() => go('age')} />
          </>
        )}

        {step === 'age' && (
          <Button
            label={t('onboarding:age.continue')}
            // Disabled rather than hidden: a button that appears when you finally
            // reach the right year is a button nobody knew they were looking for.
            disabled={birthYear === null}
            onPress={() => go('goal')}
          />
        )}

        {step === 'goal' && (
          <Button
            label={t('onboarding:age.continue')}
            onPress={() => {
              track('onboarding_goal_selected', { minutes: goal })
              go('region')
            }}
          />
        )}

        {step === 'level' && (
          <Button
            label={t('onboarding:age.continue')}
            onPress={() => {
              track('onboarding_level_selected', { level })
              go('plan')
            }}
          />
        )}

        {/* No Continue on `language` or `region`.
            Each of those is one question with one answer, and the tap on the answer is
            the whole interaction — a button underneath could only ever agree with a
            choice already made, at the cost of a second press and a thumb journey to
            the bottom of the screen. `age` keeps its button because a wheel is a
            scroll, `level` because a drag passes through every value on its way to one,
            and `taster` because starting a lesson is a different kind of act from
            answering a question. */}

        {step === 'plan' && (
          <Button label={t('onboarding:age.continue')} onPress={() => go(isChild ? 'taster' : 'offer')} />
        )}

        {step === 'offer' && (
          <Button label={t('onboarding:age.continue')} onPress={() => go('taster')} />
        )}

        {step === 'taster' && (
          <>
            <Button label={t('onboarding:taster.start')} onPress={finish} />
            {/* Not shown to children: there is no account for them to already have,
                and offering one is offering a flow we would have to refuse. */}
            {!isChild && onSignIn !== undefined && (
              <Button
                variant="ghost"
                label={t('onboarding:cta.haveAccount')}
                onPress={onSignIn}
              />
            )}
          </>
        )}
      </View>}
    </View>
  )
}

/**
 * The birth years we offer, newest first.
 *
 * A hundred years rather than ninety: the oldest verified people alive are past 115,
 * and a picker that cannot express a real user's age is a picker that makes them lie.
 *
 * Newest first because a wheel is read downward from where it opens, and the empty row
 * sits at the top. The distance from "Choose a year" to a plausible answer is then
 * proportional to age, which is the right way round — the median user is closer to the
 * top than the bottom.
 */
const OLDEST = 100

function yearsFor(currentYear: number): readonly number[] {
  const out: number[] = []
  for (let year = currentYear; year >= currentYear - OLDEST; year--) out.push(year)
  return out
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /**
   * Atlas and his bubble, side by side.
   *
   * `alignItems: 'flex-start'` so a two-line question grows DOWNWARD past him rather
   * than re-centring him against it — the tail is pinned near the top of the bubble and
   * has to stay pointing at his head whatever the question's length.
   */
  /**
   * Atlas above, his question below — a column, not a row.
   *
   * Side by side, a 320 pt screen had to be split between them, so the speaker was
   * capped at 72 pt to leave the question a readable measure and neither got what it
   * needed. Stacked, both get the whole width: Atlas is 148 and the sentence still
   * breaks where a sentence should.
   */
  ask: { alignItems: 'center', alignSelf: 'stretch', marginBottom: space[4] },
  // Overlaps the art slightly so the tail reads as coming OUT of him rather than
  // floating below his feet.
  askBubble: { marginTop: -space[2] },
  levelSlider: { marginTop: space[5], marginBottom: space[4] },
  planLabel: { ...text('body'), color: colors.text.secondary },
  planWeek: { ...text('body'), color: colors.text.secondary, textAlign: 'center', marginTop: space[4] },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  // 44 square, because it is a real target and the glyph inside it is 8 pt of paint.
  back: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -space[3],
  },
  backGlyph: { ...text('h1'), color: colors.text.secondary, lineHeight: undefined },
  // Dimmed, not gone. On step one there is nowhere back TO, and a control that
  // disappears and reappears teaches the user it might not be there next time.
  backGlyphOff: { color: colors.text.tertiary, opacity: 0.4 },
  progressBar: { flex: 1 },
  // The step owns everything between the bar and the buttons, and it is `flex: 1` so a
  // short step centres inside it rather than hanging from the top of the screen.
  stepFill: { flex: 1 },
  pager: { flex: 1 },
  /**
   * One page.
   *
   * `justifyContent: 'center'` is safe HERE and nowhere else in this file: a horizontal
   * pager's pages never overflow vertically — the hero is a fixed height and the copy is
   * two or three lines — so there is no leading overflow to strand above scroll position
   * zero. The vertical steps use a ScrollView with padding instead, for exactly the
   * reason `Spacer` exists.
   *
   * ## `flex: 1` is load-bearing here, and it looks like it should not be
   *
   * It reads like a mistake — `flex` is a MAIN-axis instruction, the main axis of a
   * horizontal pager is horizontal, and the width is already set inline from the
   * measured viewport (`{ width: page }`) because that is what `pagingEnabled` snaps to.
   * A reviewer flagged it as exactly that. It is not: in this container the explicit
   * width wins the main axis outright, and `flex: 1` is what gives the page the pager's
   * HEIGHT — without which `justifyContent: 'center'` has nothing to centre inside.
   *
   * Both alternatives were built and photographed. Removing it, and replacing it with
   * `alignSelf: 'stretch'`, produce the identical wrong picture: the slide collapses to
   * its content and the hero and copy ride at the top of the screen with a third of the
   * page empty beneath them. The pager's content container is auto-height, so there is
   * nothing for the cross axis to stretch against.
   *
   * Left as it is, with the reasoning written down, because this is the third time a
   * plausible-looking simplification has been proposed for it.
   */
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The padding lives on the TEXT, not on the page: the hero is full-bleed and a page
  // with side padding would inset it.
  slideText: { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: space[5] },
  // Fixed, so the picture does not move as the pages do. See HERO.
  hero: { height: HERO, alignItems: 'center', justifyContent: 'center' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[5] },
  /**
   * The vertical steps, sized for the SHORT phone rather than the design target.
   *
   * At 390×844 there is room for anything; the constraint is 320×568, where a two-line
   * heading, three lines of body, a 220 pt wheel and a 90 pt action bar come to within
   * about thirty points of the viewport. The first version of this spent `space[6]` on
   * top padding and another `space[5]` above the heading, which pushed the bottom of the
   * wheel under the Continue button — so the step opened on a control cut in half, which
   * is the same defect the chip grid had (O5) wearing different clothes.
   *
   * It still scrolls, and the wheel scrolls inside it. This is about what the user sees
   * in the first frame, which is the only frame most of them judge it on.
   */
  form: {
    alignItems: 'center',
    paddingHorizontal: space[5],
    paddingBottom: space[4],
    paddingTop: space[3],
    gap: space[2],
    // Required by the spacers above: without it the container is exactly as tall as its
    // content, there is no free space, and they divide nothing.
    flexGrow: 1,
  },
  title: {
    ...text('h1'),
    color: colors.text.primary,
    textAlign: 'center',
    marginTop: space[4],
    marginBottom: space[2],
    // O8: only `body` carried this, so at 390 the Swedish slide-1 title reached both
    // margins while the sentence under it did not.
    paddingHorizontal: space[3],
  },
  body: {
    ...text('body'),
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: space[3],
  },
  dots: { flexDirection: 'row', gap: space[2], alignSelf: 'center', paddingVertical: space[5] },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.bg.surfaceRaised },
  dotOn: { backgroundColor: colors.action.primary, width: 24 },
  wheelWrap: { alignSelf: 'stretch', marginTop: space[4] },
  flex: { flex: 1 },
  /**
   * Three across, so all seven continents are visible without scrolling.
   *
   * `space-between` and a percentage width rather than a gap on the main axis, for the
   * same reason the lesson's answer grid does it: a percentage plus a gap overflows the
   * row by the gap.
   */
  /**
   * Carries what the grid and the "anywhere" row used to get from `form` directly.
   *
   * Wrapping them in one radiogroup made them a single child of a centred container
   * with a `gap`, so without these two lines the group shrinks to its content width and
   * loses the space between its two halves. The a11y grouping is free; the layout it
   * would quietly have cost is not.
   */
  regionGroup: { alignSelf: 'stretch', gap: space[2] },
  regionGrid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space[3],
    marginTop: space[4],
  },
  regionCell: {
    width: '31%',
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[2],
    borderRadius: radius.lg,
    ...squircle,
    // A transparent ring so choosing one never changes the layout — the same rule the
    // goal rows kept before they became a list.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  regionCellOn: { borderColor: colors.action.primaryEdge, backgroundColor: colors.bg.surface },
  /**
   * The two-layer picture, clipped to its own rounded box.
   *
   * 3:2, because `Art` draws a 3:2 master `size` wide — a square box would band the sky
   * above and below it. `overflow: 'hidden'` is what lets the landmass be drawn larger
   * than the frame and cropped by it, which is how the Explore tiles get a shape that
   * fills its card instead of floating in the middle of one.
   */
  regionArt: {
    width: REGION_ART,
    height: Math.round(REGION_ART / 1.5),
    borderRadius: radius.md,
    ...squircle,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionShape: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  regionLabel: { ...text('caption', { weight: '700' }), color: colors.text.primary },
  anywhere: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space[4],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    minHeight: layout.minTouchTarget,
    borderRadius: radius.lg,
    ...squircle,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
  },
  anywhereOn: { borderColor: colors.action.primaryEdge },
  // Under the level's own label, so the row says what the choice MEANS rather than
  // making the user infer it from three adjectives.
  levelBody: { ...text('caption'), color: colors.text.secondary, marginTop: space[1] },
  childNote: { marginTop: space[5], padding: space[4], alignItems: 'center' },
  childTitle: { ...text('h3'), color: colors.text.primary, marginBottom: space[2] },
  // The inset group: one surface, one radius, one border. Rows draw their own hairline
  // on top and the first one does not, which is what makes a group read as a group.
  group: {
    alignSelf: 'stretch',
    marginTop: space[5],
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    ...squircle,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    // 44 is the floor; this lands well above it, and stating it means a translation that
    // shortens the label cannot drop the row below the line.
    minHeight: 44,
  },
  groupRowDivided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  goalMinutes: { ...text('h3', { numeric: true }), color: colors.text.primary },
  // Takes the slack, so the tick sits hard against the trailing edge whatever the label
  // is — `flex: 1` on the middle child rather than `space-between` on the row, because
  // the row has three children and `space-between` would centre the second one.
  goalLabel: { ...text('body'), color: colors.text.secondary, flex: 1 },
  tick: { ...text('h3'), color: colors.action.primary },
  // Reserved rather than removed — selection changes colour, never layout.
  tickOff: { opacity: 0 },
  actions: { padding: space[4], gap: space[2] },
})
