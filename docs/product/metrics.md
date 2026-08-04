# Metrics

Decided **before** launch, on purpose. An analytics plan written after launch is a
plan to rationalise whatever happened.

---

## North Star

> ### Weekly Learning Days (WLD)
> The number of distinct days in the trailing 7 on which a user completed ≥ 1 lesson.

**Why this one.**

| Candidate | Why rejected |
|---|---|
| DAU | Rewards notification spam; goes up while retention goes down |
| Session length | Rewards keeping people trapped; contradicts "5 minutes is complete" |
| Lessons completed | Rewards grinding; a user doing 40 lessons on Sunday is not learning |
| Revenue | Lags product quality by months; can't steer with it weekly |
| Streak length | Measures the mechanic, not the outcome |

WLD goes up only when someone genuinely chose to come back. It is capped at 7, so it
cannot be inflated. It is also the metric most correlated with actual retained
knowledge — which is the thing we're actually selling.

**Targets:** v1.0 ≥ 3.0 · v1.5 ≥ 3.8 · v2.0 ≥ 4.3

---

## The metric tree

```
                        Weekly Learning Days
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
    Do they start?          Do they finish?          Do they return?
        │                        │                        │
  install→lesson %       lesson completion %       D1 / D7 / D30
  signup completion      items per lesson          notification CTR
  taster→account %       heart depletion rate      streak survival
  time to first lesson   abandon point             re-engagement %
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                        Did they actually learn?
                                 │
                 facts → Proficient / week
                 30-day retention of mastered facts
                 accuracy on first review after 7+ days
```

The bottom box is the one nobody else in this category reports honestly. It is our
differentiator (see [`competitive-research.md`](competitive-research.md) gap #3) and it
must be on the internal dashboard from week one.

---

## Metric definitions

| Metric | Exact definition |
|---|---|
| **WLD** | `count(distinct date(completed_at)) where completed_at > now() - 7 days` |
| **Lesson completed** | ≥ 80 % of items answered *and* summary screen reached |
| **Activation** | First lesson completed within 24 h of install |
| **D7 retention** | Opened the app on day 7 ± 1, cohorted by install day |
| **Facts Proficient** | `user_facts` transitioning to `mastery >= 'proficient'` in the window |
| **True retention** | % of facts still answered correctly on their first review ≥ 30 days after reaching Proficient |
| **Streak survival** | % of users with a 7-day streak who reach 14 |
| **Session** | Foreground activity with < 30 min inactivity gap |

Ambiguity here costs more than it looks. **Change a definition → version it**
(`wld_v2`) and keep both running for 30 days.

---

## Targets by release

| Metric | v1.0 | v1.5 | v2.0 |
|---|---|---|---|
| WLD | 3.0 | 3.8 | 4.3 |
| Install → first lesson | 60 % | 65 % | 70 % |
| D1 | 45 % | 50 % | 55 % |
| D7 | 25 % | 30 % | 35 % |
| D30 | 12 % | 16 % | 20 % |
| Lesson completion | 85 % | 88 % | 90 % |
| Facts Proficient / active week | 15 | 18 | 20 |
| True 30-day retention | 85 % | 87 % | 88 % |
| Crash-free sessions | 99.5 % | 99.7 % | 99.8 % |
| Free → Premium | — | — | 3 % |
| Store rating | 4.5 | 4.6 | 4.6 |

---

## Guardrails — metrics that must **not** go up

These have equal standing with the targets. A feature that moves a target and breaks
a guardrail does not ship.

| Guardrail | Limit | Why |
|---|---|---|
| Notification opt-out rate | < 8 % | We're annoying people |
| Median sessions/day | ≤ 3 | We're building compulsion, not habit |
| Median session length | ≤ 12 min | We're not letting people leave |
| Support tickets "lost progress" | ≈ 0 | Sync is broken; trust is the product |
| Reported incorrect facts | < 5 / month at scale | Content quality is slipping |
| Under-13 accounts with social features enabled | **0** | Safety incident |
| Uninstall within 24 h of a push | < 2 % | The notification was a shove, not an invitation |
| p95 "next items" latency | < 50 ms | The app feels dead above this |

---

## What we refuse to optimise

Stated so nobody quietly optimises them later:

- **Time in app.** Not a goal. A 5-minute session that ends well beats a 20-minute one
  that ends in fatigue.
- **Streak length as an end in itself.** A 400-day streak with 40 % accuracy is a
  product failure we happen to be scoring as a win.
- **Ad revenue.** There are no ads.
- **Notification volume.** Hard-capped at 2/day, 1 default (see
  [`../systems/notifications.md`](../systems/notifications.md)).
- **Anything that improves by making a 10-year-old anxious.**

---

## Instrumentation

Event names, properties, and the full taxonomy:
[`../engineering/analytics-spec.md`](../engineering/analytics-spec.md).
Tooling and privacy posture: PostHog (EU region), **no third-party analytics on child
accounts** — child events go to first-party storage only, aggregated, no device or
advertising identifiers. See
[`../engineering/security-privacy.md`](../engineering/security-privacy.md).

## Review cadence

| Cadence | What | Who |
|---|---|---|
| Daily | Crash rate, p95 latency, error budget | Engineering |
| Weekly | WLD, funnel, guardrails, top drop-off point | Whole team |
| Per release | Full target table + a written retro | Whole team |
| Monthly | True learning retention (the honest one) | Product |
| Quarterly | Competitor re-verification, persona validation interviews | Product |

**Rule:** every experiment declares its success metric, its guardrails, and its
**kill criterion** before it launches. An experiment with no kill criterion is a
feature with extra steps.
