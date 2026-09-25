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

/** Best effort: a band still unknown is asked again by the account flow, as before. */
export async function sendAge(
  client: { recordAudience: (birthYear: number) => Promise<unknown> },
  birthYear: number,
): Promise<void> {
  try {
    await client.recordAudience(birthYear)
  } catch {
    // Already set, offline or refused: nothing here can make it more right.
  }
}

/** Sent from onboarding's last step, to the session the app already holds, if any. */
export async function sendOnboardingAge(birthYear: number): Promise<void> {
  if (!isD1()) return
  try {
    const { createD1AccountClient } = await import('./d1-auth.js')
    const client = createD1AccountClient(backendConfig().url)
    if (await client.restore()) await sendAge(client, birthYear)
  } catch {
    // No session to send it to; `d1CurrentUser` sends it when one is made.
  }
}
