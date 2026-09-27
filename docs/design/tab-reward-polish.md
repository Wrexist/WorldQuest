# Reward styling across the tabs

Explore uses the new editable-3D globe render, a sky-colored world card, distinct collection colors and an explicit base-answer XP cue. Continent navigation and progress still use the real content and memory data.

Quests puts the turquoise Continue quest button directly below the treasure summary, ahead of the task list, and gives each task's real XP reward a gold capsule. Completed quests do not show the continue action.

Passport uses a sky-colored welcome card, the same XP cue and turquoise lesson action. Existing profiles get a next-discovery card when the route supplies a lesson callback. No new progress, badges or stamps are fabricated.

Shop uses the new 3D coin render and sapphire wallet. A savings card selects the cheapest unowned title and compares its price with the real wallet. It disappears when no unowned titles remain and never purchases or grants anything. Purchases still use the existing catalogue rows and validation.

English and Swedish strings were added together. Verification includes the four tab suites (53 tests in total after the additional shop cases), mobile TypeScript, static accessibility checks and locale completeness. Locale checking retains the existing profile/streak warnings. Final browser screenshots: `reviews/tab-rewards-2026-09-27/`. Native-device review remains outstanding.
