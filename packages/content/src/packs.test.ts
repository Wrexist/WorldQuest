import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const packsDir = join(import.meta.dirname, '..', 'packs')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.json') ? [full] : []
  })

type Fact = {
  id?: string
  entity?: string
  attribute?: string
  value?: { names?: Record<string, string> }
  source?: { name?: string; url?: string; verifiedAt?: string }
  volatility?: string
  quizzable?: boolean
  sensitivity?: string
}

/**
 * Templates carry an `attribute` too, so filtering on that alone counts them as
 * unsourced facts. A fact is the thing that belongs to an entity.
 */
const isFact = (item: Fact): boolean => item.entity !== undefined

const packs = walk(packsDir).map((file) => ({
  file,
  pack: JSON.parse(readFileSync(file, 'utf8')) as {
    locales: string[]
    items: Fact[]
    license?: string
  },
}))

describe('content packs', () => {
  it('finds at least one pack', () => {
    expect(packs.length).toBeGreaterThan(0)
  })

  it('records a licence on every pack', () => {
    for (const { file, pack } of packs) {
      expect(pack.license, `${file} has no licence`).toBeTruthy()
    }
  })

  it('sources and dates every fact', () => {
    // A wrong fact is the worst defect this product can ship. Sourcing is the
    // only thing standing between us and a plausible guess.
    for (const { file, pack } of packs) {
      for (const item of pack.items.filter(isFact)) {
        expect(item.source?.name, `${file} ${item.id} has no source`).toBeTruthy()
        expect(item.source?.verifiedAt, `${file} ${item.id} has no verifiedAt`).toBeTruthy()
      }
    }
  })

  it('never makes a volatile fact quizzable', () => {
    for (const { file, pack } of packs) {
      for (const item of pack.items.filter((i) => i.volatility === 'fast')) {
        expect(item.quizzable, `${file} ${item.id} is fast-volatility but quizzable`).toBe(false)
      }
    }
  })

  it('holds sensitive items back from quizzing until a human signs off', () => {
    for (const { file, pack } of packs) {
      for (const item of pack.items.filter((i) => i.sensitivity === 'review-required')) {
        expect(item.quizzable, `${file} ${item.id} is unreviewed but quizzable`).toBe(false)
      }
    }
  })

  it('provides a value for every shipped locale', () => {
    for (const { file, pack } of packs) {
      for (const item of pack.items.filter((i) => i.value?.names)) {
        for (const locale of pack.locales) {
          expect(item.value!.names![locale], `${file} ${item.id} missing ${locale}`).toBeTruthy()
        }
      }
    }
  })

  it('keeps fact ids unique and in the documented format', () => {
    const seen = new Set<string>()
    for (const { file, pack } of packs) {
      for (const item of pack.items.filter(isFact)) {
        expect(item.id, `${file} has a fact with no id`).toBeTruthy()
        expect(item.id!, `${item.id} is malformed`).toMatch(/^[a-z0-9]+\.[A-Z0-9-]+\.[a-z0-9-]+$/)
        expect(seen.has(item.id!), `${item.id} is duplicated`).toBe(false)
        seen.add(item.id!)
      }
    }
  })
})
