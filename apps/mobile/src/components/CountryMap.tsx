/**
 * Where a country is — the region, with the country lit up inside it.
 *
 * The mockup's map thumbnail, and the only version of this picture that teaches
 * anything. A silhouette of Chad alone tells you the shape of Chad; Africa with Chad
 * glowing tells you where Chad is, which is the question the app exists to answer.
 *
 * ## Two tinted layers, not one picture
 *
 * Both PNGs are white-on-transparent alpha masks, so `tintColor` paints them from
 * design tokens at runtime. That is what makes a high-contrast theme or a seasonal
 * palette recolour the map without regenerating a single file, and it is as close to
 * ADR 0008's "fills are design tokens" as a raster gets.
 *
 * The two files are rasterised in one shared projection per region, so they overlay
 * exactly (`scripts/build-maps.cjs`). They are not independently positioned here and
 * must not be — nudging one would put a country somewhere it is not.
 *
 * ## Accessibility
 *
 * Decorative by default, exactly like `Flag`: on a country page the heading beside it
 * already says "Sweden", and an image that announces itself again just makes a reader
 * say everything twice. Pass `label` only where the picture carries information
 * nothing else on screen does — a lesson prompt asking "where is this?".
 */

import { Image, StyleSheet, View } from 'react-native'
import { ArtSlot, colors, radius } from '@worldquest/design'
import { mapHeight, mapSource, regionMapPath } from '../lib/maps.js'

export type CountryMapProps = {
  /** The content pack's `assets.map.path`, e.g. `geo/countries/SE.png`. */
  readonly path: string | undefined
  /** The country's region code, which selects the continent behind it. */
  readonly region: string | undefined
  /** Width in points; the height follows from the 4:3 ratio. */
  readonly width: number
  /** The continent behind the highlight. Muted on purpose — it is context, not subject. */
  readonly baseTint?: string | undefined
  /** The country itself. Defaults to the app's progress green. */
  readonly tint?: string | undefined
  /**
   * Announce the image, with this text. Omitted — the normal case — hides it from the
   * screen reader as decoration.
   */
  readonly label?: string | undefined
}

export function CountryMap({ path, region, width, baseTint, tint, label }: CountryMapProps) {
  const country = mapSource(path)
  const base = region === undefined ? undefined : mapSource(regionMapPath(region))
  const height = mapHeight(width)

  // The country layer is the point. Without it there is nothing to say, so the slot
  // shows rather than a continent with no highlight — which would read as a map of
  // somewhere, captioned as a map of somewhere else.
  if (country === undefined) {
    return <ArtSlot tint={baseTint ?? colors.bg.surfaceRaised} glyph="◍" width={width} height={height} />
  }

  return (
    <View
      style={[styles.frame, { width, height }]}
      {...(label === undefined
        ? {
            // Three props for one idea, because the three renderers disagree — see
            // Flag.tsx, where this was measured rather than assumed.
            'aria-hidden': true,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : { accessibilityLabel: label, role: 'img' as const })}
    >
      {base !== undefined && (
        <Image
          source={base}
          style={[styles.layer, { width, height }]}
          resizeMode="contain"
          tintColor={baseTint ?? colors.bg.surfacePressed}
          aria-hidden
        />
      )}
      <Image
        source={country}
        style={[styles.layer, { width, height }]}
        resizeMode="contain"
        tintColor={tint ?? colors.status.progress}
        aria-hidden
      />
    </View>
  )
}

const styles = StyleSheet.create({
  /**
   * A window, not a cropped image.
   *
   * The continent runs off the edge of the 4:3 raster — Asia fills it completely — and
   * with no container that hard edge reads as a clipping bug rather than as a map
   * being looked at through something. A rounded surface with the same radius as every
   * other panel in the app turns the crop into a deliberate viewport, which is also
   * what makes it sit on a lesson screen without looking pasted on.
   */
  frame: {
    position: 'relative',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  // Absolute so the two masks share an origin. `contain` on both, at identical box
  // sizes, is what keeps the highlight registered with the continent.
  layer: { position: 'absolute', top: 0, start: 0 },
})
