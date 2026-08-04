import { describe, expect, it } from 'vitest'
import { clamp, err, ok, seededRng, shuffle } from './index.js'

describe('seededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRng(1234)
    const b = seededRng(1234)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 10 }, seededRng(1).next)
    const b = Array.from({ length: 10 }, seededRng(2).next)
    expect(a).not.toEqual(b)
  })

  it('stays within [0, 1)', () => {
    const rng = seededRng(99)
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly uniform', () => {
    const rng = seededRng(7)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(rng.next() * 10)]!++
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9_000)
      expect(count).toBeLessThan(11_000)
    }
  })
})

describe('shuffle', () => {
  it('preserves every element', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffle(input, seededRng(5))
    expect(out).toHaveLength(input.length)
    expect([...out].sort((a, b) => a - b)).toEqual(input)
  })

  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5]
    const copy = [...input]
    shuffle(input, seededRng(5))
    expect(input).toEqual(copy)
  })

  it('is deterministic for a given seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    expect(shuffle(input, seededRng(3))).toEqual(shuffle(input, seededRng(3)))
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], seededRng(1))).toEqual([])
    expect(shuffle(['only'], seededRng(1))).toEqual(['only'])
  })
})

describe('clamp', () => {
  it('bounds a value on both sides', () => {
    expect(clamp(5, 1, 10)).toBe(5)
    expect(clamp(-3, 1, 10)).toBe(1)
    expect(clamp(99, 1, 10)).toBe(10)
  })
})

describe('Result', () => {
  it('distinguishes success from failure without throwing', () => {
    // Expected failures are values. Throws are for programmer error only.
    const good = ok(42)
    const bad = err({ code: 'offline', message: 'No connection' })
    expect(good.ok).toBe(true)
    expect(bad.ok).toBe(false)
    if (good.ok) expect(good.value).toBe(42)
    if (!bad.ok) expect(bad.error.code).toBe('offline')
  })
})
