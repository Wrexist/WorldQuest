# Compact Explore — 2026-10-02

The user supplied a screenshot of the selected Spain card and country-button wall and asked for a cleaner, more compact, smarter screen. This updates the existing Explore globe and its accessible country browser (catalogue 8/9), serving Alex's discovery and Priya's quick navigation. The primary action opens the selected country's existing page. No route, fact, reward or dependency was added.

## Changed

- The selected-country card is a single tappable metadata row with a 40-point flag, country name, capital summary and forward affordance. Close has its own 44-point target. The large full-width Open button is gone; its full accessible label and capital hint remain.
- The country-button wall is replaced by a collapsed, counted Browse countries section. Its flag/name rows follow the region filter, show selection explicitly and collapse after a pick. Search temporarily hides it.
- Search results appear before the map, start with six matches, and expose Show all/Show fewer and Clear search. Picking a result clears the query, dismisses the keyboard, clears a conflicting region and reveals the selected country. Keyboard focus moves to its Open action. External data refreshes do not move focus.
- The world overview and introductory companion return after clearing a selection, keeping selected-country inspection focused. Existing country arrival motion and persistent globe rendering remain.
- Zoom and recenter share one horizontal toolbar with 48-point targets. Explore's floating country-name pills were removed after settled-camera inspection showed labels over other countries. Country names remain in the card and browser, with selected highlights, verified capital pins and accessible map summaries; lesson labels are unchanged.

## Visual results

The card measures 74 px at 320/390/768 widths, versus 244/184/184 px before. At 390 it is about 60% shorter. The globe, selected card and closed browser can now be seen together. Representative rendered pixels, including the final focus state, were inspected.

- [Before, 390](baseline/selected-spain-390.png)
- [Final, 390](browser/final/selected-spain-390.png)
- [Narrow phone, 320](browser/selected-spain-320.png)
- [Large Swedish text, native-scale layout fixture](native-layout-fixture/country-sv-fontScale2-320.png)

The [browser evidence](browser/README.md) records the real app, measurements and keyboard checks. The explicit native-font-scale fixture renders the actual country card with a labelled globe placeholder; it does not prove native rendering.

## Validation and bundle weight

The new UI initially crossed the existing native bundle limit. Twenty superseded artwork imports were unreachable because the current mascot, chest or higher-priority illustration registry handles those names first. Their registry entries and generator lists were pruned; the original artwork files and every public illustration name were preserved. Sixteen focused art/chest tests and mobile typecheck passed after the cleanup.

The full browser journey passes 107/107 steps (one unrelated scenario skipped by the harness). The final Explore-only map-label cleanup also passes 29 focused Explore scene, lesson scene and shared label tests. The v3 browser proof repeats selection, focus, browsing and search, confirms Madrid is the only selected-map text and the world has no floating country text, with zero runtime errors.

The initial `pnpm verify` run passed generation, inventory, typechecks, boundaries and workspace package tests, then hit three 5-second CoursePath test timeouts while browser E2E was running. An isolated complete mobile rerun passes all 1,163 tests across 130 files, including those three, and the coverage gates (77.75% statements, 72.02% branches). The remaining verify stages were resumed separately and pass: 162 edge tests, content validation/crosscheck/preview, localization, contrast, accessibility lint, escape hatches, reachability, SQL, five states, scrollability, economy simulation, EAS and workflows. No test timeout or gate was relaxed.

Final v3 Hermes builds pass the unchanged 5.2 MiB gate: iOS 5,448,543 bytes, Android 5,446,932 bytes. Remaining headroom is 4,052/5,663 bytes. Shipped assets fell from 824 to 804 (20.74 to 20.14 MiB); no new runtime artwork was added.

No part of this was seen on a phone. Browser playback, mocked native font scale and Hermes compilation do not establish native keyboard behavior, frame timing, VoiceOver or TalkBack behavior.
