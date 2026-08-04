/**
 * Prices, and the four ways there are none.
 *
 * The port ships as a stub that *fails*, so the unhappy path is the one that runs
 * today and on every device in a tunnel. These tests exist because the failure a
 * paywall usually ships with is a spinner that never stops.
 */

import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePurchases } from './usePurchases.js'
import { SAMPLE_PLANS, UNAVAILABLE, type PurchasePort } from './purchases.js'

const port = (over: Partial<PurchasePort> = {}): PurchasePort => ({
  plans: async () => SAMPLE_PLANS,
  purchase: async () => ({ kind: 'purchased' }),
  restore: async () => ({ kind: 'purchased' }),
  manageBilling: async () => {},
  ...over,
})

describe('usePurchases', () => {
  it('starts by asking rather than by assuming', async () => {
    const { result } = renderHook(() => usePurchases(port()))
    expect(result.current.loading).toBe(true)
    expect(result.current.plans).toEqual([])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plans).toHaveLength(2)
  })

  it('shows no prices rather than invented ones when the store will not answer', async () => {
    // A paywall that guesses a price is a paywall that charges a different number
    // than the one it showed.
    const { result } = renderHook(() => usePurchases(UNAVAILABLE))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.failed).toBe(true)
    expect(result.current.plans).toEqual([])
  })

  it('stops loading on failure — the spinner every paywall ships with', async () => {
    const { result } = renderHook(() =>
      usePurchases(port({ plans: async () => Promise.reject(new Error('no network')) })),
    )
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.loading).toBe(false)
  })

  it('can be asked again, and clears the failure while it tries', async () => {
    let attempt = 0
    const { result } = renderHook(() =>
      usePurchases(
        port({
          plans: async () => {
            attempt += 1
            if (attempt === 1) throw new Error('flaky')
            return SAMPLE_PLANS
          },
        }),
      ),
    )
    await waitFor(() => expect(result.current.failed).toBe(true))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.plans).toHaveLength(2))
    expect(result.current.failed).toBe(false)
  })

  it('does not write into a screen that has already gone', async () => {
    // The user dismisses the paywall while the store is still thinking. Setting state
    // afterwards is a warning today and a leak on a screen that gets opened often.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderHook(() =>
      usePurchases(
        port({ plans: async () => new Promise((r) => setTimeout(() => r(SAMPLE_PLANS), 5)) }),
      ),
    )
    unmount()
    await new Promise((r) => setTimeout(r, 20))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reports what the store said about a purchase and grants nothing itself', async () => {
    // The entitlement arrives from the server, never from here. A port that returned
    // `{ premium: true }` would be a free subscription for anyone with a proxy.
    const purchase = vi.fn(async () => ({ kind: 'cancelled' }) as const)
    const { result } = renderHook(() => usePurchases(port({ purchase })))
    await expect(result.current.purchase('annual')).resolves.toEqual({ kind: 'cancelled' })
    expect(purchase).toHaveBeenCalledWith('annual')
    expect(Object.keys(result.current)).not.toContain('isPremium')
  })

  it('offers restore and a way to fix a declined card', async () => {
    const restore = vi.fn(async () => ({ kind: 'purchased' }) as const)
    const manageBilling = vi.fn(async () => {})
    const { result } = renderHook(() => usePurchases(port({ restore, manageBilling })))
    await result.current.restore()
    act(() => result.current.manageBilling())
    expect(restore).toHaveBeenCalledOnce()
    expect(manageBilling).toHaveBeenCalledOnce()
  })
})
