/**
 * The tally splitter.
 *
 * One property above all others: **whatever goes in comes out, character for
 * character.** A component that emphasises numbers by rebuilding a translated sentence
 * is one bad regex away from silently dropping a word, and a dropped word in a learning
 * app is the same class of defect as a wrong fact.
 *
 * The second property is that it actually finds the numbers, because the first holds
 * trivially for a splitter that returns its input untouched.
 */

import { describe, expect, it } from 'vitest'
import { splitTally } from './tally.js'

/** Words at even indices, numbers at odd — the contract the component relies on. */
const numbers = (s: string) => splitTally(s).filter((_, i) => i % 2 === 1)

describe('splitTally — nothing is lost', () => {
  for (const value of [
    '0 of 56 learned',
    // Swedish: different words, same shape, and this file knows no Swedish.
    '0 av 56 inlärda',
    // Grouped, so "1,000" must not become "1" and "000" with a stray comma between.
    '1,000 coins',
    // Reachable: the same key renders a sentence in one branch and a count in another.
    'Not started yet',
    // Arabic-Indic. `Intl.NumberFormat('ar')` emits these, and a [0-9] splitter would
    // stop emphasising anything in that locale without failing anywhere.
    '٠ من ٥٦',
    // A narrow no-break space is what fr-FR groups thousands with.
    '1 000 points',
  ]) {
    it(`rebuilds ${JSON.stringify(value)} exactly`, () => {
      expect(splitTally(value).join('')).toBe(value)
    })
  }
})

describe('splitTally — the numbers are found', () => {
  it('finds both sides of a count', () => {
    expect(numbers('0 of 56 learned')).toEqual(['0', '56'])
  })

  it('keeps a grouped number in one run', () => {
    expect(numbers('1,000 coins')).toEqual(['1,000'])
  })

  it('finds Arabic-Indic digits', () => {
    expect(numbers('٠ من ٥٦')).toEqual(['٠', '٥٦'])
  })

  it('finds nothing in a sentence with no numbers, rather than throwing', () => {
    expect(numbers('Not started yet')).toEqual([])
  })

  it('does not swallow the words between two numbers', () => {
    // The failure this is really guarding: a greedy run that ate " of " would render
    // "056 learned". Same characters count, wrong string.
    expect(splitTally('0 of 56 learned')).toEqual(['', '0', ' of ', '56', ' learned'])
  })
})
