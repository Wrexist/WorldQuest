/**
 * Analytics adapter for Phase 1.
 *
 * PostHog wiring lands in week 3. The child-account no-op is here from the start,
 * because it is the rule a developer must not be able to bypass by forgetting a UI
 * condition — see docs/engineering/security-privacy.md.
 */

import { EVENTS, type EventName } from '@worldquest/analytics'

type Props = Record<string, unknown>

let isChildAccount = false

export function setChildAccount(value: boolean): void {
  isChildAccount = value
}

export function track<N extends EventName>(name: N, properties: Props): void {
  // Child accounts emit NO third-party analytics. Not "restricted" — absent.
  if (isChildAccount) return

  if (!(name in EVENTS)) {
    if (__DEV__) console.warn(`[analytics] undeclared event: ${name}`)
    return
  }

  // Debug builds print every event so QA can verify instrumentation without a
  // dashboard. Fire-and-forget — analytics never blocks the UI.
  if (__DEV__) console.log(`[analytics] ${name}`, properties)
}

declare const __DEV__: boolean
