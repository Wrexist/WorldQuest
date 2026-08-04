---
name: worldquest-a11y
description: Audit or fix accessibility in WorldQuest — screen readers, contrast, touch targets, font scaling, reduced motion, RTL. Use when reviewing a screen for accessibility, fixing an a11y issue, or before merging any UI change. Automated checks catch about a third of real problems; this covers the rest.
---

# Accessibility audit

Contract: [`docs/design/accessibility.md`](../../docs/design/accessibility.md).
Target: **WCAG 2.2 AA** plus platform conventions.

Two of our eight personas depend on this directly (Emma, Ingrid), and larger text is
the most-used accessibility feature on both platforms by an order of magnitude — this
is not a niche case.

## Run the automated checks first

```bash
pnpm lint:a11y          # RTL, ARIA spelling, touch handlers, unlabelled controls
pnpm design:contrast    # every token pair
```

Both run inside `pnpm verify`, so they are already green by the time you read this —
their value is that they *stay* green.

**Still not built**, and named here rather than listed as if they were: a scale
harness that screenshots at 100 % and 200 %, and role/label queries across every
screen. Until they exist, 200 % text and focus order are manual, every time.

Then do the manual pass. **The manual pass cannot be automated away** — and the three
commands this file used to promise did not exist, which is worse than promising
nothing, because a step that always fails is a step people learn to skip.

## The manual pass

### VoiceOver (iOS) / TalkBack (Android)
1. Turn it on. **Turn the screen brightness to zero.**
2. Complete the screen's primary task end to end.
3. If you can't, it's a bug — the same priority as a crash.

Check: every control announces its purpose (not its icon name) · focus order matches
visual order · modals trap focus and return it · state changes are announced ·
decorative elements are hidden from the reader.

### Font scale
Set the OS text size to maximum (200 %). Check: nothing clipped, no truncated button
labels, no horizontal scroll, no overlapping text.

### Reduced motion
Turn it on. Springs become 150 ms fades, Lottie shows a static end frame, parallax and
globe rotation stop, staggering stops. **Verify it, don't assume the conditional works.**

### Colour blindness
Screenshot through deuteranopia, protanopia and tritanopia simulation. Every meaningful
colour must be paired with an icon, a label, or a shape. ~8 % of men are red/green
colour-blind and a large share of our core audience is 10-year-old boys.

### Touch targets
≥ 44×44 pt, ≥ 8 pt apart. Use `hitSlop` to reach it — grow the target, not the visual.

## Common failures in this codebase

| Failure | Fix |
|---|---|
| Icon button with no label | `accessibilityLabel` describing the **action** ("Back"), not the icon ("chevron") |
| Card reads as 7 separate elements | `accessible={true}` on the container |
| Confetti announced by the screen reader | `accessibilityElementsHidden` |
| Progress bar with no value | `accessibilityValue={{ now, max, text }}` |
| Green tick as the only correctness signal | Add icon + haptic + sound |
| Countdown that can't be paused | No timed input in the core loop; speed rounds are opt-in |
| Text truncated at 200 % | Let it wrap; never fix a height to an English string |
| `left`/`right` in styles | `start`/`end` |

## The known hard problems

| Problem | Approach |
|---|---|
| Map tap questions | Screen-reader-safe sibling template with the same fact — a **content** solution |
| Flag recognition without sight | `tpl.flag-describe.mc4` describes the flag in words |
| The 3D globe | The continent grid is a full accessible equivalent, never a lesser fallback |
| Speed rounds | Opt-in, excluded from all required progression, off in Relaxed Mode |
| Streak anxiety | Freeze, repair, and a full "hide streaks" setting |

## Per-screen checklist

- [ ] Targets ≥ 44 pt, ≥ 8 pt apart
- [ ] Contrast verified for every pair
- [ ] Every control has label, role, state
- [ ] Focus order verified with a screen reader
- [ ] 200 % text: no clipping, no horizontal scroll
- [ ] Reduced motion verified
- [ ] No meaning from colour, sound, or motion alone
- [ ] Screen reader completes the primary task end to end
- [ ] RTL mirrors (flags, maps, photos do not)
- [ ] No flashing > 3 Hz
