/**
 * Type styles.
 *
 * ## The trap this exists to close
 *
 * On React Native, `fontFamily` and `fontWeight` do NOT combine for a custom font.
 * Writing
 *
 *     { fontFamily: 'Inter', fontWeight: '700' }
 *
 * gets you regular Inter on iOS and a synthetically smeared fake-bold on Android.
 * Each weight is a separate font file and therefore a separate family name —
 * `Inter_700Bold` is not a bold variant of `Inter`, it is its own family.
 *
 * That is easy to get wrong once and impossible to spot in review, because it looks
 * right on the simulator the author happened to use. So the weight is not something a
 * component sets: `text()` resolves the scale step to the family that actually
 * contains that weight, and `tokens.test.ts` fails any primitive that sets
 * `fontWeight` at all.
 *
 * ## Why a helper rather than more tokens
 *
 * Every component was hand-assembling four properties — family, size, line height,
 * letter spacing — from three different token objects, and a mismatched line height
 * is invisible until two screens sit side by side. One call, one source of truth.
 *
 *     const styles = StyleSheet.create({
 *       title: { ...text('h2'), color: colors.text.primary },
 *       count: { ...text('numeric'), color: colors.reward.xp },
 *     })
 *
 * Spec: docs/design/design-system.md §5
 */

import type { TextStyle } from 'react-native'
import { typography } from './tokens.js'

// `TypeScale` is generated alongside the tokens; re-exported here so a component
// only ever imports from one place.
import type { TypeScale } from './tokens.js'
export type { TypeScale }
export type FontFace = keyof typeof typography.font

export type TextOptions = {
  /** Override the step's default weight — e.g. a caption that needs to be bold. */
  readonly weight?: string
  /**
   * Tabular numerals: every digit the same width, so a counter or timer does not
   * jitter as it ticks. On by default for the `numeric` step.
   */
  readonly numeric?: boolean
  /**
   * Opt out of the step's casing. Only `overline` has one, and only the tab bar
   * needs the escape hatch — the mockup sets tab labels in title case while the
   * badge text they share a size with is uppercase. Stating it at the call site
   * beats a local `fontSize: 10` that quietly leaves the scale.
   */
  readonly transform?: 'none' | 'uppercase'
}

/**
 * The family name for a face at a weight.
 *
 * Falls back to the nearest available weight rather than throwing. A missing weight
 * should degrade to slightly-wrong type, not to a crash on a screen a user is looking
 * at — and the token test asserts every weight the scale asks for actually exists, so
 * the fallback is a safety net rather than a routine path.
 */
export function fontFamily(face: FontFace, weight: string): string {
  const family = typography.font[face] as Record<string, string>
  const exact = family[weight]
  if (exact !== undefined) return exact

  const available = Object.keys(family)
    .map(Number)
    .sort((a, b) => Math.abs(a - Number(weight)) - Math.abs(b - Number(weight)))
  return family[String(available[0])]!
}

/** A complete type style for a scale step. Spread it; add colour separately. */
export function text(scale: TypeScale, options: TextOptions = {}): TextStyle {
  const step = typography.scale[scale] as {
    size: number
    lineHeight: number
    weight: string
    letterSpacing: number
    transform?: string
  }
  const face = typography.face[scale] as FontFace
  const weight = options.weight ?? step.weight
  const tabular = options.numeric ?? scale === 'numeric'
  const transform = options.transform ?? step.transform

  return {
    fontFamily: fontFamily(face, weight),
    fontSize: step.size,
    lineHeight: step.lineHeight,
    letterSpacing: step.letterSpacing,
    ...(transform === 'uppercase' ? { textTransform: 'uppercase' as const } : {}),
    ...(tabular ? { fontVariant: ['tabular-nums' as const] } : {}),
  }
}

/**
 * Every family the app must load before its first frame.
 *
 * Derived from the tokens rather than listed by hand: adding a weight to
 * `tokens.json` and forgetting to load it renders that text in the system font, which
 * on Android is a different face entirely and on iOS is close enough to miss.
 */
export const FONT_FAMILIES: readonly string[] = Object.values(typography.font).flatMap(
  (weights) => Object.values(weights as Record<string, string>),
)
