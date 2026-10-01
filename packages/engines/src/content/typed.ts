/**
 * Judging a typed answer.
 *
 * Choosing among four options is RECOGNITION: the answer is on screen and the question is
 * whether it looks right. Typing it is RECALL, and recall is the harder and longer-lasting
 * thing — the testing-effect research is about producing, not picking. It is also the one
 * Duolingo exercise this app did not have, and the one that tells a learner who knows
 * "Reykjavík" from one who knows "it was the one that starts with R".
 *
 * ## Fair, not forgiving
 *
 * A typed answer is wrong in ways a tapped one cannot be: a missing accent, a capital letter,
 * a slip of the thumb on a phone keyboard. Marking those wrong would teach a child that they do
 * not know Tokyo because they typed "tokio". So the judgement has three outcomes:
 *
 * - `exact` — the same after folding case, accents, punctuation, spacing and a leading "the".
 * - `near`  — one letter wrong in a word of five or more (two in a word of nine or more): a typo.
 *   Counts as RIGHT, and the learner is shown the real spelling. Never for anything with a
 *   digit in it — "+254" and "+255" are one edit apart and different countries.
 * - `wrong` — everything else, including a different real answer. "Austria" for Australia is two
 *   edits and is wrong; "Niger" for Nigeria likewise.
 *
 * Pure: no clock, no randomness.
 */

export type TypedMatch = 'exact' | 'near' | 'wrong'

/**
 * The `chosenOptionId` of a typed answer that matched nothing.
 *
 * A typed answer is sent to the Worker as an OPTION ID, like every other answer: the one
 * correct option's id when the text matched, and this when it did not. The text itself never
 * leaves the device — a child typing into a box is the shape of input a privacy review should
 * not have to think about, and the server never needed it, since all it decides is right or
 * wrong against a key it already holds.
 */
export const TYPED_WRONG = '~wrong'

/** Longest answer taken. Longer is somebody pasting, and no name here is this long. */
export const MAX_TYPED_LENGTH = 60

/** Case, accents, punctuation, spacing and a leading article — the things that are not the answer. */
export function normaliseTyped(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Ligatures and letters NFD leaves alone but a person types as two ASCII ones.
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/ı/g, 'i')
    .replace(/['’`´.,;:!?()\[\]{}"“”+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|der|die|das|le|la|les|el|los|las|il|lo|den|det|en|ett) /, '')
}

/** Optimal-string-alignment distance: insert, delete, substitute, or swap two neighbours. */
function distance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...new Array<number>(cols - 1).fill(0)])
  for (let j = 0; j < cols; j++) d[0]![j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1)
      d[i]![j] = best
    }
  }
  return d[rows - 1]![cols - 1]!
}

/**
 * How many slips a name of this length forgives.
 *
 * Two only from eleven letters. Nine was tried first and let "Austria" through for Australia,
 * two edits apart: a slip is a slip in a word long enough that one letter does not change
 * which word it is, and the countries that are two edits from each other are all shorter than
 * this. One slip from five letters, none below — "Lima" and "Lome" are a letter apart and are
 * different cities.
 */
const forgiven = (length: number): number => (length >= 11 ? 2 : length >= 5 ? 1 : 0)

/**
 * @param rivals other REAL answers that sit within a typo of an accepted one — the Swedish
 * "krona" beside the Danish "krone". A typed answer that is exactly a rival is that other thing,
 * not a slip at this one, so it is wrong however close it is. Without it, forgiving a typo
 * would mark a Swedish answer right for Denmark.
 */
export function matchTyped(text: string, accepts: readonly string[], rivals: readonly string[] = []): TypedMatch {
  const typed = normaliseTyped(text.slice(0, MAX_TYPED_LENGTH))
  if (typed === '') return 'wrong'
  const targets = [...new Set(accepts.map(normaliseTyped).filter((t) => t !== ''))]
  if (targets.includes(typed)) return 'exact'
  if (rivals.some((rival) => normaliseTyped(rival) === typed)) return 'wrong'
  // A number is its digits; one off is a different number.
  if (/\d/.test(typed) || targets.some((t) => /\d/.test(t))) return 'wrong'
  for (const target of targets) {
    if (Math.abs(target.length - typed.length) > 2) continue
    if (distance(typed, target) <= forgiven(target.length)) return 'near'
  }
  return 'wrong'
}

/**
 * The other real answers within two edits of an accepted spelling.
 *
 * Computed where the question is built, so it travels with the question and the judge needs no
 * view of the rest of the pack. Short on purpose: only labels that could be MISTAKEN for an
 * accepted one, which is what `matchTyped` needs them for.
 */
export function nearRivals(accepts: readonly string[], others: readonly string[]): string[] {
  const targets = [...new Set(accepts.map(normaliseTyped).filter((t) => t !== ''))]
  const own = new Set(targets)
  const out = new Set<string>()
  for (const other of others) {
    const folded = normaliseTyped(other)
    if (folded === '' || own.has(folded) || /\d/.test(folded)) continue
    if (targets.some((t) => Math.abs(t.length - folded.length) <= 2 && distance(folded, t) <= 2)) out.add(other)
  }
  return [...out]
}

/**
 * Every spelling a typed answer may take, from the labels a fact or an entity carries.
 *
 * A name with a comma or a bracket is also accepted without it — "Washington, D.C." as
 * "Washington", "Congo (Kinshasa)" as "Congo" — because nobody types the qualifier and the
 * qualifier is not the thing being asked.
 */
export function acceptedSpellings(labels: readonly (string | undefined)[]): string[] {
  const out = new Set<string>()
  for (const label of labels) {
    if (label === undefined || label.trim() === '') continue
    out.add(label)
    const head = label.split(/[,(]/)[0]!.trim()
    if (head !== '' && head !== label) out.add(head)
  }
  return [...out]
}
