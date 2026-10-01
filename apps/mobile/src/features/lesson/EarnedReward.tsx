import { createThemeStyles } from '@worldquest/design'
import { Animated, StyleSheet, Text } from 'react-native'
import { radius, space, text, useScaleIn } from '@worldquest/design'
import { HeaderJewel } from '../../components/HeaderJewel.js'
import { Icon } from '../../components/Icon.js'
import { useT } from '../../lib/i18n.js'

/** Mounts once per graded answer. Animation never delays or changes the real amount. */
export function EarnedReward({ kind, amount }: { kind: 'xp' | 'coin'; amount: number }) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const entrance = useScaleIn(.8)
  return <Animated.View accessible
    aria-label={t(kind === 'xp' ? 'lesson:reward.xp' : 'lesson:reward.coins', { amount })}
    style={[styles.badge, entrance]} testID={`earned-${kind}`}>
    {kind === 'coin' ? <HeaderJewel name="coins" size={32} /> : <Icon name="star" size={24} color={colors.reward.coin} />}
    <Text style={styles.amount} aria-hidden>{kind === 'xp' ? t('home:path.xp', { amount }) : `+${amount}`}</Text>
  </Animated.View>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: space[1], backgroundColor: colors.journey.sand, borderRadius: radius.full, paddingHorizontal: space[2], minHeight: 40 },
  amount: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
})
  return { colors, styles }
})
