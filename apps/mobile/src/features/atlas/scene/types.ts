/**
 * What the atlas is asked to show. The renderer draws exactly this and nothing else.
 *
 * The renderer never sees a question, an answer key or a grade. The lesson layer turns
 * those into a spec (`lessonScene.ts`); Explore builds its own (`exploreScene.ts`). So
 * every disclosure decision — what is labelled, what is pinned, what a screen reader
 * hears — is made in one pure, tested function per surface, and the GL code below it is
 * incapable of leaking an answer because it is never told one.
 */

import type { AtlasFrame } from '../geo/types.js'

export type AtlasMode =
  /** "What is the capital of X?" — country shown, capital hidden until graded. */
  | 'capital-name'
  /** "Which country is this?" — shape shown, its name nowhere until graded. */
  | 'identify-country'
  /** A question about the country that the map cannot answer (its currency, its TLD). */
  | 'context'
  /** Free exploration: names, search, verified pins. */
  | 'explore'

export type AtlasPhase = 'question' | 'selected' | 'submitting' | 'revealed' | 'explore'

/** Semantic states only; the renderer maps them to tokens and never to meaning. */
export type HighlightState = 'subject' | 'selected' | 'correct' | 'incorrect' | 'context'

export type AtlasHighlight = { readonly countryId: string; readonly state: HighlightState }

export type AtlasMarker = {
  readonly placeId: string
  readonly lat: number
  readonly lon: number
  /** Already localised. Null draws the pin without a name. */
  readonly label: string | null
  readonly emphasis: 'answer' | 'info'
}

export type AtlasLabel = {
  readonly countryId: string
  readonly lat: number
  readonly lon: number
  /** Already localised by whoever built the spec. */
  readonly text: string
  readonly priority: number
  /**
   * Angular radius of the labelled shape, degrees. When the shape is smaller on screen
   * than its own name, the name goes beside it rather than on top of it.
   */
  readonly extent?: number
}

export type AtlasFocus =
  | { readonly kind: 'country'; readonly countryId: string; readonly frame: AtlasFrame }
  | { readonly kind: 'region'; readonly regionId: string; readonly frame: AtlasFrame }
  | { readonly kind: 'world' }

export type AtlasInteraction = {
  readonly rotate: boolean
  readonly zoom: boolean
  /** Which countries a tap may select. Empty means taps select nothing. */
  readonly selectable: 'all' | readonly string[]
}

export type AtlasSceneSpec = {
  /** Changes whenever the thing being asked changes; events tagged with an old key are dropped. */
  readonly sceneKey: string
  readonly mode: AtlasMode
  readonly phase: AtlasPhase
  readonly focus: AtlasFocus
  readonly highlights: readonly AtlasHighlight[]
  readonly markers: readonly AtlasMarker[]
  readonly labels: readonly AtlasLabel[]
  readonly interaction: AtlasInteraction
  /**
   * The one sentence a screen reader hears for the whole map. Built under the same
   * disclosure rules as the labels — it is the accessible label, so it is a label.
   */
  readonly summary: string
  /** Countries too small to see by fill alone get a ring; listed here, not inferred. */
  readonly rings: readonly { readonly countryId: string; readonly lat: number; readonly lon: number }[]
}

export type AtlasEvent =
  | { readonly type: 'countrySelected'; readonly sceneKey: string; readonly countryId: string }
  | { readonly type: 'placeSelected'; readonly sceneKey: string; readonly placeId: string }
  | { readonly type: 'coordinateSelected'; readonly sceneKey: string; readonly lat: number; readonly lon: number }
  | { readonly type: 'viewChanged'; readonly sceneKey: string; readonly lat: number; readonly lon: number; readonly distance: number }
