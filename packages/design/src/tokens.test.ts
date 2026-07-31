import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { colors, contrastFloors, layout, motion, radius, space, typography } from './tokens.js'

const primitivesDir = join(import.meta.dirname, 'primitives')
/** Comments discuss the very things these tests grep for, so strip them first. */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const sources = readdirSync(primitivesDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, code: stripComments(readFileSync(join(primitivesDir, f), 'utf8')) }))

describe('token integrity', () => {
  it('resolves every semantic colour to a concrete value', () => {
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        // An unresolved {palette.x.y} reference means the generator silently failed.
        expect(node, `${path} is unresolved`).not.toMatch(/^\{.*\}$/)
        return
      }
      if (Array.isArray(node)) return
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
      }
    }
    walk(colors, 'colors')
  })

  it('matches the documented scale exactly', () => {
    // An 8-point grid with 4-point half-steps. Asserting the literal list is
    // stronger than a modulo check: it catches an added value as well as a
    // malformed one, and the whole point is that no other value exists.
    expect(Object.values(space)).toEqual([0, 4, 8, 12, 16, 24, 32, 40, 48, 64])
  })

  it('exposes the documented scales', () => {
    expect(Object.keys(radius)).toEqual(['sm', 'md', 'lg', 'xl', '2xl', 'full'])
    expect(typography.scale.body.size).toBe(16)
    expect(typography.maxFontScale).toBeGreaterThanOrEqual(2)
    expect(layout.minTouchTarget).toBeGreaterThanOrEqual(44)
    expect(motion.celebrate.duration).toBeLessThanOrEqual(1000)
  })

  it('states a reduced-motion duration well under the expressive one', () => {
    expect(motion.reducedMotion.duration).toBeLessThan(motion.expressive.duration)
  })
})

describe('primitives obey the token discipline', () => {
  it('contains no hardcoded hex colours', () => {
    // The one rule that makes theming, high-contrast mode and seasonal events
    // possible. CI enforces it because review will not catch every instance.
    for (const { file, code } of sources) {
      const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
      // '#000' in a shadowColor is the one allowed literal — a shadow is not a
      // themeable surface, it is an absence of light.
      const offending = hexes.filter((h) => h !== '#000')
      expect(offending, `${file} hardcodes ${offending.join(', ')}`).toEqual([])
    }
  })

  it('contains no off-scale spacing literals', () => {
    const allowed = new Set(Object.values(space) as number[])
    for (const { file, code } of sources) {
      const props = code.matchAll(/(?:padding|margin|gap)(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*(\d+)/g)
      for (const m of props) {
        const value = Number(m[1])
        expect(allowed.has(value), `${file} uses ${value}px, which is off the scale`).toBe(true)
      }
    }
  })

  it('gives every interactive primitive an accessibility role', () => {
    for (const { file, code } of sources) {
      if (!code.includes('Pressable')) continue
      expect(code, `${file} has a Pressable with no accessibilityRole`).toContain('accessibilityRole')
      expect(code, `${file} has a Pressable with no accessibilityState`).toContain('accessibilityState')
    }
  })

  it('honours reduced motion wherever it animates', () => {
    for (const { file, code } of sources) {
      if (!code.includes('Animated.')) continue
      expect(code, `${file} animates without checking reduced motion`).toContain(
        'isReduceMotionEnabled',
      )
    }
  })

  it('pairs every iOS shadow with an Android elevation', () => {
    // iOS shadows simply do not render on Android — a shadow without elevation is
    // a component that looks flat on half our users' devices.
    for (const { file, code } of sources) {
      const shadows = (code.match(/shadowOpacity/g) ?? []).length
      const elevations = (code.match(/elevation:/g) ?? []).length
      expect(elevations, `${file} has ${shadows} shadows but ${elevations} elevations`)
        .toBeGreaterThanOrEqual(shadows)
    }
  })
})

describe('contrast floors', () => {
  const lum = (hex: string): number => {
    const h = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
    return (hi + 0.05) / (lo + 0.05)
  }

  it('meets AA for body text on every surface', () => {
    for (const bg of [colors.bg.canvas, colors.bg.surface, colors.bg.surfaceRaised]) {
      expect(ratio(colors.text.primary, bg)).toBeGreaterThanOrEqual(contrastFloors.bodyText)
      expect(ratio(colors.text.secondary, bg)).toBeGreaterThanOrEqual(contrastFloors.bodyText)
    }
  })

  it('meets the large-text floor for button labels', () => {
    for (const bg of [colors.action.primary, colors.action.secondary, colors.action.destructive]) {
      expect(ratio(colors.text.onAccent, bg)).toBeGreaterThanOrEqual(contrastFloors.largeText)
    }
  })

  it('keeps the wrong-answer surface visually calm, not alarming', () => {
    // A red flash reads as punishment. The token must stay far from the danger red.
    expect(ratio(colors.feedback.wrong, colors.status.hearts)).toBeGreaterThan(1.5)
  })
})
