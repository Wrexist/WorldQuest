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
