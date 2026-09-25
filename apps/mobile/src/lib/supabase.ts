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
import { createD1AccountRepository } from '@worldquest/api/d1-repository'
import { beginStorageTransition, captureStorage, finishStorageTransition, readJson, setStorageAccount, startGuestStorage } from './storage.js'
import { createSessionStorage } from './credentials.js'
import { backendConfig, isD1 } from './backendConfig.js'
import { sendAge } from './d1-age.js'
export { isD1 } from './backendConfig.js'

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
  const selected = backendConfig()
  return selected.kind === 'supabase'
    ? { url: selected.url, publishableKey: selected.publishableKey }
    : { url: '', publishableKey: '' }
}

/** True when the app has been given a backend to talk to at all — either one. */
export function isConfigured(): boolean {
  return backendConfig().kind !== 'none'
}


/**
 * The backend origin, or `''` when there is none.
 *
 * Exposed for the connectivity probe, which needs to reach OUR server rather than
 * whichever third party a library picked as a default. Deliberately not the client:
 * asking "is the server up" must not require a session, a key, or a table.
 */
export const backendUrl = (): string => backendConfig().url

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
  const accept = (userId: string, created: boolean) => {
    if (transitioning || !store.isCurrent()) throw new AccountChangedError()
    setStorageAccount(userId, created)
  }
  const start = isD1() ? () => d1CurrentUser(accept) : () => ensureSession(supabase(), accept)
  const pending = Promise.resolve().then(start).catch((error: unknown) => {
    // Clear the memo so a later attempt can retry — a failed sign-in on a plane must
    // not poison the session for the rest of the process's life.
    if (session === pending) session = null
    throw error
  }).finally(() => { initializing-- })
  session = pending
  return pending
}

/**
 * The D1 identity: the stored session if there is one, otherwise a new guest.
 *
 * Only a guest created HERE may adopt this device's pre-account work, the same rule
 * the legacy path follows — restoring an existing session must never pull another
 * person's local lessons into it.
 */
async function d1CurrentUser(accept: (userId: string, created: boolean) => void): Promise<{ userId: string }> {
  // Loaded on the D1 path only: it reaches into native crypto and the legacy build
  // (and every jsdom test of this module) must not pay for or trip over that.
  const { createD1AccountClient } = await import('./d1-auth.js')
  const client = createD1AccountClient(backendConfig().url)
  const existing = await client.restore()
  // Read in the scope onboarding wrote to, before the new identity is accepted.
  const birthYear = existing === null ? onboardingBirthYear() : undefined
  const next = existing ? await client.ensureSession() : await client.startGuest()
  accept(next.userId, existing === null)
  if (birthYear !== undefined) await sendAge(client, birthYear)
  return { userId: next.userId }
}

/**
 * The age gate's answer, for a guest created after onboarding finished (S02, `d1-age.ts`).
 *
 * Read by key rather than through `features/onboarding`: a `lib` module importing a
 * feature is a cycle, the same choice `locale.ts` makes for preferences.
 */
function onboardingBirthYear(): number | undefined {
  const year = readJson<{ birthYear?: unknown }>('onboarding.v1')?.birthYear
  return typeof year === 'number' && Number.isInteger(year) ? year : undefined
}

/** Open an immutable, owner-bound transport for the account visible to the caller. */
export async function accountRepository(userId: string) {
  if (transitioning) throw new AccountChangedError()
  if (isD1()) {
    const store = captureStorage()
    const [{ createD1AccountClient }, { getRandomBytes }] = await Promise.all([import('./d1-auth.js'), import('expo-crypto')])
    return createD1AccountRepository({ auth: createD1AccountClient(backendConfig().url), owner: userId,
      isCurrent: store.isCurrent, fetch: (url, init) => fetch(url, init), randomBytes: () => getRandomBytes(12) })
  }
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

/** Forget the memoised identity while a D1 identity change is in progress. */
export function detachSession(): void {
  session = null
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
