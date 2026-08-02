import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { motion } from './tokens.js'

const src = join(import.meta.dirname)
const primitivesDir = join(src, 'primitives')

const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const read = (path: string): string => stripComments(readFileSync(path, 'utf8'))

describe('motion tokens', () => {
  it('orders the scale from instant to celebrate', () => {
    // A "quick" that is slower than "base" is the kind of thing nobody notices in
    // review and everybody feels on a device.
    expect(motion.instant.duration).toBeLessThan(motion.quick.duration)
    expect(motion.quick.duration).toBeLessThan(motion.base.duration)
    expect(motion.base.duration).toBeLessThan(motion.expressive.duration)
    expect(motion.expressive.duration).toBeLessThan(motion.celebrate.duration)
  })

  it('keeps every duration inside what a user will wait for', () => {
    // Past a second, an animation stops being feedback and becomes a delay.
    for (const [name, step] of Object.entries(motion)) {
      if (!('duration' in step)) continue
      expect(step.duration, name).toBeGreaterThan(0)
      expect(step.duration, name).toBeLessThanOrEqual(1000)
    }
  })
})

describe('the motion helper', () => {
  const source = read(join(src, 'motion.ts'))

  it('subscribes to the reduced-motion setting rather than reading it once', () => {
    // Read once at module load and a user who turns the setting on mid-session — the
    // user who most needs it — keeps getting the animations.
    expect(source).toContain('reduceMotionChanged')
    expect(source).toMatch(/subscription\??\.remove/)
  })

  it('survives a renderer that has nothing to unsubscribe', () => {
    // react-native-web returns `undefined` from addEventListener for this event, so
    // an unguarded `subscription.remove()` threw on EVERY unmount of any component
    // that reads reduced motion. It sat here undetected until the first screen used
    // it — the splash — and then crashed the app on the way out of boot.
    //
    // Asserted on the source rather than by mocking, because the thing that must stay
    // true is the shape of the call, and a mock returning undefined would be a test
    // that passes the moment someone re-adds a platform branch instead.
    expect(source).toMatch(/subscription\?\.remove\?\.\(\)/)
    expect(source).not.toMatch(/[^?]\bsubscription\.remove\(\)/)
  })

  it('collapses duration to zero rather than skipping the animation', () => {
    // The usual way this is implemented wrong: skip the animation and the value
    // never lands, so a card that should have appeared simply is not there.
    // Reduced motion means less movement, not less feedback.
    expect(source).toMatch(/duration:\s*reduced\s*\?\s*0/)
  })

  it('drives every animation on the native driver', () => {
    // Off the native driver, an animation runs on the JS thread and stutters the
    // moment anything else is happening — which on this app is a lesson being graded.
    const timings = source.match(/Animated\.(timing|spring)\(/g) ?? []
    const native = source.match(/useNativeDriver:\s*true/g) ?? []
    expect(native.length).toBeGreaterThanOrEqual(timings.length - 1)
  })
})

describe('primitives honour reduced motion', () => {
  const sources = readdirSync(primitivesDir)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ file, code: read(join(primitivesDir, file)) }))

  it('never animates without checking the setting', () => {
    for (const { file, code } of sources) {
      if (!code.includes('Animated.')) continue
      const checks =
        code.includes('isReduceMotionEnabled') ||
        code.includes('useReducedMotion') ||
        code.includes('useTiming') ||
        code.includes('useAnimatedTo')
      expect(checks, `${file} animates without honouring reduced motion`).toBe(true)
    }
  })

  it('uses no raw duration literals', () => {
    // A hardcoded 300ms is a value that cannot be tuned, cannot be themed, and does
    // not collapse when the user asks for less movement.
    // `as const` on the tokens narrows each duration to its literal, so the Set has
    // to be widened to `number` before an arbitrary parsed value can be looked up.
    const allowed = new Set<number>(
      Object.values(motion).flatMap((step) => ('duration' in step ? [step.duration as number] : [])),
    )
    for (const { file, code } of sources) {
      for (const match of code.matchAll(/duration:\s*(\d+)/g)) {
        const value = Number(match[1])
        expect(
          allowed.has(value) || value === 0,
          `${file} uses a raw duration of ${value}ms — add a motion token`,
        ).toBe(true)
      }
    }
  })
})
