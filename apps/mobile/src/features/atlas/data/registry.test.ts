/**
 * The generated registry against the content pack and the shipped files.
 *
 * Geographic coverage (what can be drawn and pinned) is not lesson coverage (what the
 * pack teaches); these tests hold the first to the second's IDs without conflating them.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import entities from '../../../../../../packages/content/packs/geography/entities.countries.v1.json'
import capitals from '../../../../../../packages/content/packs/geography/facts.capitals.v1.json'
import { ATLAS_CHECKSUMS, ATLAS_COUNTRIES, ATLAS_PLACES, ATLAS_UNASSIGNED_RASTER_IDS } from './atlas.generated.js'
import { containsPoint, parseAtlasGeometry } from '../geo/geometry.js'

const assets = join(__dirname, '..', '..', '..', '..', 'assets', 'atlas')
const bin = readFileSync(join(assets, 'countries.bin'))
const geometry = parseAtlasGeometry(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'design', 'world-atlas', 'atlas-manifest.generated.json'), 'utf8'),
) as {
  coverage: {
    capitalIssues: { factId: string; reason: string }[]
    places: { id: string; source: string; crosscheck: string; verifiedAt: string }[]
  }
}
const provenance = new Map(manifest.coverage.places.map((p) => [p.id, p]))

describe('the atlas registry', () => {
  it('has geometry for every pack country, keyed by the same stable ID', () => {
    const ids = entities.items.map((e) => e.id).sort()
    expect(Object.keys(ATLAS_COUNTRIES).sort()).toEqual(ids)
    for (const e of entities.items) expect(ATLAS_COUNTRIES[e.id]!.region).toBe(e.region)
  })

  it('never gives two features one raster ID', () => {
    const all = [...Object.values(ATLAS_COUNTRIES).map((c) => c.rasterId), ...ATLAS_UNASSIGNED_RASTER_IDS]
    expect(new Set(all).size).toBe(all.length)
    expect(all.every((id) => id > 0)).toBe(true)
  })

  it('anchors every label inside its own country', () => {
    const outside = Object.values(ATLAS_COUNTRIES).filter((c) => {
      const g = geometry.countries.get(c.id)!
      return !containsPoint(g, { lat: c.anchor[0], lon: c.anchor[1] })
    })
    expect(outside.map((c) => c.id)).toEqual([])
  })

  it('gives every country at least one raster texel, and flags the hard-to-see ones', () => {
    for (const c of Object.values(ATLAS_COUNTRIES)) {
      expect(c.pixels).toBeGreaterThan(0)
      expect(c.small).toBe(c.pixels < 64)
    }
    expect(ATLAS_COUNTRIES['VA']!.small).toBe(true)
    expect(ATLAS_COUNTRIES['BR']!.small).toBe(false)
  })

  it('pins every place inside (or on the coast of) the country it belongs to', () => {
    for (const place of Object.values(ATLAS_PLACES)) {
      const g = geometry.countries.get(place.countryId)!
      const inside = containsPoint(g, place)
      if (inside) continue
      // Coastal capitals may sit a few kilometres off a simplified outline: measured to
      // the nearest EDGE, since a vertex can be far away along a straight coast.
      const k = Math.cos((place.lat * Math.PI) / 180)
      let nearest = Infinity
      for (const ring of g.rings) {
        const n = ring.length / 2
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ax = (ring[j * 2]! - place.lon) * k
          const ay = ring[j * 2 + 1]! - place.lat
          const bx = (ring[i * 2]! - place.lon) * k
          const by = ring[i * 2 + 1]! - place.lat
          const dx = bx - ax
          const dy = by - ay
          const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-12)))
          nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy) * 111.32)
        }
      }
      expect(nearest, place.id).toBeLessThan(6)
    }
  })

  it('links each place to a real, non-sensitive capital fact of the same country', () => {
    const facts = new Map(capitals.items.map((f) => [f.id, f as (typeof capitals.items)[number] & { sensitivity?: string }]))
    for (const place of Object.values(ATLAS_PLACES)) {
      const fact = facts.get(place.factId)
      expect(fact, place.factId).toBeDefined()
      expect(fact!.entity).toBe(place.countryId)
      expect(fact!.sensitivity).toBeUndefined()
      // Every shipped pin names its source and the independent record that agrees with it.
      expect(provenance.get(place.id)?.source).toMatch(/Natural Earth/)
      expect(provenance.get(place.id)?.crosscheck).toMatch(/GeoNames \d+ \(\w+\), \d+(\.\d)? km/)
      expect(provenance.get(place.id)?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('accounts for every capital fact: pinned, or listed with a reason', () => {
    const pinned = new Set(Object.values(ATLAS_PLACES).map((p) => p.factId))
    const listed = new Set(manifest.coverage.capitalIssues.map((i) => i.factId))
    for (const fact of capitals.items) expect(pinned.has(fact.id) || listed.has(fact.id), fact.id).toBe(true)
    for (const issue of manifest.coverage.capitalIssues) expect(issue.reason.length).toBeGreaterThan(10)
    // Nothing is ever placed at Null Island.
    for (const p of Object.values(ATLAS_PLACES)) expect(Math.abs(p.lat) + Math.abs(p.lon)).toBeGreaterThan(1)
  })

  it('matches the shipped files byte for byte', () => {
    for (const [file, sum] of Object.entries(ATLAS_CHECKSUMS)) {
      expect(createHash('sha256').update(readFileSync(join(assets, file))).digest('hex'), file).toBe(sum)
    }
  })
})
