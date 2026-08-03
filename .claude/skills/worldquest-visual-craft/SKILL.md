---
name: worldquest-visual-craft
description: Twelve craft-level rules for WorldQuest UI — the token-, pixel- and motion-level decisions that separate a polished screen from a generated one. Use when writing or reviewing any component in packages/design or apps/mobile, and when asked to "make this look better", "polish this", "why does this look generic", or "tighten this up". Craft level, not UX-flow level.
---

# Visual craft — 12 rules

Craft is the surface: how a thing is built, not whether the flow makes sense. For flow,
use `worldquest-screen` or `worldquest-persona-check`.

Two modes. **Critique**: report only violations, each with the concrete fix. **Build**:
apply silently, mention only what shaped a visible decision.

Start a critique with one line: ✅ Crafted / ⚠️ A few rough edges / 🚨 Reads as generated.
End with at most three Priority Fixes, ordered by visual impact.

---

## The rules

**R1 · A gradient is a decision, not a default.**
This repo *does* use gradients — `Card` is a 135° two-token gradient, and there is a
paragraph in `Card.tsx` explaining why a flat fill at these lightness levels reads as a
rectangle. That is the bar. A new gradient needs a comparable reason; a gradient reached
for because a surface felt lifeless is a colour decision that has not been made yet.
Never a gradient on a button face — the face/edge pair is what gives it dimension.

**R2 · No glow.**
No coloured outer shadows to make something "pop". Emphasis comes from size, weight,
contrast and space. Shadows are for elevation (R10). The one exception is
`elevation.accent`, the primary CTA's soft green halo, and it appears once per screen.

**R3 · Every animation names its property, its token and the native driver.**
React Native has no `transition: all`, and the equivalent sin is `Animated.timing` with
a literal duration off the motion scale, or an animation that cannot run natively.
Animate `transform` and `opacity`. `motion.test.ts` fails a raw duration literal; the
native-driver rule is not automatically checked, so check it by eye.

**R4 · Kill visual monotony.**
Squint at the screenshot. If every card weighs the same, every heading is the same size,
and everything is centred, the screen has no voice. One element per view is allowed to
be big. The mockup's Home is the reference: quest card dominant, challenge secondary,
two small tiles.

**R5 · Depth belongs to anything pressable, and nothing else.**
Face on an edge, sinks on press (`press3d.tsx`). A static card with a fat bottom border
is claiming to be tappable. Conversely a pressable with no edge reads as a label.

**R6 · Neutrals carry the screen; accents are rationed.**
Colour means exactly one thing here — green is progress and correct, red is hearts, gold
is earned, blue is navigate. **One primary green per screen.** A second green CTA means
neither is primary.

**R7 · Type hierarchy comes from weight and size on ONE family.**
Nunito, 400–900, via `text()`. Never `fontWeight` beside a custom `fontFamily` — on iOS
that renders regular, on Android a smeared fake bold, and it looks correct on whichever
simulator you happened to open. `tokens.test.ts` fails any primitive containing
`fontWeight:`.

**R8 · Spacing is relationship, not decoration.**
Related things closer, unrelated further. If two labels sit 8 px apart, the gap to the
next group is 16 or 24 — not 12. Every value is a `space[n]` step. `padding: 15` is a bug
and the token test says so.

**R9 · Nothing is sized to an English string.**
`minHeight`, never `height`, on anything containing text. No line caps on a name that
identifies something. Every one of the 200 %-text failures in this repo was a box drawn
around an English word at 100 %.

**R10 · Elevation is surface lightness plus a border, then a shadow.**
On a dark canvas a shadow is dark-on-dark and nearly invisible, so a card whose only
edge is a shadow has no edge. The border draws it; the shadow lifts it. Always pair
`shadowOpacity` with `elevation` — iOS shadows do not render on Android.

**R11 · Every interactive state exists, including the boring ones.**
Default, pressed, disabled, loading, focused. A disabled control that looks enabled is a
bug report. A loading button that changes width is a layout jump.

**R12 · No placeholder anything.**
No lorem, no "Coming soon" that ships, no `—` standing in for a number nobody wired.
This repo's specific version: a preference written by Settings that nothing reads is
placeholder UI wearing a real control's clothes, and it has shipped here four separate
times (daily goal, haptics, language, sound). If a control writes a value, something
must read it.

---

## What is already gated — cite it, do not re-derive it

| Rule | Enforced by |
|---|---|
| Tokens only, no off-scale spacing, no `fontWeight` | `packages/design/src/tokens.test.ts` |
| Raw duration literals, reduced motion | `packages/design/src/motion.test.ts` |
| Contrast, 23 pairs | `pnpm design:contrast` |
| RTL, ARIA spelling, unlabelled pressables | `pnpm lint:a11y` |
| 200 % text: clipping, overlap, sideways scroll | `pnpm e2e` |
| Touch targets under 44 pt | `pnpm design:shots` |

R4, R5, R6 and R11 are the ones no script checks. They are the ones worth your attention.
