/**
 * Home's data, and one question about it: when is it allowed to say "you're offline"?
 *
 * `refreshFailed` was `query.isError || query.isStale`, and `staleTime` is 60 seconds.
 * So a tab left open for a minute on a perfect connection set it, and Home printed
 * "You're offline — lessons still work. We'll sync later." at someone with four bars.
 *
 * The reason it survived is that nothing could see it. `useProgress` had no test,
 * `design:shots` runs against a build with no backend configured — where the query is
 * disabled and the flag is permanently false — and the screen's own tests take
 * `isOffline` as a prop, so they assert the banner renders when told and never ask who
 * is telling it. This file asks.
 */

import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { queryKeys } from '../../lib/query.js'

const PROGRESS = { xpTotal: 120, coins: 30, streak: 4, hearts: 5, level: 2 }

/**
 * A backend that exists, because without one the query never runs.
 *
 * This is not decoration. `isConfigured()` is false in a test environment and in the
 * screenshot harness alike, which disables the query — and a disabled query is never
 * stale, never errors, and pins `refreshFailed` to false no matter what the expression
 * inside it says. That is exactly why the bug survived: every mechanism that could have
 * seen it was looking at a build where the code path did not execute.
 */
vi.mock('../../lib/supabase.js', () => ({
  isConfigured: () => true,
  supabase: () => ({}) as never,
  currentUser: async () => ({ userId: 'u1' }),
}))

const fetchProgress = vi.fn(async () => PROGRESS)
vi.mock('@worldquest/api', () => ({ fetchProgress: () => fetchProgress() }))

const { useProgress } = await import('./useProgress.js')

/**
 * A client with retries off and staleness immediate.
 *
 * `staleTime: 0` is the point: it puts the hook in exactly the situation the bug
 * needed — data in hand, cache stale, network fine — on the first render instead of
 * sixty seconds in.
 */
const wrapper = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return Wrapper
}

const clientWithCachedProgress = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
  })
  client.setQueryData(queryKeys.progress, PROGRESS)
  return client
}

describe('useProgress — when it is allowed to claim the network is down', () => {
  it('does not report a failed refresh just because the cache went stale', async () => {
    // The exact shape of the bug: cached data, `staleTime` elapsed, nothing failed.
    const client = clientWithCachedProgress()
    const { result } = renderHook(() => useProgress(), { wrapper: wrapper(client) })

    await waitFor(() => expect(result.current.data).toEqual(PROGRESS))
    expect(result.current.refreshFailed).toBe(false)
  })

  it('reports a failed refresh when the fetch actually fails and a cache is showing', async () => {
    // The case the banner exists for: numbers on screen, server unreachable. The other
    // test only proves the flag is quiet; without this one, `refreshFailed: false`
    // would pass both.
    fetchProgress.mockRejectedValueOnce(new Error('unreachable'))
    const client = clientWithCachedProgress()
    const { result } = renderHook(() => useProgress(), { wrapper: wrapper(client) })

    await waitFor(() => expect(result.current.refreshFailed).toBe(true))
    expect(result.current.data).toEqual(PROGRESS)
    expect(result.current.status).toBe('ready')
  })
})
