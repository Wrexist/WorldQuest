/**
 * Onboarding — mockup screen 2.
 *
 * Three value slides → age gate → daily goal → taster lesson. The order is the
 * product decision, not a layout one: **the user completes a real lesson before we
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
  useAnimatedTo,
} from '@worldquest/design'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { hapticSelect } from '../../lib/haptics.js'
import { DAILY_GOALS, type DailyGoal } from '../settings/usePreferences.js'
import { Art } from '../../components/Art.js'
import { WheelPicker, type WheelOption } from '../../components/WheelPicker.js'
import type { ArtName } from '../../lib/art.generated.js'

/** The age at which the child branch applies. COPPA; GDPR-K varies by country and is stricter in places. */
export const CHILD_AGE = 13

export type OnboardingResult = {
  readonly birthYear: number
  readonly isChild: boolean
  readonly dailyGoalMinutes: DailyGoal
}

export type OnboardingScreenProps = {
  /** Injected so the screen stays pure — no `new Date()` in a component. */
  readonly currentYear: number
  readonly onFinish: (result: OnboardingResult) => void
  readonly onSignIn?: (() => void) | undefined
}

type Step = 'slides' | 'age' | 'goal' | 'taster'
const STEPS: readonly Step[] = ['slides', 'age', 'goal', 'taster']

/**
 * Atlas on a step where the user is choosing something.
 *
 * Deliberately smaller than the slides' hero. Those screens are the picture plus a
 * sentence; this one is a list the user has to read and pick from, and an illustration
 * the same size as theirs would be arguing with them.
 */
const DECISION_ART = 104

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

export function OnboardingScreen({ currentYear, onFinish, onSignIn }: OnboardingScreenProps) {
  const t = useT()
  const [step, setStep] = useState<Step>('slides')
  const [slide, setSlide] = useState(0)
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const [goal, setGoal] = useState<DailyGoal>(10)

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
          outputRange: [space[6], 0],
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
    onFinish({ birthYear, isChild, dailyGoalMinutes: goal })
  }

  return (
    <View style={styles.root} onLayout={onFrameLayout}>
      {/* 4 pt and no numeral. This used to be a 16 pt bar with an accent-green `1 / 4`
          beside it, which is a game HUD; iOS's own progress view is 4 (N5). The count is
          gone because the dots below already count, and the two disagreed — both of the
          first two slides read `1 / 4` while the dot moved (O4). The bar still carries
          the full step count for a screen reader, which is where a number belongs when
          the picture cannot hold one. */}
      <View
        style={styles.progress}
        accessibilityLabel={t('onboarding:progress', { step: stepIndex, total: STEPS.length })}
      >
        <ProgressBar current={stepIndex} total={STEPS.length} height={4} showCount={false} />
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
            <Text style={styles.title}>{t('onboarding:age.title')}</Text>
            <Text style={styles.body}>{t('onboarding:age.body')}</Text>

            <View style={styles.wheelWrap}>
              <WheelPicker
                options={years}
                value={birthYear}
                onChange={setBirthYear}
                label={t('onboarding:age.year')}
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

            {/* The flow warmed up, went cold, then warmed up again: the slides and the
                taster all carry a hero and the two decision steps between them carried
                none. Smaller than the slides', and above the choice rather than beside
                it — these rows are the content of the step and the picture is not
                allowed to compete with them. `thinking`, because a question is being
                asked. */}
            <Art name="atlas/thinking" size={DECISION_ART} />
            <Text style={styles.title}>{t('onboarding:goal.title')}</Text>
            <Text style={styles.body}>{t('onboarding:goal.body')}</Text>

            {/* ONE inset group, hairline separators, a checkmark on the chosen row
                (N7, N8). It was three cards with 12 pt between them and a green ring
                around the selected one, which is how a web framework draws a radio
                group and is not how iOS draws anything. The container owns the corners
                so the rows do not each need their own. */}
            <View style={styles.group} role="radiogroup" aria-label={t('onboarding:goal.title')}>
              {DAILY_GOALS.map((minutes, index) => {
                const chosen = goal === minutes
                return (
                  <Pressable
                    key={minutes}
                    role="radio"
                    aria-checked={chosen}
                    aria-label={t('onboarding:goal.minutes', { minutes })}
                    onPress={() => {
                      if (!chosen) hapticSelect()
                      setGoal(minutes)
                    }}
                    style={[styles.groupRow, index > 0 && styles.groupRowDivided]}
                  >
                    <Text style={styles.goalMinutes}>{t('onboarding:goal.minutes', { minutes })}</Text>
                    <Text style={styles.goalLabel}>{t(GOAL_LABEL[minutes])}</Text>
                    {/* The tick is the selection. Rendered always and hidden when it is
                        not the answer, so choosing one never changes the row's layout —
                        the same rule the old bordered version kept with a transparent
                        2 px border. */}
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

      <View style={styles.actions}>
        {step === 'slides' && (
          <>
            <Button
              label={slide < SLIDES.length - 1 ? t('onboarding:cta.next') : t('onboarding:cta.start')}
              onPress={() =>
                slide < SLIDES.length - 1 ? goToSlide(slide + 1) : setStep('age')
              }
            />
            <Button variant="ghost" label={t('onboarding:cta.skip')} onPress={() => setStep('age')} />
          </>
        )}

        {step === 'age' && (
          <Button
            label={t('onboarding:age.continue')}
            // Disabled rather than hidden: a button that appears when you finally
            // reach the right year is a button nobody knew they were looking for.
            disabled={birthYear === null}
            onPress={() => setStep('goal')}
          />
        )}

        {step === 'goal' && (
          <Button
            label={t('onboarding:age.continue')}
            onPress={() => {
              // On leaving the step, not on each row tap: what matters is the goal
              // they settled on, and firing per tap would record every one they tried.
              track('onboarding_goal_selected', { minutes: goal })
              setStep('taster')
            }}
          />
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
      </View>
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
  progress: { paddingHorizontal: space[4], paddingTop: space[2] },
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
