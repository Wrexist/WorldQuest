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
  ensureSession,
  type WorldQuestClient,
} from '@worldquest/api'
import { sessionStorage } from './storage.js'

let client: WorldQuestClient | null = null
let session: Promise<{ userId: string }> | null = null

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
  client ??= createWorldQuestClient({ ...config(), storage: sessionStorage })
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
  session ??= ensureSession(supabase()).catch((error: unknown) => {
    // Clear the memo so a later attempt can retry — a failed sign-in on a plane must
    // not poison the session for the rest of the process's life.
    session = null
    throw error
  })
  return session
}

/** Test seam. Not for app code. */
export function __resetSupabaseForTests(): void {
  client = null
  session = null
}
