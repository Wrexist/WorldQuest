import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resetChildAccount, setChildAccount, track } from './analytics.js'

/**
 * `track` only console.logs today — PostHog lands later. That is exactly why these
 * assert on whether it emits AT ALL rather than on a transport: the rule has to be
 * right before there is anything to leak to, and the day the transport arrives is the
 * day it stops being fixable quietly.
 */
const logged = () => vi.spyOn(console, 'log').mockImplementation(() => {})

beforeEach(() => resetChildAccount())
afterEach(() => vi.restoreAllMocks())

describe('analytics — the child rule', () => {
  it('emits nothing for a child account', () => {
    const spy = logged()
    setChildAccount(true)
    track('app_opened', {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('emits nothing before we know who is holding the phone', () => {
    // THE bug this file exists for. `isChildAccount` defaulted to `false` and
    // `setChildAccount` was never called from anywhere in the app, so the no-op could
    // only ever be skipped. Unknown is not permission.
    const spy = logged()
    track('app_opened', {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('emits for an adult once the age gate has answered', () => {
    const spy = logged()
    setChildAccount(false)
    track('app_opened', {})
    expect(spy).toHaveBeenCalled()
  })

  it('goes silent again on reset, as a sign-out must', () => {
    const spy = logged()
    setChildAccount(false)
    resetChildAccount()
    track('app_opened', {})
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('analytics — the wiring', () => {
  it('is actually called from the app, not just exported', () => {
    // The whole failure was an unreferenced setter. A unit test of the gate would
    // have passed happily while nothing on any screen ever set it.
    const layout = readFileSync(
      join(import.meta.dirname, '..', '..', 'app', '_layout.tsx'),
      'utf8',
    )
    expect(layout).toMatch(/setChildAccount\(/)
  })

  it('never defaults the flag to "adult"', () => {
    const source = readFileSync(join(import.meta.dirname, 'analytics.ts'), 'utf8')
    expect(source).not.toMatch(/isChildAccount\s*(:\s*boolean\s*)?=\s*false/)
  })
})
