/**
 * The end of a lesson — mockup screen 6, and the app's biggest emotional moment.
 *
 * This screen used to be a heading, two chips and a button. Everything worth showing
 * was already computed by `gradeLesson` and thrown away: accuracy, whether the lesson
 * was perfect, and which facts moved up a mastery band. The last of those is the only
 * number here that a quiz app cannot show, so it gets a tile of its own.
 *
 * ## Two outcomes, not one
 *
 * `LessonScreen` routes both `summary` and `abandoned` here, and they are different
 * events: one is a finished lesson, the other is someone who chose to stop. A user who
 * left gets no celebration — a fanfare for walking out is the app failing to read the
 * room — and no shame either. They get their XP, plainly, and a door.
 *
 * ## Why the XP counts up
 *
 * It is the single most recognisable move in this genre, and it works because it turns
 * a number into an event. It is also the one animation here that must not be announced:
 * the ticking text is `aria-hidden` and the card carries the final figure as its label,
 * so a screen reader says "40 XP earned" once instead of counting to forty out loud.
 *
 * Spec: docs/design/voice-and-tone.md · docs/systems/xp-economy.md
 */

import { useMemo } from 'react'
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  colors,
  radius,
  space,
  text,
  useCelebration,
  useCountUp,
} from '@worldquest/design'
import { factsStrengthened } from '@worldquest/engines'
import type { GradeResult } from '@worldquest/engines'
import { Flag } from '../../components/Flag.js'
import { useT } from '../../lib/i18n.js'

/**
 * How a lesson ended, from the user's point of view rather than the machine's.
 *
 * `early` is deliberately not called "abandoned" outside the state machine. The word
 * is accurate about the transition and wrong about the person.
 */
export type SummaryOutcome = 'perfect' | 'strong' | 'done' | 'early'

export function outcomeOf(result: GradeResult | null, wasAbandoned: boolean): SummaryOutcome {
  if (wasAbandoned) return 'early'
  if (result === null) return 'done'
  if (result.perfect) return 'perfect'
  return result.accuracy >= 0.8 ? 'strong' : 'done'
}

const HEADLINE = {
  perfect: 'lesson:summary.perfect.title',
  strong: 'lesson:summary.strong.title',
  done: 'lesson:summary.done.title',
  early: 'lesson:summary.early.title',
} as const

const BODY = {
  perfect: 'lesson:summary.perfect.body',
  strong: 'lesson:summary.strong.body',
  done: 'lesson:summary.done.body',
  early: 'lesson:summary.early.body',
} as const

/** One country the lesson touched, ready to draw. Resolved by the caller. */
export type PractisedCountry = {
  readonly id: string
  /** `assets.flag.path` from the content pack, or undefined if we ship no artwork. */
  readonly flagPath: string | undefined
  /** Localised country name, from the pack — a country name is a fact, not copy. */
  readonly name: string
}

/** Wide enough to tell Chad from Romania, small enough that eight fit on a 320pt row. */
const PRACTISED_FLAG_WIDTH = 44

export function LessonSummary({
  result,
  practised = [],
  wasAbandoned,
  isOffline,
  onExit,
}: {
  result: GradeResult | null
  /**
   * The countries behind the facts just answered.
   *
   * Here because a summary made only of XP, coins and a percentage is a scoreboard,
   * and this app is about the world. Six flags say "you were just in these places" in
   * a way no number does — and they cost nothing, because the artwork already ships
   * for the collection.
   */
  practised?: readonly PractisedCountry[]
  /** True when the user chose to stop rather than reaching the last question. */
  wasAbandoned: boolean
  isOffline: boolean
  onExit: () => void
}) {
  const t = useT()
  const outcome = outcomeOf(result, wasAbandoned)

  const xp = result?.xpAwarded ?? 0
  const counted = useCountUp(xp)

  // Only a perfect lesson pops. A celebration that fires every time is wallpaper, and
  // the point of this one is that it means something happened.
  const scale = useCelebration(outcome === 'perfect' ? 'perfect' : null)

  const strengthened = useMemo(() => (result === null ? 0 : factsStrengthened(result)), [result])
  const accuracyPct = result === null ? 0 : Math.round(result.accuracy * 100)

  return (
    <View style={styles.screen}>
      {isOffline && <OfflineNote />}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* `heading` and not a bare Text: this is the first thing a screen reader
            should land on, and the outcome is the headline of the whole screen. */}
        <Text style={styles.title} role="heading" aria-level={1}>
          {t(HEADLINE[outcome])}
        </Text>
        {/* The stock body promises that what you answered counts, which would be a lie
            with nothing answered. Reachable by leaving on the first question. */}
        <Text style={styles.subtitle}>
          {result === null ? t('lesson:summary.none.body') : t(BODY[outcome])}
        </Text>

        {result !== null && (
          <>
            <Animated.View style={[styles.hero, { transform: [{ scale }] }]}>
              <Card
                level={2}
                accessibilityLabel={t('lesson:reward.xp', { amount: xp })}
                style={styles.xpCard}
                testID="summary-xp"
              >
                {/* Hidden from the reader, which already has the figure from the card's
                    label. Visible text only — a tally read aloud digit by digit is the
                    classic way this animation becomes an accessibility bug. */}
                {/* The one capped string in the app, and the cap is small.
                    `hero` is 56pt; a full lesson awards three digits, and at the
                    200 % the DoD requires that is ~270pt of glyph on a 320pt phone —
                    which `Text` resolves by wrapping, so "+120" becomes "+12" over
                    "0". A wrong number is worse than a smaller one. 1.6 still renders
                    it at 90pt, larger than anything else on the screen at any
                    setting, and the figure is also in the card's label. */}
                <Text style={styles.xpValue} maxFontSizeMultiplier={1.6} aria-hidden>
                  {`+${counted}`}
                </Text>
                <Text style={styles.xpUnit} aria-hidden>
                  {t('lesson:summary.xpUnit')}
                </Text>
              </Card>
            </Animated.View>

            <View style={styles.tiles}>
              <StatTile
                value={t('lesson:summary.stat.percent', { value: accuracyPct })}
                label={t('lesson:summary.stat.accuracy')}
                tint={colors.status.progress}
                accessibilityLabel={t('lesson:summary.stat.accuracy.a11y', {
                  correct: result.correct,
                  total: result.items,
                  value: accuracyPct,
                })}
                testID="summary-accuracy"
              />
              <StatTile
                value={`+${result.coinsAwarded}`}
                label={t('lesson:summary.stat.coins')}
                tint={colors.reward.coin}
                accessibilityLabel={t('lesson:reward.coins', { amount: result.coinsAwarded })}
                testID="summary-coins"
              />
              {/* Always rendered, including at zero. A stat that appears only when it
                  flatters is a scoreboard, not a report — and a layout that changes
                  shape between lessons is its own small accessibility problem. */}
              <StatTile
                value={String(strengthened)}
                label={t('lesson:summary.stat.stronger')}
                tint={colors.reward.gem}
                accessibilityLabel={t('lesson:summary.stat.stronger.a11y', {
                  count: strengthened,
                })}
                testID="summary-stronger"
              />
            </View>
          </>
        )}

        {practised.length > 0 && (
          <View style={styles.practised} testID="summary-practised">
            <Text style={styles.practisedLabel} role="heading" aria-level={2}>
              {t('lesson:summary.practised')}
            </Text>
            <View style={styles.flags}>
              {practised.map((country) => (
                // Labelled, unlike every other decorative flag in the app: here the
                // picture is the only thing naming the country, so a reader that
                // skipped it would get a heading followed by silence.
                <Flag
                  key={country.id}
                  path={country.flagPath}
                  width={PRACTISED_FLAG_WIDTH}
                  label={country.name}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Button
        label={t('common:continue')}
        onPress={onExit}
        fullWidth
        size="lg"
        style={styles.cta}
        testID="summary-continue"
      />
    </View>
  )
}

/**
 * One number and what it means.
 *
 * The label sits under the value rather than beside it so the tile can be narrow, and
 * the pair is grouped into a single accessible element — three tiles should read as
 * three facts, not six fragments.
 */
function StatTile({
  value,
  label,
  tint,
  accessibilityLabel,
  testID,
}: {
  value: string
  label: string
  tint: string
  accessibilityLabel: string
  testID: string
}) {
  return (
    <Card level={1} accessibilityLabel={accessibilityLabel} style={styles.tile} testID={testID}>
      <Text style={[styles.tileValue, { color: tint }]} aria-hidden>
        {value}
      </Text>
      <Text style={styles.tileLabel} aria-hidden>
        {label}
      </Text>
    </Card>
  )
}

function OfflineNote() {
  const t = useT()

  return (
    <View style={styles.offline} role="alert">
      <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[4] },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },

  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center' },
  subtitle: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },

  // Full width, because this is the object on the screen and a small square floating
  // in the middle of a phone reads as a widget rather than as the point.
  hero: { alignSelf: 'stretch' },
  xpCard: { alignItems: 'center', paddingVertical: space[5] },
  xpValue: { ...text('hero'), color: colors.reward.xp },
  xpUnit: { ...text('overline'), color: colors.text.secondary },

  // Wraps rather than squeezing. Three tiles fit one row at 320pt; at 200 % text they
  // become two rows instead of three columns of broken words.
  tiles: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    justifyContent: 'center',
  },
  tile: { flexGrow: 1, flexBasis: 96, minWidth: 96, alignItems: 'center', gap: space[1] },
  tileValue: text('h2', { numeric: true }),
  tileLabel: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },

  practised: { alignSelf: 'stretch', alignItems: 'center', gap: space[3], marginTop: space[2] },
  // `text.secondary`, not `tertiary`. Tertiary is a large-text-only token
  // (check-contrast.ts: "≥18px") and `overline` is 12pt — the pair checker validates
  // tokens against each other, not against the size a caller happens to use them at,
  // so this one is on the caller to get right.
  practisedLabel: { ...text('overline'), color: colors.text.secondary },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], justifyContent: 'center' },

  cta: { marginTop: space[2] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
