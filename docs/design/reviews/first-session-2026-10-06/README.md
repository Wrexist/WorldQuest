# First-session review — 6 October 2026

The required onboarding path is now welcome, neutral birth-year entry and a first-lesson invitation. Language selection and the flag demo remain optional. Goal, region, level and marketing slides no longer delay the first real lesson. Existing preferences survive replaying the intro; pace and level remain in Settings.

The first completed taster goes from its summary directly to the actual next course lesson. The route reads saved course progress; it does not create progress or rewards. Streak and quest rewards are still persisted, and pending badges remain queued for a later celebration. Returning sign-in stays at welcome, and child safeguards remain unchanged.

The next-challenge page keeps both actions outside its scroller. At short heights it omits the duplicate course-node illustration and general encouragement, retaining the actual lesson objective and position. Onboarding resets its scroll position between steps. Artwork and finite entrance motion use the existing clay components and motion preferences.

## Rendered review

The real exported web bundle was driven from a fresh install through a completed first lesson into lesson two at 320, 390, 430 and 768 CSS pixels. The short screen also checks both next-lesson actions at 200% CSS text. Screenshot hooks wait for image decoding and entrance motion, so a capture cannot silently omit Atlas during loading.

The review caught a cropped welcome paragraph and a next-lesson action below the fold at 320. Both are fixed. Text and details remain scrollable at enlarged sizes; the primary and home actions remain reachable. No new artwork or rendering dependency was added.

- [Welcome, 320](onboarding-welcome@320.png)
- [Welcome, 390](onboarding-welcome@390.png)
- [Age setup](onboarding-age@390.png)
- [Ready to learn](onboarding-taster@390.png)
- [Next lesson, 320](first-session-next-challenge@320.png)
- [Next lesson, 390](first-session-next-challenge@390.png)
- [Next lesson, 200% text](first-session-next-challenge-large-text@320.png)
- [Second lesson](first-session-second-lesson@390.png)
- [Next lesson, 768](first-session-next-challenge@768.png)

## Validation

- Focused onboarding, post-lesson planning and next-challenge tests: 39 passed. Covers the age boundary, no preselected age, all supported birth years, back navigation, optional language/demo, duplicate finishing, real next course step and no offers after the first completed taster.
- Browser journey: 103/103 checks, including English/Swedish small-screen setup at 200% text. Final targeted flow additionally verifies the revised next-challenge footer and starts lesson two at all four widths.
- Connected local D1 journey: 44/44, including first-lesson credit, server rewards, offline lesson completion, two-session progress, returning sign-in and child safeguards. Local email capture only; no real email was sent.
- iOS and Android bundles: 5.13 MB each, below the unchanged 5.21 MB limit. Compilation is not native runtime acceptance.
- Full `pnpm verify` passed: 1,247 mobile, 782 engine, 102 backend, 162 edge, 64 API, 49 design, 29 i18n, 22 content and 6 analytics tests, plus tooling, coverage and repository checks. Existing content/translation warnings remain; no gate was relaxed.

No part of this was seen on a phone. Native safe areas, VoiceOver/TalkBack, Dynamic Type, haptics and frame rate still require the next device candidate. This is a shorter implemented flow, not evidence of improved conversion or a completed usability study.
