/** Atlas is one complete liquid-clay cutout. Motion never exposes neighbouring frames. */
import { useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { space } from '@worldquest/design'
import { ATLAS_CLAY, ATLAS_CLAY_BLINK, type AtlasClayMood } from '../lib/atlasClay.generated.js'
import { useMascotMotion } from './useMascotMotion.js'
import { useMascotIdle } from './useMascotIdle.js'
import { hapticSelect } from '../lib/haptics.js'
import { soundTap } from '../lib/sound.js'

export type AtlasMood = AtlasClayMood
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
const toSource = (asset: unknown) => (typeof asset === 'string' ? { uri: asset } : asset) as number

/**
 * How he moves when a pose arrives — once, never on a loop.
 *
 * Every pose used to play the same small greeting, so a cheer and a "hmm" moved alike
 * and the lesson's reaction was only a picture swap (feel audit 2026-10-06, gap 3). Now
 * the movement matches the face: a cheer is a real hop with a squash on landing, a
 * thought is a slow head tilt, everything else keeps the greeting. Still one finite
 * gesture per pose: big motion is for big moments. Between them he only breathes and
 * blinks (`useMascotIdle`).
 */
type Gesture = 'greet' | 'hop' | 'ponder'
const STEPS = [0, .35, .7, 1]
const GESTURES: Record<Gesture, { lift: number[]; scale: number[]; tilt: string[] }> = {
  greet: { lift: [0, -space[1], 0, 0], scale: [1, 1.035, .99, 1], tilt: ['0deg', '-2deg', '1deg', '0deg'] },
  hop: { lift: [0, -space[4], 0, 0], scale: [1, 1.06, .96, 1], tilt: ['0deg', '-4deg', '2deg', '0deg'] },
  ponder: { lift: [0, 0, -space[1] / 2, 0], scale: [1, 1, 1.01, 1], tilt: ['0deg', '6deg', '4deg', '0deg'] },
}
/**
 * The smallest Atlas that breathes and blinks. The blink frame is a second full image, so
 * an icon-sized Atlas skips both: below this his eyes are a few points tall and a breath
 * is under a point. It is also the off switch: set it out of reach and no Atlas idles.
 */
const IDLE_MIN_SIDE = space[9]
/** How far a breath fills him out: under two percent taller, a little narrower. */
const BREATH = .016

const gestureFor = (mood: AtlasClayMood): Gesture =>
  mood === 'celebrate' || mood === 'laughing' || mood === 'surprised' ? 'hop' : mood === 'thinking' ? 'ponder' : 'greet'

export function WorldMascot({ mood = 'welcome', style, label, onBoopLabel }: {
  mood?: AtlasMood | undefined; style?: StyleProp<ViewStyle> | undefined; label?: string | undefined
  /** Opt in to tapping him: the accessible name of that button. */
  onBoopLabel?: string | undefined
  /** Compatibility for paywall callers; all scenes now use a finite greeting. */
  playback?: 'ambient' | 'paywall'
}) {
  const dimensions = StyleSheet.flatten(style)
  const [side, setSide] = useState(typeof dimensions?.width === 'number' && typeof dimensions?.height === 'number' ? Math.min(dimensions.width, dimensions.height) : 0)
  const [decoded, setDecoded] = useState<ReadonlySet<unknown>>(new Set())
  const { gesture, playing, boopNow, reduced } = useMascotMotion(mood, side, decoded)
  const art = ATLAS_CLAY[playing]
  // Only where he is big enough to see, and only once his pose is on screen: closed eyes
  // over a pose that is still decoding would float on their own.
  const idle = !reduced && side >= IDLE_MIN_SIDE
  const blink = idle ? ATLAS_CLAY_BLINK[playing] : undefined
  const { lids, breath } = useMascotIdle(idle && decoded.has(art))
  const character = <View testID={`mascot-pose-${playing}`} style={{ width: side, height: side }}>
    <Animated.View testID="mascot-motion" dataSet={{ gesture: gestureFor(playing) }} style={{ width: side, height: side, transform: reduced ? [] : [
      { translateY: gesture.interpolate({ inputRange: STEPS, outputRange: GESTURES[gestureFor(playing)].lift }) },
      { scale: gesture.interpolate({ inputRange: STEPS, outputRange: GESTURES[gestureFor(playing)].scale }) },
      { rotate: gesture.interpolate({ inputRange: STEPS, outputRange: GESTURES[gestureFor(playing)].tilt }) },
    ] }}>
      {/* The breath grows him from his boots, so his feet stay on the ground. */}
      <Animated.View testID="mascot-breath" style={{ width: side, height: side, transform: idle ? [
        { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -side * BREATH / 2] }) },
        { scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + BREATH] }) },
        { scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - BREATH / 3] }) },
      ] : [] }}>
        <Image key={String(art)} testID="mascot-still" source={toSource(art)} alt="" {...hidden} resizeMode="contain"
          onLoad={() => setDecoded(previous => previous.has(art) ? previous : new Set([...previous, art]))}
          style={{ width: side, height: side }} />
        {blink === undefined ? null : <Animated.Image key={String(blink)} testID="mascot-blink" source={toSource(blink)} alt="" {...hidden}
          resizeMode="contain" style={[StyleSheet.absoluteFill, { width: side, height: side, opacity: lids }]} />}
      </Animated.View>
    </Animated.View>
  </View>

  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout
    const next = Math.round(Math.min(width, height))
    if (next > 0) setSide(previous => previous === next ? previous : next)
  }
  if (onBoopLabel !== undefined) {
    return <Pressable testID="world-mascot" onPress={() => { hapticSelect(); soundTap(); boopNow() }} onLayout={onLayout} role="button" aria-label={onBoopLabel}
      style={({ pressed }) => [{ alignItems: 'center', justifyContent: 'center', opacity: pressed ? .8 : 1 }, style]}>{character}</Pressable>
  }
  return <View testID="world-mascot" pointerEvents="none" {...(label === undefined ? hidden : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
    onLayout={onLayout} style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
    {character}
  </View>
}
