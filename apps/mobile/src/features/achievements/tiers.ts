/**
 * How a tier is named and coloured, in one place.
 *
 * These two tables lived inside `AchievementsScreen`. The unlock card needs exactly the
 * same answers — "Bronze", in bronze — and a second copy is how a tier ends up gold on
 * the shelf and a different gold on the card that announced it.
 */

import { colors, palette } from '@worldquest/design'
import type { Tier } from '@worldquest/engines'
import type { TranslationKey } from '../../lib/i18n.js'

export const TIER_LABEL: Record<Tier, TranslationKey> = {
  bronze: 'achievements:tier.bronze',
  silver: 'achievements:tier.silver',
  gold: 'achievements:tier.gold',
  platinum: 'achievements:tier.platinum',
  legendary: 'achievements:tier.legendary',
}

/**
 * The tier colours from docs/systems/achievements.md §2.
 *
 * Bronze, silver and platinum are metal colours with no semantic meaning beyond
 * "this tier" — they are the one place a raw palette reference is right, because
 * there is nothing to name them after. Gold reuses the reward token, since a gold
 * tier and an XP reward are the same idea.
 *
 * Every one of them is always paired with the tier's NAME wherever it is drawn: the
 * colour is a second signal, never the only one.
 */
export const TIER_COLOR: Record<Tier, string> = {
  bronze: palette.bronze['500'],
  silver: palette.silver['500'],
  gold: colors.reward.xp,
  platinum: palette.platinum['500'],
  legendary: palette.purple['500'],
}
