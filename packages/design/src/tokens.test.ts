import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  colors,
  contrastFloors,
  gradient,
  layout,
  motion,
  radius,
  space,
  typography,
} from './tokens.js'
import { FONT_FAMILIES, fontFamily, text } from './typography.js'

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
    // Gradients are semantic too — a component asks for `gradient.card`, never for a
    // pair of hexes, so an unresolved reference here is the same class of failure.
    walk(gradient, 'gradient')
  })

  it('gives every gradient two concrete stops and an angle', () => {
    for (const [name, spec] of Object.entries(gradient)) {
      expect(spec.from, `gradient.${name}.from`).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(spec.to, `gradient.${name}.to`).toMatch(/^#[0-9a-fA-F]{6}$/)
      // A gradient whose stops are equal is a flat fill wearing a costume — it costs
      // a native view and buys nothing.
      expect(spec.from, `gradient.${name} has identical stops`).not.toBe(spec.to)
      expect(spec.angle).toBeTypeOf('number')
    }
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

  it('keeps the native window background in step with the canvas token', () => {
    // The splash screen and the window behind the JS bundle are painted by the OS
    // before any JavaScript runs, so they cannot read a token — the value has to be
    // duplicated into app.json. Duplication without a guard is drift, and the symptom
    // is a coloured flash on every cold start that nobody can reproduce on a
    // simulator with a fast disk.
    //
    // This lives here, rather than in the app, because it is an assertion ABOUT the
    // tokens. It reads a file; it does not import one, so the dependency direction
    // in the shipped bundle is unchanged.
    const appJsonPath = join(import.meta.dirname, '..', '..', '..', 'apps', 'mobile', 'app.json')
    const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')) as {
      expo: {
        backgroundColor: string
        primaryColor: string
        splash: { backgroundColor: string }
        android: { adaptiveIcon: { backgroundColor: string } }
      }
    }

    expect(appJson.expo.backgroundColor.toLowerCase()).toBe(colors.bg.canvas.toLowerCase())
    expect(appJson.expo.android.adaptiveIcon.backgroundColor.toLowerCase()).toBe(
      colors.bg.canvas.toLowerCase(),
    )
    // The splash's own backdrop is the third copy, and it is the one a user sees for
    // longest: it is what fills the screen either side of the splash image on any
    // aspect ratio the image does not cover.
    expect(appJson.expo.splash.backgroundColor.toLowerCase()).toBe(colors.bg.canvas.toLowerCase())

    // `primaryColor` is Android's accent — the tint on a notification, among other
    // native chrome. It read `#F5A61E`, which is in no token file: it is the "warm gold"
    // from the Style Block in asset-prompts.md, a colour for PROMPTING an image model,
    // and it had drifted into shipped configuration where it matched nothing a user sees.
    // The gold the app actually renders XP and coins in is `colors.reward.xp` — asserted
    // against the semantic token, not the palette entry behind it, for the same reason
    // every component does: the palette is an implementation detail of the semantics.
    expect(appJson.expo.primaryColor.toLowerCase()).toBe(colors.reward.xp.toLowerCase())
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

  it('gives every interactive primitive a role and a state', () => {
    // ARIA props, not `accessibilityRole`/`accessibilityState`.
    //
    // React Native 0.71+ accepts both and maps ARIA to the native accessibility API,
    // but react-native-web SILENTLY DROPS `accessibilityState` — no aria-checked, no
    // aria-disabled, nothing. So on the web build every switch and every disabled
    // control was unlabelled, and no test could have caught it, because the attribute
    // simply was not in the tree. ARIA props survive both targets and are assertable.
    for (const { file, code } of sources) {
      if (!code.includes('Pressable')) continue
      expect(code, `${file} has a Pressable with no role`).toMatch(/\brole=/)
      expect(code, `${file} has a Pressable with no aria state`).toMatch(/\baria-(disabled|checked|selected|busy)=/)
    }
  })

  it('never puts a handler on a View instead of a Pressable', () => {
    // `onTouchEnd` fires for a finger and for nothing else — no mouse click, no
    // keyboard, and crucially no screen-reader activation, because VoiceOver
    // dispatches an accessibility action rather than a touch sequence.
    //
    // The TabBar shipped this way: the app's primary navigation, inert on web and
    // unreachable with a screen reader on every platform. It looked right and it
    // worked when poked with a finger, which is exactly why nobody caught it.
    for (const { file, code } of sources) {
      expect(code, `${file} uses onTouchEnd — use a Pressable with onPress`).not.toMatch(
        /onTouchEnd=\{/,
      )
      expect(code, `${file} uses onTouchStart — use a Pressable with onPress`).not.toMatch(
        /onTouchStart=\{/,
      )
    }
  })

  it('honours reduced motion wherever it animates', () => {
    // Either it reads the setting itself, or it takes its timing from a helper that
    // does. `motion.test.ts` owns the list of trusted helpers and proves each one
    // actually honours the setting; this is the same rule stated from the token side.
    for (const { file, code } of sources) {
      if (!code.includes('Animated.')) continue
      const honoured =
        code.includes('isReduceMotionEnabled') ||
        code.includes('useTiming') ||
        code.includes('useAnimatedTo') ||
        code.includes('useCelebration') ||
        code.includes('useFacePress')
      expect(honoured, `${file} animates without checking reduced motion`).toBe(true)
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

describe('type is set in a font that exists', () => {
  it('has a real font file for every weight the scale asks for', () => {
    // `fontFamily: 'Inter', fontWeight: '700'` does NOT give you bold Inter on React
    // Native — each weight is a separate file and therefore a separate family. If a
    // scale step names a weight the token map has no file for, `text()` silently
    // falls back to the nearest one and the design quietly drifts.
    for (const [step, spec] of Object.entries(typography.scale)) {
      const face = (typography.face as Record<string, string>)[step]!
      const weights = Object.keys((typography.font as Record<string, object>)[face]!)
      expect(weights, `${step} wants ${face} ${spec.weight}`).toContain(spec.weight)
    }
  })

  it('names every family the app has to load', () => {
    // A family in the tokens that nobody loads renders as the system font — a
    // different face entirely on Android, and close enough to miss on iOS.
    expect(FONT_FAMILIES.length).toBeGreaterThan(0)
    for (const family of FONT_FAMILIES) {
      // `@expo-google-fonts` names files `Nunito_600SemiBold`. The loader keys off
      // exactly this string, so a typo here is a silently missing font.
      expect(family).toMatch(/^[A-Za-z0-9]+_\d{3}[A-Za-z]+$/)
    }
  })

  it('never pairs fontWeight with a custom family in a primitive', () => {
    // The whole point of `text()`. On iOS this renders regular weight; on Android it
    // synthesises a smeared fake bold. It looks correct on whichever simulator the
    // author happened to open, which is why review does not catch it.
    for (const { file, code } of sources) {
      expect(code, `${file} sets fontWeight — use text(step, { weight }) instead`).not.toMatch(
        /fontWeight\s*:/,
      )
    }
  })

  it('resolves a missing weight to the nearest one rather than to undefined', () => {
    // The fallback is a safety net, not a routine path — but a screen a user is
    // looking at should degrade to slightly-wrong type, never to a crash.
    expect(fontFamily('display', '100')).toBe(typography.font.display['700'])
    expect(fontFamily('body', '900')).toBe(typography.font.body['800'])
  })

  it('builds a complete style from one call', () => {
    const h2 = text('h2')
    expect(h2.fontFamily).toBe('Nunito_800ExtraBold')
    expect(h2.fontSize).toBe(typography.scale.h2.size)
    expect(h2.lineHeight).toBe(typography.scale.h2.lineHeight)

    // Tabular by default where digits change, so a counter does not jitter.
    expect(text('numeric').fontVariant).toEqual(['tabular-nums'])
    expect(text('body').fontVariant).toBeUndefined()

    // Casing comes from the token, and the opt-out is explicit.
    expect(text('overline').textTransform).toBe('uppercase')
    expect(text('overline', { transform: 'none' }).textTransform).toBeUndefined()
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
