/**
 * Where a country is — the country lit up, with its neighbours around it.
 *
 * The mockup's map thumbnail, and the only version of this picture that teaches
 * anything. A silhouette of Chad alone tells you the shape of Chad; Chad with Libya,
 * Sudan and Niger around it tells you where Chad is, which is the question the app
 * exists to answer. A continent with Chad as a speck on it tells you neither — that
 * was the first version, and it is why the frame is now fitted per country.
 *
 * ## Two tinted layers, not one picture
 *
 * Both PNGs are white-on-transparent alpha masks, so `tintColor` paints them from
 * design tokens at runtime. That is what makes a high-contrast theme or a seasonal
 * palette recolour the map without regenerating a single file, and it is as close to
 * ADR 0008's "fills are design tokens" as a raster gets.
 *
 * The two files are rasterised in one projection per COUNTRY, so they overlay exactly
 * (`scripts/build-maps.cjs`). They are not independently positioned here and must not
 * be — nudging one would put a country somewhere it is not.
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
import { mapHeight, mapSource } from '../lib/maps.js'

export type CountryMapProps = {
  /** The content pack's `assets.map.path`, e.g. `geo/countries/SE.png`. */
  readonly path: string | undefined
  /**
   * The pack's `assets.mapContext.path` — the land around this country, drawn in the
   * SAME frame. Named by the pack rather than derived, because it is a licensed asset
   * of its own and because each country now has its own projection.
   */
  readonly contextPath: string | undefined
  /** Width in points; the height follows from the 4:3 ratio. */
  readonly width: number
  /** The land behind the highlight. Muted on purpose — it is context, not subject. */
  readonly baseTint?: string | undefined
  /** The country itself. Defaults to the app's progress green. */
  readonly tint?: string | undefined
  /**
   * Announce the image, with this text. Omitted — the normal case — hides it from the
   * screen reader as decoration.
   */
  readonly label?: string | undefined
}

export function CountryMap({ path, contextPath, width, baseTint, tint, label }: CountryMapProps) {
  const country = mapSource(path)
  const base = mapSource(contextPath)
  const height = mapHeight(width)

  // The country layer is the point. Without it there is nothing to say, so the slot
  // shows rather than bare land with no highlight — which would read as a map of
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
   * The surrounding land runs off the edge of the 4:3 raster by design, and with no
   * container that hard edge reads as a clipping bug rather than as a map being looked
   * at through something. A rounded surface with the same radius as every
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
  // sizes, is what keeps the highlight registered with the land behind it.
  layer: { position: 'absolute', top: 0, start: 0 },
})
