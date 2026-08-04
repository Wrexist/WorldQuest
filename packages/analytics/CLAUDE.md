# `packages/analytics`

`src/events.ts` is the typed registry. Emitting an undeclared event, or one with wrong
properties, is a **type error**. There is no free-form metadata blob.

- Names are `object_action`, snake_case, past tense. **An event name is an API** —
  renaming breaks a year of history. Version instead (`lesson_completed_v2`).
- Adding one requires a question it answers, a dashboard that uses it, and an owner.
- Fire from a hook or after a successful state change — never from a render body.
- **The adapter is a no-op for child accounts.** That rule lives here and is
  unit-tested, so a developer cannot bypass it by forgetting a UI condition.
- No PII property names — CI rejects `email`, `name`, `phone`, `address`.

Spec: [`../../docs/engineering/analytics-spec.md`](../../docs/engineering/analytics-spec.md)
