/**
 * The Supabase client.
 *
 * One place where the app touches the network. Everything above it works with domain
 * types; everything below is an implementation detail that could be swapped for a
 * different backend by rewriting this file alone.
 *
 * Spec: docs/engineering/architecture.md · docs/adr/0003-backend-supabase.md
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.js'

/** Every query in the app is checked against the real schema, not against `any`. */
export type WorldQuestClient = SupabaseClient<Database>

/** The three methods supabase-js needs to persist a session. Not the DOM `Storage`. */
export type SessionStorage = {
  getItem: (key: string) => string | null | Promise<string | null>
  setItem: (key: string, value: string) => void | Promise<void>
  removeItem: (key: string) => void | Promise<void>
}

export type WorldQuestConfig = {
  readonly url: string
  readonly publishableKey: string
  /**
   * Where the session is persisted. React Native has no `localStorage`, so the app
   * supplies an adapter; Node supplies nothing and gets a memory-only session, which
   * is what tests want anyway.
   */
  readonly storage?: SessionStorage
}

/**
 * Only the publishable key ever reaches the client bundle. The service-role key
 * exists solely in edge functions — if it appears in anything shipped to a device,
 * every RLS policy in the schema is decoration.
 */
export function createWorldQuestClient(config: WorldQuestConfig): WorldQuestClient {
  if (!config.url || !config.publishableKey) {
    throw new Error(
      'Supabase config missing. Copy .env.example to .env.local — see README.',
    )
  }
  if (
    config.publishableKey.startsWith('sb_secret') ||
    config.publishableKey.includes('service_role')
  ) {
    // Cheap check, enormous consequence. Worth failing loudly at startup.
    throw new Error('Refusing to start: a service-role key was passed to the client.')
  }

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      // Anonymous sign-in backs the taster lesson: a user completes a real lesson
      // before we ask for an account, then upgrades in place without losing it.
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      ...(config.storage ? { storage: config.storage } : {}),
    },
  })
}

// ── session ─────────────────────────────────────────────────────────────────

/**
 * Returns a signed-in user, creating an anonymous one if there isn't one.
 *
 * The alternative — an account wall before the first lesson — is the biggest
 * drop-off point in every competitor we tore down. A user should feel the product
 * work before being asked for anything, and an anonymous session upgrades in place
 * later without losing a day of progress.
 *
 * The profile, wallet and streak rows are created by the `on_auth_user_created`
 * trigger, not here. Doing it client-side would mean a user who closes the app
 * mid-signup ends up with an auth record and no profile, after which every query
 * returns empty for reasons nobody can reproduce.
 */
export async function ensureSession(client: WorldQuestClient): Promise<{ userId: string }> {
  const { data: existing } = await client.auth.getSession()
  if (existing.session?.user) return { userId: existing.session.user.id }

  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('signInAnonymously returned no user')

  return { userId: data.user.id }
}

// ── lesson submission ───────────────────────────────────────────────────────

export type SubmitLessonRequest = {
  lessonId: string
  kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
  topicId?: string
  startedAt: number
  answers: readonly unknown[]
  clientVersion?: string
}

export type SubmitLessonResponse = {
  lessonId: string
  items: number
  correct: number
  accuracy: number
  xpAwarded: number
  coinsAwarded: number
  perfect: boolean
  rejected: number
  /**
   * The session was too short to contain the answers it claimed, so its timing was
   * discarded and every answer graded as average. Not shown to the user — a real client
   * cannot produce it, and telling someone their clock looked forged is a conversation
   * for a support ticket, not a summary screen. It exists so a spike is graphable.
   */
  timingDiscarded: boolean
  replayed: boolean
}

/**
 * Submit a finished lesson for authoritative grading.
 *
 * Note what is NOT in the request: xp, coins, mastery, streak. The client sends
 * answers; the server computes rewards. See ADR 0006.
 */
export async function submitLesson(
  client: WorldQuestClient,
  request: SubmitLessonRequest,
): Promise<SubmitLessonResponse> {
  const { data, error } = await client.functions.invoke<SubmitLessonResponse>(
    'submit-lesson',
    { body: request },
  )
  if (error) throw error
  if (!data) throw new Error('submit-lesson returned no body')
  return data
}

// ── progress ────────────────────────────────────────────────────────────────

/** What Home needs to render, in one round trip. */
export type Progress = {
  readonly xpTotal: number
  readonly coins: number
  readonly gems: number
  readonly hearts: number
  readonly streak: number
  readonly longestStreak: number
  readonly factsMastered: number
}

/** Mastery levels that count as learned for the progress ring. */
const MASTERED: readonly Database['public']['Enums']['mastery_level'][] = [
  'mastered',
  'burnished',
]

/**
 * Reads the user's wallet, streak and mastery count.
 *
 * Three queries rather than one view, deliberately: a view would need its own RLS
 * policy, and each of these tables is already default-deny and scoped to
 * `auth.uid()`. They run concurrently, so it is one round trip either way.
 */
export async function fetchProgress(client: WorldQuestClient): Promise<Progress> {
  const [wallet, streak, mastered] = await Promise.all([
    client.from('wallets').select('xp_total, coins, gems, hearts').maybeSingle(),
    client.from('streaks').select('current, longest').maybeSingle(),
    client
      .from('user_facts')
      .select('fact_id', { count: 'exact', head: true })
      .in('mastery', MASTERED),
  ])

  if (wallet.error) throw wallet.error
  if (streak.error) throw streak.error
  if (mastered.error) throw mastered.error

  // A missing row is not an error — it is a user on their very first launch, whose
  // provisioning trigger has not landed yet. Zeroes are the truth in that moment.
  return {
    xpTotal: wallet.data?.xp_total ?? 0,
    coins: wallet.data?.coins ?? 0,
    gems: wallet.data?.gems ?? 0,
    hearts: wallet.data?.hearts ?? 0,
    streak: streak.data?.current ?? 0,
    longestStreak: streak.data?.longest ?? 0,
    factsMastered: mastered.count ?? 0,
  }
}

/**
 * Read this user's subscription, as the server understands it.
 *
 * The shape is `Subscription` from `packages/engines/src/entitlements` — not converted
 * to it, but the same field names and the same enum values, so this is a rename of
 * `expires_at` and nothing more. A mapping layer here is somewhere for `in_grace` to
 * quietly become `active`, which is the one mistake in this file nobody would notice
 * until a support ticket.
 *
 * The types are declared structurally rather than imported, because `packages/api` must
 * not depend on `packages/engines` — the dependency rule in PROJECT.md §3 runs the other
 * way. `entitlementOf` accepts this object as-is.
 *
 * **No row means no subscription**, which is why it is `maybeSingle` and why the
 * fallback is the free tier rather than an error. Most users will never have a row, and
 * a first launch must not fail on the absence of one.
 */
export type SubscriptionRow = {
  readonly status: Database['public']['Enums']['subscription_status']
  readonly tier: Database['public']['Enums']['plan_tier']
  readonly expiresAt: number | null
  readonly willRenew: boolean
  readonly hasUsedTrial: boolean
}

const NO_SUBSCRIPTION: SubscriptionRow = {
  status: 'none',
  tier: 'free',
  expiresAt: null,
  willRenew: false,
  hasUsedTrial: false,
}

export async function fetchSubscription(
  client: WorldQuestClient,
): Promise<SubscriptionRow> {
  const { data, error } = await client
    .from('subscriptions')
    .select('status, tier, expires_at, will_renew, has_used_trial')
    .maybeSingle()

  if (error) throw error
  if (data === null) return NO_SUBSCRIPTION

  return {
    status: data.status,
    tier: data.tier,
    // Epoch millis, because every date in the engines is a number — `entitlementOf`
    // compares this against an injected `now` and cannot be given a string.
    expiresAt: data.expires_at === null ? null : Date.parse(data.expires_at),
    willRenew: data.will_renew,
    hasUsedTrial: data.has_used_trial,
  }
}
