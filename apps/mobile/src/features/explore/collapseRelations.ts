/**
 * One row per relation, not one per related country.
 *
 * A relation attribute holds a fact per neighbour — `geo.DE.borders-fr`, `geo.DE.borders-at`,
 * and seven more — because each is its own piece of knowledge with its own memory: a learner
 * can know that France borders Germany and not that Poland does. On a country page that is
 * nine rows under "What to know" saying "Neighbours", which is a list pretending to be a table.
 *
 * So the page shows ONE row whose value is the list, and whose mastery is the WEAKEST of its
 * members — the honest summary of "how well do you know Germany's neighbours" is how well you
 * know the one you know least. Due if any member is. The row keeps the first member's id for
 * its key and its source, which every member shares.
 *
 * Facts withdrawn from quizzing (`quizzable: false`) are not shown: those are the borders
 * only one source claims, kept so a question never offers them as a wrong answer, and a page
 * that listed them would state as fact what the pipeline refused to.
 */
import type { Mastery } from '@worldquest/engines'
import type { CountryFact } from './CountryScreen.js'

const ORDER: readonly Mastery[] = ['unseen', 'learning', 'familiar', 'proficient', 'mastered', 'burnished']

/** The attributes whose facts are one-per-related-entity. */
export const RELATION_ATTRIBUTES: ReadonlySet<string> = new Set(['borders'])

export type RelationFact = CountryFact & { readonly quizzable: boolean }

export function collapseRelations(facts: readonly RelationFact[]): CountryFact[] {
  const out: CountryFact[] = []
  const grouped = new Map<string, RelationFact[]>()
  for (const fact of facts) {
    if (!RELATION_ATTRIBUTES.has(fact.attribute)) {
      const { quizzable: _quizzable, ...plain } = fact
      out.push(plain)
      continue
    }
    if (!fact.quizzable) continue
    const members = grouped.get(fact.attribute)
    if (members) members.push(fact)
    else grouped.set(fact.attribute, [fact])
  }

  for (const members of grouped.values()) {
    const first = members[0]!
    const weakest = members.reduce<Mastery>(
      (worst, m) => (ORDER.indexOf(m.mastery) < ORDER.indexOf(worst) ? m.mastery : worst),
      first.mastery,
    )
    out.push({
      id: first.id,
      attribute: first.attribute,
      value: [...members].map((m) => m.value).sort((a, b) => a.localeCompare(b)).join(', '),
      mastery: weakest,
      due: members.some((m) => m.due),
      ...(first.source ? { source: first.source } : {}),
    })
  }
  return out
}
