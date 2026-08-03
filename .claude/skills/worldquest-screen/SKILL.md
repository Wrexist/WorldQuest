---
name: worldquest-screen
description: Build or change a WorldQuest screen or UI component correctly — five states, design tokens, i18n, accessibility, analytics, haptics. Use whenever creating a new screen, editing an existing one, or adding a component to apps/mobile or packages/design. Triggers on "add a screen", "build the X screen", "new component", "update the UI", or any work under apps/mobile/app or src/features.
---

> **Before you start**, if the brief names a product to feel like ("make it like
> Duolingo", "Wallet-style cards"), run `dna-transplant` first — it names the mechanics
> and measures them instead of copying the surface. **After you finish**, run
> `/design-review`, which looks at the rendered screen rather than the diff. Craft-level
> polish is `worldquest-visual-craft`.

# Building a WorldQuest screen

Read [`docs/design/design-system.md`](../../docs/design/design-system.md) and the
screen's entry in [`docs/product/screen-catalog.md`](../../docs/product/screen-catalog.md)
before writing code.

## 1. Before you write anything

Answer these four in the PR description:

1. **Which screen is this?** Find it in the screen catalogue. If it isn't there, it
   probably shouldn't exist yet — check the roadmap phase.
2. **Which persona does it serve?** Name one from `docs/product/personas.md`.
3. **Where does it live in the IA?** Which tab, what depth, what's the back path?
   Max 3 pushes deep — anything deeper is a sheet.
4. **What is the one primary action?** There is exactly one green button.

## 2. Structure

```
apps/mobile/app/(tabs)/explore.tsx          route: thin, composes
apps/mobile/src/features/explore/
  components/ContinentCard.tsx              presentational
  hooks/useContinentProgress.ts             data + logic
  api/queries.ts                            TanStack Query
  store.ts                                  Zustand, only if session state is needed
```

Routes are thin: fetch, compose, delegate. **No business logic in JSX.**

## 3. The five states — all required

| State | Rule |
|---|---|
| **Content** | The happy path |
| **Loading** | `Skeleton` matching the final layout. **Never a spinner** on primary content, never a layout shift when data arrives. |
| **Empty** | Explains *why* it's empty and offers the next step. Never a dead end. |
| **Error** | Human sentence + Retry + a support path. No error codes shown to users. |
| **Offline** | `OfflineBanner`, non-blocking, says what still works. |

A screen without all five is not done.

## 4. Tokens only

```tsx
// ❌ every one of these fails CI
backgroundColor: '#0A1F3C'   padding: 15   borderRadius: 14   duration: 300

// ✅
import { colors, space, radius, motion } from '@worldquest/design'
backgroundColor: colors.bg.surface
padding: space[4]
borderRadius: radius.lg
duration: motion.base
```

Use **semantic** tokens (`colors.action.primary`), never raw palette (`blue.500`).
If the value you need doesn't exist, add a token — never a local literal.

## 5. Every string is a key

```tsx
❌  <Text>Continue</Text>
❌  <Text>You found {country.name}</Text>          // concatenation breaks translation
✅  <Text>{t('common:continue')}</Text>
✅  <Text>{t('lesson:youFound', { country: country.name })}</Text>
```

Add the key to `packages/i18n/locales/en/` **and** `sv/`, with a `__note` giving the
translator context.

## 6. Accessibility — not a later pass

```tsx
<Pressable
  accessible
  accessibilityRole="button"
  accessibilityLabel={t('lesson:answer.label', { country: name })}
  accessibilityState={{ selected, disabled }}
  hitSlop={12}                       // reach 44pt without growing the visual
/>
```

- Every target ≥ 44×44 pt, ≥ 8 pt apart
- Focus order matches visual order — verify with a screen reader, don't assume
- Test at 200 % font scale
- Reduced motion path implemented and checked
- Never signal with colour alone: pair with an icon, a label, or a haptic

## 7. Motion & haptics

Use the tokens (`motion.instant|quick|base|expressive|celebrate`). Things scale and
spring; they don't fade in place. Celebration never blocks input.

Haptic on every meaningful outcome. **Wrong answers get `impactMedium`, never
`notificationError`** — we don't punish.

## 8. Analytics

```ts
track('screen_viewed', { screen: 'explore', from: 'home' })
```

Fire from a hook or an effect, never from a render body. The event must exist in
`packages/analytics/src/events.ts` or it won't typecheck.

## 9. Finish

Run `/wq-dod`. Attach before/after screenshots at default **and** 200 % text.
