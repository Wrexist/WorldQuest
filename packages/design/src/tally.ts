/**
 * Where a formatted count stops being words and starts being numbers.
 *
 * The pure half of `primitives/Tally.tsx`, in its own module and not beside it, for a
 * mechanical reason worth writing down: this package's vitest runs `environment: node`
 * over `.test.ts` files only, with no JSX transform — so a test that imported the
 * component to reach this function would fail to parse before it ran a single
 * assertion. The risky part of that primitive is this regex, and the risky part is the
 * part that has to be testable.
 *
 * (Also why it is `src/tally.ts` rather than `primitives/tally.ts`: a file differing
 * from `Tally.tsx` only in the case of one letter is a trap on a case-insensitive
 * filesystem.)
 */

/**
 * Split into alternating word and number runs, keeping every character.
 *
 * `split` with a capturing group rather than `match`, so separators, spaces and the
 * words between the numbers all survive in order. A tally that dropped the word between
 * two numbers would be a wrong string, which is worse than an unstyled one.
 */
const RUNS = /(\p{N}[\p{N},.\u00A0\u202F]*\p{N}|\p{N})/gu

/**
 * Exported, and tested on its own, because this is the only part that can be wrong.
 *
 * The component around it renders what this returns; the risk lives entirely here, in a
 * regex that rebuilds a translated sentence. `packages/design`'s vitest is node-only, so
 * a pure function is also the only part of a primitive this package CAN test — which is
 * the second reason to keep the interesting half out of the JSX.
 *
 * Returns alternating runs starting with a (possibly empty) word run, so index parity is
 * the whole answer: even is words, odd is numbers.
 */
export function splitTally(value: string): readonly string[] {
  return value.split(RUNS)
}
