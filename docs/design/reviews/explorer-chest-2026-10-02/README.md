# Explorer chest integration — 2026-10-02

The user approved the tan, brass and ocean-blue explorer-trunk concept and requested it across the game, with opening motion. The editable Blender model, portable animated GLB and runtime artwork are built from that direction. See [asset provenance, validation and rebuild instructions](../../assets/explorer-chest/README.md).

## What changed

- The daily quest card uses the new trunk, a finite tap nudge and an opening when quest completion actually changes. Its numbered trail continues to reflect the existing quest engine.
- The streak chest uses the same opening film, with the existing selectable action, sound preference and haptic feedback. The existing receipt appears after the visual opening; Continue remains available throughout. Revisiting an opened streak receipt does not replay its celebration sound.
- Quest introduction/completion, course check nodes, streak collection and legacy illustration entry points share the same artwork. Course nodes stay closed until done; a direct visit to an incomplete quest-completion route does not open a chest. The dedicated completed-quest celebration can play a cosmetic opening on entry.
- Decorative list/path instances render one still, without animation values or subscriptions. Interactive instances load the film only for a reveal. The transparent 40-frame film is 331,218 bytes, 20fps; no realtime 3D renderer or new runtime dependency was introduced.
- Reduced motion uses the settled still. Blur/background, failed or stalled film decode and unmount are handled without leaving the receipt waiting or replaying a reward cue. No animation grants XP, currency or collectibles.
- Small-screen and large-text layouts wrap or scroll, with reachable footer actions. All new copy uses the existing English/Swedish keys and all existing economic values remain unchanged.

## Visual and interaction evidence

- [Quest card](fixtures/quest-default-390.png), [Swedish/dark/200% text card](fixtures/quest-accessible-320.png).
- [Opening video](fixtures/chest-opening.webm): the actual component in an explicitly labeled local fixture, with hardware audio/haptic calls counted rather than executed.
- [Streak receipt](fixtures/streak-after-opening.png).
- [Interaction report](fixtures/report.json): six layouts at 320/390/768, normal versus Swedish/dark/reduced/200% text; nudge preserves progress; opening settles once; Continue stays usable; restored, failed-decode and blurred-opening cases.
- [Surface report](surfaces/report.json): sixteen Intro, incomplete/complete QuestComplete and StreakGemCollection configurations at 320/390, plus eight scrolled large-text captures. Zero runtime errors or horizontal text overflow. Native font-scale branching is emulated in these React Native Web fixtures; screenshots also enlarge the actual glyphs.
- [Real route screenshots and measurements](routes/report.json): five routes at 320/390/430/768 from the immutable Metro web export; no measured overflow or target/label failures. These include [Quests at 390](routes/quests@390.png) and [Quest introduction at 320](routes/quest@320.png).

The rendered stills and opening frames were inspected directly. The blue globe latch, map inlays, rounded brass corners and rising parchment/XP/star contents match the approved visual direction and sit coherently beside Atlas. The historical blue chest art remains in old asset catalogues/source files for provenance; active chest surfaces resolve to the new explorer artwork.

## Validation scope

Focused component checks passed, including the shared animation lifecycle, streak action/receipt, quest progress and course path. The course-path timeout seen during the first concurrent full run did not recur after decorative chest rendering was simplified: all 1,143 app tests then passed under coverage, as did the package and 162 edge tests. The verify run subsequently caught a deprecated accessibility-role prop in the legacy empty-collection wrapper. It was changed to `role="img"`; app typechecking, accessibility lint and every remaining verify gate were rerun successfully. The new production content-transform tests and regenerated inventory check also passed separately.

Both native Hermes bundles compile within the unchanged 5.2 MiB budget: iOS 5,448,983 bytes (5.196555 MiB), Android 5,447,373 bytes (5.195020 MiB). The first build exceeded the limit by roughly 22 KB. A production-only Metro transform now excludes `$comment` and `$schema` authoring fields from content-pack copies. Three tests exercise Expo's real transformer across all 31 canonical packs and check every remaining value/citation plus unchanged source files; development and unrelated JSON are untouched. The current headroom is small (roughly 3.5–5 KB). Runtime assets ship separately from these bytecode measurements.

Web export and real-route screenshot checks passed. The full browser journey reported 107/107 steps passing, including one explicitly skipped image-question branch (106 executed checks). It played real lessons, opened the new streak chest, observed one collectible receipt, continued through the reward flow, and confirmed quest/course progress, keyboard input and 200% text layouts with no uncaught errors. Full output is retained in `node_modules/.cache/wq-explorer-chest-e2e.log`; the export used the immutable `wq-explorer-chest-web-v3` cache directory.

These are browser/component and compile checks. No physical iOS/Android playback, mid-tier Android frame-time measurement, VoiceOver or TalkBack session was performed. Native feel and assistive-technology behavior still require the project's device pass; a Hermes bundle alone does not prove them.
