import { Image, type StyleProp, type ImageStyle, type ViewStyle } from 'react-native'
import { ADVENTURE_ART } from '../lib/adventure.generated.js'
import { WorldMascot, type AtlasMood } from './WorldMascot.js'
/** Scenery and the shared articulated companion; labels and actions stay native. */
export function AdventureArt({ name, style, mood = 'welcome' }: { name: keyof typeof ADVENTURE_ART; style?: StyleProp<ImageStyle>; mood?: AtlasMood }) {
  if (name === 'explorer' || name === 'passport') return <WorldMascot style={style as StyleProp<ViewStyle>} mood={mood} />
  const source = ADVENTURE_ART[name]
  return <Image source={typeof source === 'string' ? { uri: source } : source} style={style} resizeMode={name === 'treasure' ? 'contain' : 'cover'} alt="" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
}
