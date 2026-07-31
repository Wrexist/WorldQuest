/**
 * ProgressBar — every list, country and collection answers "how far along am I?".
 *
 * The numeric label is not decoration: a bar alone conveys progress by fill length
 * only, which fails for screen-reader users and reads poorly at small sizes. The
 * mockup shows `172 / 195` alongside the bar on nine of fifteen screens — match it.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space, typography } from '../tokens.js'

export type ProgressBarProps = {
  current: number
  total: number
  /** Renders "172 / 195" beside the bar. Strongly preferred. */
  showCount?: boolean
  label?: string
  height?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function ProgressBar({
  current, total, showCount = true, label, height = 8, style, testID,
}: ProgressBarProps) {
  const safeTotal = Math.max(1, total)
  const pct = Math.min(100, Math.max(0, (current / safeTotal) * 100))

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: safeTotal, now: current, text: `${current} of ${total}` }}
      style={[styles.wrap, style]}
      testID={testID}
    >
      {(label !== undefined || showCount) && (
        <View style={styles.header}>
          {label !== undefined && <Text style={styles.label}>{label}</Text>}
          {showCount && <Text style={styles.count}>{current} / {total}</Text>}
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: radius.full }]}>
        <View style={[styles.fill, { width: `${pct}%`, borderRadius: radius.full }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontFamily: typography.fontFamily.body, fontSize: typography.scale.caption.size,
    color: colors.text.secondary, fontWeight: '500',
  },
  count: {
    fontFamily: typography.fontFamily.numeric, fontSize: typography.scale.caption.size,
    color: colors.status.progress, fontWeight: '700', fontVariant: ['tabular-nums'],
  },
  track: { backgroundColor: colors.bg.canvas, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.status.progress },
})
