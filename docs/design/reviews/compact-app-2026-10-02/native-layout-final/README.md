# Native font-scale layout fixture

`scripts/review-compact-app-layout.cjs` renders the actual `QuestScreen`, `ShopScreen`, and both Profile branches using explicitly synthetic props. It sets React Native's window `fontScale` to 2 before mounting and separately doubles rendered glyph sizes because React Native Web does not implement native text scaling. All cases use Swedish, dark mode, and reduced motion.

The [report](report.json) records 12 passing cases: four screen states at 320, 390, and 768 px. There are no uncaught errors, no text extending outside the viewport, and no measured buttons below 44 px. Full-element captures additionally verify that the treasure card, passport, companion message, statistics, wallet, and freeze row contain their text horizontally and vertically. The Quest Continue and guest Profile Start callbacks work; equipping an already-owned fixture title produces its confirmation. No purchase is made.

The full 320 and 390 captures were opened for visual inspection. The former Profile identity/mascot overlap, collapsed companion bubble, narrow stat columns, and Quests heading/tab collision are resolved. Large text deliberately increases vertical length. The guest heading may wrap a long Swedish compound word within its card; no text is truncated.

Useful full-element evidence at 320:

- [Profile passport](profile-passport-full-sv-dark-fontScale2-320.png)
- [Profile companion](profile-companion-full-sv-dark-fontScale2-320.png)
- [Profile statistics](profile-stats-full-sv-dark-fontScale2-320.png)
- [Quest treasure](quests-treasure-full-sv-dark-fontScale2-320.png)
- [Shop freeze row](shop-freeze-full-sv-dark-fontScale2-320.png)

The account values and owned-title set are fixture inputs, not a real account or server response. The bottom navigation area is a labeled placeholder. Explore's unused globe module is excluded; these screens do not render it. This fixture proves layout branches, not real navigation, persistence, haptics, or frame rate. The separate exported-app walkthrough covers real routes and earned progress. No part of this was seen on a phone.
