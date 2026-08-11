/**
 * The WorldQuest analytics registry.
 *
 * Decided BEFORE launch, on purpose — a taxonomy written afterwards answers whatever
 * questions the data happens to allow, rather than the ones you needed answered.
 *
 * An event name is an API: it ships into dashboards, alerts and saved queries.
 * Renaming one breaks a year of history. If a DEFINITION must change, version it
 * (`lesson_completed_v2`), run both for 30 days, then retire the old one.
 *
 * Spec: docs/engineering/analytics-spec.md
 */

export const EVENTS = {
  // ── onboarding & lifecycle ────────────────────────────────────────────────
  app_opened: {
    description: 'App brought to the foreground',
    properties: { is_cold_start: 'boolean', from: 'icon|push|deeplink|widget' },
  },
  onboarding_slide_viewed: {
    description: 'A slide of the onboarding carousel was shown',
    properties: { index: 'number' },
  },
  onboarding_goal_selected: {
    description: 'Daily goal chosen during onboarding',
    properties: { minutes: 'number' },
  },
  onboarding_region_selected: {
    description:
      'The continent the first lessons will stay in, chosen during onboarding. ' +
      '"any" when the user picked "anywhere in the world", which is a real answer.',
    properties: { region: 'string' },
  },
  onboarding_level_selected: {
    description:
      'Self-assessed starting level from onboarding. Worth watching against measured ' +
      'first-session accuracy: a population that consistently under- or over-claims is ' +
      'telling us the three labels are wrong, not that the users are.',
    properties: { level: 'string' },
  },
  taster_lesson_completed: {
    description: 'The pre-account taster lesson was finished. The #1 activation step.',
    properties: { accuracy: 'number', duration_ms: 'number' },
  },
  signup_completed: {
    description: 'Account created',
    properties: { method: 'apple|google|email|guest_upgrade', after_lessons: 'number' },
  },
  onboarding_abandoned: {
    description: 'Onboarding left before completion — tells us exactly where we lose people',
    properties: { last_step: 'string' },
  },

  // ── the learning loop ─────────────────────────────────────────────────────
  lesson_started: {
    description: 'A lesson began',
    properties: {
      lesson_id: 'string',
      kind: 'lesson|quest|review|challenge|event',
      topic_id: 'string?',
      item_count: 'number',
      source: 'home|quests|explore|notification|widget',
      was_offline: 'boolean',
    },
  },
  question_answered: {
    description: 'The richest event we have. Sampled at 100%.',
    properties: {
      lesson_id: 'string',
      template_id: 'string',
      fact_id: 'string',
      correct: 'boolean',
      elapsed_ms: 'number',
      rating: 'number',
      position: 'number',
      $comment_position: 'index within the lesson — accuracy by position is how we set lesson length honestly rather than by guessing',
    },
  },
  lesson_completed: {
    description: 'A lesson reached the summary screen',
    properties: {
      lesson_id: 'string',
      kind: 'lesson|quest|review|challenge|event',
      items: 'number',
      correct: 'number',
      accuracy: 'number',
      duration_ms: 'number',
      hearts_lost: 'number',
      xp_awarded: 'number',
      was_offline: 'boolean',
    },
  },
  lesson_abandoned: {
    description: 'A lesson was left before completion — the drop-off point',
    properties: { lesson_id: 'string', at_item: 'number', of_items: 'number', reason: 'string' },
  },
  hearts_depleted: {
    description: 'Ran out of hearts. Watch this — if it is high, the mechanic is too punishing.',
    properties: { at_item: 'number', topic_id: 'string?' },
  },
  fact_mastered: {
    description: 'A fact reached mastery. The proof that the product works.',
    properties: { fact_id: 'string', days_to_master: 'number', total_reviews: 'number' },
  },
  fact_lapsed: {
    description: 'A previously-mastered fact was forgotten — where the scheduler mispredicts',
    properties: { fact_id: 'string', prior_mastery: 'string', days_since: 'number' },
  },

  // ── progression & economy ─────────────────────────────────────────────────
  streak_extended: { description: 'Streak grew', properties: { length: 'number' } },
  streak_broken: {
    description: 'Streak reset',
    properties: { length: 'number', freeze_used: 'boolean' },
  },
  level_up: { description: 'Explorer level increased', properties: { level: 'number', title: 'string?' } },
  coins_spent: {
    description: 'Coins spent in the shop',
    properties: { amount: 'number', item_id: 'string', balance_after: 'number' },
  },
  cosmetic_equipped: {
    description: 'A cosmetic was worn or taken off. `item_id` is "level_title" when the user returns to the title their level earned.',
    properties: { item_id: 'string', kind: 'string' },
  },
  achievement_unlocked: {
    description: 'Achievement or tier unlocked',
    properties: { achievement_id: 'string', tier: 'string', days_to_unlock: 'number' },
  },
  quest_completed: { description: 'Daily or weekly quest completed', properties: { quest_id: 'string' } },

  // ── monetisation ──────────────────────────────────────────────────────────
  //
  // The whole funnel, so the industry benchmarks in docs/systems/monetization.md can
  // be CHECKED against our own numbers rather than believed. `paywall_shown` fires for
  // the parental-gate variant too — otherwise the funnel silently under-counts and the
  // child branch looks like it converts at zero.
  //
  // None of these fire on a child account: `track` no-ops there, and that must stay
  // true. A purchase event attached to an under-13 user is a COPPA problem, not a
  // metric.
  paywall_shown: {
    description: 'Paywall or parental gate presented',
    properties: { source: 'string', variant: 'string' },
  },
  paywall_dismissed: {
    description: 'Paywall closed without a purchase — a decision, not a failure',
    properties: { source: 'string', page: 'number' },
  },
  plan_selected: {
    description: 'Purchase started for a plan',
    properties: { plan: 'string', with_trial: 'boolean' },
  },
  trial_started: { description: 'Free trial began', properties: { plan: 'string' } },
  trial_converted: { description: 'Trial charged successfully', properties: { plan: 'string' } },
  trial_cancelled: {
    description: 'Trial cancelled before charging',
    properties: { plan: 'string', day: 'number' },
  },
  purchase_failed: { description: 'Store rejected the purchase', properties: { reason: 'string' } },
  // The two that pay for themselves. A third of Google Play cancellations are failed
  // charges rather than decisions; without these events that loss is invisible and
  // indistinguishable from ordinary churn.
  billing_issue_detected: {
    description: 'Renewal failed; grace period started',
    properties: { store: 'string' },
  },
  billing_issue_resolved: {
    description: 'Payment fixed before access lapsed — recovered revenue',
    properties: { store: 'string', days_in_grace: 'number' },
  },
  subscription_cancelled: {
    description: 'Auto-renew turned off',
    properties: { plan: 'string', days_subscribed: 'number' },
  },
  winback_shown: { description: 'Win-back offer presented at cancel', properties: { plan: 'string' } },
  winback_accepted: { description: 'Win-back offer taken', properties: { plan: 'string' } },

  // ── navigation & content ──────────────────────────────────────────────────
  screen_viewed: { description: 'A screen was shown', properties: { screen: 'string', from: 'string?' } },
  country_viewed: { description: 'A country page was opened', properties: { country: 'string', source: 'string' } },
  search_performed: {
    description: 'Country search',
    properties: { query_length: 'number', result_count: 'number', selected: 'boolean' },
  },

  // ── system & quality ──────────────────────────────────────────────────────
  error_occurred: {
    description: 'A handled error surfaced to the user',
    properties: { domain: 'string', code: 'string', is_fatal: 'boolean' },
  },
  sync_conflict_resolved: {
    description: 'Client and server state disagreed; server won',
    properties: { kind: 'string' },
  },
  xp_reconciliation_failed: {
    description: 'Client-predicted XP differed from the server. A spike means a bug or a cheat.',
    properties: { client_xp: 'number', server_xp: 'number' },
  },
  offline_mode_entered: { description: 'Lost connectivity', properties: {} },
  notification_opened: { description: 'A push notification was opened', properties: { type: 'string' } },
  setting_changed: { description: 'A setting was changed', properties: { setting: 'string', value: 'string' } },
  a11y_feature_detected: {
    description:
      'An accessibility setting is active. AGGREGATE ONLY — that 12% of users run 200% text is a design input; which users do is not our business.',
    properties: { feature: 'string' },
  },
} as const

export type EventName = keyof typeof EVENTS

/**
 * Attached automatically to every event. Note what is absent: no email, no real
 * name, no precise location, no IP (discarded at ingest), no advertising ID, and no
 * free text the user typed.
 */
export type StandardProperties = {
  user_id_hashed: string
  session_id: string
  app_version: string
  platform: 'ios' | 'android' | 'web'
  locale: string
  timezone: string
  is_premium: boolean
  is_child: boolean
  account_age_days: number
  network: 'wifi' | 'cellular' | 'offline'
  reduced_motion: boolean
  font_scale: number
}

/**
 * High-volume, low-value events are sampled. `question_answered` is not — it is the
 * one we actually analyse.
 */
export const SAMPLE_RATES: Partial<Record<EventName, number>> = {
  screen_viewed: 1.0,
  question_answered: 1.0,
}

/**
 * The tracker port. The Supabase/PostHog adapter implements it — and returns a no-op
 * implementation when `is_child` is true. That rule lives in the adapter and is
 * unit-tested, so a developer cannot bypass it by forgetting a UI condition.
 */
export type Analytics = {
  track<N extends EventName>(name: N, properties: Record<string, unknown>): void
  identify(userIdHashed: string, traits: Partial<StandardProperties>): void
  flush(): Promise<void>
}
