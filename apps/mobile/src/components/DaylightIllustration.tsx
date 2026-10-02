/** Raster exports of the editable Blender props, sized to their visible silhouette. */
import { Image, View } from 'react-native'
import { EXPEDITION_ART } from '../lib/expedition.generated.js'
import { STUDIO_ART } from '../lib/studio.generated.js'
import { DAYLIGHT_ART } from '../lib/daylight.generated.js'
import { RewardMotion } from './RewardMotion.js'
import { ExplorerChestStill } from './ExplorerChestArt.js'

export function DaylightIllustration({ name, size, active = true }: {
  name: keyof typeof DAYLIGHT_ART | keyof typeof STUDIO_ART | keyof typeof EXPEDITION_ART | 'treasure-chest' | 'chest-base' | 'chest-lid'
  size: number
  active?: boolean
}) {
  if (name === 'treasure-chest' || name === 'chest-base' || name === 'chest-lid') {
    return <RewardMotion active={active}><ExplorerChestStill size={size} opened={name === 'treasure-chest'} /></RewardMotion>
  }
  const { asset, geometry: g } = name in EXPEDITION_ART ? EXPEDITION_ART[name as keyof typeof EXPEDITION_ART]
    : name in STUDIO_ART ? STUDIO_ART[name as keyof typeof STUDIO_ART] : DAYLIGHT_ART[name as keyof typeof DAYLIGHT_ART]
  const width = Math.min(size / g.w, size * g.aspect / g.h)
  return (
    <RewardMotion active={active}>
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Image source={typeof asset === 'string' ? { uri: asset } : asset} resizeMode="contain" alt="" aria-hidden
        style={{ width, height: width / g.aspect, transform: [
          { translateX: width * (0.5 - g.x - g.w / 2) },
          { translateY: width / g.aspect * (0.5 - g.y - g.h / 2) },
        ] }} />
    </View>
    </RewardMotion>
  )
}
