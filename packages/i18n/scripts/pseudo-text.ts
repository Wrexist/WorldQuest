/**
 * The pseudo-localisation transform, as a pure function.
 *
 * Separated from the script that writes files so it can be tested. Its one hard
 * invariant — placeholders and ICU structure survive untouched — is exactly the kind
 * of thing that breaks silently and wastes a designer's afternoon.
 */

/** Enough expansion to match the worst real language, no more. */
export const EXPANSION = 0.4

/** Visually distinct, still readable, still Latin — so a designer can judge the layout. */
const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', n: 'ñ', c: 'ç', s: 'š', z: 'ž',
  A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', Y: 'Ý', N: 'Ñ', C: 'Ç', S: 'Š', Z: 'Ž',
}

/** Accent the letters, then pad to the target width so the overflow is visible. */
function decorate(plain: string): string {
  if (plain === '') return ''
  const accented = [...plain].map((ch) => ACCENTS[ch] ?? ch).join('')
  const padding = Math.round(plain.replace(/[\s#]/g, '').length * EXPANSION)
  return accented + '·'.repeat(padding)
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(value: string, open: number): number {
  let depth = 0
  for (let i = open; i < value.length; i++) {
    if (value[i] === '{') depth++
    else if (value[i] === '}' && --depth === 0) return i
  }
  return -1
}

/**
 * Transforms the literal text of an ICU message and nothing else.
 *
 * The naive version — leave everything between braces alone — is far too blunt. In
 * `{count, plural, =0 {No streak yet} other {# day streak}}` ALL of the visible copy
 * lives inside braces, so a blunt pass expands it by zero percent. The strings most
 * likely to overflow a layout are precisely the ones it would skip.
 *
 * So: placeholder names, argument types and plural selectors are structure and stay
 * verbatim; the branch bodies are copy and get pseudo-localised. Accenting `{count}`
 * would give `{çóúñt}`, which no longer matches the parameter the code passes, and
 * the string would silently render as its own pattern.
 */
export function pseudo(value: string): string {
  let out = ''
  let plain = ''
  let i = 0

  const flush = (): void => {
    out += decorate(plain)
    plain = ''
  }

  while (i < value.length) {
    if (value[i] !== '{') {
      plain += value[i]
      i++
      continue
    }
    const end = matchBrace(value, i)
    if (end === -1) {
      plain += value[i]
      i++
      continue
    }
    flush()
    out += pseudoArgument(value.slice(i, end + 1))
    i = end + 1
  }

  flush()
  return out
}

/** One `{...}` block, braces included. */
function pseudoArgument(block: string): string {
  const body = block.slice(1, -1)
  const comma = body.indexOf(',')

  // A bare `{name}` is nothing but structure.
  if (comma === -1) return block

  // `count,` — the argument name, which must survive untouched.
  let out = body.slice(0, comma + 1)
  const rest = body.slice(comma + 1)

  let i = 0
  while (i < rest.length) {
    if (rest[i] === '{') {
      const end = matchBrace(rest, i)
      if (end === -1) {
        out += rest[i]
        i++
        continue
      }
      // A branch body: real copy, recursively pseudo-localised.
      out += `{${pseudo(rest.slice(i + 1, end))}}`
      i = end + 1
    } else {
      // The argument type and the selectors: ` plural, =0 `, ` one `, ` number `.
      out += rest[i]
      i++
    }
  }

  return `{${out}}`
}
