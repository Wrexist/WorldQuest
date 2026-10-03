# Relief atlas restoration — 3 October 2026

The native rollout gate left release builds displaying the older two-color
locator masks, even though the realistic globe renderer was already in the repo.
This update enables the existing render-on-demand globe on iOS and Android as
well as web. `EXPO_PUBLIC_ATLAS_GLOBE=0` remains an explicit build-time off switch.

Country pages and study cards use 640 × 480 stills generated from that exact
renderer and its Natural Earth inputs. This gives the same relief, blue ocean,
daylight and lifted gold country highlight without mounting a GL context for
every card. Region pages, Explore tiles, onboarding and the coin-wallet map use
the same preview family. Tiny-country locators remain at verified coordinates.

No answer labels or capitals are baked into the previews. Existing lesson scene
policy controls which map is shown and when labels are disclosed. Quiz entry
now goes directly to the question; studying the same question set is optional.

Explore falls back to the appropriate still if GL initialization or drawing
fails, retaining country search, selection and the country page action. A stalled
initialization has a bounded timeout. Lessons retain their existing failure
fallback and never retry a failed renderer on every question.

Initial validation: all 96 atlas tests and 67 country/region/onboarding tests
passed. Both Hermes bundles measured 5.13 MiB against the unchanged 5.21 MiB
limit after replacing the old mask imports; 19.17 MiB of separately loaded assets.
Later catalogue/startup changes require final measurements. Native simulator and
visual review results will be recorded with the final candidate. Physical-device
frame rate is not established by a simulator or browser run.
