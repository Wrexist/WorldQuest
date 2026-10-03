import { describe, expect, it } from 'vitest'
import { buildExploreScene, type ExploreSceneInput } from './exploreScene.js'
import { ATLAS_PLACES } from '../data/atlas.generated.js'

const t = (key: string, params?: Record<string, string | number>) => `${key}|${JSON.stringify(params ?? {})}`
const base: ExploreSceneInput = {
  selected: null,
  region: null,
  matches: [],
  countryName: (id) => ({ ES: 'Spain', BR: 'Brazil', IL: 'Israel', ZA: 'South Africa', PT: 'Portugal', FR: 'France' })[id] ?? id,
  factValueName: (id) => ({ 'geo.ES.capital': 'Madrid', 'geo.BR.capital': 'Brasília' })[id],
  t,
}

describe('the Explore scene', () => {
  it('starts on the whole world, freely selectable', () => {
    const spec = buildExploreScene(base)
    expect(spec.focus.kind).toBe('world')
    expect(spec.interaction.selectable).toBe('all')
    expect(spec.markers).toEqual([])
    expect(spec.labels).toEqual([])
  })

  it('frames the selection without a displaced duplicate name and pins its verified capital', () => {
    const spec = buildExploreScene({ ...base, selected: 'BR' })
    expect(spec.highlights).toContainEqual({ countryId: 'BR', state: 'selected' })
    expect(spec.focus).toMatchObject({ kind: 'country', countryId: 'BR' })
    expect(spec.labels).toEqual([])
    expect(spec.markers).toHaveLength(1)
    expect(spec.markers[0]!.label).toBe('Brasília')
    expect(spec.summary).toContain('Brasília')
    expect(spec.summary).toContain('Brazil')
  })

  it('pins nothing it has not verified — a review-required capital, or a country with no capital fact', () => {
    // Israel's capital fact is review-required in the pack; South Africa has three capitals
    // and no single fact. Neither gets a pin, and neither summary invents one.
    for (const id of ['IL', 'ZA']) {
      expect(Object.values(ATLAS_PLACES).some((p) => p.countryId === id)).toBe(false)
      const spec = buildExploreScene({ ...base, selected: id })
      expect(spec.markers).toEqual([])
      expect(spec.summary).toContain('atlas:summary.country')
    }
  })

  it('agrees with the search: a short list of matches is highlighted on the globe', () => {
    const spec = buildExploreScene({ ...base, matches: ['PT', 'ES'] })
    expect(spec.highlights).toEqual([
      { countryId: 'PT', state: 'context' },
      { countryId: 'ES', state: 'context' },
    ])
    expect(spec.labels).toEqual([])
    expect(spec.focus.kind).toBe('world')
  })

  it('frames the chosen region without floating country names', () => {
    const spec = buildExploreScene({ ...base, region: 'SA' })
    expect(spec.focus).toMatchObject({ kind: 'region', regionId: 'SA' })
    expect(spec.labels).toEqual([])
    expect(spec.interaction).toEqual({ rotate: true, zoom: true, selectable: 'all' })
  })

  it('changes its scene key with every selection, so a late tap for the old one is dropped', () => {
    const keys = new Set([null, 'ES', 'BR'].map((selected) => buildExploreScene({ ...base, selected }).sceneKey))
    expect(keys.size).toBe(3)
  })
})
