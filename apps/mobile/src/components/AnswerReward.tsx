import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, space, text } from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { useT } from '../lib/i18n.js'
import { Icon } from './Icon.js'

/** A base earning rule, never a promised lesson payout. */
export function AnswerReward() {
  const t = useT()
  return <View style={styles.row}>
    <View style={styles.badge}>
      <Icon name="star" size={20} color={colors.reward.coin} />
      <Text style={styles.amount}>{t('home:path.xp', { amount: BALANCE.xp.correctAnswer })}</Text>
    </View>
    <Text style={styles.detail}>{t('home:path.xp.detail')}</Text>
  </View>
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space[1], padding: space[2], borderRadius: radius.full, backgroundColor: colors.journey.sand },
  amount: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
  detail: { ...text('caption'), color: colors.text.secondary, flex: 1, minWidth: 110 },
})
