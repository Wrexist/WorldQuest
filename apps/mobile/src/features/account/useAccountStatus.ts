/**
 * Whether this device's session has a way home yet.
 *
 * Three screens need the same answer — Profile decides whether to draw its "Save your
 * progress" card, Settings decides which account rows to show, and onboarding decides
 * whether to offer "I already have an account" — and deriving it three times is how
 * they come to disagree.
 *
 * `linked` starts FALSE and becomes true only once the server has answered. The card it
 * gates is an offer, and offering to save progress that is already saved is a small
 * annoyance; hiding it from someone whose progress is not saved is the bug this whole
 * feature exists to fix. Optimism belongs on the side that costs less when it is wrong.
 */

import { useEffect, useState } from 'react'
import { accountEmail } from '@worldquest/api'
import { isConfigured, supabase } from '../../lib/supabase.js'
import { readOnboarding } from '../onboarding/useOnboarding.js'

export type AccountStatus = {
  /** The linked address, or null while the session is still anonymous. */
  readonly email: string | null
  readonly linked: boolean
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

export function useAccountStatus(): AccountStatus {
  const [email, setEmail] = useState<string | null>(null)
  const isChild = readOnboarding().isChild === true

  useEffect(() => {
    // No backend configured — a fresh checkout with no .env.local. Asking would throw.
    if (!isConfigured()) return
    let cancelled = false
    void accountEmail(supabase())
      .then((found) => {
        if (!cancelled) setEmail(found)
      })
      // Swallowed: not knowing whether an account exists must not break the screen that
      // asked. The consequence of guessing wrong here is an offer shown once too often.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return { email, linked: email !== null, isChild }
}
