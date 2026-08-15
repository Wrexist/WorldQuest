/**
 * Signing out, all the way.
 *
 * `auth.signOut()` ends the session and nothing else. Everything this app caches on the
 * device outlives it: the persisted TanStack cache holding a wallet and a streak, the
 * activity log behind Profile's week chart, the achievement progress, the equipped
 * title, the queued lessons waiting to sync. Leaving any of it behind means the next
 * person to open the app on a shared family device sees the previous user's numbers —
 * which `lib/storage.ts` already says in as many words, and which nothing enforced
 * because nothing signed out.
 *
 * So: end the session, wipe both stores, and reload into a fresh anonymous one.
 *
 * Deliberately NOT selective. A list of keys to clear is a list somebody forgets to add
 * to, and the thing forgotten is by definition the thing that leaks.
 */

import { router } from 'expo-router'
import { signOut } from '@worldquest/api'
import { clearAll } from '../../lib/storage.js'
import { isConfigured, resetClient, supabase } from '../../lib/supabase.js'
import { resetChildAccount } from '../../lib/analytics.js'

export async function signOutEverywhere(): Promise<void> {
  try {
    if (isConfigured()) await signOut(supabase())
  } catch {
    // A sign-out that could not reach the server is still a sign-out from this device's
    // point of view, and it is the device half that matters for privacy. Carry on.
  }

  clearAll()
  // Back to "we have not asked yet", which `lib/analytics.ts` treats as a child — so no
  // event leaves the device between here and the next age gate. Unknown is not
  // permission, and the person holding the phone is now unknown.
  resetChildAccount()
  // Drops the memoised client and session promise, so the next `currentUser()` mints a
  // fresh anonymous one against the storage we just emptied rather than reusing the
  // token in memory.
  resetClient()

  // Onboarding, not Home: the age gate has to run again before anything else does. The
  // storage wipe removed the answer, and `_layout` sends an install with no answer here
  // anyway — going through the router makes that immediate rather than next launch.
  router.replace('/onboarding')
}
