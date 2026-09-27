import { createThemeStyles } from '@worldquest/design'
/** Atlas belongs to a little landscape, with separate 3D character and scenery layers. */
import { Image, StyleSheet, View } from 'react-native'

import island from '../../assets/art/atlas3d/expedition.webp'
import { AtlasCharacter, type AtlasMood } from './AtlasCharacter.js'

export function ExpeditionScene({ size = 260, mood = 'welcome' }: { size?: number; mood?: AtlasMood }) {
  const { styles } = useThemeValues()
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size * .86 }}>
    <View style={[styles.sun, { width: size * .32, height: size * .32, top: size * .035, end: size * .08 }]} />
    <View style={[styles.cloud, { width: size * .23, height: size * .055, top: size * .15, start: size * .04 }]} />
    <View style={[styles.cloud, { width: size * .16, height: size * .045, top: size * .32, end: 0 }]} />
    <Image source={typeof island === 'string' ? { uri: island } : island} alt="" resizeMode="contain"
      style={{ position: 'absolute', bottom: 0, width: size, height: size * .60 }} />
    <View style={{ position: 'absolute', top: 0, start: size * .16 }}>
      <AtlasCharacter size={size * .69} mood={mood} />
    </View>
  </View>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  sun: { position: 'absolute', borderRadius: 200, backgroundColor: colors.journey.sun },
  cloud: { position: 'absolute', borderRadius: 40, backgroundColor: colors.bg.surfaceRaised },
})
  return { colors, styles }
})
