/**
 * What happens when what came off disk is not what this build expects.
 *
 * `JSON.parse` proves the bytes are JSON and nothing more, so every `readJson<T>` was a
 * cast over a value written by an older build, edited on a rooted device, or truncated by
 * a full disk. The failures are not hypothetical and not cosmetic: spreading a non-array
 * throws, indexing `undefined` throws, assigning a key to a number throws, and `"3" + 1`
 * is `"31"`.
 *
 * These are the adversarial cases — the shapes a user cannot produce by playing, and
 * which nothing in the app could recover from once stored.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAll,
  isFiniteNumber,
  isNumberArray,
  isNumberRecord,
  isRecord,
  peekJson,
  readJson,
  writeJson,
} from './storage.js'

const KEY = 'test.shape.v1'

/** Writes a raw string, bypassing `writeJson` — which is how a bad value gets there. */
const poison = (raw: string): void => writeJson(KEY, JSON.parse(raw))

beforeEach(() => clearAll())

describe('shape predicates', () => {
  it('rejects the two things typeof "object" also admits', () => {
    // `typeof null === 'object'` and `typeof [] === 'object'`, and both reach code that
    // expects to index or assign a key.
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord({})).toBe(true)
  })

  it('rejects a record with a non-number in it', () => {
    expect(isNumberRecord({ '2026-08-18': 3 })).toBe(true)
    expect(isNumberRecord({ '2026-08-18': '3' })).toBe(false)
    expect(isNumberRecord({ '2026-08-18': null })).toBe(false)
  })

  it('rejects NaN and Infinity, which JSON cannot hold but a build could write', () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false)
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isFiniteNumber(0)).toBe(true)
    expect(isNumberArray([1, 2])).toBe(true)
    expect(isNumberArray([1, '2'])).toBe(false)
    expect(isNumberArray({})).toBe(false)
  })
})

describe('readJson', () => {
  it('returns the value when the shape holds', () => {
    writeJson(KEY, { a: 1 })
    expect(readJson(KEY, isNumberRecord)).toEqual({ a: 1 })
  })

  it('returns null and DROPS the entry when the shape fails', () => {
    poison('[1,2,3]')
    expect(readJson(KEY, isNumberRecord)).toBeNull()
    // Dropped, not merely refused. Keeping it means re-reading the same unusable value on
    // every launch for ever; dropping it costs a cache and restores a working app.
    expect(readJson(KEY)).toBeNull()
  })

  it('still returns anything at all when no shape is given', () => {
    // The unguarded overload is unchanged, so no existing caller changed behaviour.
    poison('[1,2,3]')
    expect(readJson(KEY)).toEqual([1, 2, 3])
  })
})

describe('peekJson', () => {
  it('reports a bad shape as corrupt and repairs nothing', () => {
    poison('5')
    const { value, corrupt } = peekJson(KEY, isRecord)
    expect(value).toBeNull()
    expect(corrupt).toBe(true)
    // Still there: this function runs inside a render, where a delete is a side effect
    // React would perform twice under StrictMode. The caller repairs it in an effect.
    expect(readJson(KEY)).toBe(5)
  })
})
