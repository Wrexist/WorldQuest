import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { ClaySurface, createThemeStyles, motion, radius, space, useReducedMotion } from '@worldquest/design'
import { Icon } from './Icon.js'

/** One visible milestone per real task/answer, with a bounded earned-stamp reveal. */
export function QuestMilestones({ current, total, label, testID, decorative = false }: { current: number; total: number; label: string; testID?: string; decorative?: boolean }) {
  const { styles } = useThemeValues()
  const count = Math.max(1, Math.min(12, total))
  const semantics = decorative ? { 'aria-hidden': true as const } : { role: 'progressbar' as const, 'aria-label': label, 'aria-valuenow': current, 'aria-valuemin': 0, 'aria-valuemax': total }
  return <View {...semantics} testID={testID} style={styles.track}>
    {Array.from({ length: count }, (_, i) => <Stamp key={i} earned={current / Math.max(1, total) >= (i + 1) / count} index={i} />)}
  </View>
}
function Stamp({ earned, index }: { earned: boolean; index: number }) {
  const { colors, styles } = useThemeValues()
  const reduced = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const previous = useRef(earned)
  useEffect(() => {
    const fresh = earned && !previous.current
    previous.current = earned
    scale.setValue(1)
    if (!fresh || reduced) return
    const animation = Animated.sequence([
      Animated.delay(Math.min(index, motion.stagger.maxItems) * motion.stagger.stepMs),
      Animated.timing(scale, { toValue: 1.13, duration: motion.quick.duration, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 160, friction: 7, useNativeDriver: true }),
    ])
    animation.start(); return () => animation.stop()
  }, [earned, index, reduced, scale])
  return <Animated.View aria-hidden style={[styles.stamp, earned && styles.earned, { transform: [{ scale }] }]}>
    <ClaySurface tone={earned ? 'lime' : 'ice'} radius={radius.full} />
    {earned ? <Icon name="check" size={12} color={colors.clay.lime.ink} /> : <View style={styles.pending} />}
  </Animated.View>
}
const useThemeValues = createThemeStyles(colors => ({ colors, styles: StyleSheet.create({
  track: { flexDirection: 'row', gap: space[1], paddingVertical: space[1] },
  stamp: { flex: 1, minHeight: space[5], borderRadius: radius.full, borderWidth: 1, borderColor: colors.border.subtle, alignItems: 'center', justifyContent: 'center' },
  earned: { borderColor: colors.clay.lime.rim },
  pending: { width: space[1], height: space[1], borderRadius: radius.full, backgroundColor: colors.text.secondary },
}) }))
