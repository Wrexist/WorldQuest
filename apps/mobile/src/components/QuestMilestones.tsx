import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { motion, useReducedMotion } from '@worldquest/design'
import { Icon } from './Icon.js'

/** One visible milestone per real task/answer, with a bounded earned-stamp reveal. */
export function QuestMilestones({ current, total, label, testID, decorative = false }: { current: number; total: number; label: string; testID?: string; decorative?: boolean }) {
  const count = Math.max(1, Math.min(12, total))
  const semantics = decorative ? { 'aria-hidden': true as const } : { role: 'progressbar' as const, 'aria-label': label, 'aria-valuenow': current, 'aria-valuemin': 0, 'aria-valuemax': total }
  return <View {...semantics} testID={testID} style={styles.track}>
    {Array.from({ length: count }, (_, i) => <Stamp key={i} earned={current / Math.max(1, total) >= (i + 1) / count} index={i} />)}
  </View>
}
function Stamp({ earned, index }: { earned: boolean; index: number }) {
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
    {earned ? <Icon name="check" size={12} color="#FFFFFF" /> : <View style={styles.pending} />}
  </Animated.View>
}
const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 5, paddingVertical: 3 },
  stamp: { flex: 1, minHeight: 19, borderRadius: 7, backgroundColor: '#EDF1E6', borderWidth: 1, borderColor: '#CBD8BC', alignItems: 'center', justifyContent: 'center' },
  earned: { backgroundColor: '#28734F', borderColor: '#1B5538', borderBottomWidth: 3 },
  pending: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#ABB99E' },
})
