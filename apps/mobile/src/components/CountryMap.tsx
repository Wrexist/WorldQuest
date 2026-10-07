import { StyleSheet, View } from 'react-native'
import { ArtSlot, createThemeStyles, radius, squircle } from '@worldquest/design'
import { ClayMap } from './ClayMap.js'
import { Icon } from './Icon.js'
import { CLAY_MAPS } from '../lib/clay-maps.generated.js'

export type CountryMapProps = {
  /** Content pack locator, e.g. geo/countries/SE.png. Unknown paths stay unknown. */
  readonly path: string | undefined
  readonly contextPath: string | undefined
  readonly width: number
  readonly label?: string | undefined
}

/** Accurate relief and a lifted highlight from GlobeRenderer, without a GL context per card.
 * No labels or capital pins are baked in: question disclosure stays with the lesson.
 */
export function CountryMap({ path, width, label }: CountryMapProps) {
  const { colors, styles } = useThemeValues()
  const code = /^geo\/countries\/([A-Z]{2})\.png$/.exec(path ?? '')?.[1]
  const height = Math.round(width * 3 / 4)
  if (code === undefined || CLAY_MAPS[code] === undefined) {
    return <ArtSlot tint={colors.bg.surfaceRaised}
      art={<Icon name="map" size={Math.round(width * .3)} color={colors.text.tertiary} />}
      width={width} height={height} />
  }
  return <View style={[styles.frame, { width, height }]}
    {...(label === undefined
      ? { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
      : { accessibilityLabel: label, role: 'img' as const })}>
    <ClayMap name={code} style={{ width, height }} />
  </View>
}

const useThemeValues = createThemeStyles((colors) => ({ colors, styles: StyleSheet.create({
  // The edge makes the light sea read as a framed picture on the dark canvas, not a hole in it.
  frame: { overflow: 'hidden', borderRadius: radius.lg, ...squircle, backgroundColor: colors.map.water,
    borderWidth: 1, borderColor: colors.border.subtle },
}) }))
