/**
 * The glyph for each fact attribute.
 *
 * Moved here from `CountryScreen` when the Home course path needed the same marks: a
 * path step about flags and the Flag row on a country page are the same subject, and
 * two copies of this table would be two answers to "which icon means capital" the day
 * one of them changed. The country page's reason for a glyph at all still holds — a mark
 * per kind is what lets somebody find the capital without reading, and the same glyphs
 * name the same things in a quest, in the shop, and now on the path.
 *
 * `Partial`, and a caller with no match draws its own fallback rather than a placeholder:
 * an attribute that arrives before its glyph should be a plain row, not a broken one.
 */

import type { IconName } from './icons.generated.js'

export const ATTRIBUTE_ICON: Partial<Record<string, IconName>> = {
  capital: 'capital',
  flag: 'flag',
  location: 'continent',
  population: 'profile',
  currency: 'currency',
  language: 'language',
  'calling-code': 'callingCode',
}
