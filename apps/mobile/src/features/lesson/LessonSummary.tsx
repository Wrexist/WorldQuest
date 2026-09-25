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
 * ## Time, and why it is not called speed
 *
 * The time tile is how long the questions took: the engine's `answeringMs`, which leaves
 * out pauses and the feedback sheet. It is printed in the neutral colour and labelled
 * "Time", never "Speedy". A slow lesson is not a worse one, and a child reading a flag
 * description carefully should not see the care scored.
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
  Spacer,
  squircle,
  staggerStyle,
  text,
  useCelebration,
  useCountUp,
  useStagger,
} from '@worldquest/design'
import { factsStrengthened } from '@worldquest/engines'
import type { GradeResult } from '@worldquest/engines'
import { Art } from '../../components/Art.js'
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
  return result.accuracy >= STRONG_ACCURACY ? 'strong' : 'done'
}

/**
 * Where a lesson stops being "done" and starts being "strong".
 *
 * Named because the accuracy tile now reads it too. The tile was tinted
 * `status.progress` unconditionally, so 35 % accuracy was printed in the same green as
 * "Perfect!", a completed bar and every other good thing in the app — on the one screen
 * built to be kind, the palette was the only thing lying. Below the bar it goes to
 * `text.primary`: honest, not red. We state the truth and do not punish, and a number
 * that has to stop claiming to be good does not have to start claiming to be bad.
 */
const STRONG_ACCURACY = 0.8

/**
 * Whole minutes and the seconds left over, to the nearest second: 65 400 ms is 1:05.
 *
 * Rounded once, on the total, so 59.6 seconds reads 1:00 rather than 0:60.
 */
export function minutesAndSeconds(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(ms / 1000))
  return { minutes: Math.floor(total / 60), seconds: total % 60 }
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

/**
 * The celebration layers, drawn around the 140pt Atlas they sit behind.
 *
 * Both assets radiate from an empty centre and fade to nothing at the edges, so the
 * ratio is what matters rather than the absolute size: at 1.7× the subject there is
 * room for confetti on every side of him without the outer ring reaching the screen
 * edge at 320pt, where the content column is 288 wide.
 */
const CELEBRATION_SIZE = 240

/** Wide enough to tell Chad from Romania, small enough that eight fit on a 320pt row. */
const PRACTISED_FLAG_WIDTH = 44

export function LessonSummary({
  result,
  practised = [],
  timeMs,
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
  /**
   * Time spent answering, in milliseconds: the engine's `answeringMs`, so pauses and the
   * feedback sheet are already left out.
   */
  timeMs: number
  /** True when the user chose to stop rather than reaching the last question. */
  wasAbandoned: boolean
  /*
   * Badges are no longer drawn here. They used to sit in a row of 64pt medals under the
   * numbers; each one now gets a full-screen card straight after this screen, for a
   * finished lesson and an early exit alike (`afterLesson.ts`, `AchievementUnlocked`).
   * Keeping the row as well would show the same medal twice, seconds apart, and push
   * the practised flags off a short phone to do it.
   */
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
  const time = minutesAndSeconds(timeMs)
  // After the four tiles, in reading order. A hook, so it is called whether or not the
  // shelf renders.
  const practisedIn = useStagger(5, 'expressive')

  return (
    <View style={styles.screen}>
      {isOffline && <OfflineNote />}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Centred by spacers rather than `justifyContent` — see `Spacer`. This screen's
            centring was added in this same session, before the hazard was understood: a
            summary with a wrapped reward row and a long streak line overflows a short
            phone, and centring a scroll view that overflows puts its title above scroll
            position zero, where nothing reaches it. */}
        <Spacer />
        {/* The celebration frame: Atlas mid-jump — "pure delight, weightless" — with
            `rays` and `burst` radiating behind him. Both of those are briefed with an
            EMPTY CENTRE because content composites into it, and Atlas is the content.

            They were behind the XP card first, which is what the empty centre sounded
            like it was for, and looking at the render settled it: the card is
            full-width and the burst is square, so a burst wide enough to clear the
            card would have to be twice its height. What actually shipped was a strip
            of confetti above the card and a beige smudge below it. Against a 140pt
            Atlas the same asset has room to radiate in every direction, which is the
            composition it was drawn as.

            Only on a perfect lesson, for the same reason only a perfect lesson pops:
            a celebration that fires every time is wallpaper, and one that fires for a
            lesson somebody walked out of is the app failing to read the room.

            Static, deliberately. "Reduced motion is a Definition of Done box and the
            implementation shows the last frame — so burst.png at its settled state
            *is* a deliverable, not a by-product. An animation with no still is a blank
            space for every user who turned motion off, which is disproportionately the
            users who most need the feedback."

            `pointerEvents="none"` because celebration never blocks input, and
            decorative by default — the brief's own code note: a screen reader
            announcing confetti is noise. */}
        {outcome === 'perfect' && (
          <View style={styles.headlineArt}>
            {/* Confetti ring only. `celebration/rays` used to sit under it, and on the
                navy background that asset is an opaque white blob that swallowed the
                whole headline (owner review, 25 Sep 2026). */}
            <View style={styles.celebration} pointerEvents="none">
              <Art name="celebration/burst" size={CELEBRATION_SIZE} />
            </View>
            <Art name="atlas/celebrate" size={140} />
          </View>
        )}
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

            {/* Dealt in one after another behind the XP, in the order they are read.
                `useStagger` caps the cascade and skips it under Reduce Motion, where
                every tile is simply there. */}
            <View style={styles.tiles}>
              <StatTile
                order={1}
                value={t('lesson:summary.stat.percent', { value: accuracyPct })}
                label={t('lesson:summary.stat.accuracy')}
                tint={
                  result.accuracy >= STRONG_ACCURACY
                    ? colors.status.progress
                    : colors.text.primary
                }
                accessibilityLabel={t('lesson:summary.stat.accuracy.a11y', {
                  correct: result.correct,
                  total: result.items,
                  value: accuracyPct,
                })}
                testID="summary-accuracy"
              />
              <StatTile
                order={2}
                value={t('lesson:summary.stat.time.value', {
                  minutes: time.minutes,
                  seconds: String(time.seconds).padStart(2, '0'),
                })}
                label={t('lesson:summary.stat.time')}
                // Neutral: time is a fact about the lesson, not a score (see the header).
                tint={colors.text.primary}
                accessibilityLabel={t('lesson:summary.stat.time.a11y', time)}
                testID="summary-time"
              />
              <StatTile
                order={3}
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
                order={4}
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
          <Animated.View
            style={[styles.practised, staggerStyle(practisedIn)]}
            testID="summary-practised"
          >
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
          </Animated.View>
        )}
        <Spacer />
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
  order,
  value,
  label,
  tint,
  accessibilityLabel,
  testID,
}: {
  /** Its place in the reveal: 1 arrives first, just after the XP card. */
  order: number
  value: string
  label: string
  tint: string
  accessibilityLabel: string
  testID: string
}) {
  const entrance = useStagger(order, 'expressive')

  return (
    // The cell moves; the card inside it is the one spoken element, unchanged.
    <Animated.View style={[styles.tile, staggerStyle(entrance)]}>
      <Card
        level={1}
        accessibilityLabel={accessibilityLabel}
        style={styles.tileFace}
        testID={testID}
      >
        <Text style={[styles.tileValue, { color: tint }]} aria-hidden>
          {value}
        </Text>
        <Text style={styles.tileLabel} aria-hidden>
          {label}
        </Text>
      </Card>
    </Animated.View>
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
  screen: { flex: 1, padding: space[4], gap: space[4] },
  body: { flexGrow: 1, alignItems: 'center', gap: space[4] },

  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center' },
  subtitle: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },

  // Full width, because this is the object on the screen and a small square floating
  // in the middle of a phone reads as a widget rather than as the point.
  // A positioning context for the layers behind Atlas, sized to him rather than to
  // the burst — the burst overflows it on purpose and nothing here clips.
  headlineArt: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  hero: { alignSelf: 'stretch' },
  // Behind the XP card, centred on it, and larger than it so the burst reads as
  // radiating from the number rather than framing it. `overflow: visible` is the
  // default; the parent does not clip, which is what lets it spill past the card edge.
  celebration: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpCard: { alignItems: 'center', paddingVertical: space[5] },
  xpValue: { ...text('hero'), color: colors.reward.xp },
  xpUnit: { ...text('overline'), color: colors.text.secondary },

  // Two by two at every width. Four in a row is 64pt a tile at 320 — broken words — and
  // wrapping at a fixed width gave 2 + 2 on a small phone but 3 + 1 at 390, one tile
  // stretched alone under three. A basis under half the row fits two beside the gap and
  // never three; at 200 % text the cards grow taller instead of narrower.
  tiles: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    justifyContent: 'center',
  },
  tile: { flexGrow: 1, flexBasis: '40%' },
  tileFace: { flexGrow: 1, alignItems: 'center', gap: space[1] },
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
    ...squircle,
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
