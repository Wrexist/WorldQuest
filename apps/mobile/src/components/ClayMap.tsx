import { Image, type StyleProp, type ImageStyle } from 'react-native'
import { CLAY_MAPS } from '../lib/clay-maps.generated.js'

/** A still from the live globe renderer; safe to repeat in scrolling lists. */
export function ClayMap({ name, style, cover = false }: {
  readonly name: string
  readonly style?: StyleProp<ImageStyle>
  readonly cover?: boolean
}) {
  const source = CLAY_MAPS[name]
  if (source === undefined) return null
  return <Image source={typeof source === 'string' ? { uri: source } : source}
    resizeMode={cover ? 'cover' : 'contain'} style={style}
    alt="" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
}
