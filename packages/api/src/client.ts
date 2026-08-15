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
  /** Statistic, not a reward input — see the note in `apps/mobile/src/lib/sync.ts`. */
  heartsLost?: number
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
   * Which facts changed mastery level, as the SERVER computed it.
   *
   * The field that makes `fact_mastered` achievements possible. It was already returned
   * and nothing on the client read it, so the flag and capital collectors — 40 and 63
   * countries of content — could never move off zero.
   */
  masteryChanges?: readonly { readonly factId: string; readonly from: string; readonly to: string }[]
  /**
   * Overdue reviews cleared in this lesson.
   *
   * `ach.review.faithful` counts these — 25 / 250 / 1000 — and it is the only achievement
   * in the catalogue that measures the behaviour the product exists to produce rather
   * than volume. The grader computed the number and threw it away.
   */
  overdueCleared?: number
  /**
   * Countries whose every quizzable fact is now mastered.
   *
   * The last achievement event with no producer, and one only the server can answer: it
   * is a question about facts the lesson did not touch. `ach.countries.complete` and
   * `ach.set.nordics` both count it.
   */
  entityMastered?: readonly string[]
  /**
   * The session was too short to contain the answers it claimed, so its timing was
   * discarded and every answer graded as average. Not shown to the user — a real client
   * cannot produce it, and telling someone their clock looked forged is a conversation
   * for a support ticket, not a summary screen. It exists so a spike is graphable.
   */
  timingDiscarded: boolean
  /**
   * The streak as the server now has it — the first time this endpoint has had one to
   * report, because until `record_lesson` nothing wrote `streaks` at all.
   *
   * Optional because a replayed submission returns the original row and does not
   * recompute it: awarding a streak day twice for one lesson is the same class of bug as
   * awarding XP twice.
   */
  streak?: {
    current: number
    longest: number
    extended: boolean
    freezeUsed: boolean
    reset: boolean
  }
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

/**
 * What Home needs to render, in one round trip.
 *
 * `gems` used to be here. Nothing grants one, nothing spends one, no screen renders one,
 * and the column has been 0 on every row this product ever created — a third currency
 * that existed only as a field being fetched and thrown away. Fetching it made the app
 * look like it had a gem economy to anyone reading this type. The COLUMN stays: dropping
 * it is a migration for no benefit, and a premium currency is a plausible v2 decision.
 * Pretending to have one today is not.
 */
export type Progress = {
  readonly xpTotal: number
  readonly coins: number
  readonly hearts: number
  readonly streak: number
  readonly longestStreak: number
  readonly factsMastered: number
  /**
   * The recovery fields, which the streak screen stubbed to their defaults because they
   * "do NOT exist in the progress payload yet". They existed in the table the whole time.
   *
   * `lastActiveDate` is what makes the displayed streak honest between lessons —
   * `streaks.current` is only written when a lesson lands, so a user who missed two days
   * was still being shown the number they had before they missed them.
   */
  readonly lastActiveDate: string | null
  readonly freezesHeld: number
  /**
   * The local date the streak broke, or null while it is intact.
   *
   * `repairAvailability` opens on this and returns `not-broken` when it is null, so the
   * whole repair feature — a 600-coin sink with a 48-hour window and a 30-day cooldown,
   * written and tested — could never be offered to anyone. Nothing wrote the column,
   * because a break is the ABSENCE of activity and only a scheduled job notices one.
   */
  readonly brokenOn: string | null
  readonly lastRepairAt: number | null
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
    client.from('wallets').select('xp_total, coins, hearts').maybeSingle(),
    client
      .from('streaks')
      .select('current, longest, last_active_date, freezes_held, broken_on, last_repair_at')
      .maybeSingle(),
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
    hearts: wallet.data?.hearts ?? 0,
    streak: streak.data?.current ?? 0,
    longestStreak: streak.data?.longest ?? 0,
    lastActiveDate: streak.data?.last_active_date ?? null,
    freezesHeld: streak.data?.freezes_held ?? 0,
    brokenOn: streak.data?.broken_on ?? null,
    lastRepairAt: streak.data?.last_repair_at ? Date.parse(streak.data.last_repair_at) : null,
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

// ── consumables ─────────────────────────────────────────────────────────────

export type FreezePurchase =
  | { readonly status: 'purchased'; readonly freezesHeld: number; readonly coins: number }
  | { readonly status: 'at_cap'; readonly freezesHeld: number }
  | { readonly status: 'insufficient_funds' | 'not_for_sale' | 'no_streak' | 'unauthorized' }

/**
 * Buy a streak freeze.
 *
 * The caller supplies nothing but the intent: the price comes from `shop_items` and the
 * user from `auth.uid()`, so the worst a modified client can do is buy one it can afford.
 * The cap and the overdraft are both refused server-side, and both come back as a status
 * rather than an error — "you already hold two" is an answer, not a failure.
 *
 * `grantFreeze` in the engine has described "the common caller is a purchase flow" since
 * streaks were built and had no caller. This is it.
 */
export async function buyStreakFreeze(client: WorldQuestClient): Promise<FreezePurchase> {
  const { data, error } = await client.rpc('purchase_freeze', {})
  if (error) throw error
  return (data ?? { status: 'unauthorized' }) as FreezePurchase
}

// ── accounts ────────────────────────────────────────────────────────────────

/**
 * Giving an anonymous session a way home.
 *
 * `ensureSession` above says an anonymous session "upgrades in place later without
 * losing a day of progress". Until now nothing upgraded it, so every install was a
 * dead end: uninstall the app, change phone, or clear its storage, and a hundred-day
 * streak and every mastered fact were gone with no way back and nothing to support.
 * For a learning app that is the worst bug available and the surest one-star review.
 *
 * ## Why a code and not a magic link
 *
 * A link makes the user leave for their mail client and come back through a deep link,
 * which is where the flow breaks: in-app mail previews, corporate link rewriters, and
 * the "open in" dialogue all eat it, and each failure looks like the app being broken.
 * A six-digit code keeps the whole flow on one screen.
 *
 * This requires the Supabase email templates to send `{{ .Token }}` rather than
 * `{{ .ConfirmationURL }}` — a dashboard setting, not code, and it is written down in
 * `docs/product/support-notes.md` because a template nobody changed makes every one of
 * these functions look broken in exactly the same way.
 *
 * ## The upgrade is in place
 *
 * `updateUser({ email })` attaches an address to the CURRENT user rather than making a
 * new one, so the `user_id` on every ledger row, fact and streak is untouched. That is
 * the whole point, and it is why signing in must never be the path a linking user takes.
 */

/** The email on this session, or null while it is still anonymous. */
export async function accountEmail(client: WorldQuestClient): Promise<string | null> {
  const { data } = await client.auth.getUser()
  return data.user?.email ?? null
}

/**
 * Attach an email to the session that already exists. Sends a confirmation code.
 *
 * Nothing changes until `confirmEmail` succeeds — Supabase holds the address as
 * pending, so an abandoned attempt leaves the account exactly as anonymous as it was.
 */
export async function linkEmail(client: WorldQuestClient, email: string): Promise<void> {
  const { error } = await client.auth.updateUser({ email })
  if (error) throw error
}

/** Finish `linkEmail`. The user id does not change; the account stops being anonymous. */
export async function confirmEmail(
  client: WorldQuestClient,
  email: string,
  token: string,
): Promise<void> {
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email_change' })
  if (error) throw error
}

/**
 * Send a sign-in code to an address that already has an account.
 *
 * `shouldCreateUser: false` on purpose, and it is the difference between a recovery
 * flow and a trap: with the default, a typo'd address silently mints a brand-new empty
 * account, signs the user into it, and shows them zero XP where their streak used to
 * be. They would conclude their progress was deleted, and they would be describing
 * what happened. Failing with "we have no account for that address" is recoverable.
 */
export async function requestSignIn(client: WorldQuestClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })
  if (error) throw error
}

/** Finish `requestSignIn`, replacing this device's session with the real account's. */
export async function confirmSignIn(
  client: WorldQuestClient,
  email: string,
  token: string,
): Promise<{ userId: string }> {
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
  if (!data.user) throw new Error('verifyOtp returned no user')
  return { userId: data.user.id }
}

/** Ends the session. The CALLER must clear device storage — see `lib/storage.ts`. */
export async function signOut(client: WorldQuestClient): Promise<void> {
  const { error } = await client.auth.signOut()
  if (error) throw error
}

// ── the league ──────────────────────────────────────────────────────────────

/**
 * Reading the week's cohort.
 *
 * ## Why this waited
 *
 * The engine and the migration have been done and unreachable since they were written,
 * with the reason recorded in `scripts/reachability.ts`: the environment they were
 * written in has no Docker, so the migration could not be applied to a real Postgres,
 * `pnpm db:types` could not regenerate the types from it, and `supabase test db` could
 * not prove the RLS policies do what they claim. Shipping an unproven policy on a
 * children's leaderboard was the one thing not worth guessing at.
 *
 * CI has now done all three. All 35 RLS tests pass against this schema, and
 * `database.types.ts` carries the tables and the view. So the client half is buildable
 * on evidence rather than on hope, and this is it.
 *
 * ## One read, through the view
 *
 * `league_standings` is `security_invoker` and carries no `user_id` column — it joins
 * the cohort and computes `is_you` server-side. That is the whole privacy design: a
 * client cannot ask "who is user X", because the answer is not in the shape it receives.
 * The row policy on `league_members` restricts SELECT to cohorts the reader belongs to,
 * so a reader outside a cohort gets nothing rather than a filtered nothing.
 *
 * Nothing here writes. `league_members` has no client write policy, deliberately —
 * weekly XP is the server's, and a client that can write it is a client that can win.
 */

/** One row of the standings view, in the engine's shape. */
export type LeagueRow = {
  readonly handle: string
  readonly weeklyXp: number
  readonly isYou: boolean
}

export type LeagueCohort = {
  readonly weekId: string
  readonly tier: string
  readonly division: number
  readonly members: readonly LeagueRow[]
}

/**
 * This week's cohort, or null when the reader is in none.
 *
 * Null is the ordinary state for most of the app's life, not an error: a user who has
 * not been placed yet, a user who opted out, and every under-13 account — none of them
 * belongs to a cohort, and the RLS policy answers all three the same way, with no rows.
 * The screen says "you are not in a league yet" rather than showing an empty table.
 */
export async function fetchLeague(client: WorldQuestClient): Promise<LeagueCohort | null> {
  const { data, error } = await client
    .from('league_standings')
    .select('cohort_id, week_id, tier, division, handle, weekly_xp, is_you')

  if (error) throw error
  if (data === null || data.length === 0) return null

  // Every row carries the same cohort, because the policy only returns one. Reading the
  // week and rank off the first row rather than a second query: they are columns of the
  // join, and a second round trip for three constants is a round trip.
  const first = data[0]!
  return {
    weekId: first.week_id ?? '',
    tier: first.tier ?? 'bronze',
    division: first.division ?? 3,
    members: data.map((row) => ({
      handle: row.handle ?? '',
      weeklyXp: row.weekly_xp ?? 0,
      // `is_you` is computed by the view from `auth.uid()`, never sent by the client.
      isYou: row.is_you === true,
    })),
  }
}

/** Whether this user has opted out of leagues entirely. */
export async function fetchLeagueOptOut(client: WorldQuestClient): Promise<boolean> {
  const { data, error } = await client
    .from('league_opt_outs')
    .select('opted_out')
    .maybeSingle()

  if (error) throw error
  return data?.opted_out === true
}

/**
 * Leave, or come back.
 *
 * Upserted on the user's own row, which is the only row the policy lets them touch.
 * Opting out does not delete history — it stops the next placement, and the current
 * week runs out on its own. Deleting a cohort membership mid-week would renumber
 * everybody else's positions for a reason none of them can see.
 */
export async function setLeagueOptOut(
  client: WorldQuestClient,
  userId: string,
  optedOut: boolean,
): Promise<void> {
  const { error } = await client
    .from('league_opt_outs')
    .upsert({ user_id: userId, opted_out: optedOut }, { onConflict: 'user_id' })

  if (error) throw error
}
