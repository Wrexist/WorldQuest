/**
 * Pull the server's subscription row into the local cache.
 *
 * `useEntitlement` has always read a cache, and `setSubscription` has always been the
 * one way to write it. Until this hook existed, nothing called it — so the cache was
 * seeded once with `NO_SUBSCRIPTION` and stayed there for ever. Every entitlement check
 * in the app was answering "free" from a value the server had never been asked about.
 *
 * That is not a security hole — the client deciding it was Premium would be the hole,
 * and the absence of any writer made that impossible — but it does mean a paying user
 * would have been shown the paywall. The gap is the other half of ADR 0006: the server
 * decides, and the client has to actually go and read the decision.
 *
 * ## Why a query rather than a fetch in an effect
 *
 * The same reasons as `useProgress`: the cache is persisted, so a returning subscriber
 * gets their real status in the first frame instead of a flash of the free tier; a
 * refetch on reconnect is one option rather than a hand-rolled listener; and an offline
 * launch renders the last known answer instead of failing.
 *
 * **Stale-while-revalidate is the correct behaviour here, in one direction only.** An
 * expired row still shows Premium until the network answers — and that is fine, because
 * `entitlementOf` compares `expiresAt` against the clock and reports free the moment it
 * passes, whatever the cached status says. The cache cannot extend access on its own.
 *
 * Spec: docs/systems/monetization.md · docs/adr/0006-server-authoritative-progress.md
 */

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSubscription, type SubscriptionRow } from '@worldquest/api'
import type { Subscription } from '@worldquest/engines'
import { currentUser, isConfigured, supabase } from '../../lib/supabase.js'
import { queryKeys } from '../../lib/query.js'
import { setSubscription } from './useEntitlement.js'

/**
 * `SubscriptionRow` and `Subscription` are the same shape by construction — the API
 * package declares the fields structurally so it need not depend on `packages/engines`,
 * which the dependency rule forbids. This assignment is where that claim is checked: if
 * either side gains a field, this stops compiling rather than silently dropping it.
 */
const asSubscription = (row: SubscriptionRow): Subscription => row

export function useSubscriptionSync(): void {
  const { data } = useQuery({
    queryKey: queryKeys.subscription,
    queryFn: async (): Promise<SubscriptionRow> => {
      await currentUser()
      return fetchSubscription(supabase())
    },
    // No backend configured — a fresh checkout with no .env.local. Everything except
    // sync still works, and the free tier is the honest answer with no server to ask.
    enabled: isConfigured(),
  })

  useEffect(() => {
    if (data !== undefined) setSubscription(asSubscription(data))
  }, [data])
}
