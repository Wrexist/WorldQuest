/** Articulated globe: independent limbs, pupils, eyelids and anticipation/settle. */
import { useState } from 'react'
import { Animated, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useMascotMotion } from './useMascotMotion.js'
import { FRAME_TIMES, PERFORMANCES, RIG, type MascotMood } from './mascotPerformance.js'
import body from '../../assets/art/world-mascot/rig/body.webp'
import feet from '../../assets/art/world-mascot/rig/feet.webp'
import leftArm from '../../assets/art/world-mascot/rig/leftArm.webp'
import rightArm from '../../assets/art/world-mascot/rig/rightArm.webp'
import eyes from '../../assets/art/world-mascot/rig/eyes.webp'
import pupils from '../../assets/art/world-mascot/rig/pupils.webp'
import brows from '../../assets/art/world-mascot/rig/brows.webp'
import scarf from '../../assets/art/world-mascot/rig/scarf.webp'
import smile from '../../assets/art/world-mascot/rig/smile.webp'
import thinking from '../../assets/art/world-mascot/rig/thinking.webp'
import gentle from '../../assets/art/world-mascot/rig/gentle.webp'
import happyEyes from '../../assets/art/world-mascot/rig/happyEyes.webp'

export type AtlasMood = MascotMood
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

export function WorldMascot({ mood = 'welcome', style, label }: {
  mood?: AtlasMood | undefined; style?: StyleProp<ViewStyle> | undefined; label?: string | undefined
}) {
  const dimensions = StyleSheet.flatten(style)
  const [side, setSide] = useState(typeof dimensions?.width === 'number' && typeof dimensions?.height === 'number' ? Math.min(dimensions.width, dimensions.height) : 0)
  const { clock, blink } = useMascotMotion(mood, side)
  const unit = side / RIG.size
  const tracks = PERFORMANCES[mood]
  const track = (key: keyof typeof tracks[number], scale = 1) => clock.interpolate({ inputRange: FRAME_TIMES, outputRange: tracks.map(frame => frame[key] * scale) })
  const angle = (key: keyof typeof tracks[number]) => clock.interpolate({ inputRange: FRAME_TIMES, outputRange: tracks.map(frame => `${frame[key]}deg`) })
  const layer = (asset: typeof body, id: string) => <Image testID={id} source={typeof asset === 'string' ? { uri: asset } : asset} alt="" {...hidden} style={[StyleSheet.absoluteFill, { width: side, height: side }]} resizeMode="contain" />
  const pivot = (x: number, y: number, angle: Animated.AnimatedInterpolation<string>) => [
    { translateX: (x - 150) * unit }, { translateY: (y - 150) * unit }, { rotate: angle },
    { translateX: -(x - 150) * unit }, { translateY: -(y - 150) * unit },
  ]
  return <View testID="world-mascot" pointerEvents="none" {...(label === undefined ? hidden : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
    onLayout={event => { const { width, height } = event.nativeEvent.layout; const next = Math.round(Math.min(width, height)); if (next > 0) setSide(previous => previous === next ? previous : next) }}
    style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
    <Animated.View testID={`mascot-pose-${mood}`} style={{ width: side, height: side, transform: [{ translateY: track('jump', unit) }] }}>
      {layer(feet, 'mascot-feet')}
      <Animated.View testID="mascot-torso" style={[StyleSheet.absoluteFill, { transform: [
        { translateY: track('bodyY', unit) },
        ...pivot(RIG.hips.x, RIG.hips.y, angle('bodyTilt')),
        { translateY: (RIG.hips.y - 150) * unit },
        { scaleY: clock.interpolate({ inputRange: FRAME_TIMES, outputRange: tracks.map(frame => 1 + frame.squash) }) },
        { scaleX: clock.interpolate({ inputRange: FRAME_TIMES, outputRange: tracks.map(frame => 1 - frame.squash * .5) }) },
        { translateY: -(RIG.hips.y - 150) * unit },
      ] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pivot(RIG.leftShoulder.x, RIG.leftShoulder.y, angle('leftArm')) }]}>{layer(leftArm, 'mascot-left-arm')}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pivot(RIG.rightShoulder.x, RIG.rightShoulder.y, angle('rightArm')) }]}>{layer(rightArm, 'mascot-right-arm')}</Animated.View>
      {layer(body, 'mascot-body')}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pivot(117, 201, angle('scarf')) }]}>{layer(scarf, 'mascot-scarf')}</Animated.View>
      {layer(brows, 'mascot-brows')}
      {mood === 'resting' || mood === 'celebrate' ? layer(happyEyes, 'mascot-happy-eyes') : <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: -24 * unit }, { scaleY: blink }, { translateY: 24 * unit }] }]}>
        {layer(eyes, 'mascot-eyes')}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: track('gazeX', unit) }, { translateY: track('gazeY', unit) }] }]}>{layer(pupils, 'mascot-pupils')}</Animated.View>
      </Animated.View>}
      {layer(mood === 'thinking' ? thinking : mood === 'resting' || mood === 'encouraging' ? gentle : smile, 'mascot-mouth')}
      </Animated.View>
    </Animated.View>
  </View>
}


