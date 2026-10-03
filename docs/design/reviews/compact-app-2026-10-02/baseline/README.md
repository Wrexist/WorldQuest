# Compact app baseline — 2 October 2026

Captured the immutable `node_modules/.cache/wq-compact-explore-web-v3` export with `scripts/design-shots.cjs`, `WQ_NO_FLOWS=1`, and port 4223. These are real app routes in Chromium, using the fresh guest account's available content. No product source was changed for this capture.

32 screenshots cover eight routes at 320 × 568, 390 × 844, 430 × 932, and 768 × 1024. The reviewer opened every route at 320, 390, and 768. The [raw measurements](report.json) report zero page sideways scroll, zero targets below 44 px, and zero unlabelled controls across the 32 cases.

## Findings

These are hierarchy and compactness opportunities, not broken layouts. Heights below are visual readings from the screenshot coordinates.

| Priority | Surface | Visible problem | Evidence |
| --- | --- | --- | --- |
| High | Quests | Intro guidance, tabs, and the large chest dominate the first viewport. At 320, neither Continue nor an actual quest is initially visible. At 390, the chest is about 290 px tall and the first task remains clipped under navigation. | [320](quests@320.png), [390](quests@390.png) |
| High | Profile, fresh guest | The primary Start a lesson action is below the fold at 320. The large illustration and reward explanation take the space above it. | [320](profile@320.png), [390](profile@390.png) |
| Medium | Flag collection | Title, progress, search, filter rail, and a large introductory mascot message push the flag grid to y428 at 320. Only one complete row is visible. | [320](collection-flags@320.png), [390](collection-flags@390.png) |
| Medium | Shop | Wallet art, explanatory copy, and next-unlock progress occupy most of the initial viewport before shop actions. At 320 only the top of the next-unlock panel is visible. | [320](shop@320.png), [390](shop@390.png) |
| Medium | Achievements | Each unstarted achievement repeats Not yet, an empty bar, 0%, and a remaining count. Cards are roughly 168 px tall at 320, limiting comparison. | [320](achievements@320.png), [390](achievements@390.png) |
| Medium | Region | Map/progress and the companion introduction consume enough space that only about two country rows fit above the fixed Start action at 320. | [320](region-EU@320.png), [390](region-EU@390.png) |
| Medium | Country | The map and vertical header push the first fact below the initial viewport at 320, despite country learning being the page's purpose. The fixed practice action remains visible. | [320](country-SE@320.png), [390](country-SE@390.png) |
| Lower | Streak | The upper hero consumes roughly the first 350 px before the calendar. This is less urgent than screens where browsing or the main action is delayed. | [320](streak@320.png), [390](streak@390.png) |

The mascot remains valuable for warmth and orientation. The repeated large speech-bubble introductions are the common source of avoidable height; retaining the character in a smaller contextual treatment would preserve its role.

## Limits

Fresh-guest routes do not validate server-backed populated profile or streak states. No offline flow, enlarged text, RTL, or reduced-motion pass was requested in this baseline run. Existing automated checks are not replaced by these pictures. This is React Native Web in Chromium: no part of this was seen on a phone.
