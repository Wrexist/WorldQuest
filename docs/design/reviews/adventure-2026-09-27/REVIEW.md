# Illustrated adventure review — 27 September 2026

The screenshots in this folder come from the running Expo web export after real onboarding, with a new user's actual zero progress. They are not generated app mockups.

## Evidence

- Web export completed (`wq-adventure-delivery`).
- Mobile TypeScript check passed.
- Design token tests: 21 passed.
- Final targeted component run: 36 tests passed across CoursePath, Explore and Shop. Profile and Quest screen suites also passed in the preceding run.
- Contrast: 49 curated and 35 generated pairs passed.
- Accessibility source lint passed.
- Scrollability source checks passed across 19 screens.
- Browser: 17 checks passed; five tabs at 320, 390 and 768 pixels, no failed artwork or horizontal page overflow, locked-step explanation and real lesson launch verified. No page errors.
- `git diff --check` passed.

Earlier component-test attempts were interrupted by worker startup failures on the busy host. The successful targeted rerun used one thread and a 15-second per-test timeout without changing repository test configuration. A duplicate earned-title label found by the Shop test was removed by integrating the new explorer into the existing title card.

## Scope and limits

The new illustrations are static raster artwork. Existing gameplay, press, progress and reward animations remain separate. The experimental new 3D character sculpt was not accepted for runtime use; a fully rigged character matching the new illustration is still outstanding. No native device frame-rate, VoiceOver or haptics claim is made by this browser review.

Coins remain spendable; streak gems remain collectible badges. The reference's sample balances, stamps and outfit products were not fabricated in the app.

See [the screenshot gallery](index.html), [browser evidence](browser-report.json), and [asset prompts](../../assets/adventure/PROMPTS.md).
