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
  EntityId,
  Fact,
  Item,
  Question,
  Template,
} from './types.js'

export * from './types.js'

/**
 * A fact is quizzable unless it says otherwise. Sensitive and volatile facts opt out.
 *
 * Takes the three fields it reads rather than a whole `Fact`, so that everything which
 * has to answer this question can ask the same function. It was three answers: here, in
 * `content/scripts/validate.ts` where the achievement ceilings are counted, and in
 * `supabase/functions/build.ts` where the server's answer key is written. Three copies
 * of "a fast fact is never a quiz answer" is three chances for the ceiling a badge is
 * measured against to disagree with the questions a user is actually asked.
 *
 * The validator now calls this. The bundler still cannot — it is the script that
 * VENDORS the engine into the deployable function, and a build step that imports the
 * package it is flattening is a resolution order nobody wants to debug at deploy time.
 * Its copy stays, named as a copy.
 */
export function isQuizzable(
  fact: Pick<Fact, 'quizzable' | 'volatility' | 'sensitivity'>,
): boolean {
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
 * Every way this fact could be presented, in a shuffled order the caller walks.
 *
 * `screenReaderOnly` is not a downgrade — it selects the sibling templates that test
 * the same fact without sight, so a blind user's `user_facts` row is identical to
 * anyone else's. See docs/design/accessibility.md §8.
 *
 * A LIST rather than a pick, and that is the whole point. Not every item builds into a
 * question: a reverse template can name its own answer ("Mexico City is the capital of
 * which country?"), and one that does is correctly refused by `buildQuestion`.
 *
 * This used to be `pickItemForFact`, returning one item, and `composeLesson` dropped
 * the fact from the lesson when that one produced nothing. For `geo.MX.capital` in
 * screen-reader mode that is a coin flip between a normal lesson and a lesson one
 * question shorter — the fact has two safe presentations and only one of them can be
 * asked. Being able to try the next one is what makes "the same facts, the same
 * progress" true rather than approximately true.
 */
export function itemsForFact(
  index: ContentIndex,
  factId: FactId,
  rng: Rng,
  options: {
    screenReaderOnly?: boolean
    modalities?: readonly Template['modality'][]
    /**
     * Push templates whose ANSWER is the entity to the back of the queue.
     *
     * Set when the lesson is scoped to a single entity, where those templates stop being
     * questions. Practising Sweden served "Att ringa +46 går till vilket land?" with
     * Finland, Frankrike, Sverige and Norge underneath it — and every such question in
     * that lesson had the same answer, because the lesson is *about* Sweden. The user
     * does not need to know the calling code to score full marks; they need to remember
     * which country they tapped.
     *
     * Six attributes ship, and every one has a forward template (`answer.from` is
     * `fact.value.names`), so the useful question — "vad har Sverige för landsnummer?" —
     * already existed for all of them. It was being passed over at random.
     *
     * **Ordered, not filtered**, and that distinction is the whole safety of this. A
     * filter would drop a fact whose only remaining presentation was unusable for some
     * other reason — a screen-reader user practising one country would silently get a
     * shorter lesson than a sighted one, which is the exact parity bug
     * `docs/design/accessibility.md` §8 exists to prevent and which this file's own
     * `$comment` records being shipped once already. Ordering degrades instead: the
     * revealing template is still there, last, and is used only when nothing else can be.
     */
    deprioritizeEntityAnswers?: boolean
  } = {},
): Item[] {
  const candidates = index.itemsByFact.get(factId) ?? []
  const usable = candidates.filter((i) => {
    if (options.screenReaderOnly && !i.screenReaderSafe) return false
    if (options.modalities === undefined) return true
    const modality = index.templates.get(i.templateId)?.modality
    return modality !== undefined && options.modalities.includes(modality)
  })
  const shuffled = shuffle(usable, rng)
  if (!options.deprioritizeEntityAnswers) return shuffled

  // A stable partition rather than a sort: within each half the shuffle's order stands,
  // so which forward template gets asked is still random.
  const asksSomething: Item[] = []
  const namesTheEntity: Item[] = []
  for (const item of shuffled) {
    const template = index.templates.get(item.templateId)
    ;(template?.answer.from === 'entity.names' ? namesTheEntity : asksSomething).push(item)
  }
  return [...asksSomething, ...namesTheEntity]
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
    case 'other-values':
      /**
       * Every entity that has a value for this attribute, wherever it is.
       *
       * For a template whose answer is the fact VALUE, the option space is the set of
       * values, not the set of entities — "Where in the world is Brazil?" picks four of
       * fourteen subregions. Geography restrictions do not narrow that pool; they
       * destroy it. `same-region` for Brazil returns other South American countries,
       * every one of which answers "South America", so all three distractors collapse
       * into the correct option and the question is dropped.
       *
       * That was not hypothetical: `tpl.location-of.mc4` — the screen-reader-safe
       * sibling of the map question, and the only way a blind user can be asked where a
       * country is — built for 35 of 65 countries. The 30 it skipped were every country
       * in Asia, North America, Oceania and South America, because those regions hold
       * three, one, one and one subregion respectively. A whole continent of questions
       * was missing from the accessible path, silently, and the map question it stands
       * in for was not.
       *
       * The filter is what separates this from `random-global`: an entity with no value
       * for the attribute cannot supply an option, and including it would produce a
       * blank one.
       */
      return all.filter((e) =>
        [...index.facts.values()].some(
          (f) => f.entity === e.id && f.attribute === fact.attribute && isQuizzable(f),
        ),
      )
    case 'random-global':
      // Rejected by content validation for shipped packs; kept for test fixtures.
      return all
  }
}

/** Two options that differ only by a diacritic are a trick question, not a hard one. */
const normalise = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * What a fact's VALUE reads as inside a question — which is not always its name.
 *
 * A fact has one value and two audiences. The country screen cites it and wants the
 * full, sourced form: India's currency is the *Indian rupee*. A question shows it to
 * someone who is being asked to know it, and there the demonym is the answer printed
 * next to the question — "Which country uses the Indian rupee?" needs no knowledge of
 * India, and "What money do people use in India?" offered against *Nepalese rupee* and
 * *Bangladeshi taka* needs none either. Fifty-four of the sixty-five currency values
 * shared a stem with their own country's name in at least one shipped locale.
 *
 * So a value may carry `shortNames`, and everything a QUESTION is built from reads
 * through here: the prompt's `{valueName}`, the correct option, every distractor's
 * label, the wrong-answer hint, and the ambiguity check. Everything that CITES the
 * fact — `app/country/[code]`, the collection, `pnpm content:crosscheck` — still reads
 * `names`, which is why this could be added without restating a single sourced claim.
 *
 * Resolving the LOCALE first and the form second is deliberate. `shortNames.en` is
 * not a better answer for a Swedish user than `names.sv`, and a value authored short
 * in one language and long in another would ask two different questions of two users
 * — `pnpm content:validate` rejects that outright, and this fails safe if one ever
 * gets through.
 */
const displayValue = (
  value: Fact['value'],
  locale: string,
): string | undefined =>
  value.shortNames?.[locale] ??
  value.names?.[locale] ??
  value.shortNames?.['en'] ??
  value.names?.['en']

/**
 * Whether two option labels are close enough that telling them apart is a spelling
 * test rather than the question being asked.
 *
 * One edit — insert, delete or substitute — and only for labels of four characters or
 * more. Below that a single edit is most of the word: "won" and "yen" are one edit
 * apart and are not remotely the same answer, and refusing that pair would delete a
 * fair question.
 *
 * Deliberately tight. Two edits would start eating real distractors — Chile against
 * China, Niger against Nigeria — and those pairs are what makes a question worth
 * asking. What this is for is krona/krone: identical to a reader who is not looking
 * for the trick, and the trick is not the thing being taught.
 */
const isNearlyTheSame = (a: string, b: string): boolean => {
  const x = normalise(a)
  const y = normalise(b)
  if (x === y) return true
  if (x.length < 4 || y.length < 4) return false
  if (Math.abs(x.length - y.length) > 1) return false

  // Levenshtein, bounded at 2 — the answer is only ever "is this 0, 1, or more".
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      row.push(Math.min((row[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost))
    }
    previous = row
  }
  return (previous[y.length] ?? 99) <= 1
}

/** `displayValue` for a fact that may not exist — the distractor lookup's shape. */
const valueLabelOf = (fact: Fact | undefined, locale: string): string | undefined =>
  fact === undefined ? undefined : displayValue(fact.value, locale)

/**
 * The wrong-answer hint, or nothing.
 *
 * Three ways a hint can be worthless, and all three shipped before this function
 * existed or after it:
 *
 * 1. The answer IS the fact value, so the hint restates the answer — "Stockholm is
 *    Stockholm." Caught by looking at a screenshot.
 * 2. The fact value is already in the PROMPT, so the hint restates the question —
 *    "Stockholm is the capital of which country?" → "Sweden is Stockholm." Caught by
 *    `pnpm content:preview`, which exists for exactly this.
 *
 * 3. The prompt is a PICTURE of the answer and the value describes the same picture —
 *    "Which country is highlighted?" over a map of Germany → "Germany is Europe."
 *    Caught by looking at a screenshot, four months after the first one.
 *
 * What is left is the case the copy was designed around: the answer is a country and
 * the fact value describes it. "Sweden is a yellow Nordic cross on a blue field."
 */
function hintFor(
  template: Template,
  fact: Fact,
  locale: string,
  promptParams: Readonly<Record<string, string>>,
): string | undefined {
  if (template.answer.from !== 'entity.names') return undefined

  const value = displayValue(fact.value, locale)
  if (value === undefined) return undefined

  // Already said in the question. Repeating it is noise at the moment the user is
  // most in need of something new.
  if (Object.values(promptParams).includes(value)) return undefined

  /**
   * 3. The prompt is a PICTURE of the answer, and the hint describes the same picture.
   *
   * "Which country is highlighted?" over a map of Germany, answered wrongly, read:
   * "Germany is Europe." Two faults in four words. The sentence shape — `{correct} is
   * {hint}` — was written for a value that DESCRIBES the answer ("Sweden is a yellow
   * Nordic cross on a blue field"), and a continent is a place rather than a
   * description, so it comes out ungrammatical. And it is redundant even where it
   * parses: the map is framed on the country with its neighbours around it, so the
   * user has just been shown where it is more precisely than "Europe" says it.
   *
   * Same reasoning as `revealAsset` — do not hand back what is already on screen.
   * Checked on the prompt's MODALITY rather than by naming the location attribute, so
   * a future pack whose map question asks about a river's course inherits it.
   */
  if (template.modality === 'map') return undefined

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
    template.answer.from === 'entity.names'
      ? nameOf(entity.names)
      : displayValue(fact.value, locale)
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
    if (param === 'valueName') promptParams[param] = displayValue(fact.value, locale) ?? ''
    if (param === 'description') promptParams[param] = displayValue(fact.value, locale) ?? ''
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
  const params = Object.values(resolved.promptParams)
  if (params.some((value) => namesAnswer(value, resolved.correctLabel))) return true

  /**
   * The same leak one derivation away, and only in the direction where it IS a leak.
   *
   * `namesAnswer` wants a whole word, so "Which country uses the Indian rupee?" passed
   * it: "India" is not a word of "Indian rupee", it is a stem of one. A ten-year-old
   * does not need the word boundary. The same shape reaches every demonym there is —
   * Norwegian/Norway, Filippinerna/filippinsk, Tjeckien/tjeckisk — which is why this is
   * a rule rather than a list somebody maintains against a dataset that changes.
   *
   * Four characters, case- and accent-folded: the same test
   * `scripts/build-country-facts.cjs` already applies to language facts, and the same
   * trade — Sweden/Swedish and France/French caught, Austria/German and Brazil/Portuguese
   * left alone. Over-rejecting is the correct direction: a question dropped is one
   * nobody sees, and a giveaway kept is a question that teaches nothing while telling
   * the user they knew it.
   *
   * ONLY for templates answered by the entity. That restriction is the whole safety of
   * it. The forward direction is the case the note above defends — "What is the capital
   * of Mexico?" → "Mexico City" shares four characters and is not a leak, it is how the
   * place is named. Applied in both directions this would delete it, along with every
   * other capital that carries its country's name.
   */
  if (resolved.template.answer.from !== 'entity.names') return false
  return params.some((value) => sharesStem(value, resolved.correctLabel))
}

/** How much of a shared opening reads as the same word. See `sharesStem`. */
const STEM = 4

/**
 * Whether `text` opens on the same stem as `answer`.
 *
 * Deliberately crude, and it tries EVERY word of the text rather than anchoring to one
 * end. Which word carries the demonym moves with the language — "Indian rupee" opens on
 * it and "indisk rupie" does too, but "North Korean won" hides it in the second word and
 * a rule anchored to the first would miss it in one of the two shipped locales.
 */
const sharesStem = (text: string, answer: string): boolean => {
  const stem = normalise(answer).slice(0, STEM)
  if (stem.length < STEM) return false
  return normalise(text)
    .split(/\W+/)
    .some((word) => word.length >= STEM && word.slice(0, STEM) === stem)
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

  /**
   * A `map` prompt shows the entity's OWN geometry, not the fact value.
   *
   * The rule above is about reverse questions where the prompt carries the value:
   * "Which country uses the Euro?" is unanswerable because twenty countries share it.
   * "Which country is this outline?" shares nothing — the picture is that country's
   * border and no other country's, so the fact hanging off it can be as common as it
   * likes.
   *
   * Without this branch every map question in the pack is dropped, silently and all
   * at once: `location` values are subregions, so all four Nordic countries "share"
   * Northern Europe and each one looks ambiguous by the value test. Checked by asking
   * what the PROMPT presents rather than by naming the attribute, so a future pack
   * asking about a river's course gets the same answer with no engine change.
   *
   * `image` deliberately still goes through the value check. A flag prompt shows
   * artwork whose description IS the fact value, so two identical descriptions really
   * do mean two identical flags — Monaco and Indonesia — and that question really is
   * unanswerable.
   */
  if (template.modality === 'map') return false

  const value = displayValue(fact.value, locale)
  if (value === undefined) return false

  for (const other of index.facts.values()) {
    if (other.id === fact.id) continue
    if (other.attribute !== fact.attribute) continue
    if (other.entity === fact.entity) continue
    // Only entities that actually exist in this index can be offered as options, so
    // a value shared with an orphaned fact is not ambiguity the user can observe.
    if (!index.entities.has(other.entity)) continue
    if (normalise(displayValue(other.value, locale) ?? '') === normalise(value)) return true
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

  /**
   * The picture for an option, when the option is a VALUE that has one.
   *
   * Only for `fact.value.names` templates — see the long note on `AnswerOption.asset`
   * for why that single condition is the whole difference between illustrating an
   * answer and giving it away. An `entity.names` template gets `undefined` here and
   * keeps the plain text options it has always had.
   *
   * Indexed by the template's attribute, exactly like `promptAsset` below, so this
   * knows nothing about flags. An entity with no such asset yields `undefined` and the
   * option renders as words — which is what every attribute except `flag` does today,
   * and is why adding this changed no question but one.
   */
  const assetFor = (entityId: EntityId): string | undefined =>
    template.answer.from === 'fact.value.names'
      ? index.entities.get(entityId)?.assets?.[template.attribute]?.path
      : undefined

  const correctAsset = assetFor(item.entityId)
  const options: AnswerOption[] = [
    {
      id: item.entityId,
      label: correctLabel,
      isCorrect: true,
      ...(correctAsset !== undefined ? { asset: correctAsset } : {}),
    },
  ]

  if (spec) {
    /**
     * What this candidate would READ as, which is not always its own name.
     *
     * Through `displayValue` for the same reason the correct option is: a distractor
     * drawn from a value has to read the way the answer reads. Left on `names` it would
     * have offered "rupee" against "Nepalese rupee" and "Bangladeshi taka" — three
     * options in two registers, and the odd one out is the answer.
     */
    const labelOf = (candidate: Entity): string | undefined =>
      template.answer.from === 'entity.names'
        ? nameOf(candidate.names)
        : valueLabelOf(
            [...index.facts.values()].find(
              (f) =>
                f.entity === candidate.id &&
                f.attribute === fact.attribute &&
                // A fact the pack has withdrawn is not an option. `geo.ZW.currency` is
                // `quizzable: false` because Zimbabwe has changed currency twice in five
                // years, and it still turned up under "What money do people use in
                // Belgium?" as "Zimbabwe Gold (ZiG)" — printed to a child by the one
                // path that never asked. Withdrawing a fact has to withdraw it from
                // both sides of the question.
                isQuizzable(f),
            ),
            locale,
          )

    const pick = (pool: readonly Entity[]): AnswerOption[] => {
      const taken = new Set([normalise(correctLabel)])
      const chosen: AnswerOption[] = []

      for (const candidate of shuffle([...pool], rng)) {
        if (chosen.length >= spec.count) break

        const label = labelOf(candidate)
        if (label === undefined) continue

        // Never a distractor that is also correct, and never two options that read
        // the same. Both make the question unanswerable rather than difficult.
        const key = normalise(label)
        if (taken.has(key)) continue
        // `excludeSimilarStrings` is named for what it does now. It used to test
        // `key === normalise(correctLabel)`, which is what the line above already
        // does — so the flag every template in the pack sets was, exactly, dead. What
        // it was written for is the pair it could not see: the Swedish krona beside
        // the Norwegian krone. One letter apart, in a list of four, in front of a
        // ten-year-old, is a spelling trap rather than a geography question.
        if (spec.excludeSimilarStrings !== false && isNearlyTheSame(key, correctLabel)) continue

        taken.add(key)
        const asset = assetFor(candidate.id)
        chosen.push({
          id: candidate.id,
          label,
          isCorrect: false,
          ...(asset !== undefined ? { asset } : {}),
        })
      }
      return chosen
    }

    const primary = candidatePool(index, entity, spec.strategy, fact)
    let chosen = pick(primary)

    /**
     * Fall back on too few OPTIONS, not on too few candidates.
     *
     * This asked `pool.length < spec.count` — a count of entities — and the two numbers
     * are the same only when every candidate reads as a different string. For a
     * template whose answer is the fact value they routinely do not: `same-region` for
     * Brazil returns four South American countries, comfortably more than the three
     * distractors wanted, and all four answer "South America". They collapse into the
     * correct option during deduplication and the question is dropped, having never
     * consulted the fallback that would have rescued it, because the pool was not empty.
     *
     * That silence cost `tpl.location-of.mc4` — the only accessible way to ask where a
     * country is — every question in Asia, North America, Oceania and South America.
     */
    if (chosen.length < spec.count && spec.fallback) {
      const extra = candidatePool(index, entity, spec.fallback, fact)
      chosen = pick([...new Set([...primary, ...extra])])
    }

    // A question with too few plausible options is worse than no question.
    if (chosen.length < spec.count) return null
    options.push(...chosen)
  }

  const hint = hintFor(template, fact, locale, promptParams)

  /**
   * Indexed by the template's ATTRIBUTE, not by the literal `'flag'`. Templates are
   * attribute-shaped by design — see the comment at the top of the templates pack —
   * so a wildlife pack asking about `photo` gets `entity.assets.photo` with no engine
   * change, which is the whole reason this package knows nothing about geography.
   */
  const promptAsset =
    template.modality === 'image' ? entity.assets?.[template.attribute]?.path : undefined

  /**
   * The same asset, for AFTER the answer — see `Question.revealAsset`.
   *
   * A described-flag template asks in words and is answered in words, so the flag never
   * appears; the user finishes the question without having seen the thing it is about.
   * This hands the screen the picture to show once grading is done, when there is
   * nothing left to give away.
   *
   * `promptAsset === undefined` was the whole condition, and it is no longer sufficient.
   * The options can now carry the picture too: a flag question whose four options ARE
   * the four flags has shown the right one since before the user answered, so revealing
   * it on the feedback sheet is a second copy of something that never left — the exact
   * redundancy the `promptAsset` half of this condition exists to prevent.
   *
   * The reveal still fires for the described-flag templates, which is where it was
   * earning its place: those ask in words, are answered in words, and would otherwise
   * finish without the flag ever appearing.
   */
  const revealAsset =
    promptAsset === undefined && correctAsset === undefined
      ? entity.assets?.[template.attribute]?.path
      : undefined

  /**
   * The locator map, and the one rule that makes it safe.
   *
   * Only when the answer is NOT the entity. A template answered by `entity.names` is
   * asking "which country is this?" in some form, and a map of that country beside the
   * question hands the answer over — silently, and only to sighted users, which is the
   * worst shape a giveaway can take. Decided here rather than in a screen, because
   * every screen would have to remember it and one of them would not.
   *
   * Requires both halves: the country and the land around it. A country drawn with
   * nothing behind it is a shape in a void, which locates nothing — so a pack that
   * declares one layer and not the other gets no locator rather than half a picture.
   */
  const mapAsset = entity.assets?.['map']?.path
  const contextAsset = entity.assets?.['mapContext']?.path
  const hasMap = mapAsset !== undefined && contextAsset !== undefined

  /**
   * A `map` template inverts the rule above: the map IS the question.
   *
   * "Which country is this?" over a locator is answered by `entity.names`, which is
   * exactly the shape the giveaway rule refuses — so the two have to be told apart by
   * the MODALITY rather than by the answer. Same picture, opposite meaning: decoration
   * beside a capital-city question, the entire prompt here.
   *
   * A pack that declares a map template for an entity with no geometry gets no
   * question at all rather than an unanswerable one. That is the `null` below, and it
   * is the same reason the flag composer drops an image question with no artwork.
   */
  const isMapPrompt = template.modality === 'map'
  if (isMapPrompt && !hasMap) return null

  const locator =
    hasMap && (isMapPrompt || template.answer.from !== 'entity.names')
      ? { path: mapAsset, contextPath: contextAsset }
      : undefined

  return {
    item,
    promptKey: template.prompt.key,
    promptParams,
    ...(promptAsset !== undefined ? { promptAsset } : {}),
    ...(revealAsset !== undefined ? { revealAsset } : {}),
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
