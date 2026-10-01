/**
 * Explore's scene: names, a selection, and verified pins. Nothing here is being assessed,
 * so the only rule is accuracy — a pin only where two sources agree (ATLAS_PLACES), and
 * never for a capital the pack marks for review.
 */

import { ATLAS_COUNTRIES, ATLAS_PLACES, ATLAS_REGION_FRAMES } from '../data/atlas.generated.js'
import type { Translate } from './lessonScene.js'
import type { AtlasFocus, AtlasHighlight, AtlasLabel, AtlasMarker, AtlasSceneSpec } from './types.js'

export type ExploreSceneInput = {
  readonly selected: string | null
  readonly region: string | null
  /** Countries the current search/filter matches; empty means "all". */
  readonly matches: readonly string[]
  readonly countryName: (countryId: string) => string | undefined
  readonly factValueName: (factId: string) => string | undefined
  readonly t: Translate
}

/** How many country names compete for space. Collision culling decides which fit. */
const LABEL_CANDIDATES = 40

export function buildExploreScene(input: ExploreSceneInput): AtlasSceneSpec {
  const highlights: AtlasHighlight[] = []
  const markers: AtlasMarker[] = []
  const rings: { countryId: string; lat: number; lon: number }[] = []
  const pool = input.matches.length > 0 ? input.matches : Object.keys(ATLAS_COUNTRIES)
  const inRegion = (id: string) => input.region === null || ATLAS_COUNTRIES[id]?.region === input.region

  // Larger countries first: with limited room, Brazil's name tells you more than Malta's.
  const labels: AtlasLabel[] = pool
    .filter(inRegion)
    .map((id) => ATLAS_COUNTRIES[id])
    .filter((c) => c !== undefined)
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, LABEL_CANDIDATES)
    .flatMap((c) => {
      const text = input.countryName(c.id)
      return text === undefined ? [] : [{ countryId: c.id, lat: c.anchor[0], lon: c.anchor[1], text, priority: Math.log10(c.pixels + 1), extent: c.frame.radius }]
    })

  if (input.matches.length > 0 && input.matches.length < 12) {
    for (const id of input.matches) if (id !== input.selected) highlights.push({ countryId: id, state: 'context' })
  }

  let focus: AtlasFocus = { kind: 'world' }
  let summary = input.t('atlas:summary.world')
  const region = input.region === null ? undefined : ATLAS_REGION_FRAMES[input.region]
  if (region !== undefined && input.region !== null) focus = { kind: 'region', regionId: input.region, frame: region }

  const selected = input.selected === null ? undefined : ATLAS_COUNTRIES[input.selected]
  if (selected !== undefined) {
    highlights.push({ countryId: selected.id, state: 'selected' })
    if (selected.small) rings.push({ countryId: selected.id, lat: selected.anchor[0], lon: selected.anchor[1] })
    focus = { kind: 'country', countryId: selected.id, frame: selected.frame }
    const name = input.countryName(selected.id) ?? ''
    // The selected country's own label always competes first.
    // Replaces its entry in the general list rather than adding a second "Spain".
    const existing = labels.findIndex((l) => l.countryId === selected.id)
    if (existing >= 0) labels.splice(existing, 1)
    labels.unshift({ countryId: selected.id, lat: selected.anchor[0], lon: selected.anchor[1], text: name, priority: 100, extent: selected.frame.radius })
    const place = Object.values(ATLAS_PLACES).find((p) => p.countryId === selected.id && p.role === 'capital')
    const capital = place === undefined ? undefined : input.factValueName(place.factId)
    if (place !== undefined && capital !== undefined) {
      markers.push({ placeId: place.id, lat: place.lat, lon: place.lon, label: capital, emphasis: 'info' })
      summary = input.t('atlas:summary.exploreSelected', { country: name, capital })
    } else {
      summary = input.t('atlas:summary.country', { country: name })
    }
  }

  return {
    sceneKey: `explore:${input.selected ?? ''}:${input.region ?? ''}`,
    mode: 'explore',
    phase: 'explore',
    focus,
    highlights,
    markers,
    labels,
    interaction: { rotate: true, zoom: true, selectable: 'all' },
    summary,
    rings,
  }
}
