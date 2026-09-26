/**
 * Onboarding's age answer, carried to the D1 account (S02).
 *
 * Nothing sent it, so every guest's age band stayed `unknown`. The server could not
 * protect a child's account until the child reached the account screen, and an adult
 * linking an email was asked the year onboarding had just asked (`pnpm e2e:d1`). The
 * Worker keeps only the band it derives, `protected` or `eligible`, never the year
 * (`account-policy.ts`), and sets it once, so from then on a child's account refuses
 * email flows server-side instead of relying on this app to hide them.
 *
 * Two moments send it. Usually the app has opened a guest session at launch, before the
 * age gate, and it is sent when onboarding finishes. A phone that has no session yet
 * sends it when one is made (`d1CurrentUser`).
 *
 * A module of its own so onboarding does not import the backend layer to reach it.
 */

import { backendConfig, isD1 } from './backendConfig.js'
import { readJson, writeJson } from './storage.js'

/** Onboarding's record, read and marked by key: a `lib` module importing a feature is a cycle. */
const ONBOARDING_KEY = 'onboarding.v1'
type Onboarding = { completed?: unknown; birthYear?: unknown; ageSent?: unknown }

/**
 * Sends the year and says whether the Worker has now recorded an answer: accepted, or
 * refused because a band is already set (which a resend cannot change). Anything else —
 * offline, a timeout — is "not yet", and the next sync tries again.
 */
export async function sendAge(
  client: { recordAudience: (birthYear: number) => Promise<unknown> },
  birthYear: number,
): Promise<boolean> {
  try {
    await client.recordAudience(birthYear)
    return true
  } catch (error) {
    return (error as { code?: unknown } | null)?.code === 'AUDIENCE_ALREADY_SET'
  }
}

function markSent(): void {
  const state = readJson<Onboarding>(ONBOARDING_KEY)
  if (state !== null) writeJson(ONBOARDING_KEY, { ...state, ageSent: true })
}

/** Sent from onboarding's last step, to the session the app already holds, if any. */
export async function sendOnboardingAge(birthYear: number): Promise<void> {
  if (!isD1()) return
  try {
    const { createD1AccountClient } = await import('./d1-auth.js')
    const client = createD1AccountClient(backendConfig().url)
    if ((await client.restore()) && (await sendAge(client, birthYear))) markSent()
  } catch {
    // No session to send it to; `sendPendingAge` and `d1CurrentUser` send it later.
  }
}

/**
 * Onboarding's answer, until the Worker has it (S02). Sent once and dropped, a lost
 * connection at onboarding's last tap left the band `unknown` for good — and an unknown
 * band is asked afresh by the account flow, where a child can type an adult's year.
 * Run by every sync wake-up; after the first success it is a single storage read.
 */
export async function sendPendingAge(): Promise<void> {
  if (!isD1()) return
  const state = readJson<Onboarding>(ONBOARDING_KEY)
  if (state?.completed !== true || state.ageSent === true) return
  if (typeof state.birthYear !== 'number' || !Number.isInteger(state.birthYear)) return
  try {
    const { createD1AccountClient } = await import('./d1-auth.js')
    const client = createD1AccountClient(backendConfig().url)
    if ((await client.restore()) && (await sendAge(client, state.birthYear))) markSent()
  } catch {
    // The next wake-up tries again.
  }
}
