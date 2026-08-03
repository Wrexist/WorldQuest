/**
 * A UI icon.
 *
 * Replaces the text glyphs the app shipped with — `⌂ ◎ ◈ ☺ ⋯` in the tab bar,
 * `🔥 🌍 🗺 🏆` in the chips and empty states. Those were not merely rough: a glyph is
 * a different typeface on every device, four of them were colour emoji that ignore
 * `color` entirely, and a screen reader will happily announce `☺` as "white smiling
 * face" in the middle of a tab label.
 *
 * ## One file, every colour
 *
 * Each PNG is white on transparent — an alpha MASK, not a picture. `tintColor`
 * recolours it, so the same file draws the active tab in `action.primary` and the
 * inactive one in `text.secondary`, and a themed override needs no new asset. Same
 * technique `CountryMap` uses for its two map layers.
 *
 * ## Decorative by default
 *
 * Almost every icon in this app sits beside its own label — the tab bar, the settings
 * rows, the stat chips. An icon that announces itself there makes a screen reader say
 * everything twice. So it is hidden from the tree unless a caller passes `label`, and
 * the callers that pass one are the icon-only buttons where the picture IS the name.
 *
 * Artwork: Lucide (ISC), rasterised by `pnpm build:icons`. See scripts/build-icons.cjs.
 */

import { Image, type ImageSourcePropType } from 'react-native'
import { colors } from '@worldquest/design'
import { ICON_BY_NAME, type IconName } from '../lib/icons.generated.js'

/**
 * Metro gives a numeric handle, Vite a URL string — see types/assets.d.ts. Narrowed
 * here rather than at the call site, exactly as `lib/flags.ts` does for flags.
 *
 * No `undefined` branch, unlike flags: `IconName` is a union generated from the files
 * that exist, so a missing icon is a compile error rather than a blank square.
 */
const source = (name: IconName): ImageSourcePropType => {
  const asset = ICON_BY_NAME[name]
  return typeof asset === 'string' ? { uri: asset } : asset
}

export type IconProps = {
  readonly name: IconName
  /** Points. Square — every icon in the set is drawn on a 24×24 grid. */
  readonly size?: number
  /** Any colour token. Defaults to body text so an untinted icon still reads. */
  readonly color?: string
  /**
   * Announce the icon, with this text. Omitted — the normal case — hides it as
   * decoration. Pass it only where nothing else on screen names the thing.
   */
  readonly label?: string | undefined
}

const DEFAULT_SIZE = 24

export function Icon({ name, size = DEFAULT_SIZE, color = colors.text.primary, label }: IconProps) {
  return (
    <Image
      source={source(name)}
      style={{ width: size, height: size }}
      // The whole point: one white mask, recoloured per use.
      tintColor={color}
      // `alt=""` plus aria-hidden, or a real name. `aria-hidden` rather than
      // `accessibilityElementsHidden` — the latter is iOS-only and react-native-web
      // ignores it, which is the same family of bug as the `accessibilityState` one
      // this repo already hit.
      accessibilityLabel={label ?? ''}
      aria-hidden={label === undefined}
      role={label === undefined ? undefined : 'img'}
      // Never scales with the font. An icon that grows with the text setting overflows
      // the 44pt target it sits inside; the LABEL beside it is what carries the scale.
      resizeMode="contain"
    />
  )
}
