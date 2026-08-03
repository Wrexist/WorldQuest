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

  it('keeps the one JS-driven animation to the one that has to be', () => {
    // The rule above allows a single exception, and this names it so the slack cannot
    // be spent silently by the next animation somebody adds.
    //
    // `useCountUp` animates TEXT CONTENT, so the value has to be readable in JS. A
    // native-driven value lives on the UI thread and its JS listener never fires — the
    // animation would run perfectly and the number on screen would never move. That is
    // a bug with no symptom in review and no symptom in these tests, because jsdom
    // completes every animation in one frame regardless.
    const exceptions = source.match(/useNativeDriver:\s*false/g) ?? []
    expect(exceptions).toHaveLength(1)
    const countUp = source.slice(source.indexOf('export function useCountUp'))
    expect(countUp.slice(0, countUp.indexOf('export function', 1))).toContain(
      'useNativeDriver: false',
    )
  })

  it('lands the count-up on its target rather than one short', () => {
    // Animated listeners are throttled and the final frame is not guaranteed, so a
    // count-up that only listens reliably stops at 39 of 40. The completion callback
    // is what makes the number true.
    expect(source).toMatch(/\}\)\.start\(\(\)\s*=>\s*setValue\(target\)\)/)
  })
})

describe('primitives honour reduced motion', () => {
  const sources = readdirSync(primitivesDir)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ file, code: read(join(primitivesDir, file)) }))

  /**
   * A primitive may animate if it reads the setting itself, or if it gets its timing
   * from one of these. The list is checked against reality by the test below it —
   * without that, this is an allowlist that anyone can widen by adding a name, which
   * is the opposite of a guard.
   */
  const SAFE = [
    'isReduceMotionEnabled',
    'useReducedMotion',
    'useTiming',
    'useAnimatedTo',
    'useCelebration',
    'useFacePress',
  ] as const

  it('never animates without checking the setting', () => {
    for (const { file, code } of sources) {
      if (!code.includes('Animated.')) continue
      const checks = SAFE.some((name) => code.includes(name))
      expect(checks, `${file} animates without honouring reduced motion`).toBe(true)
    }
  })

  it('every helper on that list actually honours it', () => {
    // The allowlist above says "these helpers can be trusted". This is what makes that
    // true rather than asserted. `useFacePress` is the case that matters: it lives in
    // press3d.tsx, animates the face of every button and answer option in the product,
    // and honours the setting only because it takes its duration from `useTiming`. If
    // someone inlines a duration there to "make the press snappier", the button stops
    // respecting an accessibility setting and nothing else in the suite would notice.
    const helperFiles = [
      read(join(primitivesDir, '..', 'motion.ts')),
      read(join(primitivesDir, 'press3d.tsx')),
    ].join('\n')

    for (const name of SAFE) {
      if (name === 'isReduceMotionEnabled' || name === 'useReducedMotion') continue
      const defined = new RegExp(`(function|const)\\s+${name}\\b`).test(helperFiles)
      expect(defined, `${name} is trusted by the allowlist but defined nowhere`).toBe(true)
    }

    // And every one of those definitions sits in a file that reads the setting.
    for (const code of [read(join(primitivesDir, '..', 'motion.ts')), read(join(primitivesDir, 'press3d.tsx'))]) {
      expect(
        code.includes('isReduceMotionEnabled') || code.includes('useTiming'),
        'a trusted motion helper does not consult the reduced-motion setting',
      ).toBe(true)
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
