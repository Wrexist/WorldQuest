import { describe, expect, it } from 'vitest'
import { LABEL_MAX_SCALE, layoutLabels, markerBox } from './labels.js'
import type { AtlasLabel } from './scene/types.js'

/** Half a label's laid-out height, at the capped text scale. */
const HALF = (22 * LABEL_MAX_SCALE) / 2

const VIEW = { width: 358, height: 260 }
const EUROPE = { lat: 45, lon: 5, distance: 2.4 }
const label = (countryId: string, lat: number, lon: number, text: string, priority = 1, extent?: number): AtlasLabel => ({
  countryId,
  lat,
  lon,
  text,
  priority,
  ...(extent !== undefined ? { extent } : {}),
})

describe('label layout', () => {
  it('drops labels on the far side of the Earth', () => {
    const placed = layoutLabels([label('NZ', -41, 174, 'New Zealand'), label('FR', 46.6, 2.4, 'France')], EUROPE, VIEW)
    expect(placed.map((p) => p.countryId)).toEqual(['FR'])
  })

  it('places higher priority first and never overlaps two names', () => {
    const placed = layoutLabels(
      [label('BE', 50.6, 4.6, 'Belgium', 1), label('NL', 52.2, 5.5, 'Netherlands', 2), label('LU', 49.8, 6.1, 'Luxembourg', 3)],
      EUROPE,
      VIEW,
    )
    expect(placed[0]!.countryId).toBe('LU')
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!
        const b = placed[j]!
        const w = (t: string) => t.length * 7.6 * LABEL_MAX_SCALE + 18
        const overlapX = a.x < b.x + w(b.text) && b.x < a.x + w(a.text)
        const overlapY = Math.abs(a.y - b.y) < 22 * LABEL_MAX_SCALE
        expect(overlapX && overlapY).toBe(false)
      }
  })

  it('gives way to a pin, which is the answer being taught', () => {
    const at = { x: VIEW.width / 2, y: VIEW.height / 2 }
    const pinned = layoutLabels([label('FR', 45, 5, 'France', 10)], EUROPE, VIEW, [markerBox(at.x, at.y, 'Paris')])
    for (const p of pinned) {
      const box = markerBox(at.x, at.y, 'Paris')
      const inside = p.x < box.x1 && p.x + 60 > box.x0 && p.y < box.y1 && p.y + 22 * LABEL_MAX_SCALE > box.y0
      expect(inside).toBe(false)
    }
  })

  it('puts the name beside a country smaller than its name, not over it', () => {
    const centred = layoutLabels([label('LU', 45, 5, 'Luxembourg', 1, 0.4)], EUROPE, VIEW)[0]!
    expect(centred.y + HALF).not.toBeCloseTo(VIEW.height / 2, 0)
    const big = layoutLabels([label('FR', 45, 5, 'France', 1, 12)], EUROPE, VIEW)[0]!
    expect(big.y + HALF).toBeCloseTo(VIEW.height / 2, 0)
  })
})
