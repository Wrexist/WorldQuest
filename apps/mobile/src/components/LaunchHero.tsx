import { Image, StyleSheet, View } from 'react-native'
import { createThemeStyles, radius, space } from '@worldquest/design'
import { ATLAS_CLAY } from '../lib/atlasClay.generated.js'
import { CloudBackdrop } from './CloudBackdrop.js'
import { WorldMascot } from './WorldMascot.js'

/** One recognisable Atlas silhouette from the system launch to the welcome screen. */
export function LaunchHero({ size, boot = false }: { size: number; boot?: boolean }) {
  const { styles } = useThemeValues()
  const character = size * .76
  return <View testID="launch-hero" pointerEvents="none" aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <View style={[styles.sky, { width: size * .84, height: size * .84, start: size * .08, top: size * .08 }]} />
    <CloudBackdrop animated={!boot} style={{ bottom: size * .06 }} />
    <View style={[styles.character, { top: size * .06 }]}>
      {boot ? <Image source={typeof ATLAS_CLAY.welcome === 'string' ? { uri: ATLAS_CLAY.welcome } : ATLAS_CLAY.welcome}
        alt="" resizeMode="contain" style={{ width: character, height: character }} />
        : <WorldMascot mood="welcome" style={{ width: character, height: character }} />}
    </View>
    <View style={[styles.ground, { width: size * .3, start: size * .35, bottom: size * .1 }]} />
  </View>
}

const useThemeValues = createThemeStyles(colors => ({ styles: StyleSheet.create({
  sky: { position: 'absolute', borderRadius: radius.full, backgroundColor: colors.bg.surface, opacity: .6 },
  character: { position: 'absolute', start: 0, end: 0, alignItems: 'center', zIndex: 1 },
  ground: { position: 'absolute', height: space[2], borderRadius: radius.full, backgroundColor: colors.border.subtle, opacity: .35 },
}) }))
