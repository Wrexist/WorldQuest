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
  label?: string
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
  label,
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
      aria-label={label}
      accessibilityValue={{
        min: 0,
        max: safeTotal,
        now: current,
        text: `${current} of ${total}`,
      }}
      style={[styles.wrap, style]}
      testID={testID}
    >
      {(label !== undefined || showCount) && (
        <View style={styles.header}>
          {label !== undefined && <Text style={styles.label}>{label}</Text>}
          {showCount && (
            <Text style={[styles.count, { color: fill }]}>
              {current} / {total}
            </Text>
          )}
        </View>
      )}
      <View style={[styles.track, { height }]}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...text('caption'), color: colors.text.secondary },
  // Tabular: `9 / 10` must not shift width when it becomes `10 / 10`.
  count: { ...text('caption', { weight: '800', numeric: true }) },
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
