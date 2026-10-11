/**
 * A flat outline map for a place the globe cannot draw: a US state, a Swedish county.
 *
 * The globe's raster knows countries, and a state is not one. These are two Natural Earth
 * masks per place (`scripts/build-subdivisions.cjs`) — the place, and the land around it with
 * its country's first-level borders cut out — tinted from the flat-map tokens the globe's
 * fallback already uses, so a state question looks like the rest of the app: sea, land, and
 * one thing lit in sun gold. Nothing is drawn by hand; a path the bundle lacks draws the
 * reserved art slot, never another place.
 */

import { Image, StyleSheet, View } from 'react-native'
import { ArtSlot, createThemeStyles, radius, squircle } from '@worldquest/design'
import { Icon } from './Icon.js'
import { SUBDIVISION_MAP_BY_PATH } from '../lib/subdivision-maps.generated.js'
import type { ImageSourcePropType } from 'react-native'

const source = (path: string | undefined): ImageSourcePropType | undefined => {
  const asset = path === undefined ? undefined : SUBDIVISION_MAP_BY_PATH[path]
  if (asset === undefined) return undefined
  return typeof asset === 'string' ? { uri: asset } : asset
}

/** Whether these are paths this component can draw. */
export const isLocatorPath = (path: string | undefined): boolean => source(path) !== undefined

export function LocatorMap({ path, contextPath, width, label }: {
  readonly path: string | undefined
  readonly contextPath: string | undefined
  readonly width: number
  /** Absent: decorative (the question already says what it shows, or must not). */
  readonly label?: string | undefined
}) {
  const { colors, styles } = useThemeValues()
  const height = Math.round(width * 3 / 4)
  const subject = source(path)
  const context = source(contextPath)
  if (subject === undefined || context === undefined) {
    return <ArtSlot tint={colors.bg.surfaceRaised} art={<Icon name="map" size={Math.round(width * 0.3)} color={colors.text.tertiary} />} width={width} height={height} />
  }
  return (
    <View
      style={[styles.frame, { width, height }]}
      testID="locator-map"
      {...(label === undefined
        ? { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
        : { accessibilityLabel: label, role: 'img' as const })}
    >
      {/* Sized, not absoluteFill: react-native-web drew a tinted image at its own size inside
          an absolute fill, so the frame showed a corner of the map (Texas as a sliver). */}
      <Image source={context} style={[styles.layer, { width, height }]} tintColor={colors.map.atlasFlatLand} resizeMode="stretch" />
      <Image source={subject} style={[styles.layer, { width, height }]} tintColor={colors.map.atlasSubject} resizeMode="stretch" />
    </View>
  )
}

const useThemeValues = createThemeStyles((colors) => ({ colors, styles: StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: radius.lg, ...squircle, backgroundColor: colors.map.atlasFlatWater,
    borderWidth: 1, borderColor: colors.border.subtle },
  layer: { position: 'absolute', top: 0, start: 0 },
}) }))
