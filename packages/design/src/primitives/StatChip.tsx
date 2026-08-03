/**
 * StatChip — XP, coins, streak and hearts. One component, four meanings, because
 * they share a shape and differ only in token.
 *
 * The icon is always present: colour alone must never carry the meaning.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { text } from '../typography.js'

export type ChipKind = 'xp' | 'coin' | 'streak' | 'hearts' | 'gem'

export type StatChipProps = {
  kind: ChipKind
  value: number | string
  /**
   * The picture, supplied by the caller.
   *
   * A node rather than a name, because the artwork is an app ASSET and this package
   * may not reach into `apps/mobile/assets` — the dependency rule runs one way. It
   * used to be a literal `'🔥'` in a map here, which is how the app shipped a colour
   * emoji that ignores `color` and renders in Apple's house style beside our flat
   * cards. `src/components/Stat.tsx` owns the kind → icon pairing so it cannot drift.
   */
  icon: React.ReactNode
  /** Full-sentence label for screen readers, e.g. "12 day streak". */
  accessibilityLabel: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

const TINTS: Record<ChipKind, string> = {
  xp: colors.reward.xp,
  coin: colors.reward.coin,
  streak: colors.status.streak,
  hearts: colors.status.hearts,
  gem: colors.reward.gem,
}

/** The colour the caller should tint its icon, so the pair always matches. */
export const chipTint = (kind: ChipKind): string => TINTS[kind]

export function StatChip({ kind, value, icon, accessibilityLabel, style, testID }: StatChipProps) {
  return (
    <View
      accessible
      aria-label={accessibilityLabel}
      style={[styles.base, { borderColor: TINTS[kind] }, style]}
      testID={testID}
    >
      {icon}
      <Text style={[styles.value, { color: TINTS[kind] }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row', alignItems: 'center', gap: space[1],
    paddingHorizontal: space[3], paddingVertical: space[2],
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    // A ring in the chip's own meaning-colour is applied by the caller-facing tint
    // below. Without it a chip on a raised card vanishes into the card.
    borderWidth: 2,
    minHeight: 34,
  },
  // `bodyStrong`, not `caption`: the number is the entire point of a chip and it has
  // to survive being read at arm's length, mid-lesson, by someone whose attention is
  // on the question. Tabular so a streak ticking 9 → 10 does not jog the row.
  value: text('bodyStrong', { numeric: true }),
})
