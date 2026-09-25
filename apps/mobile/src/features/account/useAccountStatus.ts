/**
 * Whether this device's session has a way home yet.
 *
 * Four screens need the same answer — Profile decides whether to draw its "Save your
 * progress" card, Settings decides which account rows to show, onboarding decides
 * whether to offer "I already have an account", and the after-lesson chain decides
 * whether to ask a guest to create a profile — and deriving it four times is how they
 * come to disagree.
 *
 * `linked` starts FALSE and becomes true only once the server has answered. The card it
 * gates is an offer, and offering to save progress that is already saved is a small
 * annoyance; hiding it from someone whose progress is not saved is the bug this whole
 * feature exists to fix. Optimism belongs on the side that costs less when it is wrong.
 *
 * `known` is for the caller where that trade flips. A card on Profile can afford to be
 * shown once too often; a full screen after a lesson cannot, so the profile ask waits
 * for an ANSWER rather than reading the starting assumption as one.
 */

import { useEffect, useState } from 'react'
import { accountEmail } from '@worldquest/api'
import { isConfigured, supabase } from '../../lib/supabase.js'
import { backendConfig, isD1 } from '../../lib/backendConfig.js'
import { readOnboarding } from '../onboarding/useOnboarding.js'

export type AccountStatus = {
  /** The linked address, or null while the session is still anonymous. */
  readonly email: string | null
  readonly linked: boolean
  /**
   * Whether `linked` is an answer rather than the starting assumption.
   *
   * True once the lookup has succeeded — or at once in a build with no backend, where
   * every session is a guest by construction. False while the lookup is in flight, when
   * it failed (offline), and when the caller asked for no lookup at all.
   */
  readonly known: boolean
  /**
   * Under-13, from the age gate.
   *
   * The account flow is ABSENT on a child account rather than disabled. Collecting an
   * email address from an under-13 is the thing COPPA and GDPR-K exist to prevent, and
   * a disabled row is still a request for one. A parent-consent flow is the v1.5 answer;
   * until then Settings says plainly that progress stays on this phone, which is true
   * and which a parent can act on.
   */
  readonly isChild: boolean
}

export type AccountStatusOptions = {
  /**
   * Whether to ask the server at all. Default true.
   *
   * The lesson route mounts this for every lesson and needs the answer for only the
   * first two, so it turns the round trip off for the rest.
   */
  readonly enabled?: boolean
}

export function useAccountStatus(options: AccountStatusOptions = {}): AccountStatus {
  const enabled = options.enabled ?? true
  const [email, setEmail] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const isChild = readOnboarding().isChild === true

  useEffect(() => {
    // No backend configured: asking would throw. Not asked for: nothing to do.
    if (!isConfigured() || !enabled) return
    let cancelled = false
    const lookup = isD1()
      ? import('../../lib/d1-auth.js').then(({ createD1AccountClient }) =>
          createD1AccountClient(backendConfig().url).account()).then((account) => account.email)
      : accountEmail(supabase())
    void lookup
      .then((found) => {
        if (cancelled) return
        setEmail(found)
        setAnswered(true)
      })
      // Swallowed: not knowing whether an account exists must not break the screen that
      // asked. The consequence of guessing wrong here is an offer shown once too often —
      // which is why `known` stays false, for the one caller that cannot afford that.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])

  // No backend configured — a fresh checkout with no .env.local, and the web export the
  // e2e drives. There is no account to be linked to, so "a guest" is not a guess there.
  const known = !isConfigured() || (enabled && answered)
  return { email, linked: email !== null, known, isChild }
}
