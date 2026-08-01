# `packages/design` — tokens and primitives

`tokens.json` is the source of truth. `src/tokens.ts` is **generated** — never edit it.

## The one rule

**Components consume semantic tokens (`color.action.primary`), never raw palette
(`blue.500`).** Raw values exist only in `tokens.json`.

That indirection is what makes a high-contrast theme, a light theme, and seasonal
event theming possible without touching a single component. Break it once and the
capability is gone.

## The scales

```
space    0 4 8 12 16 24 32 40 48 64      (4 only for icon↔label pairs)
radius   sm 8 · md 12 · lg 16 · xl 20 · 2xl 28 · full 999
motion   instant 100 · quick 180 · base 260 · expressive 420 · celebrate 900
type     display 34 · h1 28 · h2 22 · h3 18 · body 16 · caption 13 · overline 11
```

## Type: never set `fontWeight`

`fontFamily` and `fontWeight` do **not** combine for a custom font on React Native.
`{ fontFamily: 'Inter', fontWeight: '700' }` gives you regular Inter on iOS and a
synthetic fake-bold on Android — each weight is a separate file and a separate family.

So use `text()`, which resolves the whole style from one scale step:

```ts
title: { ...text('h2'), color: colors.text.primary },
count: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.progress },
```

`tokens.test.ts` fails any primitive containing `fontWeight:`. Adding a weight means
adding it to `tokens.json` **and** to `apps/mobile/src/lib/fonts.ts` — both sides
assert against the other.

`padding: 15` is a bug. If a value you need doesn't exist, **add a token** — never a
local literal.

## Every primitive ships with

All states · a Storybook story · an accessibility strategy · RTL support · a test.

Design the API so the accessible path is the easy path: a `Button` without a label
should be a **type error**, not a review comment.

## Commands

```bash
pnpm design:tokens      # regenerate tokens.ts
pnpm design:contrast    # every text/background pair against its floor
```

Spec: [`../../docs/design/design-system.md`](../../docs/design/design-system.md)
