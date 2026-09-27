import { Animated, StyleSheet, Text, View } from 'react-native'
import { colors, radius, space, text, useCelebration } from '@worldquest/design'
import { useT } from '../lib/i18n.js'
import { HeaderJewel } from './HeaderJewel.js'
import { Icon } from './Icon.js'
import { WorldMapArt } from './WorldMapArt.js'

/** A real wallet amount with a bounded coin reveal and a pop when the balance changes. */
export function CoinWallet({ coins }: { coins: number }) {
  const t = useT()
  const pop = useCelebration(coins)
  return <View style={styles.wallet} accessible aria-label={t('shop:balance', { count: coins })} testID="coin-wallet">
    <View pointerEvents="none" aria-hidden style={styles.map}><WorldMapArt width={340} height={180} /></View>
    <View style={styles.orbit} pointerEvents="none" aria-hidden />
    <View style={styles.row}>
      <View style={styles.words}>
        <Text style={styles.label}>{t('shop:balance.label')}</Text>
        <Animated.Text style={[styles.amount, { transform: [{ scale: pop }] }]}>{coins}</Animated.Text>
        <View style={styles.rule} />
      </View>
      <View style={styles.art} pointerEvents="none" aria-hidden>
        <HeaderJewel name="coins" size={126} />
        <View style={styles.sparkle}><Icon name="star" size={space[4]} color={colors.league.gold.start} /></View>
        <View style={styles.sparkleSmall}><Icon name="star" size={space[2]} color={colors.league.gold.highlight} /></View>
      </View>
    </View>
    <View style={styles.footer}><Icon name="globe" size={space[4]} color={colors.league.gold.start} /><Text style={styles.footerText}>WorldQuest</Text></View>
  </View>
}
const styles = StyleSheet.create({
  wallet: { minHeight: space[9]*3, backgroundColor: colors.chrome.surface, borderRadius: radius['2xl'], borderBottomWidth: space[1], borderColor: colors.chrome.edge, overflow: 'hidden', padding: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] },
  words: { flex: 1, minWidth: space[9], gap: space[2] },
  label: { ...text('bodyStrong'), color: colors.league.gold.highlight },
  amount: { ...text('hero', { numeric: true }), color: colors.chrome.text, alignSelf: 'flex-start' },
  rule: { width: space[7], height: space[1], borderRadius: radius.full, backgroundColor: colors.league.gold.end },
  art: { width: 126, height: 120, alignItems: 'center', justifyContent: 'center' },
  map: { position: 'absolute', end: -80, top: 8, opacity: .2 },
  orbit: { position: 'absolute', width: space[9]*3, height: space[9]*3, borderRadius: radius.full, borderWidth: 1, borderColor: colors.chrome.counter, end: -space[4], top: -space[5] },
  sparkle: { position: 'absolute', end: 0, top: 13 },
  sparkleSmall: { position: 'absolute', start: 8, bottom: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3] },
  footerText: { ...text('caption', { weight: '600' }), color: colors.league.gold.start },
})
