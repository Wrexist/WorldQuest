/**
 * The content engine: facts × templates → items → questions.
 *
 * Pure. No I/O — packs are handed in already parsed. Randomness is injected, so a
 * friend challenge can hand both players the same seed and get identical questions.
 *
 * Spec: docs/systems/content-pipeline.md
 */

import { shuffle, type Rng } from '../shared/index.js'
import type { FactId } from '../learning/types.js'
import type {
  AnswerOption,
  ContentIndex,
  DistractorStrategy,
  Entity,
  Fact,
  Item,
  Question,
  Template,
} from './types.js'

export * from './types.js'

/** A fact is quizzable unless it says otherwise. Sensitive and volatile facts opt out. */
export function isQuizzable(fact: Fact): boolean {
  if (fact.quizzable === false) return false
  if (fact.volatility === 'fast') return false
  if (fact.sensitivity === 'review-required') return false
  return true
}

/**
 * Build the index a lesson is composed from.
 *
 * The item count is the platform thesis made arithmetic: N facts × M matching
 * templates. Five countries with two attributes and four templates yields far more
 * questions than anyone would hand-write, and adding a sixth country adds its share
 * without touching a line of code.
 */
export function buildIndex(input: {
  entities: readonly Entity[]
  facts: readonly Fact[]
  templates: readonly Template[]
}): ContentIndex {
  const entities = new Map(input.entities.map((e) => [e.id, e]))
  const facts = new Map(input.facts.map((f) => [f.id, f]))
  const templates = new Map(input.templates.map((t) => [t.id, t]))

  const items: Item[] = []
  const itemsByFact = new Map<FactId, Item[]>()

  for (const fact of input.facts) {
    if (!isQuizzable(fact)) continue
    // An orphaned fact is a content bug, not a crash. It is caught by
    // `pnpm content:validate`; here we simply skip it.
    if (!entities.has(fact.entity)) continue

    for (const template of input.templates) {
      if (template.attribute !== fact.attribute) continue

      const item: Item = {
        id: `${fact.id}@${template.id}`,
        factId: fact.id,
        templateId: template.id,
        entityId: fact.entity,
        difficulty: clampDifficulty(fact.difficulty + (template.difficultyModifier ?? 0)),
        screenReaderSafe: template.a11y.screenReaderSafe,
      }

      items.push(item)
      const bucket = itemsByFact.get(fact.id)
      if (bucket) bucket.push(item)
      else itemsByFact.set(fact.id, [item])
    }
  }

  return { entities, facts, templates, items, itemsByFact }
}

const clampDifficulty = (n: number): number => Math.min(5, Math.max(1, n))

/**
 * Pick which template to present a fact through.
 *
 * `screenReaderOnly` is not a downgrade — it selects the sibling template that tests
 * the same fact without sight, so a blind user's `user_facts` row is identical to
 * anyone else's. See docs/design/accessibility.md §8.
 */
export function pickItemForFact(
  index: ContentIndex,
  factId: FactId,
  rng: Rng,
  options: { screenReaderOnly?: boolean } = {},
): Item | null {
  const candidates = index.itemsByFact.get(factId) ?? []
  const usable = options.screenReaderOnly
    ? candidates.filter((i) => i.screenReaderSafe)
    : candidates
  if (usable.length === 0) return null
  return usable[Math.floor(rng.next() * usable.length)] ?? null
}

/** Distractor pools, in the order the strategy prefers them. */
function candidatePool(
  index: ContentIndex,
  correct: Entity,
  strategy: DistractorStrategy,
  fact: Fact,
): Entity[] {
  const all = [...index.entities.values()].filter((e) => e.id !== correct.id)

  switch (strategy) {
    case 'same-subregion':
      return all.filter((e) => e.subregion !== undefined && e.subregion === correct.subregion)
    case 'same-region':
      return all.filter((e) => e.region !== undefined && e.region === correct.region)
    case 'visually-similar':
    case 'commonly-confused': {
      // Entities that share a distinguishing tag with this fact — Nordic crosses
      // with Nordic crosses, tricolours with tricolours. Precomputed similarity
      // sets replace this in v1.0; the shape of the call does not change.
      const tags = new Set(fact.tags ?? [])
      const similar = all.filter((e) => {
        const theirFact = [...index.facts.values()].find(
          (f) => f.entity === e.id && f.attribute === fact.attribute,
        )
        return theirFact?.tags?.some((t) => tags.has(t) && t !== 'core') ?? false
      })
      return similar
    }
    case 'random-global':
      // Rejected by content validation for shipped packs; kept for test fixtures.
      return all
  }
}

/** Two options that differ only by a diacritic are a trick question, not a hard one. */
const normalise = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Build a renderable question.
 *
 * Returns null when there are not enough plausible distractors — a short lesson is
 * better than a question with an absurd option, which teaches nothing and makes the
 * app feel cheap.
 */
export function buildQuestion(
  index: ContentIndex,
  item: Item,
  locale: string,
  rng: Rng,
  opts: { isNew?: boolean } = {},
): Question | null {
  const fact = index.facts.get(item.factId)
  const template = index.templates.get(item.templateId)
  const entity = index.entities.get(item.entityId)
  if (!fact || !template || !entity) return null

  const nameOf = (names: Readonly<Record<string, string>> | undefined): string | undefined =>
    names?.[locale] ?? names?.['en']

  const correctLabel =
    template.answer.from === 'entity.names' ? nameOf(entity.names) : nameOf(fact.value.names)
  if (correctLabel === undefined) return null

  const spec = template.distractors
  const options: AnswerOption[] = [
    {
      id: item.entityId,
      label: correctLabel,
      isCorrect: true,
      ...(template.modality === 'image' && entity.assets?.['flag']
        ? { asset: entity.assets['flag'].path }
        : {}),
    },
  ]

  if (spec) {
    let pool = candidatePool(index, entity, spec.strategy, fact)
    if (pool.length < spec.count && spec.fallback) {
      const extra = candidatePool(index, entity, spec.fallback, fact)
      pool = [...new Set([...pool, ...extra])]
    }

    const taken = new Set([normalise(correctLabel)])
    const chosen: AnswerOption[] = []

    for (const candidate of shuffle(pool, rng)) {
      if (chosen.length >= spec.count) break

      const label =
        template.answer.from === 'entity.names'
          ? nameOf(candidate.names)
          : nameOf(
              [...index.facts.values()].find(
                (f) => f.entity === candidate.id && f.attribute === fact.attribute,
              )?.value.names,
            )
      if (label === undefined) continue

      // Never a distractor that is also correct, and never two options that read
      // the same. Both make the question unanswerable rather than difficult.
      const key = normalise(label)
      if (taken.has(key)) continue
      if (spec.excludeSimilarStrings !== false && key === normalise(correctLabel)) continue

      taken.add(key)
      chosen.push({
        id: candidate.id,
        label,
        isCorrect: false,
        ...(template.modality === 'image' && candidate.assets?.['flag']
          ? { asset: candidate.assets['flag'].path }
          : {}),
      })
    }

    // A question with too few plausible options is worse than no question.
    if (chosen.length < spec.count) return null
    options.push(...chosen)
  }

  const promptParams: Record<string, string> = {}
  for (const param of template.prompt.params ?? []) {
    if (param === 'entityName') promptParams[param] = nameOf(entity.names) ?? entity.id
    if (param === 'valueName') promptParams[param] = nameOf(fact.value.names) ?? ''
    if (param === 'description') promptParams[param] = nameOf(fact.value.names) ?? ''
  }

  return {
    item,
    promptKey: template.prompt.key,
    promptParams,
    // Shuffled with the injected rng — position must never become the answer.
    options: shuffle(options, rng),
    modality: template.modality,
    timeLimitMs: template.timeLimitMs ?? null,
    isNew: opts.isNew ?? false,
    ...(nameOf(fact.value.names) !== undefined ? { hint: nameOf(fact.value.names)! } : {}),
  }
}
