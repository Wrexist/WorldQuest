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
 * templates. Sixty countries with two attributes and five templates yield far more
 * questions than anyone would hand-write, and the sixty-first adds its share without
 * touching a line of code — which is the claim the whole package exists to make good.
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
  options: { screenReaderOnly?: boolean; modalities?: readonly Template['modality'][] } = {},
): Item | null {
  const candidates = index.itemsByFact.get(factId) ?? []
  const usable = candidates.filter((i) => {
    if (options.screenReaderOnly && !i.screenReaderSafe) return false
    if (options.modalities === undefined) return true
    const modality = index.templates.get(i.templateId)?.modality
    return modality !== undefined && options.modalities.includes(modality)
  })
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
      /**
       * Entities that share a `like:` tag with this fact — Nordic crosses with
       * Nordic crosses, tricolours with tricolours, Chad with Romania.
       *
       * Only `like:` tags count, and that prefix is the whole point. This used to
       * match any shared tag except `core`, which meant it matched `flag` — a tag
       * every flag fact carries — so "visually similar" silently meant "any country
       * at all". With five countries nobody could tell. The moment a second region
       * was authored, `pnpm content:preview` printed a Swedish flag question whose
       * distractors were China and Mongolia: a hard question turned into a free one.
       *
       * A fact with no `like:` tag matches nothing here and falls through to the
       * strategy's `fallback`, which is the honest outcome — we do not know what its
       * flag resembles, so we should not pretend to.
       *
       * Spec: docs/systems/content-pipeline.md §distractors
       */
      const tags = new Set((fact.tags ?? []).filter((t) => t.startsWith('like:')))
      if (tags.size === 0) return []
      return all.filter((e) => {
        const theirFact = [...index.facts.values()].find(
          (f) => f.entity === e.id && f.attribute === fact.attribute,
        )
        return theirFact?.tags?.some((t) => tags.has(t)) ?? false
      })
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
 * The wrong-answer hint, or nothing.
 *
 * Two ways a hint can be worthless, and both shipped before this function existed:
 *
 * 1. The answer IS the fact value, so the hint restates the answer — "Stockholm is
 *    Stockholm." Caught by looking at a screenshot.
 * 2. The fact value is already in the PROMPT, so the hint restates the question —
 *    "Stockholm is the capital of which country?" → "Sweden is Stockholm." Caught by
 *    `pnpm content:preview`, which exists for exactly this.
 *
 * What is left is the case the copy was designed around: the answer is a country and
 * the fact value describes it. "Sweden is a yellow Nordic cross on a blue field."
 */
function hintFor(
  template: Template,
  fact: Fact,
  nameOf: (names: Readonly<Record<string, string>> | undefined) => string | undefined,
  promptParams: Readonly<Record<string, string>>,
): string | undefined {
  if (template.answer.from !== 'entity.names') return undefined

  const value = nameOf(fact.value.names)
  if (value === undefined) return undefined

  // Already said in the question. Repeating it is noise at the moment the user is
  // most in need of something new.
  if (Object.values(promptParams).includes(value)) return undefined

  return value
}

/**
 * Everything a question needs that does NOT depend on the distractors.
 *
 * Split out so the two cheap rejections — no label, prompt gives itself away — can
 * happen before the expensive pool search, and so tooling can ask *why* an item is
 * unaskable without duplicating the rules that decide it.
 */
function resolveShallow(
  index: ContentIndex,
  item: Item,
  locale: string,
):
  | {
      fact: Fact
      template: Template
      entity: Entity
      nameOf: (names: Readonly<Record<string, string>> | undefined) => string | undefined
      correctLabel: string
      promptParams: Record<string, string>
    }
  | null {
  const fact = index.facts.get(item.factId)
  const template = index.templates.get(item.templateId)
  const entity = index.entities.get(item.entityId)
  if (!fact || !template || !entity) return null

  const nameOf = (names: Readonly<Record<string, string>> | undefined): string | undefined =>
    names?.[locale] ?? names?.['en']

  const correctLabel =
    template.answer.from === 'entity.names' ? nameOf(entity.names) : nameOf(fact.value.names)
  if (correctLabel === undefined) return null

  const promptParams: Record<string, string> = {}
  for (const param of template.prompt.params ?? []) {
    // The sentence form when the content supplies one, the citation form otherwise.
    // Answer OPTIONS deliberately keep the citation form: "the Netherlands" belongs
    // in "the capital of the Netherlands", not in a list of four countries.
    if (param === 'entityName') {
      promptParams[param] =
        nameOf(entity.namesInSentence) ?? nameOf(entity.names) ?? entity.id
    }
    if (param === 'valueName') promptParams[param] = nameOf(fact.value.names) ?? ''
    if (param === 'description') promptParams[param] = nameOf(fact.value.names) ?? ''
  }

  return { fact, template, entity, nameOf, correctLabel, promptParams }
}

/**
 * Whether this item's prompt would contain its own answer.
 *
 * "Guatemala City is the capital of which country?" — and the same for Panama,
 * Mexico, Kuwait, Luxembourg, Djibouti, Singapore and every other country whose
 * capital carries its name. There are enough of them that catching this by hand is a
 * matter of time, not diligence.
 *
 * The asymmetry is deliberate. This rejects the PROMPT giving away the answer; it
 * does not reject the answer echoing the prompt, so "What is the capital of Mexico?"
 * → "Mexico City" survives. That one is not a leak, it is how the place is named,
 * and it is a fact worth learning.
 *
 * Exported because it is the difference between two very different messages from the
 * authoring tools: "this can never be asked, by design" and "this needs more
 * neighbours before it can be asked". Advising an author to add countries to fix
 * Guatemala City would waste an afternoon.
 */
export function isSelfAnswering(index: ContentIndex, item: Item, locale: string): boolean {
  const resolved = resolveShallow(index, item, locale)
  if (resolved === null) return false
  return Object.values(resolved.promptParams).some((value) =>
    namesAnswer(value, resolved.correctLabel),
  )
}

/**
 * Whether `text` names `answer` — as a whole word, not as a run of letters.
 *
 * Exported so the authoring tools apply the SAME rule the engine does. They did not,
 * once: `pnpm content:preview` kept a plain `includes` after the engine moved to word
 * boundaries, and immediately failed CI on "What is the capital of Tunisia?" → "Tunis",
 * a question the engine had just correctly decided to allow. Two copies of a rule are
 * one copy and one bug waiting for the input that separates them.
 *
 * The tools check the RENDERED prompt rather than its params, which catches the case
 * this cannot: a catalogue string that gives the answer away in its own literal text.
 */
export function namesAnswer(text: string, answer: string): boolean {
  const escaped = normalise(answer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\W)${escaped}($|\\W)`).test(normalise(text))
}

/**
 * Build a renderable question, or nothing.
 *
 * Three reasons it declines, and the callers that care can tell them apart:
 *
 * 1. **Too few plausible distractors.** A short lesson beats a question with an
 *    absurd option, which teaches nothing and makes the app feel cheap. Fixable by
 *    authoring more countries into that subregion — `pnpm content:stats` says which.
 * 2. **The prompt names its own answer** — see `isSelfAnswering`. Not fixable, and
 *    not a gap: the other template for the same fact still works.
 * 3. The item references content that is not in the index at all, which is a bug in
 *    the pack rather than in the question.
 */
/**
 * Whether this item's question has more than one correct answer.
 *
 * Only reverse templates can be ambiguous — the ones whose answer is the ENTITY, with
 * the fact value in the prompt. "Which country uses the Euro?" has twenty correct
 * answers, and no choice of distractors fixes that: even if every option shown is
 * wrong except one, the user knows Germany would also have been right.
 *
 * Shared capitals and shared currencies are the obvious cases; the general rule is
 * that a reverse question is only askable when the value identifies the entity
 * uniquely. `docs/systems/content-pipeline.md` states it as a hard rule — "never a
 * distractor that is also a correct answer" — and it had only ever been enforced for
 * options that render as the same STRING, which is a different and much weaker thing.
 *
 * Exported so the authoring tools can say "this can never be asked" rather than
 * "add more countries", which would be advice that cannot work.
 */
export function isAmbiguous(index: ContentIndex, item: Item, locale: string): boolean {
  const resolved = resolveShallow(index, item, locale)
  if (resolved === null) return false

  const { fact, template } = resolved
  if (template.answer.from !== 'entity.names') return false

  const nameOf = (names: Readonly<Record<string, string>> | undefined): string | undefined =>
    names?.[locale] ?? names?.['en']
  const value = nameOf(fact.value.names)
  if (value === undefined) return false

  for (const other of index.facts.values()) {
    if (other.id === fact.id) continue
    if (other.attribute !== fact.attribute) continue
    if (other.entity === fact.entity) continue
    // Only entities that actually exist in this index can be offered as options, so
    // a value shared with an orphaned fact is not ambiguity the user can observe.
    if (!index.entities.has(other.entity)) continue
    if (normalise(nameOf(other.value.names) ?? '') === normalise(value)) return true
  }
  return false
}

export function buildQuestion(
  index: ContentIndex,
  item: Item,
  locale: string,
  rng: Rng,
  opts: { isNew?: boolean } = {},
): Question | null {
  const resolved = resolveShallow(index, item, locale)
  if (resolved === null) return null
  const { fact, template, entity, nameOf, correctLabel, promptParams } = resolved

  if (isSelfAnswering(index, item, locale)) return null
  if (isAmbiguous(index, item, locale)) return null

  const spec = template.distractors
  const options: AnswerOption[] = [
    { id: item.entityId, label: correctLabel, isCorrect: true },
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
      chosen.push({ id: candidate.id, label, isCorrect: false })
    }

    // A question with too few plausible options is worse than no question.
    if (chosen.length < spec.count) return null
    options.push(...chosen)
  }

  const hint = hintFor(template, fact, nameOf, promptParams)

  /**
   * Indexed by the template's ATTRIBUTE, not by the literal `'flag'`. Templates are
   * attribute-shaped by design — see the comment at the top of the templates pack —
   * so a wildlife pack asking about `photo` gets `entity.assets.photo` with no engine
   * change, which is the whole reason this package knows nothing about geography.
   */
  const promptAsset =
    template.modality === 'image' ? entity.assets?.[template.attribute]?.path : undefined

  /**
   * The locator map, and the one rule that makes it safe.
   *
   * Only when the answer is NOT the entity. A template answered by `entity.names` is
   * asking "which country is this?" in some form, and a map of that country beside the
   * question hands the answer over — silently, and only to sighted users, which is the
   * worst shape a giveaway can take. Decided here rather than in a screen, because
   * every screen would have to remember it and one of them would not.
   *
   * Requires both halves: the outline and the region it sits in. A country drawn with
   * no continent behind it is a shape in a void, which locates nothing.
   */
  const mapAsset = entity.assets?.['map']?.path
  const locator =
    template.answer.from !== 'entity.names' && mapAsset !== undefined && entity.region !== undefined
      ? { path: mapAsset, region: entity.region }
      : undefined

  return {
    item,
    promptKey: template.prompt.key,
    promptParams,
    ...(promptAsset !== undefined ? { promptAsset } : {}),
    ...(locator !== undefined ? { locator } : {}),
    // Shuffled with the injected rng — position must never become the answer.
    options: shuffle(options, rng),
    modality: template.modality,
    timeLimitMs: template.timeLimitMs ?? null,
    isNew: opts.isNew ?? false,
    // A hint only when it ADDS something — see `hintFor`. Omitted rather than set to
    // undefined, because `exactOptionalPropertyTypes` distinguishes the two.
    ...(hint !== undefined ? { hint } : {}),
  }
}
