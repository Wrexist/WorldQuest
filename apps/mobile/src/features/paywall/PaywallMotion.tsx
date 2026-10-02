import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, AppState, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import { createThemeStyles, motion, radius, space, text, useReducedMotion } from '@worldquest/design'
import { Icon } from '../../components/Icon.js'
import { useT } from '../../lib/i18n.js'
import { WorldMascot } from '../../components/WorldMascot.js'

const spring = {
  stiffness: motion.expressive.stiffness,
  damping: 2 * Math.sqrt(motion.expressive.stiffness) * motion.expressive.damping,
  mass: 1,
  useNativeDriver: true,
}
/** The donor reveals hero → copy → timeline → plans → CTA in roughly 1.3 seconds. */
export function Reveal({ children, order, hero = false }: { children: ReactNode; order: number; hero?: boolean }) {
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (reduced) { progress.setValue(1); return }
    progress.setValue(0)
    const animation = Animated.sequence([
      Animated.delay(order * motion.quick.duration),
      Animated.spring(progress, { ...spring, toValue: 1 }),
    ])
    animation.start()
    return () => animation.stop()
  }, [order, progress, reduced])
  return <Animated.View testID={`paywall-reveal-${order}`} style={{ opacity: progress, transform: [
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [hero ? -space[8] : space[5], 0] }) },
    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [hero ? 0.78 : 0.96, 1] }) },
  ] }}>{children}</Animated.View>
}
export function usePlanSpring(selected: boolean) {
  const reduced = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const previous = useRef(selected)
  useEffect(() => {
    if (reduced) { scale.setValue(1); previous.current = selected; return }
    if (previous.current === selected) return
    previous.current = selected
    scale.setValue(selected ? 0.96 : 1.02)
    const animation = Animated.spring(scale, { ...spring, toValue: 1 })
    animation.start()
    return () => animation.stop()
  }, [selected, reduced, scale])
  return scale
}
/** Decorative loops stop when the screen is hidden or Reduce Motion is enabled. */
function useAmbientMotion() {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const phase = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined
    const stop = () => { animation?.stop(); phase.setValue(0) }
    const start = () => {
      stop()
      if (reduced || AppState.currentState !== 'active' || navigation?.isFocused() === false) return
      animation = Animated.loop(Animated.timing(phase, { toValue: 1, duration: motion.drift.duration,
        easing: Easing.linear, useNativeDriver: true, isInteraction: false }))
      animation.start()
    }
    start()
    const state = AppState.addEventListener('change', value => value === 'active' ? start() : stop())
    const focus = navigation?.addListener('focus', start)
    const blur = navigation?.addListener('blur', stop)
    return () => { stop(); state.remove(); focus?.(); blur?.() }
  }, [navigation, phase, reduced])
  return { phase, reduced }
}
export function PaywallMascot() {
  const { phase } = useAmbientMotion()
  return <Animated.View testID="paywall-mascot-float" style={{ transform: [
    { translateY: phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -space[1], 0] }) },
    { rotate: phase.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-2deg', '2deg', '0deg'] }) },
  ] }}><WorldMascot playback="paywall" style={{ width: space[9] + space[8], height: space[9] + space[8] }} /></Animated.View>
}
export function DriftingCloud({ children, style, reverse = false }: { children: ReactNode; style: StyleProp<ViewStyle>; reverse?: boolean }) {
  const { phase } = useAmbientMotion()
  return <Animated.View pointerEvents="none" aria-hidden style={[style, { transform: [{ translateX:
    phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, reverse ? -space[2] : space[2], 0] }) }] }]}>{children}</Animated.View>
}
export function Sheen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useStyles()
  const { phase, reduced } = useAmbientMotion()
  const [width, setWidth] = useState(0)
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[style, { overflow: 'hidden' }]}>
    {children}
    {!reduced && width > 0 && <Animated.View pointerEvents="none" aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: width / 2,
      opacity: phase.interpolate({ inputRange: [0, 0.15, 0.5, 0.65, 1], outputRange: [0, 0.35, 0.35, 0, 0] }),
      transform: [{ translateX: phase.interpolate({ inputRange: [0, 0.65, 1], outputRange: [-width / 2, width, width] }) }, { skewX: '-20deg' }],
    }}><LinearGradient colors={[colors.bg.surface + '00', colors.bg.surface, colors.bg.surface + '00']} style={StyleSheet.absoluteFill} /></Animated.View>}
  </View>
}
export function SelectionSparkle({ selected }: { selected: boolean }) {
  const { colors } = useStyles()
  const reduced = useReducedMotion()
  const phase = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!selected || reduced) { phase.setValue(1); return }
    phase.setValue(0)
    const animation = Animated.timing(phase, { toValue: 1, duration: motion.shimmer.duration, useNativeDriver: true, isInteraction: false })
    animation.start()
    return () => animation.stop()
  }, [phase, reduced, selected])
  return <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
    {[-1, 1].map(direction => <Animated.View key={direction} style={{ position: 'absolute', top: -space[2], end: space[3],
      opacity: phase.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [
        { translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [0, direction * space[5]] }) },
        { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -space[4]] }) },
        { scale: phase.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1, 0.5] }) },
      ] }}><Icon name="star" size={space[3]} color={colors.league.gold.edge} /></Animated.View>)}
  </View>
}
/** A one-shot guided read, not a countdown. All text remains legible at every step. */
export function TrialTimeline({ days, cycle }: { days: number; cycle: string }) {
  const t = useT()
  const { styles, colors } = useStyles()
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(2)).current
  const [positions, setPositions] = useState([0, 0, 0])
  useEffect(() => {
    if (reduced) { progress.setValue(2); return }
    progress.setValue(0)
    const animation = Animated.sequence([
      Animated.delay(motion.celebrate.duration),
      Animated.timing(progress, { toValue: 1, duration: motion.drift.duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(progress, { toValue: 2, duration: motion.drift.duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])
    animation.start()
    return () => animation.stop()
  }, [progress, reduced, days])
  const rows = [
    { icon: 'lock' as const, title: t('paywall:timeline.today'), body: t('paywall:timeline.todayBody') },
    { icon: 'bell' as const, title: t('paywall:timeline.control'), body: t('paywall:timeline.controlBody') },
    { icon: 'star' as const, title: t('paywall:timeline.end', { days }), body: t('paywall:timeline.endBody', { cycle }) },
  ]
  const railHeight = positions[2]! - positions[0]! + space[6]
  return <View style={styles.section}>
    <Text style={styles.title}>{t('paywall:timeline.title')}</Text>
    <View style={styles.timeline}>
      {positions[2]! > 0 && <View style={[styles.rail, { top: positions[0], height: railHeight }]} aria-hidden>
        <Animated.View testID="paywall-trial-fill" style={[styles.fill, { height: railHeight, transform: [{ translateY: progress.interpolate({
          inputRange: [0, 1, 2], outputRange: [space[6] - railHeight, positions[1]! - positions[0]! + space[6] - railHeight, 0],
        }) }] }]} />
      </View>}
      {rows.map((row, index) => <View key={row.icon} style={styles.row} onLayout={event => {
        const y = event.nativeEvent.layout.y
        setPositions(previous => previous[index] === y ? previous : previous.map((value, i) => i === index ? y : value))
      }}>
        <View style={styles.marker}>
          <Icon name={row.icon} size={space[4]} color={colors.status.progress} />
          <Animated.View style={[styles.activeIcon, { opacity: index === 0 ? 1 : progress.interpolate({ inputRange: [index - 0.25, index], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
            <Icon name={row.icon} size={space[4]} color={colors.text.onStatus} />
          </Animated.View>
        </View>
        <View style={styles.copy}>
          <Animated.View pointerEvents="none" aria-hidden style={[styles.highlight, { opacity: reduced ? 0 : progress.interpolate({ inputRange: [index - 1, index, index + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' }) }]} />
          <Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.body}>{row.body}</Text>
        </View>
      </View>)}
    </View>
  </View>
}
const useStyles = createThemeStyles(colors => ({ colors, styles: StyleSheet.create({
  section: { gap: space[2] }, title: { ...text('overline'), textAlign: 'center', color: colors.status.progress },
  timeline: { padding: space[2], gap: space[1], borderRadius: radius.lg, backgroundColor: colors.bg.surfaceRaised },
  rail: { position: 'absolute', start: space[2], width: space[6], borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.status.progressTrack },
  fill: { width: '100%', borderRadius: radius.full, backgroundColor: colors.status.progress },
  row: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  marker: { width: space[6], height: space[6], alignItems: 'center', justifyContent: 'center' },
  activeIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, paddingHorizontal: space[1], paddingVertical: space[1] },
  highlight: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg.surface, borderRadius: radius.sm },
  rowTitle: { ...text('caption', { weight: '700' }), color: colors.text.primary }, body: { ...text('caption'), color: colors.text.secondary },
}) }))
