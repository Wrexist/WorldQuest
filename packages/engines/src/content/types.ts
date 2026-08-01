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
  readonly names: LocalizedText
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
  /** Present when the option should be shown as an image (a flag, a photo). */
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
