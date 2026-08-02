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
 */

import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  ArtSlot,
  Button,
  Card,
  ProgressBar,
  colors,
  palette,
  radius,
  space,
  text,
} from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { DAILY_GOALS, type DailyGoal } from '../settings/usePreferences.js'

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
 * The slides as literal key pairs rather than a number and string interpolation.
 *
 * `t()` is typed per key — each one carries its own parameter type — so a computed
 * key erases exactly the checking the typed catalogue exists to provide. Written out,
 * a renamed or deleted string is a compile error here instead of a raw key on the
 * first screen a new user ever sees.
 */
const SLIDES = [
  { title: 'onboarding:slide.1.title', body: 'onboarding:slide.1.body' },
  { title: 'onboarding:slide.2.title', body: 'onboarding:slide.2.body' },
  { title: 'onboarding:slide.3.title', body: 'onboarding:slide.3.body' },
] as const
const GOAL_LABEL = {
  5: 'onboarding:goal.casual',
  10: 'onboarding:goal.regular',
  20: 'onboarding:goal.serious',
} as const

/** The tint per slide, so the three feel like a sequence rather than one screen repeated. */
const SLIDE_TINT: readonly string[] = [palette.blue[500], palette.green[500], palette.gold[500]]

export function OnboardingScreen({ currentYear, onFinish, onSignIn }: OnboardingScreenProps) {
  const t = useT()
  const [step, setStep] = useState<Step>('slides')
  const [slide, setSlide] = useState(0)
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const [goal, setGoal] = useState<DailyGoal>(10)

  const isChild = birthYear !== null && currentYear - birthYear < CHILD_AGE
  const stepIndex = STEPS.indexOf(step) + 1

  const finish = (): void => {
    // `birthYear` cannot be null here — the age step is the only way past it — but the
    // type says it can, and a cast would be a lie that outlives this function.
    if (birthYear === null) return
    onFinish({ birthYear, isChild, dailyGoalMinutes: goal })
  }

  return (
    <View style={styles.root}>
      <View
        style={styles.progress}
        accessibilityLabel={t('onboarding:progress', { step: stepIndex, total: STEPS.length })}
      >
        <ProgressBar current={stepIndex} total={STEPS.length} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {step === 'slides' && (
          <>
            <ArtSlot tint={SLIDE_TINT[slide] ?? SLIDE_TINT[0]!} glyph="🌍" width={200} height={200} />
            <Text style={styles.title}>{t(SLIDES[slide]!.title)}</Text>
            <Text style={styles.body}>{t(SLIDES[slide]!.body)}</Text>

            {/* Position, and a target — a carousel whose dots cannot be tapped is a
                carousel that traps anyone who overshoots. */}
            <View style={styles.dots}>
              {SLIDES.map((s, i) => (
                <View
                  key={s.title}
                  role="button"
                  aria-label={t('onboarding:progress', { step: i + 1, total: SLIDES.length })}
                  aria-selected={i === slide}
                  onTouchEnd={() => setSlide(i)}
                  style={[styles.dot, i === slide && styles.dotOn]}
                />
              ))}
            </View>
          </>
        )}

        {step === 'age' && (
          <>
            <Text style={styles.title}>{t('onboarding:age.title')}</Text>
            <Text style={styles.body}>{t('onboarding:age.body')}</Text>

            <Text style={styles.label}>{t('onboarding:age.year')}</Text>
            <View style={styles.years}>
              {/* A 90-year scroller, newest first: the people using this app are
                  mostly young, and making a child scroll past 1935 to find 2015 is a
                  small cruelty that also skews the answer. */}
              {Array.from({ length: 90 }, (_, i) => currentYear - i).map((year) => (
                <YearChip
                  key={year}
                  year={year}
                  selected={birthYear === year}
                  onPress={() => setBirthYear(year)}
                />
              ))}
            </View>

            {isChild && (
              <Card level={2} style={styles.childNote}>
                <Text style={styles.childTitle}>{t('onboarding:age.child.title')}</Text>
                <Text style={styles.body}>{t('onboarding:age.child.body')}</Text>
              </Card>
            )}
          </>
        )}

        {step === 'goal' && (
          <>
            <Text style={styles.title}>{t('onboarding:goal.title')}</Text>
            <Text style={styles.body}>{t('onboarding:goal.body')}</Text>
            <View style={styles.goals}>
              {DAILY_GOALS.map((minutes) => (
                <Card
                  key={minutes}
                  level={goal === minutes ? 3 : 2}
                  role="radio"
                  aria-checked={goal === minutes}
                  accessibilityLabel={t('onboarding:goal.minutes', { minutes })}
                  onPress={() => setGoal(minutes)}
                  style={[styles.goal, goal === minutes && styles.goalOn]}
                >
                  <Text style={styles.goalMinutes}>{t('onboarding:goal.minutes', { minutes })}</Text>
                  <Text style={styles.goalLabel}>{t(GOAL_LABEL[minutes])}</Text>
                </Card>
              ))}
            </View>
          </>
        )}

        {step === 'taster' && (
          <>
            <ArtSlot tint={palette.green[500]} glyph="🗺" width={200} height={200} />
            <Text style={styles.title}>{t('onboarding:taster.title')}</Text>
            <Text style={styles.body}>{t('onboarding:taster.body')}</Text>
          </>
        )}
      </ScrollView>

      <View style={styles.actions}>
        {step === 'slides' && (
          <>
            <Button
              label={slide < SLIDES.length - 1 ? t('onboarding:cta.next') : t('onboarding:cta.start')}
              onPress={() => (slide < SLIDES.length - 1 ? setSlide(slide + 1) : setStep('age'))}
            />
            <Button variant="ghost" label={t('onboarding:cta.skip')} onPress={() => setStep('age')} />
          </>
        )}

        {step === 'age' && (
          <Button
            label={t('onboarding:age.continue')}
            // Disabled rather than hidden: a button that appears when you finally
            // scroll to the right year is a button nobody knew they were looking for.
            disabled={birthYear === null}
            onPress={() => setStep('goal')}
          />
        )}

        {step === 'goal' && (
          <Button label={t('onboarding:age.continue')} onPress={() => setStep('taster')} />
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

function YearChip({
  year,
  selected,
  onPress,
}: {
  readonly year: number
  readonly selected: boolean
  readonly onPress: () => void
}) {
  return (
    <Card
      level={selected ? 3 : 1}
      role="radio"
      aria-checked={selected}
      accessibilityLabel={String(year)}
      onPress={onPress}
      style={[styles.year, selected && styles.yearOn]}
    >
      <Text style={selected ? styles.yearTextOn : styles.yearText}>{year}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas },
  progress: { paddingHorizontal: space[4], paddingTop: space[2] },
  body: {
    ...text('body'),
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: space[5],
  },
  title: {
    ...text('h1'),
    color: colors.text.primary,
    textAlign: 'center',
    marginTop: space[5],
    marginBottom: space[2],
  },
  label: { ...text('overline'), color: colors.text.tertiary, marginTop: space[5] },
  dots: { flexDirection: 'row', gap: space[2], marginTop: space[6] },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.bg.surfaceRaised },
  dotOn: { backgroundColor: colors.action.primary, width: 24 },
  years: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    justifyContent: 'center',
    marginTop: space[3],
  },
  year: { paddingVertical: space[2], paddingHorizontal: space[3], minWidth: 72, alignItems: 'center' },
  yearOn: { borderColor: colors.action.primary, borderWidth: 2 },
  yearText: { ...text('body'), color: colors.text.secondary },
  yearTextOn: { ...text('body', { weight: '700' }), color: colors.text.primary },
  childNote: { marginTop: space[5], padding: space[4], alignItems: 'center' },
  childTitle: { ...text('h3'), color: colors.text.primary, marginBottom: space[2] },
  goals: { gap: space[3], marginTop: space[5], alignSelf: 'stretch' },
  goal: { padding: space[4], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalOn: { borderColor: colors.action.primary, borderWidth: 2 },
  goalMinutes: { ...text('h2'), color: colors.text.primary },
  goalLabel: { ...text('body'), color: colors.text.secondary },
  actions: { padding: space[4], gap: space[2] },
})
