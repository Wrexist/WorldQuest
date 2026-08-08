/**
 * An achievement as an object you could hold, rather than a row in a list.
 *
 * The screen was twelve identical cards — a name, a sentence and a bar — which is what
 * a settings list looks like. `mockup-v1.png` screen 14 shows painted medallions, and
 * §11 of `asset-prompts.md` splits that into two halves so the set stays consistent:
 * **five tier frames**, generated once, and **thirteen category glyphs** composited into
 * them. That is why this draws two images rather than one, and why there are eighteen
 * files instead of sixty-five.
 *
 * ## Locked is dimmed, never hidden and never a padlock
 *
 * An achievement nobody has earned still shows its glyph, at reduced opacity and with
 * no frame. Hiding it would make the set look smaller than it is, and a padlock is on
 * the same permanent no-list as the out-of-hearts one: this product does not tell a
 * ten-year-old they are shut out of something.
 */

import { StyleSheet, View } from 'react-native'
import { colors, radius } from '@worldquest/design'
import type { Tier } from '@worldquest/engines'
import { ART_BY_NAME, type ArtName } from '../../lib/art.generated.js'
import { Art } from '../../components/Art.js'

/**
 * Which glyph belongs to which achievement, keyed on the CATEGORY segment of the id.
 *
 * `ach.flags.collector` → `flags`. Keying on the category rather than the full id means
 * a new achievement in an existing category needs no change here — and the achievement
 * ids are permanent by rule, so the key cannot rot underneath it.
 *
 * Three of the eleven categories share a glyph with another, deliberately: `streak` and
 * `review` are both the same virtue (coming back), and `level` and `explorer` are both
 * about covering ground. Nothing is gained by drawing two pictures of one idea.
 */
const GLYPH: Record<string, string> = {
  capitals: 'capitals',
  countries: 'countries',
  flags: 'flags',
  streak: 'consistency',
  review: 'consistency',
  level: 'exploration',
  explorer: 'exploration',
  quest: 'events',
  session: 'perfect',
  set: 'collections',
  lessons: 'collections',
}

/** `ach.flags.collector` → `glyph-flags`. */
export function glyphFor(achievementId: string): ArtName | null {
  const category = achievementId.split('.')[1] ?? ''
  const glyph = GLYPH[category]
  const name = `achievements/glyph-${glyph}` as ArtName
  return glyph !== undefined && name in ART_BY_NAME ? name : null
}

const FRAME: Record<Tier, ArtName> = {
  bronze: 'achievements/tier-bronze',
  silver: 'achievements/tier-silver',
  gold: 'achievements/tier-gold',
  platinum: 'achievements/tier-platinum',
  legendary: 'achievements/tier-legendary',
}

export type AchievementMedalProps = {
  readonly achievementId: string
  /** The highest tier earned, or null while it is still locked. */
  readonly tier: Tier | null
  readonly size: number
}

/**
 * How much of the medal the glyph takes, framed and unframed.
 *
 * Framed, it has to clear the tier ring, and 0.52 is that ring's inner diameter in the
 * delivered art. Unframed there is no ring to clear, so a glyph held to the framed size
 * would sit in the middle of an empty disc looking like a loading state — which is the
 * opposite of what a locked row is for. It is the same picture either way; only the
 * thing around it changes.
 */
const GLYPH_IN_FRAME = 0.52
const GLYPH_ALONE = 0.66

/**
 * Decorative throughout. The card already announces its name and tier through
 * `accessibilityLabel`, and a reader saying "gold frame, flag glyph" after it is the
 * same picture described twice.
 */
export function AchievementMedal({ achievementId, tier, size }: AchievementMedalProps) {
  const glyph = glyphFor(achievementId)

  return (
    <View
      style={[styles.medal, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {/* `Art`, not a bare `Image`, and that is the whole fix.
          These were drawn with `StyleSheet.absoluteFill` and a margin, which reads as
          "fill the medal, inset a little" and is not what happened: React Native Web
          pins an Image to its source's intrinsic size, so the four zero insets were
          overruled and every glyph rendered at 768×768 inside a 56pt disc. All twelve
          medals came out blank. `Art` takes points and gives points, and it fits the
          SUBJECT to them — which matters twice over here, because a tier frame fills
          about 63 % of its file and a glyph about 48 %. */}
      {tier !== null && (
        <View style={StyleSheet.absoluteFill}>
          <Art name={FRAME[tier]} size={size} />
        </View>
      )}
      {glyph !== null && (
        <View style={tier === null ? styles.locked : undefined}>
          <Art name={glyph} size={Math.round(size * (tier === null ? GLYPH_ALONE : GLYPH_IN_FRAME))} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  medal: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.bg.surface,
  },
  // Present but quiet. Not hidden, and never a padlock. 0.45 is the dim this codebase
  // already uses for "there, but not yet yours" — `tileEmpty` on Explore and `tileDim`
  // on the collection grid — so a locked medal reads the same as a locked anything.
  locked: { opacity: 0.45 },
})
