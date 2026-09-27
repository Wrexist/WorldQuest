import { createThemeStyles } from '@worldquest/design'
/** A true hinged 3D reveal, sampled into one mobile-sized texture. Cosmetic only. */
import { useEffect, useRef, useState } from 'react'
import { Animated, AppState, Pressable, StyleSheet, View } from 'react-native'
import { useReducedMotion } from '@worldquest/design'
import sheet from '../../assets/art/expedition/chest-sheet.webp'
import { CHEST_SEQUENCE } from '../lib/soft.generated.js'
import { useT } from '../lib/i18n.js'
import { hapticCelebrate } from '../lib/haptics.js'
import { soundUnlock } from '../lib/sound.js'

const FRAME = 240
const LAST = CHEST_SEQUENCE.frames - 1
const frames = Array.from({ length: LAST + 1 }, (_, i) => i)
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

export function TreasureChest({ opened, onOpen, onReveal }: { opened: boolean; onOpen: () => void; onReveal?: (() => void) | undefined }) {
  const { styles } = useThemeValues()
  const t = useT()
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(opened ? LAST : 0)).current
  const [decoded, setDecoded] = useState(false)
  const [failed, setFailed] = useState(false)
  const initiallyOpen = useRef(opened)
  const completed = useRef(false)
  const reveal = useRef(onReveal)
  reveal.current = onReveal
  useEffect(() => {
    if (!opened) { progress.setValue(0); completed.current = false; return }
    const finish = (playSound: boolean) => {
      progress.setValue(LAST)
      if (completed.current) return
      completed.current = true
      reveal.current?.()
      if (playSound && !initiallyOpen.current) { hapticCelebrate(); soundUnlock() }
    }
    if (reduced || failed || initiallyOpen.current || completed.current) { finish(true); return }
    // A cold image decode must not consume the opening before the learner can see it.
    if (!decoded) return
    let alive = true
    progress.setValue(0)
    const timeline = Animated.timing(progress, { toValue: LAST, duration: LAST / CHEST_SEQUENCE.fps * 1000,
      easing: value => Math.floor(value * LAST) / LAST, useNativeDriver: true, isInteraction: false })
    timeline.start(({ finished }) => { if (alive && finished) finish(true) })
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { timeline.stop(); finish(false) }
    })
    return () => { alive = false; timeline.stop(); sub.remove() }
  }, [opened, reduced, decoded, failed, progress])
  return <Pressable testID="streak-chest" role="button" aria-label={t(opened ? 'streak:chest.opened' : 'streak:chest.open')}
    aria-disabled={opened} disabled={opened} onPress={onOpen} style={styles.frame}>
    <Animated.View {...hidden} style={[styles.halo, { opacity: progress.interpolate({ inputRange: [0, LAST * .5, LAST], outputRange: [.35, .55, 1] }), transform: [{ scale: progress.interpolate({ inputRange: [0, LAST], outputRange: [.8, 1] }) }] }]} />
    <View {...hidden} style={styles.viewport}>
      <Animated.Image testID="chest-film" source={typeof sheet === 'string' ? { uri: sheet } : sheet}
        onLoad={() => setDecoded(true)} onError={() => setFailed(true)}
        alt="" {...hidden} resizeMode="stretch" style={{ width: FRAME * CHEST_SEQUENCE.columns, height: FRAME * CHEST_SEQUENCE.rows,
          transform: [
            { translateX: progress.interpolate({ inputRange: frames, outputRange: frames.map(i => -(i % CHEST_SEQUENCE.columns) * FRAME) }) },
            { translateY: progress.interpolate({ inputRange: frames, outputRange: frames.map(i => -Math.floor(i / CHEST_SEQUENCE.columns) * FRAME) }) },
          ] }} />
    </View>
  </Pressable>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  frame: { width: FRAME, height: FRAME, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: FRAME * .85, height: FRAME * .85, borderRadius: FRAME,
    backgroundColor: colors.journey.sky },
  viewport: { width: FRAME, height: FRAME, overflow: 'hidden', direction: 'ltr' },
})
  return { colors, styles }
})
