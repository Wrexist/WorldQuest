# Analytics specification

> "Decide before launch."

Decided. An event taxonomy defined after launch is a taxonomy that answers whatever
questions the data happens to allow, rather than the questions you needed answered.

**Tooling:** PostHog (EU region) · **Errors:** Sentry · **Storage:** 14 months.
**Child accounts: no third-party analytics at all** — see §6.

---

## 1. Naming

`object_action`, snake_case, past tense. Always.

```
✅  lesson_completed · question_answered · streak_extended · purchase_completed
❌  completeLesson · Lesson Complete · user_did_lesson · lesson_complete_v2_final
```

**An event name is an API.** It ships into dashboards, alerts, and saved queries.
Renaming one breaks a year of history — so if a definition must change, **version it**
(`lesson_completed_v2`), run both for 30 days, then retire the old one.

Properties are `snake_case`, typed, and defined once in the registry. Never a
free-form `metadata` blob — a bag of untyped strings is where analytics goes to die.

---

## 2. The registry

Events are declared in **one** typed file. Emitting an undeclared event, or an event
with wrong properties, is a **type error**.

```ts
// packages/analytics/src/events.ts
export const EVENTS = {
  lesson_completed: {
    description: 'A lesson reached the summary screen',
    properties: {
      lesson_id:     'string',
      kind:          'lesson|quest|review|challenge|event',
      topic_id:      'string?',
      items:         'number',
      correct:       'number',
      accuracy:      'number',
      duration_ms:   'number',
      hearts_lost:   'number',
      xp_awarded:    'number',
      was_offline:   'boolean',
    },
  },
  // …
} as const

export type EventName = keyof typeof EVENTS
export function track<N extends EventName>(name: N, props: PropsOf<N>): void
```

---

## 3. The events

### Onboarding & lifecycle

| Event | Key properties | Answers |
|---|---|---|
| `app_installed` | source, campaign | Where users come from |
| `app_opened` | is_cold_start, from (icon/push/deeplink/widget) | Entry mix |
| `onboarding_started` | | |
| `onboarding_slide_viewed` | index | Where they drop in the carousel |
| `onboarding_goal_selected` | minutes | Which goal predicts retention |
| `taster_lesson_started` / `_completed` | accuracy | **The #1 activation funnel** |
| `signup_prompted` / `signup_completed` | method, after_lessons | Does the taster convert? |
| `onboarding_abandoned` | last_step | Exactly where we lose people |

### The learning loop — the core

| Event | Key properties | Answers |
|---|---|---|
| `lesson_started` | kind, topic_id, item_count, source, was_offline | Where lessons begin |
| `question_shown` | template_id, fact_id, difficulty, position | Item-level exposure |
| `question_answered` | template_id, fact_id, correct, elapsed_ms, rating, position | **The richest event we have** |
| `question_skipped` | reason | |
| `lesson_completed` | accuracy, duration_ms, hearts_lost, xp | Completion rate |
| `lesson_abandoned` | at_item, of_items, reason | **The drop-off point** |
| `hearts_depleted` | at_item, topic_id | Is the mechanic too punishing? |
| `fact_mastered` | fact_id, days_to_master, total_reviews | **Are they actually learning?** |
| `fact_lapsed` | fact_id, prior_mastery, days_since | Where the algorithm mispredicts |
| `review_backlog_shown` | due_count | Backlog anxiety |

`question_answered` carries `position` (the index within the lesson) because
accuracy-by-position tells you exactly where fatigue starts — which is how you set
lesson length honestly rather than by guessing.

### Progression & economy

`streak_extended` · `streak_broken` (with `streak_length`, `freeze_used`) ·
`streak_repaired` · `level_up` · `xp_awarded` (amount, reason) ·
`coins_earned` / `coins_spent` (amount, item_id, balance_after) ·
`achievement_unlocked` (id, tier, days_to_unlock) · `collection_completed` ·
`quest_completed` / `quest_expired` · `daily_challenge_completed` (rank_percentile)

### Navigation & content

`screen_viewed` (screen, from) · `tab_switched` · `country_viewed` (country, source) ·
`globe_interacted` (action) · `search_performed` (query_length, result_count,
selected) · `collection_viewed` · `content_pack_downloaded` (pack, ms, bytes)

### Social & commerce *(v2.0)*

`friend_added` (method) · `challenge_sent` / `_accepted` / `_completed` ·
`league_joined` / `_ended` (rank, outcome) · `paywall_viewed` (source, variant) ·
`purchase_started` / `_completed` / `_failed` (product, price, currency, error) ·
`subscription_renewed` / `_cancelled` (reason)

### System & quality

`error_occurred` (domain, code, is_fatal) · `sync_queued` / `_flushed` /
`_conflict_resolved` · `offline_mode_entered` / `_exited` (duration) ·
`xp_reconciliation_mismatch` (client_xp, server_xp) · `performance_measured`
(metric, ms) · `notification_received` / `_opened` / `_permission_result` ·
`setting_changed` (setting, value) · `a11y_feature_detected` (feature) —
*aggregate only, never per-user; knowing 12 % of users run 200 % text is a design
input, and knowing **who** is not our business.*

---

## 4. Standard properties

Attached to every event automatically:

```
user_id (hashed) · session_id · app_version · build · platform · os_version
device_model · locale · timezone · is_premium · is_child · account_age_days
network (wifi|cellular|offline) · reduced_motion · font_scale
```

**Never attached:** email, real name, precise location, IP (PostHog is configured to
discard it), device advertising ID, or any free text a user typed.

---

## 5. Funnels we watch

| Funnel | Steps | Target |
|---|---|---|
| **Activation** | install → onboarding → taster started → taster completed → signup | 60 % install→lesson |
| **Lesson** | started → item 1 → item N/2 → completed | 85 % completion |
| **Habit** | day 1 → day 2 → day 3 → day 7 | D7 ≥ 25 % |
| **Economy** | coins earned → shop viewed → item purchased | 40 % own an item by D14 |
| **Monetisation** | paywall viewed → started → completed | 3 % overall |

Plus the honest one: **`fact_mastered` → correct on the first review ≥ 30 days later**.
Target ≥ 85 %. That query is the proof that WorldQuest works, and it is the number
nobody else in this category publishes.

---

## 6. Privacy

| Rule | Implementation |
|---|---|
| **Child accounts (< 13): no third-party analytics** | The adapter is a no-op for `is_child`; events go to first-party aggregate storage only |
| No advertising identifiers | Never collected, on any account |
| IP discarded | PostHog EU config |
| No PII in properties | CI lint rejects `email`, `name`, `phone`, `address` as property names |
| User ID hashed | Salted; the salt lives server-side |
| Consent-gated where required | GDPR: analytics consent at signup; declining still lets you use everything |
| Opt-out honoured completely | Settings → Privacy → Analytics off = the tracker becomes a no-op |
| Data export includes analytics | GDPR Art. 15 |

Full posture: [`security-privacy.md`](security-privacy.md).

---

## 7. Implementation rules

1. **Track in the engine or the hook, never in JSX.** An event fired from a render is
   an event fired twice.
2. **Fire after the state change succeeds**, not on tap intent. `purchase_completed`
   means completed.
3. **Batch and queue.** Offline events persist and flush on reconnect with their
   original timestamps (`sent_at` vs `occurred_at`).
4. **Never block the UI** on analytics. Fire-and-forget, always.
5. **One event per user action.** If you need three events to describe one action, the
   event is modelled wrong.
6. **Sample high-volume events.** `question_shown` at 10 % is plenty;
   `question_answered` at 100 % because it's the valuable one.
7. **Debug builds print every event to the console** with its properties, so QA can
   verify instrumentation without a dashboard.

---

## 8. Dashboards on day one

| Dashboard | Contents |
|---|---|
| **Health** | Crash-free rate, p95 latency, error rate, sync failures |
| **North Star** | WLD, by cohort and by platform |
| **Funnels** | The five above, weekly |
| **Learning** | Facts mastered, true 30-day retention, FSRS calibration |
| **Economy** | Coin in/out, balances, shop conversion, heart-block rate |
| **Guardrails** | Notification opt-out, sessions/day, uninstall-after-push |
| **Content** | Per-fact accuracy — **finds bad questions and wrong facts automatically** |

The content dashboard is worth more than it sounds. A fact with 30 % accuracy across
thousands of users is either genuinely hard or **wrong**, and it will show up there
before anyone reports it.

---

## 9. Governance

- Adding an event = a registry entry, a description, an owner, and a dashboard or
  funnel that uses it. **An event nobody looks at is cost with no benefit.**
- Quarterly: delete events with no consumer in 90 days.
- Every experiment declares its primary metric, guardrails, and **kill criterion**
  before launch.
- Definitions live here. If a query and this document disagree, this document is
  wrong — fix it the same day.
