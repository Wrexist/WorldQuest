/**
 * The hook that closes the loop between the server and the entitlement cache.
 *
 * `useEntitlement` read a cache and `setSubscription` wrote it, and for the whole life
 * of the paywall nothing connected the two — so the cache held `NO_SUBSCRIPTION` for
 * ever and a paying user would have been shown the paywall. These tests are about that
 * wire existing, and about it never carrying anything in the dangerous direction.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { SubscriptionRow } from '@worldquest/api'

const store = new Map<string, string>()
const fetchSubscription = vi.fn<() => Promise<SubscriptionRow>>()
let configured = true

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

vi.mock('@worldquest/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchSubscription: () => fetchSubscription(),
}))

vi.mock('../../lib/supabase.js', () => ({
  currentUser: async () => ({ id: 'user-1' }),
  isConfigured: () => configured,
  supabase: () => ({}),
}))

const PREMIUM: SubscriptionRow = {
  status: 'active',
  tier: 'premium',
  expiresAt: Date.parse('2027-01-01T00:00:00Z'),
  willRenew: true,
  hasUsedTrial: true,
}

/**
 * A cold start. The entitlement cache is module state, so a test reusing it would be
 * asserting against the previous test's answer rather than what a fresh launch reads.
 */
const boot = async () => {
  vi.resetModules()
  const sync = await import('./useSubscriptionSync.js')
  const entitlement = await import('./useEntitlement.js')
  return { ...sync, ...entitlement }
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  store.clear()
  configured = true
  fetchSubscription.mockReset()
})

describe('useSubscriptionSync', () => {
  it('writes what the server said into the entitlement cache', async () => {
    fetchSubscription.mockResolvedValue(PREMIUM)
    const { useSubscriptionSync, useEntitlement } = await boot()

    const { result } = renderHook(
      () => {
        useSubscriptionSync()
        return useEntitlement(Date.parse('2026-08-03T00:00:00Z'))
      },
      { wrapper },
    )

    await waitFor(() => expect(result.current.isPremium).toBe(true))
    expect(result.current.subscription.status).toBe('active')
  })

  it('leaves the user free when there is no backend configured', async () => {
    configured = false
    const { useSubscriptionSync, useEntitlement } = await boot()

    const { result } = renderHook(
      () => {
        useSubscriptionSync()
        return useEntitlement(Date.parse('2026-08-03T00:00:00Z'))
      },
      { wrapper },
    )

    expect(fetchSubscription).not.toHaveBeenCalled()
    expect(result.current.isPremium).toBe(false)
  })

  it('does not grant Premium when the fetch fails', async () => {
    // The failure direction that matters. An unreachable server must never be read as
    // "assume they paid" — the free tier is the safe answer and the honest one.
    fetchSubscription.mockRejectedValue(new Error('offline'))
    const { useSubscriptionSync, useEntitlement } = await boot()

    const { result } = renderHook(
      () => {
        useSubscriptionSync()
        return useEntitlement(Date.parse('2026-08-03T00:00:00Z'))
      },
      { wrapper },
    )

    await waitFor(() => expect(fetchSubscription).toHaveBeenCalled())
    expect(result.current.isPremium).toBe(false)
  })

  it('lets an expired cached row lapse on its own date, not on the server answering', async () => {
    // Stale-while-revalidate is correct here in one direction only: a cached 'active'
    // row whose `expiresAt` has passed reports free immediately, because `entitlementOf`
    // compares the date against the clock. The cache cannot extend access.
    fetchSubscription.mockResolvedValue(PREMIUM)
    const { useSubscriptionSync, useEntitlement } = await boot()

    const { result } = renderHook(
      () => {
        useSubscriptionSync()
        // A year after the row expires.
        return useEntitlement(Date.parse('2028-01-01T00:00:00Z'))
      },
      { wrapper },
    )

    await waitFor(() => expect(fetchSubscription).toHaveBeenCalled())
    expect(result.current.subscription.status).toBe('active')
    expect(result.current.isPremium).toBe(false)
  })
})
