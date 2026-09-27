import { Image } from 'react-native'
import { EXPEDITION_MAPS } from '../lib/expedition-maps.generated.js'

/** Decorative Natural Earth plate; country learning uses the content pack's maps. */
export function WorldMapArt({ width, height, region = 'world' }: { width: number; height: number; region?: keyof typeof EXPEDITION_MAPS }) {
  const source = EXPEDITION_MAPS[region]
  return <Image source={typeof source === 'string' ? { uri: source } : source} alt="" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    resizeMode="contain" style={{ width, height }} />
}
