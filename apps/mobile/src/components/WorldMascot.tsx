/** Articulated globe: independent limbs, lids, brows, pupils and faces; entrance, idle life and a boop. */
import { useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useMascotMotion } from './useMascotMotion.js'
import { BOOP, FACE, FRAME_TIMES, IDLES, PERFORMANCES, RIG, type Extra, type MascotMood, type Mouth, type Pose } from './mascotPerformance.js'
import body from '../../assets/art/world-mascot/rig/body.png'
import feet from '../../assets/art/world-mascot/rig/feet.png'
import leftArm from '../../assets/art/world-mascot/rig/leftArm.png'
import rightArm from '../../assets/art/world-mascot/rig/rightArm.png'
import eyes from '../../assets/art/world-mascot/rig/eyes.png'
import pupils from '../../assets/art/world-mascot/rig/pupils.png'
import brows from '../../assets/art/world-mascot/rig/brows.png'
import scarf from '../../assets/art/world-mascot/rig/scarf.png'
import smile from '../../assets/art/world-mascot/rig/smile.png'
import thinking from '../../assets/art/world-mascot/rig/thinking.png'
import gentle from '../../assets/art/world-mascot/rig/gentle.png'
import laugh from '../../assets/art/world-mascot/rig/laugh.png'
import surprised from '../../assets/art/world-mascot/rig/surprised.png'
import smirk from '../../assets/art/world-mascot/rig/smirk.png'
import happyEyes from '../../assets/art/world-mascot/rig/happyEyes.png'
import lidLeft from '../../assets/art/world-mascot/rig/lidLeft.png'
import lidRight from '../../assets/art/world-mascot/rig/lidRight.png'
import tears from '../../assets/art/world-mascot/rig/tears.png'
import sparkles from '../../assets/art/world-mascot/rig/sparkles.png'
import zzz from '../../assets/art/world-mascot/rig/zzz.png'

export type AtlasMood = MascotMood
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
const MOUTHS: Record<Mouth, typeof body> = { smile, thinking, gentle, laugh, surprised, smirk }
const EXTRAS: Record<Extra, typeof body> = { tears, sparkles, zzz }

export function WorldMascot({ mood = 'welcome', style, label, onBoopLabel }: {
  mood?: AtlasMood | undefined; style?: StyleProp<ViewStyle> | undefined; label?: string | undefined
  /** Opt in to tapping him: the accessible name of that button. Decorative otherwise. */
  onBoopLabel?: string | undefined
}) {
  const dimensions = StyleSheet.flatten(style)
  const [side, setSide] = useState(typeof dimensions?.width === 'number' && typeof dimensions?.height === 'number' ? Math.min(dimensions.width, dimensions.height) : 0)
  const { clock, idle, boop, blink, booping, boopNow } = useMascotMotion(mood, side)
  const unit = side / RIG.size
  const face = FACE[booping ? 'laughing' : mood]

  // Each track is the entrance, the idle loop and the boop, summed: three clocks, one pose.
  const on = (clockValue: Animated.Value, frames: readonly Pose[], key: keyof Pose, scale: number) =>
    clockValue.interpolate({ inputRange: FRAME_TIMES, outputRange: frames.map(frame => frame[key] * scale) })
  const track = (key: keyof Pose, scale = 1) => Animated.add(Animated.add(
    on(clock, PERFORMANCES[mood], key, scale), on(idle, IDLES[mood], key, scale)), on(boop, BOOP, key, scale))
  const angle = (key: keyof Pose) => track(key).interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] })
  const layer = (asset: typeof body, id: string) => <Image testID={id} source={typeof asset === 'string' ? { uri: asset } : asset} alt="" {...hidden} style={[StyleSheet.absoluteFill, { width: side, height: side }]} resizeMode="contain" />
  const pivot = (x: number, y: number, rotate: Animated.AnimatedInterpolation<string>) => [
    { translateX: (x - 150) * unit }, { translateY: (y - 150) * unit }, { rotate },
    { translateX: -(x - 150) * unit }, { translateY: -(y - 150) * unit },
  ]
  // A lid hinges at its eye's top: scaled to 0 it is open and unseen, to 1 the eye is shut.
  const lid = (asset: typeof body, id: string, at: { x: number; y: number }, rest: number, key: 'lidL' | 'lidR') => {
    const amount = Animated.add(rest, track(key)).interpolate({ inputRange: [0, 1], outputRange: [.001, 1], extrapolate: 'clamp' })
    return <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: (at.y - 150) * unit }, { scaleY: amount }, { translateY: -(at.y - 150) * unit }] }]}>{layer(asset, id)}</Animated.View>
  }
  const pupilScale = Animated.add(face.pupil, track('pupil'))

  const character = <Animated.View testID={`mascot-pose-${mood}`} style={{ width: side, height: side, transform: [{ translateY: track('jump', unit) }] }}>
    {layer(feet, 'mascot-feet')}
    <Animated.View testID="mascot-torso" style={[StyleSheet.absoluteFill, { transform: [
      { translateY: track('bodyY', unit) },
      ...pivot(RIG.hips.x, RIG.hips.y, angle('bodyTilt')),
      { translateY: (RIG.hips.y - 150) * unit },
      { scaleY: Animated.add(1, track('squash')) },
      { scaleX: Animated.add(1, track('squash', -.5)) },
      { translateY: -(RIG.hips.y - 150) * unit },
    ] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pivot(RIG.leftShoulder.x, RIG.leftShoulder.y, angle('leftArm')) }]}>{layer(leftArm, 'mascot-left-arm')}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pivot(RIG.rightShoulder.x, RIG.rightShoulder.y, angle('rightArm')) }]}>{layer(rightArm, 'mascot-right-arm')}</Animated.View>
      {layer(body, 'mascot-body')}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: pivot(117, 201, angle('scarf')) }]}>{layer(scarf, 'mascot-scarf')}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: Animated.add(face.browY * unit, track('browY', unit)) }] }]}>{layer(brows, 'mascot-brows')}</Animated.View>
      {face.eyes === 'happy' ? layer(happyEyes, 'mascot-happy-eyes') : <>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: -24 * unit }, { scaleY: blink }, { translateY: 24 * unit }] }]}>
          {layer(eyes, 'mascot-eyes')}
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [
            { translateX: track('gazeX', unit) }, { translateY: track('gazeY', unit) },
            { translateX: (RIG.pupils.x - 150) * unit }, { translateY: (RIG.pupils.y - 150) * unit },
            { scale: pupilScale },
            { translateX: -(RIG.pupils.x - 150) * unit }, { translateY: -(RIG.pupils.y - 150) * unit },
          ] }]}>{layer(pupils, 'mascot-pupils')}</Animated.View>
        </Animated.View>
        {lid(lidLeft, 'mascot-lid-left', RIG.lidLeft, face.lids[0], 'lidL')}
        {lid(lidRight, 'mascot-lid-right', RIG.lidRight, face.lids[1], 'lidR')}
      </>}
      {layer(MOUTHS[face.mouth], 'mascot-mouth')}
      {face.extras.map(extra => <Animated.View key={extra} style={[StyleSheet.absoluteFill, { transform: [
        // Tears fall, Zzz rise: each mood authors `float` in the direction it means.
        { translateY: track('float', unit) },
        { scale: Animated.add(1, track('twinkle')) },
      ] }]}>{layer(EXTRAS[extra], `mascot-${extra}`)}</Animated.View>)}
    </Animated.View>
  </Animated.View>

  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout
    const next = Math.round(Math.min(width, height))
    if (next > 0) setSide(previous => previous === next ? previous : next)
  }
  if (onBoopLabel !== undefined) {
    return <Pressable testID="world-mascot" onPress={boopNow} onLayout={onLayout} role="button" aria-label={onBoopLabel}
      style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>{character}</Pressable>
  }
  return <View testID="world-mascot" pointerEvents="none" {...(label === undefined ? hidden : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label })}
    onLayout={onLayout} style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
    {character}
  </View>
}
