/** Atlas is one complete liquid-clay cutout. Motion never exposes neighbouring frames. */
import { useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { space } from '@worldquest/design'
import { ATLAS_CLAY, type AtlasClayMood } from '../lib/atlasClay.generated.js'
import { useMascotMotion } from './useMascotMotion.js'
import { hapticSelect } from '../lib/haptics.js'

export type AtlasMood = AtlasClayMood
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
const toSource = (asset: unknown) => (typeof asset === 'string' ? { uri: asset } : asset) as number

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
  const character = <View testID={`mascot-pose-${playing}`} style={{ width: side, height: side }}>
    <Animated.View testID="mascot-motion" style={{ width: side, height: side, transform: reduced ? [] : [
      { translateY: gesture.interpolate({ inputRange: [0, .35, .7, 1], outputRange: [0, -space[1], 0, 0] }) },
      { scale: gesture.interpolate({ inputRange: [0, .35, .7, 1], outputRange: [1, 1.035, .99, 1] }) },
      { rotate: gesture.interpolate({ inputRange: [0, .35, .7, 1], outputRange: ['0deg', '-2deg', '1deg', '0deg'] }) },
    ] }}>
      <Image key={String(art)} testID="mascot-still" source={toSource(art)} alt="" {...hidden} resizeMode="contain"
        onLoad={() => setDecoded(previous => previous.has(art) ? previous : new Set([...previous, art]))}
        style={{ width: side, height: side }} />
    </Animated.View>
  </View>

  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout
    const next = Math.round(Math.min(width, height))
    if (next > 0) setSide(previous => previous === next ? previous : next)
  }
  if (onBoopLabel !== undefined) {
    return <Pressable testID="world-mascot" onPress={() => { hapticSelect(); boopNow() }} onLayout={onLayout} role="button" aria-label={onBoopLabel}
      style={({ pressed }) => [{ alignItems: 'center', justifyContent: 'center', opacity: pressed ? .8 : 1 }, style]}>{character}</Pressable>
  }
  return <View testID="world-mascot" pointerEvents="none" {...(label === undefined ? hidden : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
    onLayout={onLayout} style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
    {character}
  </View>
}
