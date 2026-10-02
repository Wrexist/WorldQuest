/**
 * Atlas, the globe, as rendered 3D film: a real Blender character (scripts/build-globe-mascot.py)
 * whose every mood is 36 rendered frames packed into one sheet (build-globe-mascot-art.cjs).
 *
 * The runtime only slides a picture, like the treasure chest: no 3D engine, no video.
 * Decorative and hidden from assistive technology unless a screen gives him a `label`,
 * or opts into booping with `onBoopLabel`, which makes him a named button that laughs.
 */
import { useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { ATLAS_GLOBE, ATLAS_SEQUENCE, type AtlasGlobeMood } from '../lib/atlasGlobe.generated.js'
import { useMascotMotion } from './useMascotMotion.js'
import { hapticSelect } from '../lib/haptics.js'

export type AtlasMood = AtlasGlobeMood
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
const frames = Array.from({ length: ATLAS_SEQUENCE.frames }, (_, i) => i)
const toSource = (asset: unknown) => (typeof asset === 'string' ? { uri: asset } : asset) as number

export function WorldMascot({ mood = 'welcome', style, label, onBoopLabel, playback = 'ambient' }: {
  mood?: AtlasMood | undefined; style?: StyleProp<ViewStyle> | undefined; label?: string | undefined
  /** Opt in to tapping him: the accessible name of that button. */
  onBoopLabel?: string | undefined
  /** Continuous reference-led acting for the optional adult paywall. */
  playback?: 'ambient' | 'paywall'
}) {
  const dimensions = StyleSheet.flatten(style)
  const [side, setSide] = useState(typeof dimensions?.width === 'number' && typeof dimensions?.height === 'number' ? Math.min(dimensions.width, dimensions.height) : 0)
  const [decoded, setDecoded] = useState<Record<string, boolean>>({})
  const { frame, playing, boopNow, still } = useMascotMotion(mood, side, decoded, playback)
  const art = ATLAS_GLOBE[playing]
  const { columns, rows } = ATLAS_SEQUENCE

  const film = <View testID={`mascot-pose-${playing}`} style={{ width: side, height: side, overflow: 'hidden', direction: 'ltr' }}>
    {still || side === 0
      ? <Image testID="mascot-still" source={toSource(art.still)} alt="" {...hidden} resizeMode="contain" style={{ width: side, height: side }} />
      : <Animated.Image testID="mascot-film" source={toSource(art.sheet)} alt="" {...hidden} resizeMode="stretch"
          onLoad={() => setDecoded(previous => previous[playing] ? previous : { ...previous, [playing]: true })}
          style={{ width: side * columns, height: side * rows, transform: [
            { translateX: frame.interpolate({ inputRange: frames, outputRange: frames.map(i => -(i % columns) * side) }) },
            { translateY: frame.interpolate({ inputRange: frames, outputRange: frames.map(i => -Math.floor(i / columns) * side) }) },
          ] }} />}
  </View>

  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout
    const next = Math.round(Math.min(width, height))
    if (next > 0) setSide(previous => previous === next ? previous : next)
  }
  if (onBoopLabel !== undefined) {
    return <Pressable testID="world-mascot" onPress={() => { hapticSelect(); boopNow() }} onLayout={onLayout} role="button" aria-label={onBoopLabel}
      style={({ pressed }) => [{ alignItems: 'center', justifyContent: 'center', opacity: pressed ? .8 : 1 }, style]}>{film}</Pressable>
  }
  return <View testID="world-mascot" pointerEvents="none" {...(label === undefined ? hidden : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
    onLayout={onLayout} style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
    {film}
  </View>
}
