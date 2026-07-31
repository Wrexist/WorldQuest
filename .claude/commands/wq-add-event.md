---
description: Add a tracked analytics event to the WorldQuest registry
argument-hint: <event_name> <what it measures>
---

Add the analytics event: **$ARGUMENTS**

Invoke the `worldquest-analytics` skill.

First, answer these three. If you can't answer all three, don't add the event:

1. What question does it answer?
2. Which dashboard or funnel will use it?
3. Who owns that dashboard?

Then:

- Name it `object_action`, snake_case, past tense. An event name is an API — renaming
  breaks a year of history.
- Declare it in `packages/analytics/src/events.ts` with a description and typed
  properties. No free-form metadata blob.
- Check no property name could carry PII (CI rejects `email`, `name`, `phone`,
  `address`).
- Fire it from a hook or after a successful state change — never from a render body,
  never on tap intent.
- Decide sampling: high-volume/low-value events get sampled.
- Add it to `docs/engineering/analytics-spec.md` in the same change.
- Verify in a debug build that it fires **once**, with the right values.

Confirm the child-account no-op still holds — the adapter must not emit for `is_child`.
