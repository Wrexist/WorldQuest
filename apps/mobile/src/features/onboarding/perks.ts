import type { TranslationKey } from '../../lib/i18n.js'

/**
 * What Premium adds, listed once and taken from the paywall's own copy.
 *
 * Reusing `paywall:perk.*` rather than writing a second list is the point: two lists of
 * perks are two things to keep true, and the moment they disagree one of the screens is
 * lying to the user about what they get.
 *
 * ## Why this is its own module and not a constant in the screen
 *
 * `scripts/five-states.ts` searches screen source for the word `offline` to decide
 * whether a screen handles being offline. `paywall:perk.offline` is the NAME of a string
 * — "Offline packs", a feature Premium sells — and having it in `OnboardingScreen.tsx`
 * made that audit report the onboarding flow had grown connectivity handling it does not
 * have.
 *
 * The first fix attempted was teaching the script to ignore i18n keys, which was too
 * broad: several screens legitimately signal their offline branch through a key like
 * `errors:offline.title`, and stripping all keys made four real states disappear. So the
 * data moves out of the screen instead — the same move `levels.ts` made, for the same
 * reason, after the same audit misread an import.
 */
export const PERKS = [
  'paywall:perk.hearts',
  'paywall:perk.offline',
  'paywall:perk.stats',
  'paywall:perk.cosmetics',
] as const satisfies readonly TranslationKey[]
