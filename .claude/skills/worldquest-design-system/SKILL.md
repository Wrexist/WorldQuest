---
name: worldquest-design-system
description: Work with WorldQuest design tokens, primitives, theming and motion. Use when adding or changing a colour, spacing value, radius, shadow, font, animation duration, or a primitive component in packages/design — and when a design needs a value that does not yet exist as a token.
---

# The WorldQuest design system

Spec: [`docs/design/design-system.md`](../../docs/design/design-system.md).
Source of truth: `packages/design/tokens.json` → generated `tokens.ts`.

## The one rule

**Components consume semantic tokens. Only `tokens.json` contains raw values.**

```
raw palette      blue.500 = #1E86E8         ← tokens.json only
semantic         color.action.secondary     ← what components import
```

This is what makes a high-contrast theme, a light theme, and seasonal event theming
possible without touching a single component. Break it once and that capability is
gone.

## Adding a token

1. Does an existing token express the intent? Usually yes — use it.
2. If not, add it to `tokens.json` under the right group, with a comment saying why.
3. Add the **semantic** alias — components never import raw palette names.
4. Regenerate: `pnpm design:tokens`.
5. Check contrast: `pnpm design:contrast` must pass for every new text/background pair.
6. Update `docs/design/design-system.md` in the same PR.

**Never** add a one-off value in a component. "Just this once" is how design systems die.

## The scales — memorise these

```
space    0 4 8 12 16 24 32 40 48 64          (8-point grid; 4 only for icon↔label)
radius   sm 8 · md 12 · lg 16 · xl 20 · 2xl 28 · full 999
motion   instant 100 · quick 180 · base 260 · expressive 420 · celebrate 900
type     display 34 · h1 28 · h2 22 · h3 18 · body 16 · caption 13 · overline 11
```

`padding: 15` is a bug. `duration: 300` is a bug.

## Colour meaning — never decoration

| Colour | Means | Never |
|---|---|---|
| Green | Progress, correct, the primary action | Decoration |
| Blue | Navigate, start | Success |
| Gold | Earned, or costs money | Highlight |
| Orange | Streak | Warning |
| Red | Hearts, destructive | A wrong answer's background |

**One primary green per screen.**

## Elevation on a dark canvas

Elevation is **surface lightness + glow**, not black shadow. Level 1 = `surface.1` +
soft shadow; level 3 = `surface.2` + 1px border + deeper shadow. Always pair a shadow
with Android `elevation`.

## Primitives

`packages/design/src/primitives/`. Every primitive ships with: all states, a Storybook
story, an accessibility strategy, RTL support, and a test.

Design the API so the accessible path is the easy path — a `Button` without a label
should be a **type error**, not a review comment.

## Contrast floors

- Body text ≥ 4.5:1 · large text (≥ 24 px) ≥ 3:1
- `text.3` on `surface.1` ≈ 3.9:1 → **≥ 18 px only**
- White on `green.500` ≈ 3.3:1 → **large bold button labels only**, never captions

## CI will fail on

A hex literal outside `tokens.json` · a spacing value off the scale · a font size off
the type scale · a new text/background pair below its contrast floor.
