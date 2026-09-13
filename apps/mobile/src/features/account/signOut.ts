/** Detach local work before replacing credentials; retained accounts remain isolated. */
import { router } from 'expo-router'
import { signOut } from '@worldquest/api'
import { clearSessionStorage, startGuestStorage } from '../../lib/storage.js'
import { isConfigured, resetClient, supabase, withAccountTransition } from '../../lib/supabase.js'
import { resetChildAccount } from '../../lib/analytics.js'

export async function signOutEverywhere(): Promise<void> {
  await withAccountTransition(async () => {
    startGuestStorage()
    try {
      if (isConfigured()) await signOut(supabase())
    } catch {
      // Local logout remains possible offline. Server session revocation may retry later.
    }
    clearSessionStorage()
    resetChildAccount()
    resetClient()
  })
  router.replace('/onboarding')
}
