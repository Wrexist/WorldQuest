/**
 * i18n shim for Phase 1.
 *
 * The real i18next setup lands in week 3 (docs/plan/build-order.md). What matters
 * NOW is the call shape: every string goes through `t()` with a key and params, so
 * swapping the implementation is a one-file change instead of a sweep through every
 * screen. Retrofitting i18n is the shortcut that costs the most.
 */

import en from '../../../../packages/i18n/locales/en/common.json'
import enLesson from '../../../../packages/i18n/locales/en/lesson.json'
import enHome from '../../../../packages/i18n/locales/en/home.json'
import enNav from '../../../../packages/i18n/locales/en/nav.json'

const CATALOG: Record<string, string> = { ...en, ...enLesson, ...enHome, ...enNav }

/**
 * Minimal ICU: named placeholders and plural branches. Deliberately not a parser —
 * i18next replaces this before any locale beyond English ships.
 */
/**
 * Minimal ICU: named placeholders and plural branches.
 *
 * Deliberately a small hand parser rather than a regex — a regex cannot match the
 * balanced braces in `{count, plural, one {# friend online} other {...}}`, and the
 * previous one leaked the raw pattern to the screen. i18next replaces this before
 * any locale beyond English ships.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = CATALOG[key]
  // A missing key is a bug, but a blank screen is worse. Show the key so it is
  // obvious in development and harmless in production.
  if (template === undefined) return key
  return format(template, params)
}

function format(template: string, params: Record<string, string | number>): string {
  let out = ''
  let i = 0

  while (i < template.length) {
    if (template[i] !== '{') {
      out += template[i]
      i++
      continue
    }

    const end = matchBrace(template, i)
    if (end === -1) {
      out += template[i]
      i++
      continue
    }

    const body = template.slice(i + 1, end)
    const comma = body.indexOf(',')
    const name = (comma === -1 ? body : body.slice(0, comma)).trim()
    const value = params[name]

    if (value === undefined) {
      out += template.slice(i, end + 1)
    } else if (comma === -1) {
      out += String(value)
    } else {
      out += plural(body.slice(comma + 1), Number(value), params)
    }

    i = end + 1
  }

  return out
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return -1
}

function plural(spec: string, n: number, params: Record<string, string | number>): string {
  // Exact matches (=0, =1) win over keywords, per ICU.
  const branches = new Map<string, string>()
  let i = 0
  while (i < spec.length) {
    while (i < spec.length && /[\s,]/.test(spec[i]!)) i++
    let selector = ''
    while (i < spec.length && spec[i] !== '{') selector += spec[i++]
    if (i >= spec.length) break
    const end = matchBrace(spec, i)
    if (end === -1) break
    branches.set(selector.trim(), spec.slice(i + 1, end))
    i = end + 1
  }

  const chosen =
    branches.get(`=${n}`) ??
    (n === 1 ? branches.get('one') : undefined) ??
    branches.get('other') ??
    ''
  return format(chosen.replace(/#/g, String(n)), params)
}
