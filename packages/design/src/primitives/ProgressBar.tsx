/**
 * ProgressBar — every list, country and collection answers "how far along am I?".
 *
 * The numeric label is not decoration: a bar alone conveys progress by fill length
 * only, which fails for screen-reader users and reads poorly at small sizes. The
 * mockup shows `172 / 195` alongside the bar on nine of fifteen screens — match it.
 *
 * Thick and fully rounded, with a lighter sheen along the top of the fill. That sheen
 * is the one piece of pure decoration in this file and it earns its place: it is what
 * turns a flat rectangle into something that looks filled, and a progress bar that
 * looks filled is the single most motivating object in a learning app. It is drawn
 * inside the fill, so it grows with it and disappears at zero.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { text } from '../typography.js'
import { Tally } from './Tally.js'

/**
 * `progress` is the default green. `reward` is the amber the mockup uses on the
 * quest card — a distinct meaning (this is a reward track, not raw completion),
 * so it earns its own tone rather than a colour override at the call site.
 */
export type ProgressTone = 'progress' | 'reward' | 'streak'

export type ProgressBarProps = {
  current: number
  total: number
  tone?: ProgressTone
  /** Renders "172 / 195" beside the bar. Strongly preferred. */
  showCount?: boolean
  /**
   * Renders "38 %" at the trailing end of the TRACK.
   *
   * A different job from `showCount`, which sits in the header and says how many. This
   * says how far, and it exists because a bar conveys progress by fill LENGTH — which is
   * unreadable at the left-hand end, exactly where a new user's every bar sits. Six of
   * the seven continent cards are at zero on a fresh account and looked identical.
   *
   * Started life as a local row on the Explore tile and moved here so a second screen
   * would not re-implement it, which is how two conventions begin.
   *
   * OFF by default, and that is the whole discipline of it. Turned on everywhere it
   * looked consistent, it was mostly duplication: a quest task shows "0 / 4" an inch to
   * the right of its bar, Home's world card shows "0 of 192 facts", and a percentage
   * beside either says the same thing twice. Five rows reading "0 %" down a column is
   * clutter wearing a design system's clothes.
   *
   * So the rule is: show it where the text beside the bar is NOT already a fraction of
   * the same quantity. Explore's tiles qualify — a count of facts and a share of a
   * continent are different questions, and the share is what makes seven cards
   * comparable. Achievements qualifies — "5 to go" is a remainder, not a fraction.
   * Quests, Home and the region banner do not, and they were turned back off.
   */
  showPercent?: boolean
  label?: string
  /**
   * What a screen reader announces as the value — a localised "172 of 195".
   *
   * This package cannot import `@worldquest/i18n` (design depends on nothing, which is
   * what lets the token layer be reused), so the fallback is an English template. That
   * fallback was the only behaviour until now, which meant every Swedish user with
   * VoiceOver on heard the count in English while the screen around it was translated.
   * Callers that have a translator pass the localised string here.
   */
  valueText?: string
  /**
   * The bar's name for a screen reader, when nothing is printed beside it.
   *
   * `label` is both the visible caption and the accessible name, which is right almost
   * everywhere — the words a sighted user reads are the words a reader should say. It is
   * wrong in the one case where the surrounding card already says what the bar measures
   * and printing it again would be the same sentence twice, six pixels apart. Profile's
   * level card is that case: "Level 12" and "41 / 187 XP" sit directly above the bar.
   *
   * Passing both is a mistake rather than a merge, so `label` wins and this is ignored —
   * a bar with two names has one of them wrong.
   */
  accessibilityLabel?: string
  height?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

const FILLS: Record<ProgressTone, string> = {
  progress: colors.status.progress,
  reward: colors.reward.xp,
  streak: colors.status.streak,
}

const SHEENS: Record<ProgressTone, string> = {
  progress: colors.status.progressHighlight,
  reward: colors.reward.coin,
  streak: colors.status.streak,
}

export function ProgressBar({
  current,
  total,
  tone = 'progress',
  showCount = true,
  showPercent = false,
  label,
  valueText,
  accessibilityLabel,
  height = 16,
  style,
  testID,
}: ProgressBarProps) {
  const fill = FILLS[tone]
  const safeTotal = Math.max(1, total)
  const pct = Math.min(100, Math.max(0, (current / safeTotal) * 100))

  return (
    <View
      accessible
      role="progressbar"
      aria-label={label ?? accessibilityLabel}
      // Set explicitly as well as via `accessibilityValue`. react-native-web carries
      // that prop's numeric fields across but drops `text`, so the localised value was
      // announced on native and silently missing on web — the third time in this repo
      // that an RN platform a11y prop has no-opped on web while looking correct in
      // source. Only the ARIA spelling can be trusted to reach the DOM.
      aria-valuetext={valueText}
      accessibilityValue={{
        min: 0,
        max: safeTotal,
        now: current,
        text: valueText ?? `${current} of ${total}`,
      }}
      style={[styles.wrap, style]}
      testID={testID}
    >
      {(label !== undefined || showCount) && (
        <View style={styles.header}>
          {/* `Tally`, so a label that carries numbers reads as a count rather than as
              a caption — the same mechanic the continent tiles use, applied here so it
              lands on every bar in the app instead of on the screens somebody
              remembered. A label with no digits in it is untouched. */}
          {label !== undefined && (
            <Tally style={styles.label} numberStyle={styles.labelNumber}>
              {label}
            </Tally>
          )}
          {showCount && (
            <Text style={[styles.count, { color: fill }]}>
              {current} / {total}
            </Text>
          )}
        </View>
      )}
      <View style={showPercent ? styles.trackRow : undefined}>
      <View style={[styles.track, { height }, showPercent && styles.trackFlex]}>
        {pct > 0 && (
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fill }]}>
            {/* Inset by a hair so the sheen follows the fill's rounded ends instead
                of squaring them off. Hidden from the reader — the value is announced
                by the track. */}
            <View
              style={[styles.sheen, { backgroundColor: SHEENS[tone] }]}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
        )}
      </View>
      {showPercent && (
        // Hidden from the reader: the track above is a `progressbar` carrying
        // `aria-valuetext`, so the figure is already announced. Saying it twice per bar
        // is noise, and a screen with seven bars would say it fourteen times.
        <Text
          style={styles.percent}
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          {`${Math.round(pct)}%`}
        </Text>
      )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...text('caption'), color: colors.text.secondary },
  labelNumber: { ...text('caption', { weight: '700', numeric: true }), color: colors.text.primary },
  // Tabular: `9 / 10` must not shift width when it becomes `10 / 10`.
  count: { ...text('caption', { weight: '800', numeric: true }) },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  trackFlex: { flex: 1 },
  // Tabular, so a column of bars keeps its percentages aligned instead of jittering as
  // they pass 9 % and 99 %.
  percent: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.secondary,
  },
  track: {
    backgroundColor: colors.status.progressTrack,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full, justifyContent: 'flex-start' },
  // Inset by one space step on every side it touches, so the sheen follows the fill's
  // rounded ends rather than squaring them off. `space[1]` is the step that exists for
  // exactly this — sub-component detail, not layout.
  sheen: {
    height: space[1],
    marginTop: space[1],
    marginHorizontal: space[1],
    borderRadius: radius.full,
    opacity: 0.55,
  },
})
