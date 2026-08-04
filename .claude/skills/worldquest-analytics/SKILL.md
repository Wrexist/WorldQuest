---
name: worldquest-analytics
description: Add or change a tracked event, funnel or dashboard in WorldQuest. Use when instrumenting a feature, adding a metric, debugging analytics, or reviewing what to measure. Enforces the typed registry, naming, and the child-privacy no-op.
---

# Adding an analytics event

Spec: [`docs/engineering/analytics-spec.md`](../../docs/engineering/analytics-spec.md).

## Before you add one

**An event nobody looks at is cost with no benefit.** Answer:

1. What question does this answer?
2. Which dashboard or funnel will use it?
3. Who owns that dashboard?

If you can't answer all three, don't add the event.

## Naming — an event name is an API

`object_action`, snake_case, past tense.

```
✅  lesson_completed · question_answered · streak_extended
❌  completeLesson · Lesson Complete · lesson_complete_v2_final
```

Renaming breaks a year of history. If a **definition** must change, version it
(`lesson_completed_v2`), run both for 30 days, retire the old one.

## Declare it in the registry

```ts
// packages/analytics/src/events.ts
lesson_completed: {
  description: 'A lesson reached the summary screen',
  properties: {
    lesson_id: 'string', kind: 'lesson|quest|review|challenge|event',
    items: 'number', correct: 'number', accuracy: 'number',
    duration_ms: 'number', hearts_lost: 'number', was_offline: 'boolean',
  },
},
```

Emitting an undeclared event, or wrong properties, is a **type error**. There is no
free-form `metadata` blob — an untyped bag is where analytics goes to die.

## Firing

```ts
✅  in a hook or after a successful state change
❌  in a render body — that fires twice
❌  on tap intent — purchase_completed means completed
```

Fire-and-forget; never block the UI. Offline events queue with their original
`occurred_at` and flush on reconnect.

## Privacy — non-negotiable

| Rule | How |
|---|---|
| **Child accounts emit no third-party analytics** | The adapter is a no-op for `is_child`, unit-tested. Not a UI condition — a developer cannot bypass it. |
| No PII in properties | CI rejects `email`, `name`, `phone`, `address` as property names |
| No advertising identifiers | Never collected, on any account |
| Accessibility usage | Aggregate only. 12 % of users at 200 % text is a design input; *which* users is not our business. |
| Opt-out honoured completely | The tracker becomes a no-op |

## Sampling

`question_shown` at 10 % (high volume, low value). `question_answered` at 100 % — it's
the richest event we have, and `position` within the lesson is what tells us where
fatigue starts.

## Verifying

Debug builds print every event with its properties to the console. Check the event
fires **once**, with the right values, in the right order — before you open a
dashboard.

## Quarterly hygiene

Delete any event with no consumer in 90 days. Instrumentation debt is real debt.
