---
description: Scaffold a new WorldQuest screen with all five states, tokens, i18n, a11y and analytics
argument-hint: <screen-name> [tab]
---

Create the WorldQuest screen: **$ARGUMENTS**

Invoke the `worldquest-screen` skill and follow it exactly.

Steps:

1. Find this screen in `docs/product/screen-catalog.md`. If it isn't there, stop and
   ask — it may be out of roadmap phase.
2. Confirm its place in `docs/product/information-architecture.md`: which tab, what
   depth, what the back path is. Max 3 pushes deep.
3. Name the persona it serves and the one primary action.
4. Scaffold:
   - the route in `apps/mobile/app/`
   - `src/features/<feature>/` with `components/`, `hooks/`, `api/`
   - all five states: content, loading (skeleton), empty, error, offline
   - i18n keys in `en` and `sv`, each with a `__note`
   - accessibility props on every control
   - the `screen_viewed` analytics event
5. Run `pnpm verify`.
6. Run `/wq-dod` and report honestly on anything not done.

Use design tokens only. No hex literals, no off-scale spacing, no string literals.
