import { createThemeStyles } from '@worldquest/design'
import { StyleSheet, View } from 'react-native'
import { radius, space } from '@worldquest/design'
import { CURRENT_NODE } from './pathGeometry.js'

/** Native progress ring: the filled arc represents completed lessons, not XP. */
export function LessonRing({ finished, lessons }: { finished: number; lessons: number }) {
  const { colors, styles } = useThemeValues()
  const fraction = Math.max(0, Math.min(1, finished / Math.max(1, lessons)))
  return <View pointerEvents="none" aria-hidden style={styles.ring} testID="lesson-ring" dataSet={{ progress: String(fraction) }}>
    <View style={styles.track} testID="lesson-ring-track" />
    {Array.from({ length: Math.floor(64 * fraction) }, (_, i) => <View key={i} style={[styles.segment, {
      backgroundColor: colors.course.banner,
      transform: [{ rotate: `${i * 360 / 64}deg` }, { translateY: -(CURRENT_NODE / 2 + space[2]) }],
    }]} />)}
  </View>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  ring: { position: 'absolute', top: 0, start: 0, width: CURRENT_NODE, height: CURRENT_NODE },
  track: { position: 'absolute', top: -space[2] - space[1] / 2, start: -space[2] - space[1] / 2, width: CURRENT_NODE + space[2] * 2 + space[1], height: CURRENT_NODE + space[2] * 2 + space[1], borderRadius: radius.full, borderWidth: space[1], borderColor: colors.course.track },
  segment: { position: 'absolute', top: '50%', start: '50%', marginStart: -space[2] / 2, marginTop: -space[1] / 2, width: space[2], height: space[1], borderRadius: radius.full },
})
  return { colors, styles }
})
