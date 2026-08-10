import { describe, expect, it } from 'vitest'
import { focusToParams, parseFocusParams } from './params.js'

describe('focusToParams', () => {
  it('writes nothing for an unfocused lesson', () => {
    // `/lesson` has to stay exactly what it was: the daily reminder opens it, the taster
    // opens it, and neither should suddenly carry an empty query string.
    expect(focusToParams({}, undefined)).toBe('')
  })

  it('carries every dimension that was chosen', () => {
    const query = focusToParams(
      { attributes: ['capital'], entities: ['SE', 'NO'], difficulty: { min: 1, max: 2 } },
      10,
    )
    const params = new URLSearchParams(query)

    expect(params.get('attr')).toBe('capital')
    expect(params.get('entity')).toBe('SE,NO')
    expect(params.get('min')).toBe('1')
    expect(params.get('max')).toBe('2')
    expect(params.get('len')).toBe('10')
  })

  it('round-trips', () => {
    const focus = { attributes: ['flag'], entities: ['JP'], difficulty: { min: 4, max: 5 } }
    const parsed = parseFocusParams(
      Object.fromEntries(new URLSearchParams(focusToParams(focus, 20))),
    )

    expect(parsed.attributes).toEqual(['flag'])
    expect(parsed.entities).toEqual(['JP'])
    expect(parsed.difficulty).toEqual({ min: 4, max: 5 })
    expect(parsed.length).toBe(20)
  })
})

describe('parseFocusParams — a URL is not to be trusted', () => {
  it('reads an empty query as no focus at all', () => {
    const parsed = parseFocusParams({})

    expect(parsed.attributes).toEqual([])
    expect(parsed.entities).toEqual([])
    expect(parsed.region).toBeUndefined()
    expect(parsed.difficulty).toBeUndefined()
    expect(parsed.length).toBeUndefined()
  })

  it('drops a length outside what the engine will build', () => {
    // A link asking for 500 questions, or half a question. Dropping it falls back to the
    // measured size rather than clamping to a number nobody asked for.
    expect(parseFocusParams({ len: '500' }).length).toBeUndefined()
    expect(parseFocusParams({ len: '0' }).length).toBeUndefined()
    expect(parseFocusParams({ len: '7.5' }).length).toBeUndefined()
    expect(parseFocusParams({ len: 'lots' }).length).toBeUndefined()
    expect(parseFocusParams({ len: '20' }).length).toBe(20)
  })

  it('drops a difficulty outside the authored scale', () => {
    expect(parseFocusParams({ min: '0' }).difficulty).toBeUndefined()
    expect(parseFocusParams({ max: '9' }).difficulty).toBeUndefined()
    expect(parseFocusParams({ min: '2', max: '4' }).difficulty).toEqual({ min: 2, max: 4 })
  })

  it('swaps an inverted band rather than producing an empty lesson', () => {
    // The one parse that would fail CLOSED. `min: 4, max: 2` matches nothing at all, and
    // somebody who wrote it meant 2..4 — an empty lesson is the least useful reading.
    expect(parseFocusParams({ min: '4', max: '2' }).difficulty).toEqual({ min: 2, max: 4 })
  })

  it('ignores blanks and stray whitespace in a list', () => {
    expect(parseFocusParams({ entity: 'SE, ,NO,' }).entities).toEqual(['SE', 'NO'])
    expect(parseFocusParams({ attr: '' }).attributes).toEqual([])
  })

  it('passes a region code through without judging it', () => {
    // This module does not know what regions exist and must not learn — the route
    // expands the code against the index, and a code nobody is in yields no entities,
    // which the focus builder reads as "no filter". Widening is the safe way to fail.
    expect(parseFocusParams({ region: 'EU' }).region).toBe('EU')
    expect(parseFocusParams({ region: 'NOPE' }).region).toBe('NOPE')
    expect(parseFocusParams({ region: '' }).region).toBeUndefined()
  })
})
