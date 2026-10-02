# Responsive interaction motion — October 2, 2026

**Verdict: pass for the reviewed browser scope.** Four existing interactions now acknowledge an action without blocking it. No new dependency, art asset, reward rule, or ambient loop was introduced.

## What was reviewed

The immutable Expo export is `node_modules/.cache/wq-responsive-motion-web`. The real app was onboarded through its UI; no account state was seeded. At **390 × 844**, normal and reduced motion were checked for tab selection and opening/closing a locked Home course stop.

Actual `WeekStrip` and `StreakGemCollection` components were also exercised in a **clearly labelled synthetic fixture**: seven weekly counts and sixteen dated gems. The fixture was reviewed at 390 in English/light/normal and Swedish/dark/reduced with simulated native `fontScale=2` plus enlarged browser glyphs. Geometry-only checks covered the same enlarged Swedish fixture at **320 and 768**. Fixture source hashes are recorded in [report.json](report.json).

**6 cases, 28 PNGs, zero uncaught JavaScript errors, zero horizontal document overflow, and zero measured targets below 44pt** (43.5px rounding tolerance). Representative normal frames and narrow/tablet fixtures were opened and visually inspected. No material clipping or hierarchy regression was found in those images.

## Observed behavior

| Interaction | Normal motion | Reduced motion and input checks |
|---|---|---|
| Tab clay highlight | Per-frame computed opacity progresses through 13 distinct values from 0 to 1; existing icon pop remains. | Immediate selected state and final opacity. Tab press rectangles stay fixed. Rapid Home → Shop selection reaches Shop during the previous transition. |
| Home course explanation | Newly opened card rises from 8px and scales from 0.98 to rest. | Immediately settled. Opening, closing, and reopening remain available without waiting for the entrance. Existing locked-step text and expanded state are preserved. |
| Weekly activity | A real fixture count update moves Friday's fill from `scaleY(0.5)` to `scaleY(1)` about its bottom edge. The spring briefly overshoots before settling. | No intermediate scales. The accessible day label says the true new count immediately, and another control responds while the normal fill is moving. Restored data starts at its true value. |
| Gem page | Older/Newer changes replay the brief entrance on the gem batch. | Static final transform, immediate correct page announcement, and retained button focus. Paging remains usable during an entrance. Buttons and live status remain outside the animated subtree. Existing natural changes in page height are not suppressed. |

The complete frame traces are in [report.json](report.json). Screenshots named `changing` are opportunistic actual-browser frames, not guaranteed fixed millisecond samples; the recorded animation-frame traces establish the intervening motion. Screenshots retain their original pixels and require no video player.

| Interaction | Before | Changing | Settled |
|---|---|---|---|
| Tabs, real app | [Before](tabs-before-390-normal.png) | [Changing](tabs-changing-390-normal.png) | [Settled](tabs-settled-390-normal.png) |
| Home stop, real app | [Before](home-stop-before-390-normal.png) | [Changing](home-stop-changing-390-normal.png) | [Settled](home-stop-settled-390-normal.png) |
| Weekly count, fixture | [Before](fixture-week-before-390-normal.png) | [Changing](fixture-week-changing-390-normal.png) | [Settled](fixture-week-settled-390-normal.png) |
| Gem page, fixture | [Before](fixture-gems-before-390-normal.png) | [Changing](fixture-gems-changing-390-normal.png) | [Settled](fixture-gems-settled-390-normal.png) |

Enlarged Swedish dark fixtures: [weekly 320](fixture-week-layout-320-sv-dark-reduced-fontScale2.png), [gems 320](fixture-gems-layout-320-sv-dark-reduced-fontScale2.png), [weekly 768](fixture-week-layout-768-sv-dark-reduced-fontScale2.png), [gems 768](fixture-gems-layout-768-sv-dark-reduced-fontScale2.png).

## Coordinated verification

These broader checks were run by the root agent against the frozen source, separately from this focused harness:

- `pnpm verify`: **1,172 mobile tests and 49 design tests passed**, with typecheck, content, i18n, accessibility, and configuration gates passing. [Log](../../../../node_modules/.cache/wq-responsive-motion-verify.log).
- Full browser E2E: **107/107 steps passed**, exit 0; one conditional flag-image check was skipped because that run had no image question.
- Standard design screenshots: **24 views**, six routes at 320/390/430/768, with **0 overflow, 0 undersized targets, and 0 unlabelled controls**. [Report](../../../../node_modules/.cache/wq-responsive-motion-design-shots/report.json).
- Native bundles passed the unchanged **5.21 MiB** gate: **5,456,119 bytes iOS**, **5,453,594 bytes Android**. Change from the cloud pass: +755/+751 bytes. The 766 assets remain unchanged at approximately 19.66 MiB.

## Reproduction and limits

Run `node scripts/review-responsive-motion.cjs node_modules/.cache/wq-responsive-motion-web`. The harness reuses the existing browser onboarding and screenshot-fixture conventions. `--resume` continues missing cases in the same output folder; use it only with the same immutable export and component source.

An initial harness assertion incorrectly classified a reduced-motion old-to-new value snap as an animation. It was corrected to look for intermediate scales, then only the remaining cases were rerun. This required no app change.

This does not establish physical-device performance, native gestures, haptics, or actual OS Dynamic Type. The component fixture uses the existing web gradient adapter and synthetic values; it does not establish account persistence or award correctness. The root E2E run covers the real account flows separately.

*No part of this was seen on a phone.*
