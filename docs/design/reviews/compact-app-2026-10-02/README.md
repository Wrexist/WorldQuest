# Compact app surfaces — 2026-10-02

After approving the compact Explore screen, the user asked for similar improvements elsewhere. A rendered review of eight routes at 320/390/430/768 found the clearest opportunities in Quests, Profile and Shop. The [baseline review](baseline/README.md) records all 32 screenshots and the remaining lower-priority observations.

This pass serves Priya's quick, one-handed sessions and Alex's interest in visible progress. It changes existing screens and actions, with no new route, dependency, reward rule or content fact. Explore's approved layout and the recently approved chest artwork remain.

## Changes

- **Quests (catalogue 4):** the guidance sits beside a tappable Atlas in the heading. The treasure card uses a smaller chest and no accidental wrapping of its two columns at normal 320-point text. Its lid/nudge, real task checkpoints and completion reward are preserved. Continue is outside the scroller above the tab bar, and disappears on completion. Task details use a row at ordinary phone widths and stack for narrow screens or large native text.
- **Profile (catalogue 13):** identity and level progress share a compact passport card. The illustrated identity no longer consumes a separate 240-point scene before the name and XP. The guest state brings its first-lesson action into view sooner, while retaining the playful mascot.
- **Shop:** coin balance and next unlock share one summary, with a smaller coin illustration and the existing balance-change motion. The streak-freeze entry takes less space. Prices, ownership, affordability, equip behavior, fairness copy and the destination for freeze purchases retain their existing meaning.

Primary actions remain Continue quest, Start a lesson for a new Profile, and the existing eligible purchase/equip actions in Shop. Screen data, error/loading states and offline handling remain owned by their existing routes and hooks.

## Evidence and validation

Rendered before/after examples from the real exported app:

| Screen | Before | After |
| --- | --- | --- |
| Quests, 390 | [Before](baseline/quests@390.png) | [After](browser-final/quests-390.png) |
| Profile guest, 320 | [Before](baseline/profile@320.png) | [After](browser-final/profile-320.png) |
| Shop, 390 | [Before](baseline/shop@390.png) | [After](browser-final/shop-390.png) |

The default 320/390/768 captures were inspected. Profile's guest action is now visible at 320. Quests shows a full task at 390 while retaining Continue above the tabs; at 320 the treasure and tasks still need scrolling, with Continue visible throughout. Shop shows its title section earlier. These are compact layouts, not a promise that every screen fits without scrolling.

The [final exported-app review](browser-final/README.md) passes all 22 cases, including completing an actual lesson to inspect the [populated Profile](browser-final/profile-after-lesson-populated-390.png). There are no uncaught browser errors, measured sideways page overflow or measured controls below 44 px. Chest nudging preserves progress, Continue stays visible while scrolling, and Achievements and Streak navigation work.

At default text the quest treasure card measures 230 px, down from 290 px at 390. Shop's combined wallet and next-unlock summary measures 212 px, with a 109 px freeze row. The populated Profile passport measures 206 px, including identity and level progress; its former illustration alone was 240 px.

Reduced motion and large text are checked separately from normal screenshots. The [final native-font-scale fixture](native-layout-final/README.md) passes 12 cases at 320/390/768 in Swedish, dark mode, fontScale=2 and enlarged glyphs. It uses actual components with explicitly labeled fixture data, not an earned account. Full element captures verify offscreen content as well as the first viewport.

That pass caught and fixed large-text problems: Profile's identity and stats now reflow without overlap; Quests gives its heading and tabs full-width space; long empty-state text stays within its card; stacked mascot bubbles keep their natural text height. The earlier evidence remains in `native-layout-fixture` and `browser` for comparison.

`pnpm verify` passes, including 1,166 mobile tests across 130 files. After the final large-text refinements, all 44 design tests, 60 focused Quests/Profile/Shop tests and mobile TypeScript pass again. Both final native Hermes exports pass the unchanged 5.2 MiB gate: iOS 5,449,599 bytes, Android 5,447,987 bytes, with 804 shipped assets. Relative to the preceding compact Explore build, the change is 1,056 bytes on iOS and 1,055 bytes on Android; no new runtime art or dependency was added.

The full end-to-end flow also passes against the final immutable export: 107/107 steps, with one flag-artwork check skipped because the generated lesson contained no image question. This includes keyboard lesson completion, offline recovery and enlarged-text route checks. Its log is `node_modules/.cache/wq-compact-app-e2e.log` and screenshots are in `node_modules/.cache/wq-compact-app-e2e-shots`.

No part of this was seen on a phone. Browser rendering and Hermes compilation do not establish VoiceOver/TalkBack behavior, native font metrics, haptics or device frame timing.
