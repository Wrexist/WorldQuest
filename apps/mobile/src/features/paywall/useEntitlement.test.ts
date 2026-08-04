/**
 * The cache in front of the entitlement.
 *
 * These assert one thing above all others: **no local state, however broken, ever
 * hands out Premium.** A device-local entitlement is a free subscription for anyone
 * willing to edit a file or change a clock, so every ambiguous input here must fall to
 * free rather than to "keep what you had".
 *
 * Each test loads the module fresh. That is not ceremony — the cache is module state,
 * and a test that reused it would be asserting against the *previous* test's answer
 * instead of against what a cold start actually reads off the device.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { NO_SUBSCRIPTION, type Subscription } from '@worldquest/engines'

const store = new Map<string, string>()

// The real module reaches for MMKV, which has no native side in jsdom. Mocking the
// storage seam rather than MMKV itself keeps the test about the entitlement.
vi.mock('../../lib/storage.js', () => ({
  readJson: (key: string) => {
    const raw = store.get(key)
    if (raw === undefined) return null
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  },
  writeJson: (key: string, value: unknown) => void store.set(key, JSON.stringify(value)),
}))

const KEY = 'subscription.v1'

/** A cold start: a new module instance reading whatever is on the device. */
const boot = async () => {
  vi.resetModules()
  return await import('./useEntitlement.js')
}

const NOW = Date.parse('2026-08-03T12:00:00Z')
const DAY = 86_400_000

const premium = (over: Partial<Subscription> = {}): Subscription => ({
  ...NO_SUBSCRIPTION,
  status: 'active',
  tier: 'premium',
  expiresAt: NOW + 30 * DAY,
  willRenew: true,
  ...over,
})

/** What the server would have written before the app launched. */
const onDevice = (value: unknown): void => {
  store.set(KEY, typeof value === 'string' ? value : JSON.stringify(value))
}

beforeEach(() => store.clear())

describe('useEntitlement', () => {
  it('gives a fresh install nothing', async () => {
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.tier).toBe('free')
    expect(result.current.isPremium).toBe(false)
  })

  it('re-renders every reader when the server row arrives', async () => {
    // `useSyncExternalStore` rather than a per-hook `useState`: Settings and the lesson
    // route both read this, and a renewal that updated one of them would show a user
    // Premium in one place and a paywall in the other.
    const { useEntitlement, setSubscription } = await boot()
    const a = renderHook(() => useEntitlement(NOW))
    const b = renderHook(() => useEntitlement(NOW))
    act(() => setSubscription(premium()))
    expect(a.result.current.isPremium).toBe(true)
    expect(b.result.current.isPremium).toBe(true)
  })

  it('survives a restart — the whole point of caching it', async () => {
    const first = await boot()
    act(() => first.setSubscription(premium()))

    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.tier).toBe('premium')
  })

  it('falls to FREE on a row that parses but says nothing', async () => {
    // The one place in the app where a lenient parse would hand out the product.
    onDevice({ somethingElse: true })
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.tier).toBe('free')
  })

  it('falls to FREE on a corrupt row rather than on the last good answer', async () => {
    onDevice('{ not json')
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.tier).toBe('free')
  })

  it('ignores a hand-edited row claiming premium with no status', async () => {
    // The obvious attack, and the reason the shape check is not just a type cast.
    onDevice({ tier: 'family' })
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.tier).toBe('free')
  })

  it('keeps access through a failed charge and asks for a fix', async () => {
    // The branch worth money. Revoking access the instant a renewal fails converts a
    // bank's fraud heuristic into a churned subscriber.
    onDevice(premium({ status: 'in_grace' }))
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.isPremium).toBe(true)
    expect(result.current.needsBillingFix).toBe(true)
    expect(result.current.isPaused).toBe(false)
  })

  it('pauses extras on hold without calling it free-with-nothing-wrong', async () => {
    // A paused user must get "fix your card", not a paywall. Showing the wrong one
    // loses a subscriber who wanted to stay.
    onDevice(premium({ status: 'on_hold' }))
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.isPaused).toBe(true)
    expect(result.current.needsBillingFix).toBe(true)
  })

  it('counts a trial down so the reminder can beat the surprise', async () => {
    onDevice(premium({ status: 'trialing', expiresAt: NOW + 2 * DAY }))
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.isTrialing).toBe(true)
    expect(result.current.trialDaysLeft).toBe(2)
    // Access, but not revenue. Forecasting cares about the difference.
    expect(result.current.isPaying).toBe(false)
  })

  it('expires a stale row by its own date, offline or not', async () => {
    // The store notification may never arrive on a device that stayed offline.
    // Trusting the row would be an unlimited free trial for anyone in aeroplane mode.
    onDevice(premium({ status: 'trialing', expiresAt: NOW + DAY }))
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW + 2 * DAY))
    expect(result.current.tier).toBe('free')
  })

  it('spots a leaver while they are still here', async () => {
    onDevice(premium({ willRenew: false }))
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.winbackWorthShowing).toBe(true)
    // And they still have what they paid for, right to the end of the term.
    expect(result.current.isPremium).toBe(true)
  })

  it('does not re-offer a trial that has been spent', async () => {
    // Re-offering one is a promise the store refuses at the till.
    onDevice({ ...NO_SUBSCRIPTION, hasUsedTrial: true })
    const { useEntitlement } = await boot()
    const { result } = renderHook(() => useEntitlement(NOW))
    expect(result.current.trialAvailable).toBe(false)
  })
})
