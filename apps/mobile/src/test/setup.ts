/**
 * Test setup — the native modules jsdom cannot provide.
 *
 * Only the modules that reach into a native binary are stubbed. Everything else runs
 * for real: the i18n catalogue, the design tokens, the engines. A test that mocks the
 * thing it is testing proves nothing, and the temptation to stub "just one more"
 * module is how a suite stops describing the app.
 */

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Unmount between tests.
 *
 * Testing Library registers this itself only when vitest runs with `globals: true`.
 * We do not, so without it every render stacks in the same document and queries start
 * failing with "found multiple elements" — which reads like a component bug and is
 * not one.
 */
afterEach(cleanup)

/**
 * MMKV is a JSI module — there is no JavaScript fallback, so importing it in jsdom
 * throws at construction. This in-memory stand-in has the same surface, which is
 * enough for anything that reads or writes a preference.
 */
vi.mock('react-native-mmkv', () => {
  class MemoryMMKV {
    private readonly store = new Map<string, string>()
    getString(key: string): string | undefined {
      return this.store.get(key)
    }
    set(key: string, value: string): void {
      this.store.set(key, value)
    }
    delete(key: string): void {
      this.store.delete(key)
    }
    clearAll(): void {
      this.store.clear()
    }
  }
  return { MMKV: MemoryMMKV }
})

/** Reads the OS locale list. Fixed here so a test is not sensitive to the CI box. */
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-GB', languageCode: 'en' }],
}))

/**
 * NetInfo reaches a native module and ships untranspiled source, so importing it in
 * jsdom fails at parse. The listener is never invoked here — connectivity defaults to
 * online, and any test that needs the other state drives it through
 * `__setOnlineForTests` in `lib/connectivity.ts` rather than through a fake radio.
 */
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    configure: () => {},
    addEventListener: () => () => {},
    fetch: async () => ({ isInternetReachable: true }),
  },
}))

/**
 * Haptics reach a native module. Stubbed rather than asserted-on: what matters is
 * WHICH pattern each outcome uses, and that is a source-level rule the design guard
 * checks. A test that asserts "notificationAsync was called" would pass just as
 * happily with the punishing error pattern.
 */
vi.mock('expo-haptics', () => ({
  notificationAsync: async () => {},
  impactAsync: async () => {},
  selectionAsync: async () => {},
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

/**
 * Notifications reach a native module, and importing the real one drags in
 * `expo/src/async-require/setup.ts`, which fails to resolve in jsdom — so the failure
 * lands as "cannot find module ./setupFastRefresh" in whatever screen happens to import
 * the scheduler, several files from the actual cause.
 *
 * Permission defaults to DENIED here. That is the honest default for a fresh install on
 * iOS, and it means any test that wants a scheduled reminder has to say so — a stub that
 * granted by default would let a screen ship believing the OS always says yes, which is
 * the assumption this feature was built entirely on for four months.
 */
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: false }),
  requestPermissionsAsync: async () => ({ granted: false }),
  scheduleNotificationAsync: async () => 'stub',
  cancelScheduledNotificationAsync: async () => {},
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}))

/**
 * Every test in this suite runs in REDUCED MOTION, and nothing here chose that.
 *
 * jsdom does not implement `window.matchMedia`, and react-native-web answers
 * `AccessibilityInfo.isReduceMotionEnabled()` with `true` when it cannot query the
 * media query. So `useReducedMotion()` resolves true in every component test.
 *
 * Two consequences worth knowing before writing a test about anything that moves:
 *
 * 1. The reduced-motion branch is the one under test, always. That is the branch the
 *    Definition of Done cares most about, so this is a happy accident — but it means
 *    a green suite says nothing about the animated path.
 * 2. The animated path cannot be observed here anyway: `Animated.timing` in jsdom
 *    finishes in a single frame, so a value is at its target on the first render
 *    whether it animated or not. A test asserting "it counts up" would pass against a
 *    hook that does nothing.
 *
 * Motion is therefore guarded at the source (`packages/design/src/motion.test.ts`)
 * and by eye on a device. Deliberately NOT patched to report false: flipping the
 * default would change the branch every existing test exercises, in exchange for an
 * animation jsdom still cannot render.
 *
 * What WAS missing is that the animated branch was never entered by anything at all —
 * not asserted on, not even mounted. A component whose animated path threw on the first
 * render would have passed all 435 tests here, because no test has ever taken it.
 *
 * So the accident becomes a decision. `matchMedia` is stubbed rather than absent, and it
 * still answers "reduced motion, please" by default, so every existing test exercises
 * exactly the branch it always did. `withFullMotion` flips it for a block, which is
 * enough to prove the other branch mounts and renders. Not enough to prove it looks
 * right — nothing in jsdom can be — and that is still the device pass's job.
 */

type MediaQueryListener = (event: { matches: boolean }) => void

let prefersReducedMotion = true

if (typeof window !== 'undefined' && window.matchMedia === undefined) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? prefersReducedMotion : false,
      media: query,
      onchange: null,
      addListener: (_: MediaQueryListener) => {},
      removeListener: (_: MediaQueryListener) => {},
      addEventListener: (_: string, __: MediaQueryListener) => {},
      removeEventListener: (_: string, __: MediaQueryListener) => {},
      dispatchEvent: () => false,
    }),
  })
}

/**
 * Run a block with motion ON.
 *
 * Restored in a `finally`, because a test that leaves this flipped silently moves every
 * test after it onto the other branch — and the whole point of the note above is that
 * which branch runs should be a decision rather than a side effect.
 */
let fullMotionScopes = 0
let preferenceBeforeFullMotion = true

export function withFullMotion<T>(body: () => T): T {
  // Counted, because the restore is not "set it back to true" — it is "set it back to
  // whatever it was". A nested or overlapping call finishing first would otherwise turn
  // reduced motion back on underneath the outer one, which is the same silent-reinstate
  // bug as the async case below, arriving from the other direction.
  if (fullMotionScopes === 0) preferenceBeforeFullMotion = prefersReducedMotion
  fullMotionScopes += 1
  prefersReducedMotion = false

  const restore = (): void => {
    fullMotionScopes -= 1
    if (fullMotionScopes === 0) prefersReducedMotion = preferenceBeforeFullMotion
  }
  // An ASYNC body needs the restore to wait for it. A plain `finally` runs the moment
  // the promise is returned, not when it settles, so an awaited body would have run its
  // interesting part with reduced motion back on — the exact condition the caller turned
  // off, silently reinstated mid-test. Synchronous bodies keep restoring immediately.
  try {
    const result = body()
    if (result instanceof Promise) {
      return result.finally(restore) as T
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

/**
 * react-native-web warns about `shadow*` and `props.pointerEvents` being deprecated.
 * They come from inside react-native-web's own components, not from our code, so the
 * warnings are noise that hides the ones worth reading.
 */
const realWarn = console.warn
console.warn = (...args: unknown[]) => {
  const first = String(args[0] ?? '')
  if (first.includes('deprecated') && first.includes('style props')) return
  realWarn(...args)
}

/**
 * Audio reaches a native module and throws at import in jsdom, exactly like NetInfo
 * and MMKV. The stub resolves so the module graph loads; nothing here asserts that a
 * sound was heard, because a passing "a function was called" test would be equally
 * happy with a buzzer. `sound.test.ts` asserts the rules against the source instead.
 */
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  // expo-audio is imperative where expo-av was promise-based: one player object per
  // sound, created once, with play()/seekTo() called on it. The shape below mirrors
  // exactly what sound.ts touches — a narrower mock would pass while the real call
  // signature drifted.
  createAudioPlayer: () => ({
    volume: 1,
    play: () => {},
    seekTo: async () => {},
    remove: () => {},
  }),
}))
