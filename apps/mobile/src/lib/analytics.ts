/**
 * Analytics adapter for Phase 1.
 *
 * PostHog wiring lands in week 3. The child-account no-op is here from the start,
 * because it is the rule a developer must not be able to bypass by forgetting a UI
 * condition — see docs/engineering/security-privacy.md.
 */

import { EVENTS, type EventName } from '@worldquest/analytics'

type Props = Record<string, unknown>

/**
 * `null` means "we have not asked yet", and it is the DEFAULT on purpose.
 *
 * This was `false` — adult, tracking on — and `setChildAccount` was never called from
 * anywhere, so the flag could only ever be false and the child no-op below could never
 * fire. The comment above says this is the rule a developer must not be able to bypass
 * by forgetting a UI condition; it was bypassed by nobody wiring it up at all. Today
 * `track` only logs in dev, so no data has left a device — but the day PostHog lands,
 * every child account would have emitted third-party analytics from the first frame.
 *
 * Unknown now means silent. Before the age gate we genuinely do not know who is
 * holding the phone, and `useOnboarding` already states the principle for exactly this
 * window: the safe thing to do when we do not know is nothing at all. The cost is a
 * handful of pre-onboarding events from adults, which is the correct trade.
 */
let isChildAccount: boolean | null = null

export function setChildAccount(value: boolean): void {
  isChildAccount = value
}

/** Test seam, and what a sign-out must call. */
export function resetChildAccount(): void {
  isChildAccount = null
}

export function track<N extends EventName>(name: N, properties: Props): void {
  // Child accounts emit NO third-party analytics. Not "restricted" — absent.
  // `null` is treated as a child: unknown is not permission.
  if (isChildAccount !== false) return

  if (!(name in EVENTS)) {
    if (__DEV__) console.warn(`[analytics] undeclared event: ${name}`)
    return
  }

  // Debug builds print every event so QA can verify instrumentation without a
  // dashboard. Fire-and-forget — analytics never blocks the UI.
  if (__DEV__) console.log(`[analytics] ${name}`, properties)
}

declare const __DEV__: boolean
