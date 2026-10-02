# Compact Explore browser review

The final [390px screenshot](final/selected-spain-390.png) was captured from immutable export `wq-compact-explore-web-v3` after selecting Spain and automatically focusing its Open control. Its layout, focus appearance and scroll position were inspected. The map, compact country row and collapsed browser remain visible together.

## Measured change

The same selected country was measured in the previous `wq-question-country-web-v2` export and the new compact implementation. These are CSS layout heights, not estimates from screenshots.

| Viewport width | Previous country card | Compact country row |
| --- | ---: | ---: |
| 320 | 244px | 74px |
| 390 | 184px | 74px |
| 768 | 184px | 74px |

The country row has a 48px-high Open target and an independent 44×44px Clear selection target. No text extends beyond the measured card at those sizes. Compare the [old 390px screen](../baseline/selected-spain-390.png), [final 390px screen](final/selected-spain-390.png), and [compact 320px layout](selected-spain-320.png). The 320px matrix preceded the final map-label removal; its card geometry is unchanged.

## Interaction checks

[V1 report](report.json) records eight cases covering normal 320/390/768 layouts, the interaction journey, and Swedish dark mode with doubled glyphs and reduced motion at those widths. [V2 focus report](focus-v2/report.json) records three cases after the keyboard focus correction. [Final V3 report](final/report.json) records three cases confirming that correction, the same card geometry and the map-label fix. All three reports have no uncaught page errors.

- Country browsing starts collapsed and closes after selection. Region filters expose their actual counts: Europe 45 and Asia 46. All exposes 194 countries only when expanded.
- Search results appear before the globe, initially show six matches, expand to all matches (186 for the exercised query), and collapse again. Clear and empty-result recovery work.
- Selecting a country clears the query. Choosing Spain while Asia is active resets the incompatible region filter to All.
- The Explore canvas persists through filtering and selection. The final Spain map contains only the verified Madrid pin label; the unselected world has no floating country names. Country names remain in the selected row, search and country browser.
- A focused Open control retains its identity when the selected country changes. Enter opens the correct country route. Clear selection removes the row without navigating.
- V1 exposed a real keyboard issue: removing the chosen result/browse row left focus on BODY. V2 now places focus on the country's Open button after both search and browse selection. The final screenshot includes that state.

Normal layouts, the expanded list, and the enlarged Swedish screenshots were inspected. Country-list rows wrap long names. The large-text browser run respects the production tab-label scaling cap. Its selected row remains readable and within its width.

The separate [settled all-country view](settled/browse-all-390.png) exposed a geographic-clarity issue in v2: floating neighbor-name labels could sit over other countries even after the camera and textures settled. For example, Saudi Arabia's label appeared over North Africa because the placement helper tried offsets beside a country without a leader line. This is resolved in V3 by removing those floating country names from Explore. The [final world and country browser](final/browse-all-390.png) was inspected and the final report asserts there are no world-map label text nodes. The selected-country highlight, verified capital pin and accessible summary are retained. Historical V2 evidence is preserved.

The [native-layout fixture](../native-layout-fixture/report.json) separately exercises `fontScale=2` at 320/390/768 with doubled glyphs, Swedish, dark mode and reduced motion. It uses the actual `ExploreAtlas` and shipped country/capital names, with an explicitly labeled globe placeholder and no account storage. All three cases fit horizontally and Open responds. This proves the responsive branch in the browser, not native layout or GL performance.

## Reproduction

These scripts drive the real onboarding controls; they do not inject account or reward state. The web exports have `EXPO_PUBLIC_ATLAS_GLOBE=1`; the flag does not enable the native rollout by default.

```powershell
node scripts/review-compact-explore.cjs node_modules/.cache/wq-question-country-web-v2 --baseline
node scripts/review-compact-explore.cjs node_modules/.cache/wq-compact-explore-web-v1
node scripts/review-compact-explore.cjs node_modules/.cache/wq-compact-explore-web-v2 --focus-only
node scripts/review-compact-explore.cjs node_modules/.cache/wq-compact-explore-web-v3 --focus-only --final-proof
node scripts/review-compact-explore-layout.cjs
```

The `--focus-only` pass preserves the original matrix and baseline. Measurements concern the selected card; horizontally clipped region chips are intentional and are not treated as page-width overflow. Neither the expanded 194-country list nor native animation timing received a device performance benchmark.

No part of this was seen on a phone. Browser playback and simulated font scale do not establish native keyboard behavior, VoiceOver/TalkBack behavior, haptic feel or GPU/frame timing.
