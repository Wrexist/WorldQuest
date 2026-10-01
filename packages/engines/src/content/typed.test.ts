import { describe, expect, it } from 'vitest'
import { acceptedSpellings, matchTyped, nearRivals, normaliseTyped } from './typed.js'

describe('normaliseTyped', () => {
  it('ignores case, accents, punctuation and spacing', () => {
    expect(normaliseTyped('  Reykjavík ')).toBe('reykjavik')
    expect(normaliseTyped("Côte d'Ivoire")).toBe('cote d ivoire')
    expect(normaliseTyped('Washington, D.C.')).toBe('washington d c')
    expect(normaliseTyped('SÃO   TOMÉ')).toBe('sao tome')
  })

  it('treats the letters a person types as two ASCII ones as those two', () => {
    expect(normaliseTyped('Strasse')).toBe(normaliseTyped('Straße'))
    expect(normaliseTyped('Aarhus')).toBe('aarhus')
    expect(normaliseTyped('Łódź')).toBe('lodz')
  })

  it('drops a leading article so "the Netherlands" is the Netherlands', () => {
    expect(normaliseTyped('The Netherlands')).toBe('netherlands')
    expect(normaliseTyped('the')).toBe('the')
  })
})

describe('matchTyped', () => {
  const tokyo = ['Tokyo']

  it('accepts the answer however it is capitalised or accented', () => {
    expect(matchTyped('tokyo', tokyo)).toBe('exact')
    expect(matchTyped('TOKYO', tokyo)).toBe('exact')
    expect(matchTyped('Reykjavik', ['Reykjavík'])).toBe('exact')
  })

  it('accepts every spelling it was given, in either language', () => {
    expect(matchTyped('Sverige', ['Sweden', 'Sverige'])).toBe('exact')
    expect(matchTyped('sweden', ['Sweden', 'Sverige'])).toBe('exact')
  })

  it('forgives one slip in a word of five or more, and says it was one', () => {
    expect(matchTyped('Stokholm', ['Stockholm'])).toBe('near')
    expect(matchTyped('Wellignton', ['Wellington'])).toBe('near') // two letters swapped
    expect(matchTyped('Budapets', ['Budapest'])).toBe('near')
  })

  it('forgives two in a very long word and none in a short one', () => {
    expect(matchTyped('Ouagadogu', ['Ouagadougou'])).toBe('near')
    expect(matchTyped('Lomi', ['Lomé'])).toBe('wrong') // four letters: no slack at all
    expect(matchTyped('Tokio', tokyo)).toBe('near') // five letters, one slip
    expect(matchTyped('Tkio', tokyo)).toBe('wrong') // two slips in five letters
  })

  it('never takes a different real answer for a typo', () => {
    expect(matchTyped('Austria', ['Australia'])).toBe('wrong')
    expect(matchTyped('Niger', ['Nigeria'])).toBe('wrong')
    expect(matchTyped('Slovakia', ['Slovenia'])).toBe('wrong')
  })

  it('is exact-only for anything with a digit in it', () => {
    expect(matchTyped('+254', ['+254'])).toBe('exact')
    expect(matchTyped('+255', ['+254'])).toBe('wrong')
    expect(matchTyped('254', ['+254'])).toBe('exact')
  })

  it('counts nothing as wrong', () => {
    expect(matchTyped('', tokyo)).toBe('wrong')
    expect(matchTyped('   ', tokyo)).toBe('wrong')
    expect(matchTyped('!!!', tokyo)).toBe('wrong')
  })

  it('takes only the first sixty characters, so a paste cannot match by being long', () => {
    expect(matchTyped(`tokyo${' '.repeat(100)}and some more`, tokyo)).toBe('exact')
  })
})

describe('acceptedSpellings', () => {
  it('also accepts a name without its comma or bracket', () => {
    expect(acceptedSpellings(['Washington, D.C.'])).toEqual(['Washington, D.C.', 'Washington'])
    expect(acceptedSpellings(['Congo (Kinshasa)'])).toEqual(['Congo (Kinshasa)', 'Congo'])
  })

  it('drops empties and repeats', () => {
    expect(acceptedSpellings(['Oslo', undefined, '', 'Oslo'])).toEqual(['Oslo'])
  })
})

describe('rivals: a different real answer is not a typo', () => {
  it('refuses the neighbouring currency, even though it is one letter away', () => {
    // Danish "krone", Swedish "krona": a slip at one is exactly the other.
    expect(matchTyped('krona', ['krone'])).toBe('near')
    expect(matchTyped('krona', ['krone'], ['krona'])).toBe('wrong')
    expect(matchTyped('krone', ['krone'], ['krona'])).toBe('exact')
  })

  it('still forgives a slip that is not another answer', () => {
    expect(matchTyped('kroner', ['krone'], ['krona'])).toBe('near')
  })

  it('is judged on the folded form, like everything else', () => {
    expect(matchTyped('KRÓNA', ['krone'], ['krona'])).toBe('wrong')
  })
})

describe('nearRivals', () => {
  it('keeps only the other answers a slip could be mistaken for', () => {
    expect(nearRivals(['krone'], ['krona', 'krone', 'peso', 'kroner', 'yen'])).toEqual(['krona', 'kroner'])
  })

  it('never lists an accepted spelling as its own rival', () => {
    expect(nearRivals(['Denmark'], ['Denmark', 'denmark'])).toEqual([])
  })

  it('leaves numbers out: a code is exact-only already', () => {
    expect(nearRivals(['+254'], ['+255'])).toEqual([])
  })
})
