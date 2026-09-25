/** Detach local work before replacing credentials; retained accounts remain isolated. */
import { router } from 'expo-router'
import { signOut } from '@worldquest/api'
import { clearSessionStorage, startGuestStorage } from '../../lib/storage.js'
import { detachSession, isConfigured, resetClient, supabase, withAccountTransition } from '../../lib/supabase.js'
import { backendConfig, isD1 } from '../../lib/backendConfig.js'
import { resetChildAccount } from '../../lib/analytics.js'

export async function signOutEverywhere(): Promise<void> {
  await withAccountTransition(async () => {
    startGuestStorage()
    try {
      // D1 revokes this device's session family; the legacy SDK signs out its own.
      if (isD1()) await (await import('../../lib/d1-auth.js')).createD1AccountClient(backendConfig().url).signOut()
      else if (isConfigured()) await signOut(supabase())
    } catch {
      // Local logout remains possible offline. Server session revocation may retry later.
    }
    resetClient()
    detachSession()
    await clearSessionStorage()
    resetChildAccount()
  })
  router.replace('/onboarding')
}
