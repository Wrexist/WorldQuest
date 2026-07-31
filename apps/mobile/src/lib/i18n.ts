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

const CATALOG: Record<string, string> = { ...en, ...enLesson, ...enHome }

/**
 * Minimal ICU: named placeholders and plural branches. Deliberately not a parser —
 * i18next replaces this before any locale beyond English ships.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = CATALOG[key]
  // A missing key is a bug, but a blank screen is worse. Show the key so it is
  // obvious in development and harmless in production.
  if (template === undefined) return key

  return template.replace(
    /\{(\w+)(?:,\s*plural,([^}]*(?:\{[^}]*\}[^}]*)*)\})?\}?/g,
    (match, name: string, plural?: string) => {
      const value = params[name]
      if (value === undefined) return match
      if (!plural) return String(value)

      const n = Number(value)
      const exact = new RegExp(`=${n}\\s*\\{([^}]*)\\}`).exec(plural)
      if (exact) return exact[1]!.replace('#', String(n))
      const form = n === 1 ? /one\s*\{([^}]*)\}/ : /other\s*\{([^}]*)\}/
      const branch = form.exec(plural)
      return branch ? branch[1]!.replace('#', String(n)) : String(value)
    },
  )
}
