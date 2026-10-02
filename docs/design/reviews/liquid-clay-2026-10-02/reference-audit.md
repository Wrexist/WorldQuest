# Liquid clay reference audit

The owner supplied three 941 × 1672 PNG mockups for Quests, Profile and Shop. They
retain the compact app structure approved in the preceding review and change the
material language: rounded ice surfaces, raised navy chrome, sky-blue selection,
warm gold rewards and a bright lime learning action. Atlas, the chest, coins and
gems remain recognisable pieces of the existing game.

## Observed material rules

- A restrained top-left reflection defines each rounded rim. The brightest rim
  belongs to pale cards and the tab tray; the navy header uses a quieter blue rim.
- The face changes gradually from a lighter upper edge to a deeper lower edge.
  Short lower shadows separate controls and cards from the pale blue canvas.
- Text remains flat, readable and structurally separate from the lighting.
  The mockups' decorative text embossing is not a reason to reduce contrast.
- Selection has a distinct raised sky-blue face. Status and reward retain their
  existing colour meanings; every option is still labelled in words.
- Illustration is subordinate to the compact layout. The references do not justify
  bringing back the previous full-screen Profile island or tall country selection.
- The drawn phone rim and home indicator are presentation framing, not app content.
  Native safe areas and the real tab bar must retain ownership of those edges.

## Measured samples

Samples below were read directly from the supplied PNG pixels with Pillow. These
are individual points within shaded materials, not flat palette declarations or
production contrast evidence. Coordinates use the original image dimensions.

| Reference | Outer canvas (20, 300) | Header upper (400, 90) | Header lower (400, 165) | Pale rim (100, 40) |
|---|---|---|---|---|
| Quests | `#D8EDFD` | `#133F66` | `#0E3A61` | `#D1E9FC` |
| Profile | `#D2ECFD` | `#143C64` | `#0E365D` | `#EDF9FF` |
| Shop | `#D6EFFD` | `#133E66` | `#0E385F` | `#E3F4FE` |

The production canvas target `#D9EEFC` sits within the family seen in these
references. Text/background contrast must be verified against the complete
production tone endpoints, including dark mode, rather than against a sample.

## Custom surface coverage

Shared Card, Button and ProgressBar changes cover many screens. The following
custom surfaces need explicit treatment, as confirmed by the existing rendered
screens and then the corresponding source:

| Surface | Source |
|---|---|
| Main chrome and currency counters | TopBar, HeaderJewel, TabBar, ScreenHeader, StickyFooter |
| Home course units, lesson platforms and action panels | PlatformUnit, PathNode, PathBubble, DailyAdventure |
| Explore search, region chips, selected country and map controls | ExploreScreen, ExploreAtlas, WorldAtlasView |
| Quest tabs, task cards, milestones and treasure | QuestScreen, QuestTreasureCard, QuestMilestones |
| Profile guest panel, stats and weekly activity | ProfileScreen, WeekStrip |
| Shop wallet, next unlock and freeze navigation | CoinWallet, ShopScreen |
| Companion speech and small reward badges | AtlasCompanion, AnswerReward, EarnedReward, StreakGemCollection |
| Lesson feedback and typed answer | LessonScreen, TypedAnswer |
| Settings groups, choice chips and steppers | SettingsRow |

Existing baseline evidence is under `../compact-app-2026-10-02/browser-final/` and
`node_modules/.cache/wq-compact-app-e2e-shots/`. No geometry, coastlines, flags,
learning rules, prices or progress values are inferred from the decorative mockups.

## Review method

`scripts/review-liquid-clay.cjs` serves a supplied immutable Expo export, completes
real onboarding and captures Home, Explore, Quests, Profile, Shop, Country, Settings
and a real lesson question at 320, 390 and 768 px. A second context changes the
actual Settings controls to Swedish and dark mode, respects reduced motion and
doubles browser glyphs. It also records targets, horizontal overflow, persistent
quest CTA visibility and existing chest/navigation behavior. An actual UI lesson
provides populated Profile evidence; progress is never seeded.

`--preview` captures the five main tabs and a lesson question at 320 and 390 without completing a lesson.
It is for initial visual review, not a substitute for the final broad pass.

Browser glyph enlargement does not exercise native fontScale layout branches.
Native layout fixtures and physical iOS/Android validation are separate evidence.
No part of a browser review was seen on a phone.
