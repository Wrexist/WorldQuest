/**
 * ProgressBar — every list, country and collection answers "how far along am I?".
 *
 * The numeric label is not decoration: a bar alone conveys progress by fill length
 * only, which fails for screen-reader users and reads poorly at small sizes. The
 * mockup shows `172 / 195` alongside the bar on nine of fifteen screens — match it.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { text } from '../typography.js'

/**
 * `progress` is the default green. `reward` is the amber the mockup uses on the
 * quest card — a distinct meaning (this is a reward track, not raw completion),
 * so it earns its own tone rather than a colour override at the call site.
 */
export type ProgressTone = 'progress' | 'reward'

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

export function ProgressBar({
  current, total, tone = 'progress', showCount = true, label, height = 8, style, testID,
}: ProgressBarProps) {
  const fill = tone === 'reward' ? colors.reward.xp : colors.status.progress
  const safeTotal = Math.max(1, total)
  const pct = Math.min(100, Math.max(0, (current / safeTotal) * 100))

  return (
    <View
      accessible
      role="progressbar"
      aria-label={label}
      accessibilityValue={{ min: 0, max: safeTotal, now: current, text: `${current} of ${total}` }}
      style={[styles.wrap, style]}
      testID={testID}
    >
      {(label !== undefined || showCount) && (
        <View style={styles.header}>
          {label !== undefined && <Text style={styles.label}>{label}</Text>}
          {showCount && <Text style={[styles.count, { color: fill }]}>{current} / {total}</Text>}
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: radius.full }]}>
        <View style={[styles.fill, { width: `${pct}%`, borderRadius: radius.full, backgroundColor: fill }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...text('caption'), color: colors.text.secondary },
  // Tabular: `9 / 10` must not shift width when it becomes `10 / 10`.
  count: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.status.progress,
  },
  track: { backgroundColor: colors.bg.canvas, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.status.progress },
})
