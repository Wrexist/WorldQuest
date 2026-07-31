# `apps/mobile` — the Expo app

**Screens and navigation only.** Business logic belongs in `packages/engines` or in
hooks — never in JSX.

## Structure

```
app/              expo-router file routes — thin: fetch, compose, delegate
  (tabs)/         home · explore · quests · profile · more   — FIVE TABS, FOREVER
  (auth)/         onboarding · sign-in
  lesson/         the lesson runner (full-screen modal)
src/features/     feature-first: components/ · hooks/ · api/ · store.ts
src/components/   app-wide composites (primitives live in packages/design)
```

## Before building a screen

Invoke the `worldquest-screen` skill. Then answer: which screen in the catalogue,
which persona, where in the IA, what is the one primary action.

## Non-negotiable

- **Five states** on every screen: content · loading (skeleton, never a spinner on
  primary content) · empty · error · offline
- **Tokens only** — no hex literals, no off-scale spacing, no raw durations
- **Every string is an i18n key** with a translator note, in `en` and `sv`
- **Accessibility as you build** — label, role, state; ≥ 44 pt targets; 200 % text;
  reduced motion verified, not assumed
- **Server state in TanStack Query** — never copied into Zustand
- **The lesson runner is a state machine** in `packages/engines`, not a pile of booleans

## Motion

Things scale and spring; they don't fade in place. Celebration never blocks input.
Wrong answers get a gentle settle and `impactMedium` — no shake, no red flash, no
buzzer. We don't punish.

Finish with `/wq-dod`.
