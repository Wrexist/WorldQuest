/**
 * Server state has exactly one owner (PROJECT.md §9).
 *
 * TanStack Query owns everything that comes from Supabase; Zustand and component
 * state own only what the device decides. Copying server state into a store is the
 * mistake this exists to prevent — the copy goes stale, the two disagree, and the bug
 * reports say "my XP is wrong on one screen".
 *
 * ## Why the cache is persisted
 *
 * A returning user must see their real streak in the first frame, not a skeleton and
 * then a jump. The persisted cache makes the app usable offline on a cold start
 * without a single special case in a screen: a query returns its cached data
 * immediately and refetches in the background.
 *
 * ## Why MMKV rather than AsyncStorage
 *
 * The persister API is async, but MMKV underneath is synchronous, so the restore
 * completes within the first frame rather than one tick later. One tick is exactly
 * long enough to render an empty state and then replace it.
 */

import { useState, type ReactNode } from 'react'
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { AppState, type AppStateStatus } from 'react-native'
import { readJson, remove, writeJson } from './storage.js'

/** Cached data older than this is not restored — a week-old streak is a lie. */
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => Promise.resolve(readJson<string>(key)),
    setItem: (key, value) => {
      writeJson(key, value)
      return Promise.resolve()
    },
    removeItem: (key) => {
      remove(key)
      return Promise.resolve()
    },
  },
  key: 'query.cache.v1',
  // The values are already JSON — `readJson` parses and `writeJson` stringifies, so
  // the persister's own serialisation would double-encode them.
  serialize: (client) => client as unknown as string,
  deserialize: (cached) => cached as never,
})

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Progress changes when the user finishes a lesson, which the app knows about
        // directly — so polling is waste. A minute of staleness costs nothing and
        // saves a request on every tab switch.
        staleTime: 60_000,
        gcTime: MAX_CACHE_AGE_MS,
        // A phone loses connectivity constantly. Three retries with backoff covers a
        // lift or a tunnel; more than that is a battery cost with no payoff.
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
        // React Native has no window focus. `focusManager` below drives this from
        // AppState instead, which is the actual equivalent.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // Mutations are NOT retried here. Lesson submission goes through the sync
        // queue, which owns its own retry policy and its own idempotency key — two
        // layers retrying the same request is how a lesson gets graded twice.
        retry: false,
      },
    },
  })
}

/**
 * Foreground/background, not window focus.
 *
 * Registered once at module load rather than in an effect: the subscription is
 * process-wide, and mounting it per-provider leaks a listener on every fast refresh.
 */
onlineManager.setEventListener(() => () => {})

AppState.addEventListener('change', (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active')
})

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created once per mount, never on re-render: a fresh QueryClient discards every
  // cached query, which reads to the user as the app forgetting everything.
  const [client] = useState(makeClient)

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, maxAge: MAX_CACHE_AGE_MS }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}

/** Query keys in one place, so a typo cannot silently create a second cache entry. */
export const queryKeys = {
  progress: ['progress'] as const,
  subscription: ['subscription'] as const,
} as const
