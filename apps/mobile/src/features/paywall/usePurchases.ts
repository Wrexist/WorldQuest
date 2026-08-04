/**
 * Prices, and what happens when the store will not give us any.
 *
 * The port ([`purchases.ts`](./purchases.ts)) is deliberately a stub that *fails*
 * until a billing SDK lands, so this hook's unhappy path is the one that runs today.
 * That is on purpose: the same path runs on a real device in a tunnel, on a store
 * front where the products were not approved yet, and on a phone whose parent has
 * disabled purchases entirely. Building it last is how apps ship a paywall that shows
 * a spinner forever.
 *
 * **This hook never grants anything.** It initiates a purchase and reports what the
 * store said. The entitlement arrives separately, from the server, through
 * `useEntitlement` — see ADR 0006 and docs/systems/monetization.md.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { UNAVAILABLE, type Plan, type PurchasePort, type PurchaseResult } from './purchases.js'

export type PurchasesView = {
  /** Empty until the store answers, and empty forever if it will not. */
  readonly plans: readonly Plan[]
  /** The store has been asked and has not answered yet. */
  readonly loading: boolean
  /**
   * The store could not be reached. Distinct from "no plans": one is a problem we can
   * ask the user to retry, the other would be a configuration mistake on our side.
   */
  readonly failed: boolean
  readonly reload: () => void
  readonly purchase: (planId: Plan['id']) => Promise<PurchaseResult>
  readonly restore: () => Promise<PurchaseResult>
  /** Deep-links to the store's payment settings — the one fix for a declined card. */
  readonly manageBilling: () => void
}

/**
 * `port` is a parameter so a test, the screenshot renderer and eventually a real SDK
 * can each supply their own without this file knowing which is which.
 */
export function usePurchases(port: PurchasePort = UNAVAILABLE): PurchasesView {
  const [plans, setPlans] = useState<readonly Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  /**
   * The port is an injected singleton, not reactive data — so it is held in a ref and
   * kept OUT of the effect's dependencies.
   *
   * With it in the array, a caller writing the obvious `usePurchases(makePort())` gets
   * a new identity on every render, which re-runs the effect, which sets state, which
   * renders again: a silent infinite loop that hammers the store. Found by the first
   * test written against this hook, which never got past `loading`.
   */
  const portRef = useRef(port)
  portRef.current = port

  useEffect(() => {
    let live = true
    setLoading(true)
    setFailed(false)

    portRef.current
      .plans()
      .then((fetched) => {
        if (!live) return
        setPlans(fetched)
        setLoading(false)
      })
      .catch(() => {
        // No prices rather than invented ones. A paywall that guesses a price is a
        // paywall that charges a different number than the one it showed.
        if (!live) return
        setPlans([])
        setFailed(true)
        setLoading(false)
      })

    return () => {
      live = false
    }
  }, [attempt])

  return {
    plans,
    loading,
    failed,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
    purchase: useCallback((planId: Plan['id']) => portRef.current.purchase(planId), []),
    restore: useCallback(() => portRef.current.restore(), []),
    manageBilling: useCallback(() => void portRef.current.manageBilling(), []),
  }
}
