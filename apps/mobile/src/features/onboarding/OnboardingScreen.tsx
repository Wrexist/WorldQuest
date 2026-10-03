import { createThemeStyles, Spacer } from '@worldquest/design'
/**
 * Welcome, language, value slides, age, goal, region, level, plan, then a taster.
 * The first real lesson still precedes any account request. Revisable preferences
 * keep their selection visible until Continue; only language applies immediately.
 * Question art has a stable compact frame, while text and choices grow in a scroller.
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
  ClaySurface,
  ProgressBar,
  layout,
  radius,
  space,
  squircle,
  text,
  SpeechBubble,
  Slider,
  useAnimatedTo,
  useStagger,
  staggerStyle,
} from '@worldquest/design'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { hapticSelect } from '../../lib/haptics.js'
import { DAILY_GOALS, type DailyGoal, type LanguageChoice } from '../settings/usePreferences.js'
import { LANGUAGE_CHOICES } from '../settings/usePreferences.js'
import { LOCALE_ENDONYM, type Locale } from '@worldquest/i18n'
import {
  REGION_NAME,
  REGIONS,
  type RegionCode,
} from '../explore/ExploreScreen.js'
import { Art } from '../../components/Art.js'
import { ClayMap } from '../../components/ClayMap.js'
import { IslandStage, SceneryBanner, type SceneryName } from '../../components/Scenery.js'
import { Icon } from '../../components/Icon.js'
import { CloudBackdrop } from '../../components/CloudBackdrop.js'
import { LaunchHero } from '../../components/LaunchHero.js'
import { WheelPicker, type WheelOption } from '../../components/WheelPicker.js'
import type { LevelChoice } from './levels.js'
import { ART_GEOMETRY, type ArtName } from '../../lib/art.generated.js'

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
  /**
   * How many countries this build ships, for the third slide's promise.
   *
   * A prop, from `COUNTRY_COUNT`, rather than a number in the copy. The slide read
   * "195 flags. 195 capitals." — the UN member-state count, and the right number for the
   * app this becomes — while the packs held 65 and the very next screen said so. A new
   * user met the pitch and its contradiction inside thirty seconds.
   *
   * Defaulted so the screenshot renderer and the component tests mount without it, the
   * same as every other optional here.
   */
  readonly countryCount?: number | undefined
}

type Step =
  | 'welcome'
  | 'language'
  | 'slides'
  | 'age'
  | 'goal'
  | 'region'
  | 'level'
  | 'plan'
  | 'taster'

/**
 * The order, and why each step is where it is.
 *
 * **Welcome first**, and it is the only step here that asks nothing. It exists so the
 * returning user's door is at the front (see the header) and so the character who asks the
 * next seven questions gets to arrive before he starts asking them.
 *
 * It is deliberately in front of `language`, which used to be first on the argument that
 * "every other screen in this flow assumes the user can read it". That argument turned out
 * to prove less than it claimed: the default language is `system`, so on first launch the
 * app is *already* in the device's language and the welcome frame is read in it. What the
 * language step actually offers is an override, and an override is not the thing that has
 * to come before the greeting. The frame in front of it is also the least reading in the
 * whole flow — a name, a sentence, and two buttons.
 *
 * **Language second**, before a single word of the pitch. That part of the old argument
 * stands: the three slides are the one place where prose is doing the work, and they must
 * be in a language the reader chose.
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
  'welcome',
  'language',
  'slides',
  'age',
  'goal',
  'region',
  'level',
  'plan',
  'taster',
]

/**
 * The steps that still end in a button, and therefore still need a footer.
 *
 * `welcome` has two because it is not a question at all — it is a front door with a
 * handle on each side. `slides` has next/skip because a carousel is not a question. `age`
 * has Continue because a wheel is a scroll and a scroll that navigated on settling would
 * advance while the user was still looking for their year. `taster` has one because
 * starting a lesson is a different kind of act from answering a question.
 *
 * Only the language choice advances immediately; other preferences are revisable.
 */
const HAS_ACTION = new Set<Step>([
  'welcome',
  'slides',
  'age',
  'goal',
  'region',
  'level',
  'plan',
  'taster',
])

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

/**
 * The continents a first lesson can start in: the ones with countries in the packs.
 *
 * Explore lists Antarctica, where there is geography to look at; a first lesson there has
 * no country to ask about, and its card was sky without a landmass, a pale blur at the end
 * of the grid (round-3 design review). Six cells also fill the two-column grid evenly.
 */
const START_REGIONS = REGIONS.filter((code) => code !== 'AN')

/** Seven. Named because `goal * 7` in a template reads like a magic number. */
const DAYS_A_WEEK = 7

/**
 * How many steps the progress bar counts: everything except the welcome frame.
 *
 * Derived rather than typed, so a ninth question moves this on its own — and expressed as
 * "the flow minus the greeting" rather than as a number, because that is the sentence the
 * bar is trying to say.
 */
const SETUP_STEPS = STEPS.length - 1

/**
 * The selected-row tick, at the size the `h3` glyph it replaces occupied.
 *
 * Fixed rather than font-scaled, which is `Icon`'s own rule: an icon that grows with the
 * text setting overflows the 44 pt row it sits in, and the LABEL beside it is what
 * carries the scale.
 */
const TICK = 20


const LEVEL_COPY = {
  new: { label: 'onboarding:level.new', body: 'onboarding:level.newBody' },
  some: { label: 'onboarding:level.some', body: 'onboarding:level.someBody' },
  confident: { label: 'onboarding:level.confident', body: 'onboarding:level.confidentBody' },
} as const satisfies Record<LevelChoice, { label: TranslationKey; body: TranslationKey }>

/** A compact, prominent speaker beside the question; large text stacks the pair. */
const ASK_ART = space[9] + space[8]

/** Short phones leave more of the initial viewport for the answer controls. */
const ASK_ART_SHORT = space[9] + space[6]
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

/** Verified continent silhouettes retain their own proportions inside clay choices. */
const REGION_ART = space[9]

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
 * The island Atlas stands on at welcome and before the taster: about the hero band's own
 * height, so O7's fixed band still holds, with Atlas half of it, feet on the lawn.
 */
const STAGE = 232
const STAGE_ATLAS = 120

/** The welcome illustration has an intrinsic size, with no expanding colored panel. */
const WELCOME_STAGE = space[9] * 5

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
  { title: 'onboarding:slide.1.title', body: 'onboarding:slide.1.body', art: 'onboarding/explore', scene: 'europe' },
  { title: 'onboarding:slide.2.title', body: 'onboarding:slide.2.body', art: 'onboarding/learn', scene: 'island' },
  { title: 'onboarding:slide.3.title', body: 'onboarding:slide.3.body', art: 'onboarding/conquer', scene: 'stage' },
] as const satisfies readonly { title: TranslationKey; body: TranslationKey; art: ArtName; scene: SceneryName | 'stage' }[]

/**
 * The slide hero's band: the page's own width, at the art's own aspect.
 *
 * It was a flat 220 against a page of 390, and the comment beside the `Art` below claimed
 * that at the page's width "the box stops being a frame around the art and becomes the
 * art". For two of the three slides it did. For the first one — the first picture anybody
 * ever sees — it did the opposite: `onboarding/explore` is a whole-frame composition, so
 * fitting it into a 390×220 box fits the FRAME, and a 3:2 frame in a 1.77:1 box is 330
 * wide with 30 points of canvas down each side. Photographed, it is a bordered rectangle
 * with visible vertical seams sitting on the screen — exactly the pasted-screenshot look
 * that switching to `bleed` was meant to remove, surviving because the fix was measured on
 * the two slides that did not have the problem.
 *
 * Giving the band the art's aspect makes the whole-frame slide exactly full bleed, with
 * nothing letterboxed and nothing cropped, and gives the two cutouts a taller band to fill.
 * Still fixed per viewport — `page` does not change between slides — so O7 holds.
 *
 * Derived from the art rather than typed as 1.5: all three masters are 3:2 today, and a
 * fourth slide delivered at another aspect should move this number rather than reopen the
 * seam. The narrowest wins, because a band sized for the widest would letterbox the rest.
 */
const SLIDE_ASPECT = Math.min(...SLIDES.map((slide) => ART_GEOMETRY[slide.art].aspect))

/**
 * The share of the screen the hero band takes in the frame BEFORE layout reports.
 *
 * A seed, exactly like `page`'s: real life measures the pager and the copy and gives the
 * band what is left (see `band`), and this is what to draw until that arrives — and what
 * to draw in jsdom, where `onLayout` never fires at all.
 *
 * 0.3 rather than the art's own aspect because the first frame should err small: a band
 * that starts short and grows is a picture settling, and one that starts tall and shrinks
 * pushes the copy off the bottom and pulls it back.
 */
const BAND_OF_SCREEN = 0.3

const GOAL_LABEL = {
  5: 'onboarding:goal.casual',
  10: 'onboarding:goal.regular',
  20: 'onboarding:goal.serious',
} as const

/** Kept outside the screen so changing an answer never remounts Atlas. */
function OnboardingPrompt({ step, reacting, size, stacked }: {
  step: keyof typeof ASK
  reacting: boolean
  size: number
  stacked: boolean
}) {
  const { styles } = useThemeValues()
  const t = useT()
  return <View style={[styles.ask, stacked && styles.askStacked]}>
    <View style={styles.askCharacter}>
      <CloudBackdrop />
      <Art name={reacting ? REACTION : ASK[step].art} size={size} />
    </View>
    <SpeechBubble from={stacked ? 'top' : 'start'} style={[styles.askBubble, stacked && styles.askBubbleStacked]}>
      {t(ASK[step].line)}
    </SpeechBubble>
  </View>
}

export function OnboardingScreen({
  currentYear,
  language,
  onLanguage,
  onFinish,
  onSignIn,
  countryCount = 0,
}: OnboardingScreenProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  // The head of `STEPS`, and it is a greeting rather than a question — see that list.
  const [step, setStep] = useState<Step>('welcome')
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
  const largeText = window.fontScale > 1.3
  const welcomeStage = Math.min(window.width - space[6], WELCOME_STAGE)
  // Set for the length of the answer beat, cleared by the step change that follows.
  const [reacting, setReacting] = useState(false)
  const [page, setPage] = useState(Math.min(window.width, layout.maxContentWidth))
  /**
   * How tall the pager is, and how tall the tallest slide's copy is.
   *
   * Both measured, because the band below is the difference between them and neither can
   * be predicted. The copy especially: it is a paragraph, so its height is a function of
   * how it WRAPS, and the same sentence is two lines at 390 and three at 320.
   *
   * The copy is a maximum across all three slides rather than each slide's own, which is
   * O7 again — a band sized per slide would step by a line's height between a one-line
   * and a two-line title, and on a swiped carousel that reads as the page landing
   * crookedly. One height, taken from whichever slide needs most.
   *
   * Neither measurement depends on the band, so there is no loop: the pager is `flex: 1`
   * inside the step, and the copy's height follows the page's WIDTH.
   */
  const [pagerHeight, setPagerHeight] = useState(0)
  const [copyHeight, setCopyHeight] = useState(0)
  const onPagerLayout = (event: LayoutChangeEvent): void => {
    const height = event.nativeEvent.layout.height
    if (height > 0 && Math.abs(height - pagerHeight) > 1) setPagerHeight(height)
  }
  const onCopyLayout = (event: LayoutChangeEvent): void => {
    const height = event.nativeEvent.layout.height
    // Only ever grows. Three slides report in some order and the tallest is the one that
    // has to fit; taking the last would size the band to whichever laid out last.
    setCopyHeight(previous => height > previous + 1 ? height : previous)
  }

  /**
   * The hero band: the page's own width at the art's aspect, or what is left after the
   * copy, whichever is smaller.
   *
   * The width term is what makes the picture full bleed. The height term is what stops it
   * eating the sentence underneath it, and on a short phone it is the one that binds: a
   * slide's page does not scroll — `styles.slide` centres its content and clips what does
   * not fit, silently, at both ends — so at 320×568 the old fixed 220 pt hero put the last
   * line of slide one's sentence underneath the page dots, where no gesture on a phone can
   * reach it. Half a sentence missing on the first screen of the app reads as a fault.
   *
   * The band is what gives way, because it is the element with slack: a hero cropped by a
   * tenth is still a hero, and a sentence cut in half is not still a sentence.
   *
   * Measured rather than a fraction of the screen, which is what this was first: two
   * hand-tuned constants in a row both photographed as still clipping, because what has to
   * be cleared is a paragraph's wrapped height and there is no fraction of a viewport that
   * knows it. A translation that runs a line longer is now free, where every fixed
   * fraction was one line of Swedish away from being wrong again.
   */
  // Rounded, because a fractional height on a band whose art is clipped to it is a
  // subpixel seam on one edge and nothing on the other.
  const band = Math.round(
    Math.min(
      page / SLIDE_ASPECT,
      pagerHeight > 0 && copyHeight > 0
        ? Math.max(pagerHeight - copyHeight, 0)
        : window.height * BAND_OF_SCREEN,
    ),
  )
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
  /** Position in the whole flow, welcome included — what the entrance interpolates on. */
  const stepIndex = STEPS.indexOf(step) + 1
  /** Position in the part of the flow that is setup — what the bar counts. See the bar. */
  const setupIndex = stepIndex - 1

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

  /** Language applies immediately; its brief feedback beat precedes navigation. */
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
   * He arrives on `welcome` now rather than on `language`, which is the same animation on
   * the frame it was always describing: an entrance belongs on the step where there is
   * nothing else to do but watch it, not on one that is also asking you to pick something
   * out of a list.
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

  /**
   * The three things that settle in behind Atlas on the welcome frame.
   *
   * `useStagger` and `motion.stagger` — the design system's one answer to "these arrive in
   * order" — rather than a second sequence hand-rolled here. The donors measured for this
   * frame stagger at roughly 130 ms an item (`onboarding-transplant.md` §6); ours is the
   * token's 40, and that difference was a decision rather than an oversight. A second
   * stagger interval in the app would be a second answer to a settled question, and the
   * elements here are a wordmark, a line and a button stack — three items reading as one
   * gesture, not a grid being dealt out.
   *
   * Indexed from 1 because index 0 is Atlas, who is not staggered: he gets the scale-and-
   * drop `arrival` instead, because a mark that fades up eight points has not *arrived*,
   * it has merely appeared. Everything else follows him in.
   *
   * Hooks, so they run on every step and not just this one. That is correct rather than
   * merely tolerable: `welcome` is mounted at t=0, so all three have finished long before
   * any later step is reachable, and making them conditional would make them illegal.
   */
  const markIn = useStagger(1, 'expressive')
  const lineIn = useStagger(2, 'expressive')
  const doorsIn = useStagger(3, 'expressive')

  const ask = (at: keyof typeof ASK) => (
    <OnboardingPrompt step={at} reacting={reacting} size={askArt} stacked={largeText} />
  )

  /**
   * There is no disabled state any more, and that is the welcome frame's doing.
   *
   * The chevron used to be dimmed on step one — "disabled, not absent", so a control that
   * exists everywhere is never learned as one that might vanish. The frame in front of the
   * questions makes the whole condition unreachable: the only step with nothing behind it
   * is `welcome`, and `welcome` renders no chrome bar at all. Every step that draws this
   * row has somewhere to go back TO.
   *
   * So the dimming is gone rather than left in as a branch nothing can enter. `back` keeps
   * its own guard because the guard is about the array, not about the picture.
   */
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

          The chevron is live on every step that draws this row, because the only step
          with nothing behind it is the welcome frame and the welcome frame draws no row
          — see `back`. It still holds its 44 pt whatever happens, so the bar cannot
          change LENGTH as you advance, which would be a progress bar reporting two
          things at once and neither legibly. */}
      {/* Not on the welcome frame.
          A greeting under a bar reading "Step 1 of 9" is a greeting that has already told
          you it is a form, and none of the ten donors puts progress on the frame with the
          Get started button on it. The bar therefore counts the eight steps that are
          actually setup, starting at 1 on `language` — a bar that opened at 1/9 and then
          took two taps to reach 2/9 would be counting a step nobody was asked to take. */}
      {step !== 'welcome' && <View style={styles.progress}>
        <Pressable
          onPress={back}
          aria-label={t('onboarding:back')}
          role="button"
          hitSlop={12}
          style={styles.back}
        >
          {/* The icon, not a `‹`. This said "a glyph, not an icon font: one character in
              a repo with no icon set" — true when it was written and not since
              `pnpm build:icons` rasterised the Lucide set. `ScreenHeader` migrated its own
              back control and recorded the reason in one line: "the icon MIRRORS for RTL,
              which the `←` character never did". A chevron is the one glyph where that
              matters most — under RTL a back control pointing the wrong way is not a
              styling nit, it is an arrow to somewhere else.

              A literal character is also a different typeface on every device, which is
              the defect `build:icons` exists for: the tab bar shipped `⌂ ◎ ◈ ☺ ⋯` as text
              and four of them rendered as colour emoji.

              Decorative, because the Pressable is already named — otherwise the reader
              announces the action and then the arrowhead. */}
          <Icon name="back" size={22} color={colors.text.secondary} />
        </Pressable>

        <View style={styles.progressBar}>
          <ProgressBar
            current={setupIndex}
            total={SETUP_STEPS}
            height={4}
            showCount={false}
            // As the VALUE, not the `label` — `label` renders visibly, and a written step
            // count beside the dots is the exact duplication finding O4 removed.
            valueText={t('onboarding:progress', { step: setupIndex, total: SETUP_STEPS })}
          />
        </View>
      </View>}

      <Animated.View style={[styles.stepFill, stepStyle]}>
        {step === 'welcome' && (
          <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
            <Spacer />
            <Animated.View style={[styles.welcomeHero, { height: welcomeStage }, arrivalStyle]}>
              <LaunchHero size={welcomeStage} />
            </Animated.View>
            {/* The wordmark behaves like a logo. Prose and controls retain full text scaling. */}
            <Animated.Text maxFontSizeMultiplier={1.3} dataSet={{ maxScale: '1.3' }} style={[styles.wordmark, staggerStyle(markIn)]}>
              {t('splash:wordmark')}
            </Animated.Text>
            <Animated.Text style={[styles.body, staggerStyle(lineIn)]}>
              {t('onboarding:welcome.body')}
            </Animated.Text>
            <Spacer />
          </ScrollView>
        )}

        {step === 'slides' && (
          <>
            {/* The measurement wrapper the band is computed against.
                A plain View rather than `onLayout` on the ScrollView itself: that reads
                as equivalent and is not — the ScrollView's own layout event did not
                arrive in the web harness, the band silently kept its pre-layout seed, and
                the picture was identical to the one before the measurement existed. A
                View's layout is the one thing every renderer here reports. */}
            <View style={styles.pagerFrame} onLayout={onPagerLayout}>
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
                      the three read as one sequence at one scale.

                      `fill` rather than `bleed`, because `bleed` only took the border
                      off. It still FITS the art inside the box, so the same whole-frame
                      slide came out 330 wide in a 390 band with canvas showing down both
                      sides — the bordered rectangle again, minus its border. See `Art`. */}
                  {/* A place on every page, since September 2026: a painted scene for
                      the first two, and Atlas on his island for the promise of the third.
                      The band's height is unchanged, so O7 (no vertical step between
                      pages) holds; the scenes are cover-cropped to it. */}
                  {s.scene === 'stage'
                    ? <View style={[styles.slideStage, { width: page, height: band }]}>
                        <IslandStage size={Math.min(page * .82, band)}><Art name={s.art} size={Math.min(page * .82, band) * .5} /></IslandStage>
                      </View>
                    : <SceneryBanner name={s.scene} height={band} style={[styles.slideScene, { width: page - space[6] }]} />}
                  <View style={styles.slideText} onLayout={onCopyLayout}>
                    <Text style={[styles.title, styles.slideTitle]}>{t(s.title)}</Text>
                    {/* The third slide's body is the only one carrying a number, and it
                        is the build's own. `t()` is typed per key, so passing `count` to
                        the two that do not take it would be a compile error — which is
                        why this is a conditional rather than a spread. */}
                    <Text style={[styles.body, styles.slideBody]}>
                      {s.body === 'onboarding:slide.3.body'
                        ? t(s.body, { count: countryCount })
                        : t(s.body)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            </View>

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
            {/* One heading, not three. This step used to run h1 → body → `Choose a
                year` (h2) → `DECADE` (overline) → chips, which is four levels of
                hierarchy for a single question (O6). The wheel is self-evident and the
                answer is legible in it, so the ladder is gone. */}
            {/* Atlas asks this one too. It is the most sensitive question in the flow —
                it decides whether a child gets the child experience — and a bare heading
                reading "When were you born?" is a form demanding an identity document,
                where the same words from a character are somebody asking. */}
            {ask('age')}
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

          </ScrollView>
        )}

        {step === 'goal' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {ask('goal')}
            <Text style={styles.body}>{t('onboarding:goal.body')}</Text>
            <View style={styles.choiceGroup} role="radiogroup" aria-label={t('onboarding:goal.title')}>
              {DAILY_GOALS.map((minutes) => {
                const chosen = goal === minutes
                return <Card key={minutes} role="radio" aria-checked={chosen}
                  tone={chosen ? 'sky' : 'ice'}
                  accessibilityLabel={`${t('onboarding:goal.minutes', { minutes })}, ${t(GOAL_LABEL[minutes])}`}
                  onPress={() => { if (!chosen) hapticSelect(); setGoal(minutes) }}
                  style={[styles.goalCard, chosen && styles.choiceOn]}>
                  <View style={styles.choiceCopy}>
                    <Text style={styles.goalValue}>{t('onboarding:goal.minutes', { minutes })}</Text>
                    <Text style={styles.goalLabel}>{t(GOAL_LABEL[minutes])}</Text>
                  </View>
                  <View style={[styles.choiceMark, chosen && styles.choiceMarkOn]}>
                    {chosen && <Icon name="check" size={TICK} color={colors.clay.sky.ink} />}
                  </View>
                </Card>
              })}
            </View>
          </ScrollView>
        )}

        {step === 'language' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {/* `welcome`, and it is the first thing anybody ever sees of this app. */}
            {ask('language')}
            <Text style={styles.body}>{t('onboarding:language.body')}</Text>

            <View style={styles.group} role="radiogroup" aria-label={t('onboarding:language.title')}>
              <ClaySurface />
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
                    {/* Reserved rather than removed — selection changes colour, never
                        layout — so the wrapper keeps its size and the OPACITY carries the
                        off state. An icon rather than a `✓` for the reason
                        `ScreenHeader` gives about its arrow: a literal character is a
                        different typeface on every device, which is the defect
                        `pnpm build:icons` exists for. */}
                    <View style={!chosen && styles.tickOff}>
                      <Icon name="check" size={TICK} color={colors.action.primary} />
                    </View>
                  </Pressable>
                )
              })}
            </View>

          </ScrollView>
        )}

        {step === 'region' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {ask('region')}
            <Text style={styles.body}>{t('onboarding:region.body')}</Text>
            <View style={styles.regionGroup} role="radiogroup" aria-label={t('onboarding:region.title')}>
              <View style={styles.regionGrid}>
                {START_REGIONS.map((code) => {
                  const chosen = startRegion === code
                  return <Card key={code} role="radio" aria-checked={chosen}
                    tone={chosen ? 'sky' : 'ice'} accessibilityLabel={t(REGION_NAME[code])}
                    onPress={() => { if (!chosen) hapticSelect(); setStartRegion(code) }}
                    style={[styles.regionCell, largeText && styles.regionCellLarge, chosen && styles.choiceOn]}>
                    <View style={styles.regionArt}>
                      <ClayMap name={`region-${code}`} style={{ width: REGION_ART, height: Math.round(REGION_ART * 3 / 4) }} cover />
                    </View>
                    <Text style={styles.regionLabel}>{t(REGION_NAME[code])}</Text>
                    {chosen && <View style={styles.regionCheck}>
                      <Icon name="check" size={TICK} color={colors.clay.sky.ink} />
                    </View>}
                  </Card>
                })}
              </View>
              <Card role="radio" aria-checked={startRegion === null}
                accessibilityLabel={t('onboarding:region.anywhere')}
                tone={startRegion === null ? 'sky' : 'ice'}
                onPress={() => { if (startRegion !== null) hapticSelect(); setStartRegion(null) }}
                style={[styles.anywhere, startRegion === null && styles.choiceOn]}>
                <Text style={styles.anywhereLabel}>{t('onboarding:region.anywhere')}</Text>
                <View style={[styles.choiceMark, startRegion === null && styles.choiceMarkOn]}>
                  {startRegion === null && <Icon name="check" size={TICK} color={colors.clay.sky.ink} />}
                </View>
              </Card>
            </View>
          </ScrollView>
        )}

        {step === 'level' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {ask('level')}
            <Text style={styles.body}>{t('onboarding:level.body')}</Text>

            {/* A track, not three rows.
                These three answers are a SCALE — one axis with a direction, where the
                middle one is between the other two — and a radio group says nothing
                about that. The shape of the control now carries the shape of the
                question, which is the part a list could never do.

                A drag passes through values on its way, so Continue commits the
                final answer just as it does for the other preference steps. */}
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

          </ScrollView>
        )}

        {step === 'plan' && (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {ask('plan')}

            {/* Their own three answers, read back.
                Not a "performance" projection: this app has never measured what a week of
                it teaches, and PROJECT.md forbids shipping a number it cannot source. So
                the summary states what the user just chose, and the one number under it is
                arithmetic on their own answer rather than a claim about them. */}
            <View style={styles.group}>
              <ClaySurface />
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
          </ScrollView>
        )}

        {step === 'taster' && (
          <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <CloudBackdrop />
              <IslandStage size={STAGE}><Art name="atlas/welcome" size={STAGE_ATLAS} /></IslandStage>
            </View>
            <Text style={styles.title}>{t('onboarding:taster.title')}</Text>
            <Text style={styles.body}>{t('onboarding:taster.body')}</Text>
          </ScrollView>
        )}
      </Animated.View>

      {/* Primary actions remain outside the scroller on every confirmed step. */}
      {HAS_ACTION.has(step) && <View style={styles.actions}>
        {step === 'welcome' && (
          /* Last in, after the mark and the line, which is the order they are read in —
             and the order that matters, because a primary button that is already there
             while the sentence above it is still arriving invites a tap before anybody
             has been told what they are agreeing to. */
          <Animated.View style={[styles.actionsStack, staggerStyle(doorsIn)]}>
            <Button label={t('onboarding:cta.start')} onPress={() => go('language')} />
            {/* The door this frame exists for.
                Not guarded by `isChild`, unlike the copy of this button on the taster,
                and that is not an oversight: nobody has been asked their age yet, so
                there is no child to withhold it from. The guard downstream withholds an
                account OFFER from someone who has just told us they are ten; this is a
                returning user saying they already have one, and a child who taps it
                meets a sign-in screen with a back arrow rather than a refusal. */}
            {onSignIn !== undefined && (
              <Button
                variant="ghost"
                label={t('onboarding:cta.haveAccount')}
                onPress={onSignIn}
              />
            )}
          </Animated.View>
        )}

        {step === 'slides' && (
          <>
            {/* `Continue` on the last slide, not `Get started`.
                `Get started` is the welcome frame's button now, and two of them in one
                flow means the second is claiming to begin something that began four taps
                ago. `age.continue` is the string every other forward step in this flow
                already uses — the last slide leaving the carousel is that, not a launch. */}
            <Button
              label={
                slide < SLIDES.length - 1
                  ? t('onboarding:cta.next')
                  : t('onboarding:age.continue')
              }
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

        {step === 'region' && (
          <Button label={t('onboarding:age.continue')} onPress={() => {
            track('onboarding_region_selected', { region: startRegion ?? 'world' })
            go('level')
          }} />
        )}

        {step === 'plan' && (
          <Button label={t('onboarding:age.continue')} onPress={() => go('taster')} />
        )}

        {step === 'taster' && (
          <>
            <Button label={t('onboarding:taster.start')} onPress={finish} />
            {/* Not shown to children: there is no account for them to already have,
                and offering one is offering a flow we would have to refuse.

                The second door, and it survives the welcome frame getting the first one
                — which review read as a duplicate, reasonably, so here is why it is not.
                These two differ on the guard: up there nobody has been asked their age
                yet, so `isChild` cannot be consulted and the offer goes to everybody.
                Here it can, and this is the only age-aware sign-in in the flow. Deleting
                it would leave the unguarded one as the only door, on a frame the user
                left eight steps ago, which is the wrong half to keep.

                They are a front door and a back door rather than two buttons on one
                screen. Both sit before any lesson runs, and both `push` rather than
                `replace`, so neither one strands anybody who taps it by mistake. */}
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



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.canvas },
    progress: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2] },
    back: { width: layout.minTouchTarget, height: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center', marginStart: -space[3] },
    progressBar: { flex: 1 },
    stepFill: { flex: 1, minHeight: 0 },
    ask: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: space[3], marginBottom: space[2] },
    askStacked: { flexDirection: 'column' },
    askCharacter: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    askBubble: { flex: 1, alignSelf: 'center' },
    askBubbleStacked: { flex: 0, alignSelf: 'stretch' },
    form: { alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[5], gap: space[3], flexGrow: 1 },
    welcomeContent: { alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[5], gap: space[4], flexGrow: 1 },
    welcomeHero: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', flexShrink: 0 },
    hero: { height: HERO, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', flexShrink: 0 },
    wordmark: { ...text('display'), color: colors.text.primary, textAlign: 'center' },
    title: { ...text('h1'), color: colors.text.primary, textAlign: 'center', marginTop: space[4], marginBottom: space[2], paddingHorizontal: space[3] },
    body: { ...text('body'), color: colors.text.secondary, textAlign: 'center', paddingHorizontal: space[2], alignSelf: 'stretch' },
    choiceGroup: { alignSelf: 'stretch', gap: space[3], marginTop: space[3] },
    goalCard: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: space[9] + space[5], borderColor: colors.clay.ice.rim },
    choiceOn: { borderColor: colors.action.secondary },
    choiceCopy: { flex: 1, gap: space[1], minWidth: 0 },
    goalValue: { ...text('h2', { numeric: true }), color: colors.text.primary },
    goalLabel: { ...text('body'), color: colors.text.secondary },
    choiceMark: { width: space[6], height: space[6], borderRadius: radius.full, borderWidth: 1, borderColor: colors.border.strong, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    choiceMarkOn: { backgroundColor: colors.clay.sky.top, borderColor: colors.action.secondary },
    regionGroup: { alignSelf: 'stretch', gap: space[3], marginTop: space[2] },
    regionGrid: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[3] },
    regionCell: { width: '48%', alignItems: 'center', gap: space[2], padding: space[3], borderColor: colors.clay.ice.rim },
    regionCellLarge: { width: '100%' },
    regionArt: { width: REGION_ART, height: Math.round(REGION_ART / 1.5), alignItems: 'center', justifyContent: 'center' },
    regionLabel: { ...text('body', { weight: '700' }), color: colors.text.primary, textAlign: 'center', alignSelf: 'stretch' },
    regionCheck: { position: 'absolute', top: space[2], end: space[2] },
    anywhere: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: layout.minTouchTarget, borderColor: colors.clay.ice.rim },
    anywhereLabel: { ...text('body', { weight: '700' }), color: colors.text.primary, flex: 1, minWidth: 0 },
    levelSlider: { marginTop: space[5], marginBottom: space[4] },
    levelBody: { ...text('body'), color: colors.text.secondary, textAlign: 'center', alignSelf: 'stretch' },
    wheelWrap: { alignSelf: 'stretch', marginTop: space[3] },
    childNote: { marginTop: space[4], padding: space[4], alignItems: 'center' },
    childTitle: { ...text('h3'), color: colors.text.primary, marginBottom: space[2] },
    group: { alignSelf: 'stretch', marginTop: space[3], backgroundColor: colors.bg.surface, borderRadius: radius.xl, ...squircle, borderWidth: 1, borderColor: colors.clay.ice.rim, overflow: 'hidden' },
    groupRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[4], paddingHorizontal: space[4], minHeight: layout.minTouchTarget },
    groupRowDivided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
    goalMinutes: { ...text('h3', { numeric: true }), color: colors.text.primary, flexShrink: 1 },
    flex: { flex: 1 },
    tickOff: { opacity: 0 },
    planLabel: { ...text('body'), color: colors.text.secondary, flexShrink: 1 },
    planWeek: { ...text('body'), color: colors.text.secondary, textAlign: 'center', marginTop: space[4] },
    actions: { padding: space[4], gap: space[2] },
    actionsStack: { gap: space[2] },
    pagerFrame: { flex: 1 },
    pager: { flex: 1 },
    slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    slideStage: { alignItems: 'center', justifyContent: 'center' },
    slideScene: { alignSelf: 'center', borderRadius: radius.xl },
    slideText: { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: space[2], gap: space[2] },
    slideTitle: { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 },
    slideBody: { paddingHorizontal: 0 },
    dots: { flexDirection: 'row', gap: space[2], alignSelf: 'center', paddingVertical: space[5] },
    dot: { width: space[2], height: space[2], borderRadius: radius.full, backgroundColor: colors.bg.surfaceRaised },
    dotOn: { backgroundColor: colors.action.primary, width: space[5] },
  })
  return { colors, styles }
})
