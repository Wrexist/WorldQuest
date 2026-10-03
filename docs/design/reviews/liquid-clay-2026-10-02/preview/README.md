# Initial liquid clay preview

Source: `node_modules/.cache/wq-liquid-clay-web-preview`, an immutable Expo web
export supplied by the implementation owner. Captured through real onboarding
with `scripts/review-liquid-clay.cjs --preview`.

Reviewed all twelve main views: Home, Explore, Quests, guest Profile, Shop and a
real lesson question at 320 × 568 and 390 × 844. The settled material, typography,
raised controls and compact layout remain readable. Profile's first-lesson button
and Quest's persistent Continue control remain visible at the narrow width.

Measurements: 12 cases, no page errors, no horizontal page overflow and no controls
below the harness's 44 px target tolerance. `report.json` records the raw bounds;
the separately scrolled Quest captures verify the footer remains visible.

## Findings sent to the implementation owner

- **High:** Explore's search text and placeholder are hidden behind its decorative
  surface in both screenshots. The web TextInput needs its own positioned painting
  layer. This is a functional visibility issue, not a palette choice.
- **Medium, existing:** In the capital-question lesson, Spain's country label is
  displaced over North Africa while the highlighted geometry remains correct.
  The prompt already names Spain. This reproduces a pre-existing label-placement
  problem previously corrected for Explore only.
- **Nit:** Quest checkpoint rims have a conspicuous double light outline from the
  host border and material rim. The checkpoint text remains legible.

These are preview findings, not claims about the final export. Final evidence must
recheck resolved findings and include dark mode, Swedish, large text, additional
routes and actual earned Profile state.

No part of this was seen on a phone.
