import { createThemeStyles } from '@worldquest/design'
import type { ReactNode } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Card, radius, space, text, useCelebration } from '@worldquest/design'
import { useT } from '../lib/i18n.js'
import { DaylightIllustration } from './DaylightIllustration.js'
import { Icon } from './Icon.js'
import { WorldMapArt } from './WorldMapArt.js'

/** A real wallet amount with a bounded coin reveal and a pop when the balance changes. */
export function CoinWallet({ coins, children }: { coins: number; children?: ReactNode }) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const pop = useCelebration(coins)
  return <Card tone="navy" style={styles.wallet} testID="coin-wallet">
    <View pointerEvents="none" aria-hidden style={styles.map}><WorldMapArt width={340} height={180} /></View>
    <View style={styles.row}>
      <View style={styles.words} accessible aria-label={t('shop:balance', { count: coins })}>
        <Text style={styles.label}>{t('shop:balance.label')}</Text>
        <Animated.Text style={[styles.amount, { transform: [{ scale: pop }] }]}>{coins}</Animated.Text>
      </View>
      <View style={styles.art} pointerEvents="none" aria-hidden>
        <DaylightIllustration name="coins" size={space[9] + space[5]} active={false} />
        <View style={styles.sparkle}><Icon name="star" size={space[4]} color={colors.league.gold.start} /></View>
        <View style={styles.sparkleSmall}><Icon name="star" size={space[2]} color={colors.league.gold.highlight} /></View>
      </View>
    </View>
    {children}
  </Card>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  wallet: { padding: space[0], borderRadius: radius['2xl'], overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] },
  words: { flex: 1, minWidth: space[9], gap: space[1] },
  label: { ...text('bodyStrong'), color: colors.chrome.text },
  amount: { ...text('display', { weight: '800', numeric: true }), color: colors.league.gold.end, alignSelf: 'flex-start' },
  art: { width: space[9] + space[5], height: space[9] + space[5], alignItems: 'center', justifyContent: 'center' },
  map: { position: 'absolute', end: -80, top: 8, opacity: .2 },
  sparkle: { position: 'absolute', end: 0, top: 13 },
  sparkleSmall: { position: 'absolute', start: 8, bottom: 4 },
})
  return { colors, styles }
})
