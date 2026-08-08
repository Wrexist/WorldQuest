/**
 * The rank insignia for a level title.
 *
 * Shared by Profile, which shows the title you have, and the Shop, which shows it at the
 * top of the list of titles you could wear. Two screens deriving the same picture from
 * the same key is exactly the case for one function: if they disagreed, the same rank
 * would have art in one place and not the other, which reads as a bug in the art rather
 * than in the lookup.
 */

import { ART_BY_NAME, type ArtName } from './art.generated.js'

/**
 * `titles:navigator` → `levels/navigator`, when that rank has been drawn.
 *
 * Null rather than a placeholder in two cases, and both are deliberate:
 *
 *   · **A shop title is not a rank.** `shop:title.flagFanatic` is bought, not climbed
 *     to, and `asset-prompts.md` briefs no insignia for one.
 *   · **Level 100, `atlas`, has no insignia yet** — see asset-prompts.md §12, where the
 *     ladder and the delivery are reconciled. It is the rarest rank in the game, so a
 *     borrowed picture there would be worse than none.
 *
 * Derived from the key rather than mapped, so a rank added to the ladder needs no change
 * here — and the ranks are permanent by rule, since a title ships in save data.
 */
export function insigniaFor(titleKey: string): ArtName | null {
  const rank = titleKey.split(':')[1] ?? ''
  const name = `levels/${rank}` as ArtName
  return name in ART_BY_NAME ? name : null
}

/** How big a rank insignia sits beside its title. Shared, so the two screens match. */
export const INSIGNIA_SIZE = 40
