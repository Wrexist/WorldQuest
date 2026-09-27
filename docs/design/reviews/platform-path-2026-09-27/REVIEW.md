# Raised-platform course

The user's latest screenshots and explicit correction supersede the island trail.
Home now has a clean canvas, raised oval platforms in a descending winding sequence,
an emerald section banner and a lesson panel attached directly below its platform.
The explorer stands beside the active step. No landscape is rendered behind the path.

The daily-goal card is compact when the course is present. The larger greeting is
retained for Home without a course. This gives the lesson path priority above the fold.
Actual lesson counts fill the ring; no reward/economy or unlock rules have changed.
Locked and completed steps still explain themselves and offer practice when available.

## Skill used

Installed `ui-ux-pro-max` from
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max
into `C:/Users/IsacC/.codex/skills/ui-ux-pro-max` using Codex's skill installer.
Read its instructions, native-app professional rules and critical/high checklist.
Applied relevant local searches for React Native press feedback and progress indicators;
ignored a spatial-UI result for VisionOS because it does not fit this application.
Existing repository screen/design-system rules and the user's reference remain primary.

## Verification

- 44 CoursePath and HomeScreen tests passed.
- Mobile TypeScript and accessibility lint passed.
- 52 curated + 35 generated contrast pairs passed, including the three new course pairs.
- 19 browser checks passed across five tabs at 320/390/768, including no landscape
  inside the course, automatic selected-card visibility and a real lesson launch.
- Inspected Home at 390 and the lesson action at 320 with doubled text. The lesson
  title wraps and the Start button remains visible; no horizontal overflow was found.
- Platforms retain their horizontal positions as course progress changes. The active
  panel is in normal flow, so later platforms move vertically to make room for it.

Reduced motion is enabled for reproducible screenshots. These screenshots are from
the app, not generated mockups. Native device performance, VoiceOver/TalkBack and the
full repository verification suite were not run in this pass. No part of this was
seen on a phone.
