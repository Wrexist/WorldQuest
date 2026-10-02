/**
 * The lesson's disclosure policy for the atlas. Pure: question in, scene out.
 *
 * ## The rule this file exists for
 *
 * A map beside a question is information. Beside "what is the capital of Spain?" it is
 * context; beside "where in the world is Spain?" it IS the answer, printed for sighted
 * users only. So every template is sorted into a mode here, once, and the renderer,
 * the fallback picture and the screen-reader summary all read that one decision.
 *
 * - `capital-name`    the country, named (the prompt names it anyway); its capital is
 *                      pinned and named only once the answer is graded.
 * - `identify-country` the shape with NO name anywhere — not a label, not a pin, not the
 *                      accessible summary. Named once graded; a wrong pick is shown too.
 * - `context`          the country, named, for questions the map cannot answer.
 * - REVEAL-ONLY        attributes a map gives away (continent, hemisphere, coastline,
 *                      neighbours, size): no map until graded, then the context view.
 *
 * Anything this file does not recognise is reveal-only. Unknown is not permission.
 *
 * The composer's own rule still applies first: `question.locator` is absent whenever
 * the answer IS the country (packages/engines/src/content/index.ts), and nothing here
 * draws a map for a question without one.
 */

import type { Question } from '@worldquest/engines'
import { ATLAS_COUNTRIES, ATLAS_PLACES } from '../data/atlas.generated.js'
import type { AtlasFrame } from '../geo/types.js'
import type { AtlasHighlight, AtlasLabel, AtlasMarker, AtlasMode, AtlasSceneSpec } from './types.js'

/**
 * Attributes a map answers by being looked at. A globe framed on a country shows its
 * continent and hemisphere, whether it has a coast, who its neighbours are and roughly
 * how big it is — so before grading, these questions get no map at all.
 */
export const MAP_REVEALS: ReadonlySet<string> = new Set([
  'location',
  'hemisphere',
  'landlocked',
  'borders',
  'border-count',
  'area',
])

/**
 * Attributes the map cannot answer, so the country may be shown and named throughout.
 * An allowlist on purpose: a new attribute is reveal-only until someone adds it here.
 */
export const MAP_SAFE: ReadonlySet<string> = new Set([
  'capital',
  'currency',
  'currency-code',
  'language',
  'calling-code',
  'tld',
  'alpha3',
  'native-name',
  'flag',
  'company',
  'athlete',
  'musician',
  'actor',
  'scientist',
  'writer',
  'artist',
  'landmark',
  'club',
  'highest-point',
])

export type LessonAtlasPolicy = { readonly mode: AtlasMode; readonly beforeAnswer: boolean } | null

/** Which mode a question gets, or null for no map at any point. */
export function lessonAtlasPolicy(input: {
  readonly attribute: string | undefined
  readonly modality: Question['modality']
  readonly hasLocator: boolean
  readonly hasPromptAsset: boolean
}): LessonAtlasPolicy {
  // A flag question's picture is the flag. The atlas does not take that slot.
  if (input.hasPromptAsset) return null
  if (!input.hasLocator) return null
  if (input.modality === 'map') return { mode: 'identify-country', beforeAnswer: true }
  if (input.attribute === 'capital') return { mode: 'capital-name', beforeAnswer: true }
  if (input.attribute !== undefined && MAP_SAFE.has(input.attribute)) return { mode: 'context', beforeAnswer: true }
  return { mode: 'context', beforeAnswer: false }
}

export type Translate = (key: string, params?: Record<string, string | number>) => string

export type LessonSceneInput = {
  /** The lesson's id and the question's index: unique per question per lesson. */
  readonly sceneKey: string
  readonly policy: NonNullable<LessonAtlasPolicy>
  readonly entityId: string
  readonly factId: string
  /** `question` before a choice, `selected` with one, `revealed` once graded. */
  readonly phase: 'question' | 'selected' | 'submitting' | 'revealed'
  /** The option the learner submitted. Read only once revealed. */
  readonly chosenOptionId: string | null
  readonly countryName: (countryId: string) => string | undefined
  /** The localised value of a fact — the capital's name for a capital fact. */
  readonly factValueName: (factId: string) => string | undefined
  readonly t: Translate
}

/** The scene for one question in one phase, or null when this phase shows no map. */
export function buildLessonScene(input: LessonSceneInput): AtlasSceneSpec | null {
  const { policy, entityId, phase } = input
  const revealed = phase === 'revealed'
  if (!revealed && !policy.beforeAnswer) return null
  const country = ATLAS_COUNTRIES[entityId]
  if (country === undefined) return null

  const name = input.countryName(entityId)
  const highlights: AtlasHighlight[] = []
  const labels: AtlasLabel[] = []
  const markers: AtlasMarker[] = []
  const rings: { countryId: string; lat: number; lon: number }[] = []
  const ringFor = (id: string) => {
    const c = ATLAS_COUNTRIES[id]
    if (c?.small) rings.push({ countryId: id, lat: c.anchor[0], lon: c.anchor[1] })
  }
  const labelFor = (id: string, text: string | undefined, priority: number) => {
    const c = ATLAS_COUNTRIES[id]
    if (c === undefined || text === undefined) return
    labels.push({ countryId: id, lat: c.anchor[0], lon: c.anchor[1], text, priority, extent: c.frame.radius })
  }

  let summary: string
  const mode = policy.mode

  if (mode === 'identify-country') {
    // Before grading: the shape alone. No label, no ring text, and a summary that says
    // a country is highlighted without saying which.
    highlights.push({ countryId: entityId, state: revealed ? 'correct' : 'subject' })
    ringFor(entityId)
    if (!revealed) {
      summary = input.t('atlas:summary.identify')
    } else {
      labelFor(entityId, name, 10)
      const chosen = input.chosenOptionId
      const chosenCountry = chosen !== null && chosen !== entityId && ATLAS_COUNTRIES[chosen] !== undefined ? chosen : null
      if (chosenCountry !== null) {
        highlights.push({ countryId: chosenCountry, state: 'incorrect' })
        labelFor(chosenCountry, input.countryName(chosenCountry), 5)
        ringFor(chosenCountry)
        summary = input.t('atlas:summary.identifyWrong', {
          country: name ?? '',
          chosen: input.countryName(chosenCountry) ?? '',
        })
      } else {
        summary = input.t('atlas:summary.identifyRevealed', { country: name ?? '' })
      }
    }
  } else {
    highlights.push({ countryId: entityId, state: 'subject' })
    ringFor(entityId)
    // Capital prompts already name the country. Keep its fill and accessible
    // summary, without a floating pill that can be displaced onto a neighbour.
    if (mode !== 'capital-name') labelFor(entityId, name, 10)
    summary = input.t('atlas:summary.country', { country: name ?? '' })

    if (mode === 'capital-name') {
      const capital = input.factValueName(input.factId)
      const place = placeForFact(input.factId)
      if (!revealed) {
        summary = input.t('atlas:summary.capitalHidden', { country: name ?? '' })
      } else if (capital !== undefined) {
        if (place !== undefined) {
          markers.push({ placeId: place.id, lat: place.lat, lon: place.lon, label: capital, emphasis: 'answer' })
          summary = input.t('atlas:summary.capitalPinned', { country: name ?? '', capital })
        } else {
          // No verified coordinate: say the fact, draw no pin. A guessed pin is a wrong fact.
          summary = input.t('atlas:summary.capitalUnpinned', { country: name ?? '', capital })
        }
      }
    }
  }

  return {
    sceneKey: input.sceneKey,
    mode,
    phase: input.phase,
    focus: { kind: 'country', countryId: entityId, frame: lessonFrame(country.frame) },
    highlights,
    markers,
    labels,
    // Answers are given with the options. A tap on the map selects nothing in a lesson:
    // a map tap that graded would be a second, unequal way to answer.
    interaction: { rotate: true, zoom: true, selectable: [] },
    summary,
    rings,
  }
}

/**
 * A lesson frames the country WITH its surroundings — enough of the globe's curve and the
 * neighbouring land to say where it is, which is what the picture is for. A country
 * alone, edge to edge, is a shape; Spain with France, Portugal and Morocco is a place.
 */
export function lessonFrame(frame: AtlasFrame): AtlasFrame {
  return { ...frame, radius: Math.min(60, Math.max(10, frame.radius * 1.6)) }
}

const placeByFact = new Map(Object.values(ATLAS_PLACES).map((p) => [p.factId, p]))

export function placeForFact(factId: string) {
  return placeByFact.get(factId)
}
