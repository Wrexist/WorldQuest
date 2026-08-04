/**
 * `expo-linear-gradient`, for the screenshot renderer only.
 *
 * The real module is native, so the renderer would otherwise take `Card`'s flat
 * fallback — and the screenshots would show flat cards while the app shows gradients.
 * A harness whose output does not match the thing it depicts is worse than no harness:
 * it is a review artefact that quietly lies.
 *
 * This maps the same props onto a CSS gradient. It is aliased in ONLY by the
 * screenshot build (`--alias:expo-linear-gradient=...`), so nothing ships with it.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native'

type Point = { x: number; y: number }

export function LinearGradient({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  style,
}: {
  colors: readonly string[]
  start?: Point
  end?: Point
  style?: StyleProp<ViewStyle>
}) {
  // CSS angles run clockwise from "up"; the unit-square vector runs down-right.
  const angle = (Math.atan2(end.x - start.x, start.y - end.y) * 180) / Math.PI
  const css = `linear-gradient(${Math.round(angle)}deg, ${colors.join(', ')})`

  // `backgroundImage` is not a React Native style prop, which is exactly why this
  // file exists only for the web renderer.
  return <View style={[style, { backgroundImage: css } as unknown as ViewStyle]} />
}

export default { LinearGradient }
