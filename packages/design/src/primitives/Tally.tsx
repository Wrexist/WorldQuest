/**
 * A count, with the numbers reading as numbers.
 *
 * ## The mechanic, and where it came from
 *
 * Two references restyled this app and both did the same thing to every count on
 * screen: **"0 / 56 learned" sets the digits brighter and heavier than the words
 * around them.** It appears on the Home quest card, on the world card, and on all six
 * continent tiles — and it is the difference between a line that reads as a score and
 * one that reads as a caption. Ours drew "0 of 56 learned" in one flat colour, so the
 * only numbers on the Explore screen had exactly the weight of the word "learned".
 *
 * That is the whole graft. It is typography, not layout, which is why it survives the
 * palette being rejected: the reference's canvas and brand colour are not adoptable and
 * this is.
 *
 * ## Why it takes a formatted STRING and not `{ current, total }`
 *
 * Because the alternative breaks the one rule this repo will not bend on copy.
 *
 * A component taking two numbers has to decide where the word "learned" goes, and that
 * is the translator's decision, not this file's. `t('explore:region.progress', …)` has
 * already put the numbers where the grammar wants them — this only changes how the
 * result is painted. `packages/i18n/CLAUDE.md`: never concatenate.
 *
 * So: format through ICU as usual, hand the result here, and the digit runs get the
 * emphasis. Word order, plural form and the position of the separator all stay with
 * whoever wrote the locale file. In Swedish "0 av 56 inlärda" emphasises 0 and 56
 * without this file knowing a word of Swedish.
 *
 * ## `\p{N}` and not `[0-9]`
 *
 * Arabic-Indic digits are digits. `Intl.NumberFormat` emits them for `ar`, which is a
 * locale this app intends to reach — `lint:a11y` already checks RTL — and a `[0-9]`
 * split would quietly stop emphasising anything at all there rather than failing
 * loudly. The Unicode property escape costs nothing and is right everywhere.
 */

import { Text, type StyleProp, type TextStyle } from 'react-native'
import { splitTally } from '../tally.js'

export type TallyProps = {
  /** Already formatted and already translated — e.g. `t('explore:region.progress', …)`. */
  readonly children: string
  /** The style for the WORDS. */
  readonly style?: StyleProp<TextStyle>
  /** What the digits get on top of it: a brighter colour, a heavier face, or both. */
  readonly numberStyle?: StyleProp<TextStyle>
}

export function Tally({ children, style, numberStyle }: TallyProps) {
  const parts = splitTally(children)

  return (
    <Text style={style}>
      {parts.map((part, i) =>
        // Odd indices are the captured number runs — `split` with one capturing group
        // always alternates, so this needs no second test against the pattern.
        i % 2 === 1 ? (
          <Text key={i} style={numberStyle}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  )
}
