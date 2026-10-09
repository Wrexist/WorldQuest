import { createThemeStyles } from '@worldquest/design'
import { StyleSheet, Text, View } from 'react-native'
import { ClaySurface, radius, space, text } from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { useT } from '../lib/i18n.js'
import { Icon } from './Icon.js'

/** A base earning rule, never a promised lesson payout. Gold clay and the bolt, as in a lesson (`EarnedReward`). */
export function AnswerReward() {
  const { colors, styles } = useThemeValues()
  const t = useT()
  return <View style={styles.row}>
    <View style={styles.badge}>
      <ClaySurface tone="gold" radius={radius.full} />
      <Icon name="xp" size={20} color={colors.clay.gold.ink} />
      <Text style={styles.amount}>{t('home:path.xp', { amount: BALANCE.xp.correctAnswer })}</Text>
    </View>
    <Text style={styles.detail}>{t('home:path.xp.detail')}</Text>
  </View>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space[1], padding: space[2], borderRadius: radius.full },
  amount: { ...text('bodyStrong', { numeric: true }), color: colors.clay.gold.ink },
  detail: { ...text('caption'), color: colors.text.secondary, flex: 1, minWidth: 110 },
})
  return { colors, styles }
})
