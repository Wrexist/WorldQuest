# Final narrow-text verification

**Status: first follow-up, preserved for history.** This pass resolves control
visibility and tab-label separation from the [broad review](../browser-final/README.md)
in `node_modules/.cache/wq-liquid-clay-web-final`. Further pixel review found the
Country title's midword break unattractive, so the final Country layout gives its
name the full width beneath the flag and favorite. That
[second-round proof](../browser-country-final/README.md) passes all six Country
cases; this folder retains the intermediate screenshots and report.

`scripts/review-liquid-clay.cjs --polish-only` captured Explore and Country at
320×568, 390×844 and 768×1024 in default light mode and Swedish/dark/enlarged text
with reduced motion: 12 cases, 24 PNGs, zero JavaScript errors, horizontal overflow,
text beyond the viewport or undersized measured button/tab targets. The original
52-case broad report remains unchanged.

- Country favorite is fully visible in all six Country captures. At 320px Swedish
  enlarged text it remains 44×44, at y150–194, while the title wraps inside its
  available space. The [corrected pixels](country-SE-320-sv-dark-glyph2-reduced.png)
  were opened and reviewed.
- Tab labels retain their declared 1.2× scale cap. The closest pair, “Utforska” and
  “Uppdrag”, now has a measured 3.5px separation at 320px Swedish enlarged text.
  The [search screenshot](explore-search-320-sv-dark-glyph2-reduced.png) confirms
  visible separation and readable typed text.
- Actual search and country selection were repeated at every size and mode;
  selection cleared the query and preserved the verified Madrid pin.

The [report](report.json) contains target and label bounds. These Chromium captures
do not execute native `fontScale` branches or establish physical-device behavior.
No part of this was seen on a phone.
