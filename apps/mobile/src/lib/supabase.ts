/**
 * The app's one Supabase client.
 *
 * Created lazily rather than at module load. Two reasons, both learned the hard way
 * in other codebases: a throwing module-level constructor turns a missing env var
 * into a blank white screen with no stack, and eagerly constructing a client pulls
 * the whole auth stack into the first frame of a cold start for no benefit.
 *
 * The publishable key is the ONLY key that may appear here. The service-role key
 * lives in edge-function secrets; if it ever reaches a device build, every RLS policy
 * in the schema becomes decoration.
 */

import {
  createWorldQuestClient,
  createSupabaseBackend,
  AccountChangedError,
  ensureSession,
  type WorldQuestClient,
} from '@worldquest/api'
import { beginStorageTransition, captureStorage, finishStorageTransition, setStorageAccount, startGuestStorage } from './storage.js'
import { createSessionStorage } from './credentials.js'

let client: WorldQuestClient | null = null
let session: Promise<{ userId: string }> | null = null
let initializing = 0
let unsubscribe: (() => void) | null = null
let transitioning = false

/**
 * `EXPO_PUBLIC_` is not a naming convention — it is the prefix Expo uses to decide
 * what gets inlined into the bundle. Anything without it stays server-side, which is
 * exactly the behaviour we want for everything else.
 */
function config(): { url: string; publishableKey: string } {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  }
}

/** True when the app has been given a backend to talk to at all. */
export function isConfigured(): boolean {
  const { url, publishableKey } = config()
  return url !== '' && publishableKey !== ''
}

/**
 * The backend origin, or `''` when there is none.
 *
 * Exposed for the connectivity probe, which needs to reach OUR server rather than
 * whichever third party a library picked as a default. Deliberately not the client:
 * asking "is the server up" must not require a session, a key, or a table.
 */
export const backendUrl = (): string => config().url

export function supabase(): WorldQuestClient {
  if (!client) {
    client = createWorldQuestClient({ ...config(), storage: createSessionStorage() })
    const { data } = client.auth.onAuthStateChange((event, next) => {
      // This callback runs under the auth lock: no awaited SDK calls here.
      if (event === 'SIGNED_OUT') {
        session = null
        if (captureStorage().userId !== null) startGuestStorage()
      } else if (next && initializing === 0 && !transitioning) {
        acceptSignedInAccount(next.user.id)
      }
    })
    unsubscribe = () => data.subscription.unsubscribe()
  }
  return client
}

/**
 * The signed-in user, creating an anonymous one on first launch.
 *
 * Memoised as a promise, not as a value: several screens ask for this during the same
 * first frame, and without the memo each one starts its own anonymous sign-up. That
 * produces several orphaned users per install and a wallet the user cannot see.
 */
export function currentUser(): Promise<{ userId: string }> {
  if (transitioning) return Promise.reject(new AccountChangedError())
  if (session) return session
  const store = captureStorage()
  initializing++
  const pending = Promise.resolve().then(() => ensureSession(supabase(), (userId, created) => {
    if (transitioning || !store.isCurrent()) throw new AccountChangedError()
    setStorageAccount(userId, created)
  })).catch((error: unknown) => {
    // Clear the memo so a later attempt can retry — a failed sign-in on a plane must
    // not poison the session for the rest of the process's life.
    if (session === pending) session = null
    throw error
  }).finally(() => { initializing-- })
  session = pending
  return pending
}

/** Open an immutable, owner-bound transport for the account visible to the caller. */
export async function accountRepository(userId: string) {
  if (transitioning) throw new AccountChangedError()
  return createSupabaseBackend(config(), supabase()).forAccount(userId)
}

export async function withAccountTransition<T>(work: () => Promise<T>): Promise<T> {
  if (transitioning) throw new AccountChangedError()
  beginStorageTransition()
  transitioning = true
  session = null
  try { return await work() } finally {
    transitioning = false
    finishStorageTransition()
  }
}

export function acceptSignedInAccount(userId: string): void {
  setStorageAccount(userId)
  session = Promise.resolve({ userId })
}

/** Drop transport state after clearing local credentials. */
export function resetClient(): void {
  unsubscribe?.()
  unsubscribe = null
  if (client) void client.auth.stopAutoRefresh()
  client = null
  session = null
}
