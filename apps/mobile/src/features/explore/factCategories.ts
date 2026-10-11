/**
 * What a country page groups its facts into, so a learner can practise one kind of thing.
 *
 * The page was one list, and for the United States that list ran past a hundred rows:
 * capital, flag, then twenty-five athletes, twenty actors, twelve clubs… The owner asked
 * for categories (2026-10-11) — "famous people, places and so on, to learn more specific
 * stuff" — and each one is now a section with its own practice button, which sends the same
 * `entity` + `attr` focus the course path and the region page already use. No new lesson
 * kind: a category is a narrower pool.
 *
 * Here rather than in the content pack because it is presentation — how THIS app shelves the
 * attributes on a country page. Attributes are content; this only says which shelf. An
 * attribute that is on no shelf lands in `other`, so a new pack is never hidden.
 */

import type { IconName } from '../../lib/icons.generated.js'
import type { TranslationKey } from '../../lib/i18n.js'

export type FactCategoryId = 'basics' | 'map' | 'people' | 'sport' | 'places' | 'companies' | 'other'

export type FactCategory = {
  readonly id: FactCategoryId
  readonly title: TranslationKey
  readonly icon: IconName
  /** In the order the rows are shown. */
  readonly attributes: readonly string[]
}

export const FACT_CATEGORIES: readonly FactCategory[] = [
  {
    id: 'basics',
    title: 'country:category.basics',
    icon: 'flag',
    attributes: ['capital', 'flag', 'currency', 'currency-code', 'language', 'native-name', 'calling-code', 'tld', 'alpha3'],
  },
  {
    id: 'map',
    title: 'country:category.map',
    icon: 'map',
    attributes: ['location', 'borders', 'border-count', 'landlocked', 'hemisphere', 'area', 'highest-point'],
  },
  { id: 'people', title: 'country:category.people', icon: 'star', attributes: ['musician', 'actor', 'writer', 'artist', 'scientist'] },
  { id: 'sport', title: 'country:category.sport', icon: 'trophy', attributes: ['athlete', 'club'] },
  { id: 'places', title: 'country:category.places', icon: 'pin', attributes: ['landmark'] },
  { id: 'companies', title: 'country:category.companies', icon: 'shop', attributes: ['company'] },
]

const OTHER: FactCategory = { id: 'other', title: 'country:category.other', icon: 'globe', attributes: [] }

/** A practice lesson needs five questions' worth of facts; fewer is the "too narrow" screen. */
export const MIN_PRACTISABLE = 5

export type Shelf<F> = { readonly category: FactCategory; readonly facts: readonly F[]; readonly attributes: readonly string[] }

/**
 * The facts shelved by category, in category order and, within one, in attribute order then
 * the order given. Empty categories are left out.
 */
export function shelveFacts<F extends { readonly attribute: string }>(facts: readonly F[]): readonly Shelf<F>[] {
  const rank = (category: FactCategory, attribute: string) => category.attributes.indexOf(attribute)
  const shelved = new Set<string>(FACT_CATEGORIES.flatMap((c) => c.attributes))
  const shelves: Shelf<F>[] = []
  for (const category of [...FACT_CATEGORIES, OTHER]) {
    const mine = facts
      .map((fact, i) => ({ fact, i }))
      .filter(({ fact }) => (category === OTHER ? !shelved.has(fact.attribute) : category.attributes.includes(fact.attribute)))
      .sort((a, b) => rank(category, a.fact.attribute) - rank(category, b.fact.attribute) || a.i - b.i)
      .map(({ fact }) => fact)
    if (mine.length === 0) continue
    shelves.push({ category, facts: mine, attributes: [...new Set(mine.map((f) => f.attribute))] })
  }
  return shelves
}
