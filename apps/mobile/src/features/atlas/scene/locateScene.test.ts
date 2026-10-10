import { describe, expect, it } from 'vitest'
import { ATLAS_COUNTRIES } from '../data/atlas.generated.js'
import { buildLocateScene, compassFrom, initialBearing, revealFrame, type LocateSceneInput } from './locateScene.js'

const europe = Object.values(ATLAS_COUNTRIES).filter((c) => c.region === 'EU').map((c) => c.id)
const NAMES: Record<string, string> = { AT: 'Austria', HU: 'Hungary', DE: 'Germany', VA: 'Vatican City' }
const t = (key: string, params?: Record<string, string | number>) => `${key}${params ? ` ${JSON.stringify(params)}` : ''}`

const scene = (over: Partial<LocateSceneInput> = {}) => buildLocateScene({
  sceneKey: 'l:0',
  entityId: 'AT',
  optionIds: europe,
  phase: 'question',
  selectedId: null,
  misses: [],
  countryName: (id) => NAMES[id] ?? id,
  regionName: () => 'Europe',
  t,
  ...over,
})!

describe('the map drill before it is answered', () => {
  it('shows the region and names nothing, in the picture or the summary', () => {
    const s = scene()
    expect(s.focus).toMatchObject({ kind: 'region', regionId: 'EU' })
    expect(s.labels).toEqual([])
    expect(s.markers).toEqual([])
    expect(s.summary).not.toContain('Austria')
    expect(s.highlights).toEqual([])
  })

  it('accepts a tap on any country in play, and rings every microstate, not only the answer', () => {
    const s = scene()
    expect(new Set(s.interaction.selectable)).toEqual(new Set(europe))
    const ringed = s.rings.map((r) => r.countryId)
    expect(ringed).toContain('VA')
    expect(ringed.every((id) => ATLAS_COUNTRIES[id]!.small)).toBe(true)
  })

  it('draws a pick without naming it', () => {
    const s = scene({ phase: 'selected', selectedId: 'DE' })
    expect(s.highlights.find((h) => h.countryId === 'DE')?.state).toBe('selected')
    expect(s.labels).toEqual([])
  })

  it('keeps a missed country lit and named, and out of reach of another tap', () => {
    const s = scene({ misses: ['HU'] })
    expect(s.highlights.find((h) => h.countryId === 'HU')?.state).toBe('incorrect')
    expect(s.labels.map((l) => l.text)).toEqual(['Hungary'])
    expect(s.interaction.selectable).not.toContain('HU')
    expect(s.summary).toContain('Hungary')
    expect(s.summary).not.toContain('Austria')
  })
})

describe('the map drill once it is over', () => {
  it('lights and names the answer and frames it, and takes no more taps', () => {
    const s = scene({ phase: 'revealed' })
    expect(s.highlights).toEqual([{ countryId: 'AT', state: 'correct' }])
    expect(s.labels.map((l) => l.text)).toEqual(['Austria'])
    expect(s.focus).toMatchObject({ kind: 'country', countryId: 'AT' })
    expect(s.interaction.selectable).toEqual([])
  })

  it('shows the misses beside it, framed together', () => {
    const s = scene({ phase: 'revealed', misses: ['HU'] })
    expect(s.highlights.map((h) => h.state)).toEqual(['correct', 'incorrect'])
    expect(s.labels.map((l) => l.text)).toEqual(['Austria', 'Hungary'])
    const frame = revealFrame('AT', 'HU')
    expect(frame.lon).toBeGreaterThan(ATLAS_COUNTRIES.AT!.frame.lon)
    expect(frame.lon).toBeLessThan(ATLAS_COUNTRIES.HU!.frame.lon)
  })
})

describe('which way to look', () => {
  it('says Austria is west of Hungary and Hungary east of Austria', () => {
    expect(compassFrom('HU', 'AT')).toBe('west')
    expect(compassFrom('AT', 'HU')).toBe('east')
  })

  it('reads a bearing the way a compass does', () => {
    expect(Math.round(initialBearing({ lat: 0, lon: 0 }, { lat: 10, lon: 0 }))).toBe(0)
    expect(Math.round(initialBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 10 }))).toBe(90)
    expect(Math.round(initialBearing({ lat: 0, lon: 0 }, { lat: -10, lon: 0 }))).toBe(180)
    expect(Math.round(initialBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -10 }))).toBe(270)
  })

  it('has nothing to say about the same place, or an unknown one', () => {
    expect(compassFrom('AT', 'AT')).toBeNull()
    expect(compassFrom('AT', 'XX')).toBeNull()
  })
})
