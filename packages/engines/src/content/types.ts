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
  readonly region?: string
  readonly subregion?: string
  readonly assets?: Readonly<Record<string, { path: string; license: string }>>
}

export type Fact = {
  readonly id: FactId
  readonly entity: EntityId
  readonly attribute: string
  readonly value: { readonly id?: string; readonly names?: LocalizedText }
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
  | 'random-global'

export type Template = {
  readonly id: TemplateId
  /** Which attribute this template asks about. NOT which subject. */
  readonly attribute: string
  readonly modality: 'text' | 'image' | 'map' | 'audio'
  readonly prompt: { readonly key: string; readonly params?: readonly string[] }
  /** Where the correct answer is read from. */
  readonly answer: { readonly from: 'fact.value.names' | 'entity.names' }
  readonly distractors?: {
    readonly count: number
    readonly strategy: DistractorStrategy
    readonly fallback?: DistractorStrategy
    readonly excludeSimilarStrings?: boolean
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
}
