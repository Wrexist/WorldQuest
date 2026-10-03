/**
 * Explore's scene: a selection and verified pins. Nothing here is being assessed,
 * so the only rule is accuracy — a pin only where two sources agree (ATLAS_PLACES), and
 * never for a capital the pack marks for review.
 */

import { ATLAS_COUNTRIES, ATLAS_PLACES, ATLAS_REGION_FRAMES } from '../data/atlas.generated.js'
import type { Translate } from './lessonScene.js'
import type { AtlasFocus, AtlasHighlight, AtlasMarker, AtlasSceneSpec } from './types.js'

export type ExploreSceneInput = {
  readonly selected: string | null
  readonly region: string | null
  /** Countries the current search/filter matches; empty means "all". */
  readonly matches: readonly string[]
  readonly countryName: (countryId: string) => string | undefined
  readonly factValueName: (factId: string) => string | undefined
  readonly t: Translate
}

export function buildExploreScene(input: ExploreSceneInput): AtlasSceneSpec {
  const highlights: AtlasHighlight[] = []
  const markers: AtlasMarker[] = []
  const rings: { countryId: string; lat: number; lon: number }[] = []
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
    // Names live in the card and browser; displaced pills can label a neighbour's land.
    labels: [],
    interaction: { rotate: true, zoom: true, selectable: 'all' },
    summary,
    rings,
  }
}
