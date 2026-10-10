/**
 * The content engine's vocabulary.
 *
 * Read the type names carefully: Entity, Fact, Template, Item. Not Country, Flag,
 * Capital. Nothing in this package knows what geography is — it knows that entities
 * have attributes, and that templates ask about attributes. That is precisely what
 * makes a wildlife or astronomy pack a content release rather than a rewrite.
 *
 * Spec: docs/systems/content-pipeline.md
 */

import type { FactId, TemplateId } from '../learning/types.js'

export type EntityId = string
export type LocalizedText = Readonly<Record<string, string>>

export type Entity = {
  readonly id: EntityId
  readonly type: string
  /** The citation form — what goes in a list, on a card, or in an answer option. */
  readonly names: LocalizedText
  /**
   * The form used inside a sentence, when it differs from `names`.
   *
   * English needs this for the handful of countries that take a definite article:
   * "What is the capital of Netherlands?" is wrong, and the fix cannot live in the
   * translation catalogue because the template is one string shared by 200 countries.
   * It cannot live in `names` either — a country list sorted alphabetically must file
   * the Netherlands under N.
   *
   * It is localised rather than an `article` flag because the problem is not articles.
   * Languages with grammatical case need the country in an oblique form here, and a
   * boolean cannot express that.
   */
  readonly namesInSentence?: LocalizedText
  /**
   * Other things a person might type for this entity: "USA" for the United States, the
   * official name, the ISO code. Used ONLY to judge a typed answer (`Template.input`), never
   * shown, so an alias that is a little informal costs nothing. An alias that is also another
   * entity's name or alias is never carried here — "Guinea" must not be a right answer for
   * Equatorial Guinea — and `scripts/build-aliases.cjs` is what guarantees that.
   */
  readonly aliases?: readonly string[]
  readonly region?: string
  readonly subregion?: string
  readonly assets?: Readonly<Record<string, { path: string; license: string }>>
}

export type Fact = {
  readonly id: FactId
  readonly entity: EntityId
  readonly attribute: string
  /**
   * The value, in two forms with two jobs.
   *
   * `names` is the full, sourced form — what a citation shows and what
   * `pnpm content:crosscheck` compares against an independent dataset.
   * `shortNames`, when present, is what a QUESTION uses instead, because a full name
   * can carry its own answer: "Indian rupee" beside "Which country uses it?" is not a
   * question. See `displayValue` in ./index.ts for which paths read which.
   */
  readonly value: {
    readonly id?: string
    readonly names?: LocalizedText
    readonly shortNames?: LocalizedText
    /**
     * The figure behind a numeric value, unrounded — "about 380,000 km²" is what a learner
     * reads and 377,930 is what was sourced. Distractor strategies that care how CLOSE two
     * answers are (`nearest-values`) compare these, never the labels.
     */
    readonly number?: number
    /** ISO date the figure is as of; population and area drift. */
    readonly asOf?: string
  }
  /** Authored prior, 1–5. The engine learns the real per-user difficulty. */
  readonly difficulty: number
  readonly tags?: readonly string[]
  /**
   * Where this fact came from, and when it was last checked.
   *
   * Every pack already carries this and `pnpm content:validate` requires it — the
   * type simply did not say so, which meant the one screen that shows provenance
   * could not read it without a cast. A wrong fact in a learning app is the worst
   * bug available, and "we cannot say where this came from" is how one survives.
   */
  readonly source?: {
    readonly name: string
    readonly url?: string
    /** ISO date. Population and currency go stale; capitals occasionally move. */
    readonly verifiedAt: string
  }
  readonly volatility: 'stable' | 'slow' | 'fast'
  readonly sensitivity?: 'none' | 'review-required'
  /** Defaults to true. Sensitive and fast-volatility facts set it false. */
  readonly quizzable?: boolean
}

export type DistractorStrategy =
  | 'same-subregion'
  | 'same-region'
  | 'visually-similar'
  | 'commonly-confused'
  /**
   * Any entity that has a value for this attribute — for questions whose ANSWER is the
   * fact value rather than the entity, where the option space is the set of values and
   * not the set of entities.
   *
   * "Where in the world is Brazil?" has four options drawn from fourteen subregions, so
   * a globally-drawn pool is not a lottery; it is the question. Restricting it by region
   * is what breaks it: South America contains exactly one subregion, so every distractor
   * reads "South America", they collapse to one option, and the question is dropped.
   *
   * Distinct from `random-global`, which is a test fixture. This one is only meaningful
   * when `answer.from` is `fact.value.names`, and content validation says so.
   */
  | 'other-values'
  /**
   * For a NUMERIC fact (`value.number`): the entities whose number is nearest on a log
   * scale — "about 380,000 km²" offered beside 350,000 and 410,000. Closeness is what makes
   * a magnitude question hard rather than a lottery, so this is the way of asking that a
   * long-practised learner is steered towards (see `Template.difficultyModifier`).
   */
  | 'nearest-values'
  /**
   * The same numbers, at least a factor of four apart: the forgiving version of the above,
   * where "about 380,000 km²" sits beside 2,000 and 9,000,000. Only the order of magnitude
   * is being asked.
   */
  | 'spread-values'
  /**
   * For a RELATION fact (`answer.from: "fact.value.entity"`): entities related to the ones
   * this entity is related to — the neighbours of its neighbours. A wrong answer a learner
   * could plausibly believe, and never a right one, because the entity's own relations are
   * always excluded.
   */
  | 'near-related'
  | 'random-global'

export type Template = {
  readonly id: TemplateId
  /** Which attribute this template asks about. NOT which subject. */
  readonly attribute: string
  readonly modality: 'text' | 'image' | 'map' | 'audio'
  readonly prompt: { readonly key: string; readonly params?: readonly string[] }
  /**
   * Where the correct answer is read from.
   *
   * `fact.value.entity` is for RELATIONS: the fact says "this entity is related to that
   * one" (a neighbour, a river's country), `value.id` names the other entity, and the
   * answer is that entity. An entity may hold several such facts for one attribute — every
   * one of them is a correct answer, so every one of them is excluded from the wrong ones.
   */
  readonly answer: { readonly from: 'fact.value.names' | 'entity.names' | 'fact.value.entity' }
  /**
   * How the learner answers. Absent means by choosing an option; `typed` means by typing it.
   *
   * A typed question has no wrong options to build, so `distractors` is ignored and the
   * question carries exactly one option — the right one, which is what the answer is sent as
   * (see `TYPED_WRONG`). It is asked only of a fact the learner has already met more than
   * once: nobody can type what they were never shown, and a heart lost to that is the
   * "punishing a beginner for not knowing" that the hearts rule exists to prevent.
   *
   * `tap` means by pointing at the answer on a map: "Where is Austria?" over the region, and
   * the learner taps it. Every candidate in the distractor pool becomes an option — each is a
   * place that can be tapped, and the map has to know which ones it may accept — so
   * `distractors.count` is a minimum rather than a size. A tap template is asked ONLY in a
   * lesson that asks for it (`ComposeInput.input`): it needs a host that draws a pickable map,
   * and a lesson that wandered into one would be a lesson that changed its own rules.
   */
  readonly input?: 'typed' | 'tap'
  /**
   * Only ask this about facts whose `value.id` is this. Lets one attribute carry two
   * questions that cannot share a prompt: "which of these has no sea coast?" is true of a
   * landlocked country and false of a coastal one.
   */
  readonly when?: { readonly valueId: string }
  readonly distractors?: {
    readonly count: number
    readonly strategy: DistractorStrategy
    readonly fallback?: DistractorStrategy
    readonly excludeSimilarStrings?: boolean
    /**
     * Keep only candidates whose own fact for this attribute has a DIFFERENT `value.id`.
     *
     * For an entity-answer question whose value is shared by many entities — "which of
     * these is landlocked?" — where `isAmbiguous` would refuse it outright, because the
     * value is not unique. It is not ambiguous here: the wrong answers are chosen to be
     * coastal, so exactly one option is landlocked.
     */
    readonly differentValueOnly?: boolean
  }
  readonly a11y: {
    readonly screenReaderSafe: boolean
    /** Required when not screen-reader safe. Tests the SAME fact. */
    readonly equivalentTemplate?: TemplateId
  }
  readonly timeLimitMs?: number | null
  readonly difficultyModifier?: number
}

/**
 * fact × template. This is what a lesson is made of — but note that memory is
 * tracked per FACT, not per item: knowing "Stockholm is the capital of Sweden" is
 * one piece of knowledge however we choose to ask about it.
 */
export type Item = {
  readonly id: string
  readonly factId: FactId
  readonly templateId: TemplateId
  readonly entityId: EntityId
  readonly difficulty: number
  readonly screenReaderSafe: boolean
}

export type AnswerOption = {
  readonly id: string
  readonly label: string
  readonly isCorrect: boolean
  /**
   * A picture of THIS option, when the option is a value that has one.
   *
   * "What does Belgium's flag look like?" was answered by picking one of four written
   * descriptions — *tre lodräta band — svart, gult, rött* — which is a reading
   * comprehension question wearing a flag question's clothes. In an app whose first
   * promise is flags, the flag is the answer and it should be the thing you point at.
   *
   * ## Why this is not the giveaway `promptAsset` refuses
   *
   * The note on `promptAsset` rejects per-option art, and it is right about the case it
   * describes: for a template answered by `entity.names` the correct option's entity IS
   * the entity in the prompt, so drawing its asset marks the answer. That is why this is
   * populated for `fact.value.names` templates ONLY.
   *
   * Read the two side by side and the difference is total. "Which country's flag is
   * this?" shows one flag and is answered by four names — art on those options would be
   * each country's own flag, and one of them would match the prompt exactly. "What does
   * Belgium's flag look like?" names the country and is answered by four flag VALUES —
   * art on those options is the four flags themselves, which is not a hint about the
   * answer, it is the question finally being asked in the medium it is about.
   *
   * ## It stays screen-reader safe, which is why no second template was needed
   *
   * `label` is unchanged and still carries the written description, so a reader
   * announces "tre lodräta band — svart, gult, rött" exactly as before. The picture is
   * additive and visual; the words are the accessible name. A template that had to drop
   * its labels to show art would need an `equivalentTemplate` and a parity pair, like
   * `tpl.flag-to-country.mc4` does — this one does not, because it loses nothing.
   *
   * Indexed by the template's ATTRIBUTE like every other asset lookup in this file, so
   * a wildlife pack answering "which of these is a lion's track?" gets the same
   * behaviour with no engine change and this package still knows nothing about flags.
   */
  readonly asset?: string
}

/** A question, ready to render. Contains no logic and no React. */
export type Question = {
  readonly item: Item
  /** i18n key plus its params — never a pre-built sentence. */
  readonly promptKey: string
  readonly promptParams: Readonly<Record<string, string>>
  readonly options: readonly AnswerOption[]
  readonly modality: Template['modality']
  /**
   * The image the PROMPT is asking about — the flag in "Which country's flag is
   * this?". Present only for image-modality templates whose entity carries the
   * matching asset.
   *
   * On the question, never on the options. It used to be per-option: every option
   * carried its own entity's flag, which for a template answered by country NAME
   * would have printed the answer beside each name. Nothing rendered it, so it was
   * wrong quietly rather than loudly.
   *
   * ## This was re-proposed from a competitor screenshot, and is still wrong
   *
   * The reference showed a flag beside every answer on a CURRENCY question — Poland's
   * against "Polish złoty", the EU's against "Euro" — which looks like it dodges the
   * giveaway above, because none of those flags is the flag of the country being asked
   * about. It does not, and the reason is in `buildQuestion`: the correct option is
   * built as `{ id: item.entityId }`, so **the option's entity IS the entity in the
   * prompt**. Drawing its flag puts Germany's flag beside "Euro" on "What money do
   * people use in Germany?" — which identifies the answer to anyone who knows the flag
   * and nothing about the currency. Silently, and only for sighted users.
   *
   * What the reference actually does is hang the flag on the VALUE (Euro → the EU
   * flag), not on the entity the value came from. That is not expressible here: a
   * `Fact`'s value is `{ id?, names? }` and only an `Entity` carries `assets`. Building
   * it needs two things, in this order — value-level assets in the content model, and a
   * licensed flag or symbol per currency with a source and a `verifiedAt`, like every
   * other asset in a pack.
   *
   * Until both exist, per-option art makes the question easier to answer without
   * knowing the fact, which in a learning app is the bug that matters most.
   */
  readonly promptAsset?: string
  /**
   * A picture of WHERE the entity is, as context beside the question rather than as
   * the question. "What is the capital of Japan?" is a better question with a map of
   * Japan next to it — you learn the capital and you place the country, which is two
   * things for one look and the reason this app is not a flashcard deck.
   *
   * **Absent whenever the answer IS the entity**, and that is the whole subtlety. On
   * "Tokyo is the capital of which country?" a map of Japan is not context, it is the
   * answer printed beside the question. The rule is enforced where this is built, not
   * left to each screen to remember.
   *
   * Two paths because the picture is two layers — the country, and the land around it
   * drawn in the same frame — and a host with one but not the other could only draw a
   * shape floating in a void, which locates nothing. Both come from the pack rather
   * than one being derived from the other: each is a separately licensed asset.
   */
  readonly locator?: { readonly path: string; readonly contextPath: string }
  /**
   * The picture to show once the question has been ANSWERED.
   *
   * "Hur ser Japans flagga ut?" is answered in words — *en röd cirkel i mitten på vit
   * botten* — and read off a device that is the whole of it: four sentences, a map of
   * Japan for context, and at no point the flag. A user finishes a flag question having
   * never seen the flag. In an app whose first promise is "flags, capitals and
   * landmarks", that is the fact not being taught.
   *
   * It cannot be the prompt, and that is why this field exists rather than
   * `promptAsset` being widened. Drawing the flag beside "what does Japan's flag look
   * like?" hands the answer to anyone who can see it, silently and only to sighted
   * users — the same giveaway `locator` is carefully kept away from. After the answer
   * is graded there is nothing left to give away: the correct option is already marked.
   *
   * Indexed by the template's ATTRIBUTE, exactly like `promptAsset`, so this knows
   * nothing about flags. A wildlife pack asking "what does a lion look like?" in words
   * reveals `assets.photo` for the same reason and with no engine change.
   *
   * Absent when the asset is already on screen as the prompt — an image-modality
   * template has shown it since before the user answered.
   */
  readonly revealAsset?: string
  readonly timeLimitMs: number | null
  /**
   * Present when the answer is TYPED. The spellings that count as right; the judging (case,
   * accents, a typo) is `matchTyped`, shared by the app and the Worker's reading of what the
   * app reports. `options` then holds the one correct option and nothing else.
   */
  readonly typed?: { readonly accepts: readonly string[]; readonly rivals?: readonly string[] }
  /**
   * True when the answer is given by TAPPING it on a map (`Template.input: 'tap'`). The
   * options are every place the map may accept, the prompt names the entity, and nothing on
   * screen draws it before the answer: the map is the answer surface, never the prompt.
   */
  readonly tap?: true
  /**
   * Set when this question is one of the four that make up a "match the pairs" board
   * (`lesson/pairs.ts`). The four are consecutive, share one option list, and are each graded
   * as the fact they are about — a client that does not draw boards plays each as the ordinary
   * multiple-choice question it also is. `position` is 0 on the first.
   */
  readonly group?: { readonly id: string; readonly size: number; readonly position: number }
  /** For the wrong-answer explanation: "Japan is a red circle on white." */
  readonly hint?: string
  /**
   * True when the user has never reviewed this fact. Set by the lesson composer,
   * which is the only layer that knows the user's memory state.
   *
   * It drives heart accounting: new items never cost a heart. Inferring it from
   * difficulty would be guessing, and guessing wrong here penalises a beginner.
   */
  readonly isNew: boolean
}

export type ContentIndex = {
  readonly entities: ReadonlyMap<EntityId, Entity>
  readonly facts: ReadonlyMap<FactId, Fact>
  readonly templates: ReadonlyMap<TemplateId, Template>
  readonly items: readonly Item[]
  /** factId → items generated from it. */
  readonly itemsByFact: ReadonlyMap<FactId, readonly Item[]>
  /** entityId → every fact about it, quizzable or not. Distractor search reads these, not the whole pack. */
  readonly factsByEntity: ReadonlyMap<EntityId, readonly Fact[]>
  /** attribute → every fact carrying it. */
  readonly factsByAttribute: ReadonlyMap<string, readonly Fact[]>
}
