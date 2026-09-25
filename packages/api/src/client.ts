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
import type { SessionStorage, SubmitLessonRequest, SubmitLessonResponse, Progress, SubscriptionRow, FreezePurchase, StreakRepair, ContinuePurchase, LeagueCohort } from './contracts.js'
export type { SessionStorage, SubmitLessonRequest, SubmitLessonResponse, Progress, SubscriptionRow, FreezePurchase, StreakRepair, ContinuePurchase, LeagueRow, LeagueCohort } from './contracts.js'


/** Every query in the app is checked against the real schema, not against `any`. */
export type WorldQuestClient = SupabaseClient<Database>


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
export async function ensureSession(
  client: WorldQuestClient,
  resolved?: (userId: string, created: boolean) => void,
): Promise<{ userId: string }> {
  const { data: existing, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (existing.session?.user) {
    resolved?.(existing.session.user.id, false)
    return { userId: existing.session.user.id }
  }

  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('signInAnonymously returned no user')
  resolved?.(data.user.id, true)
  return { userId: data.user.id }
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
      .select(
        'current, longest, last_active_date, freezes_held, broken_on, last_repair_at, freeze_used_on',
      )
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
    // What `repair_streak` restores on this backend: `greatest(longest, current)`. Stated
    // here, beside the query, so no screen has to know the legacy rule to name the number.
    restoreTo: streak.data?.broken_on ? Math.max(streak.data.longest, streak.data.current) : null,
    // Written by the hourly `expire_streaks` job when it spends a freeze: the missed day.
    freezeUsedOn: streak.data?.freeze_used_on ?? null,
    factsMastered: mastered.count ?? 0,
  }
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


/**
 * Buy a broken streak back.
 *
 * Takes NOTHING — not the length to restore, not the price, not the date. `StreakScreen`
 * has a `restoreTo` prop so the button can say "restore your 214-day streak"; sending it
 * would let a modified client name any number and buy it for 600 coins, which is a
 * leaderboard entry at cosmetic prices. The server reads `streaks.longest`.
 *
 * Every refusal is a STATUS rather than an error, because each one needs different words:
 * "the window closed yesterday" and "you can do this again in 12 days" are different
 * facts, and a generic failure invites the user to keep tapping.
 */
export async function repairStreak(client: WorldQuestClient): Promise<StreakRepair> {
  // No second argument: the function takes none, and the generated type for a
  // zero-argument RPC is `never` — `{}` is not assignable to it. `purchase_freeze` above
  // passes `{}` because it has an ignored `p_price` parameter; this one has nothing to
  // ignore, and adding a parameter so the call site could look the same would be a
  // signature shaped by a type error.
  const { data, error } = await client.rpc('repair_streak')
  if (error) throw error
  return (data ?? { status: 'unauthorized' }) as StreakRepair
}


/**
 * Pay to carry on after running out of hearts mid-lesson.
 *
 * `continueId` is a UUID the client mints per OFFER, not per lesson: a lesson can run
 * out of hearts more than once, so keying on the lesson would classify a genuine second
 * continue as a replay and hand it over free. Per-offer, a double-tap is a replay and a
 * second continue is not.
 *
 * The price is `shop_items`', not the caller's, exactly as for a cosmetic or a freeze.
 */
export async function buyLessonContinue(
  client: WorldQuestClient,
  continueId: string,
): Promise<ContinuePurchase> {
  const { data, error } = await client.rpc('continue_lesson', { p_continue_id: continueId })
  if (error) throw error
  return (data ?? { status: 'unauthorized' }) as ContinuePurchase
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
