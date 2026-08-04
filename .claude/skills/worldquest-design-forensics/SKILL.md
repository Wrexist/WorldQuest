---
name: worldquest-design-forensics
description: Measure a design reference — a URL, a running dev server, or a screenshot — and return its typography, palette, spacing and shape as real numbers in this repo's token shape, with the contrast ratios that decide whether each value is adoptable. Use before copying anything from another product, when a brief cites a competitor, when asked "what fonts/colours is this using", "extract the design system from this", "reverse-engineer this UI", or as step 3 of a dna-transplant.
---

# Design forensics

**Never guess a hex, a size or a spacing value you could have measured.** A transplant
done by eye copies the surface and misses the arithmetic, and the arithmetic is where
the trap is.

```bash
node scripts/measure-design.cjs <url>            # 1440×900
node scripts/measure-design.cjs <url> --mobile   # 390×844
```

## What comes back, and why it is shaped like this

Type scale, palette, radii, gaps and transition durations — each mapped to **this
repo's** nearest scale step, not to Tailwind or shadcn variables. React Native has no
CSS custom properties, its spacing is indexed by step rather than pixel, and every font
weight is a separate family. Output in the wrong shape has to be re-typed by hand, and
hand-re-typing is where transcription errors live.

Every colour is reported in **both roles**, because they have opposite requirements:

| Role | Question | Floor |
|---|---|---|
| surface | can white text sit on it? | 4.5:1, or 3.0:1 for a large bold label |
| ink | can it sit on our canvas? | 4.5:1, or 3.0:1 at ≥18 px / as a non-text fill |

Most values are legal in one role and illegal in the other. Collapsing that to a single
verdict is exactly how a donor's button green becomes our button green.

## The reading that matters

Run it against a donor and you will typically find its brightest accents are **ink
only** on our dark canvas. Duolingo's `#58CC02` measures 2.09:1 against white and
8.52:1 against our canvas — brilliant as a progress fill, unreadable as a button. That
one row is the difference between a transplant and a mistake.

Once measured, derive rather than copy: darken the accent until white clears **3.15:1**
(headroom, not sitting on the floor) and keep the bright original one step up the ramp
for fills, glows and sheens. `packages/design/tokens.json` is the worked result.

## Environment limits — real, and worth knowing before you blame the tool

- **Outbound hosts are allowlisted.** A denied host answers 403 to CONNECT and the
  script says so rather than pretending. If a reference is blocked, screenshot it
  elsewhere and read the PNG directly — you lose exact hexes and keep everything else.
- **Localhost is bypassed** deliberately. Without that, a request to your own dev
  server goes out to the gateway, cannot route back, and Chromium's error page measures
  as "one monospace element on black" — a plausible table of a design that never
  loaded, which is worse than a failure.

Validate the instrument when in doubt by pointing it at our own exported bundle: it
should recover Nunito, `#47A502` as a surface, and `#58CC02` as ink-only.

## Then

Hand the numbers to `dna-transplant` (step 3), or straight to
`worldquest-design-system` if they are landing in `tokens.json`. Contrast is re-gated
by `pnpm design:contrast` regardless — this skill informs the decision, that script
enforces it.
