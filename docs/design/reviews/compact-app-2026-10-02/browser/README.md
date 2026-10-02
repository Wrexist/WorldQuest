# First implementation review

`review-compact-app.cjs` ran against the immutable `wq-compact-app-web-v1` export. The [report](report.json) contains 22 cases and no uncaught browser errors. These images preserve the first implementation; later focused proof belongs in a separate directory.

- Default Quests, Profile, and Shop at 320 × 568, 390 × 844, and 768 × 1024.
- The same fresh-guest routes in Swedish, dark mode, reduced motion, with doubled glyph sizes. React Native Web does not apply native font scaling; these are glyph stress checks, not native layout-branch proof.
- The quest's Continue action stays above the tab bar both before and after scrolling, including the enlarged-text cases.
- Nudging the chest leaves task text and aggregate progress unchanged. The Achievements tab opens its route. Shop's freeze row opens Streak; the next unlock remains unchanged, unaffordable purchase buttons stay disabled, and the free level title remains worn.
- A first lesson was started from Profile and completed using visible UI controls and the repository's lesson helper. It reached a real summary after 35 answer attempts, reporting 59 XP and 25 coins. No account state was seeded. Profile then displayed its populated passport at all three widths.

At default text, the chest is 230 px tall (the baseline was about 290 px at 390). The fresh Profile's Start a lesson button spans y414–470 at 320 and is visible above navigation. The combined Shop wallet/next-unlock card is 212 px tall. The populated passport after the actual lesson is 206 px tall.

The first report's `fullyVisible` rectangle helper checks viewport containment, not clipping by a scroll ancestor. For example, the 320 chest extends behind the pinned footer; the screenshot shows this correctly. The helper was subsequently tightened. The Continue action's visibility claims are unaffected.

Visual inspection found the Swedish guest heading could extend slightly beyond its blue card at 320. The separate native-font-scale fixture also exposed populated Profile stat/identity overlap and a crowded Quests segmented control. Those findings require the subsequent fixes and proof; a passing geometry assertion alone does not certify the visual result.

This is the real exported app in Chromium. It does not validate native font rendering, gestures, haptics, or device performance. No part of this was seen on a phone.
