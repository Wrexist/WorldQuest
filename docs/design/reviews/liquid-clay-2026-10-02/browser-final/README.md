# Liquid clay browser review

**Verdict: ship.** Tab-label separation passed the
[first follow-up](../browser-final-fixes/README.md); the Country header's final
two-row layout passed the [final Country follow-up](../browser-country-final/README.md).
This folder preserves the first broad capture, including the observed issues.

Source: `node_modules/.cache/wq-liquid-clay-web`, captured with
`scripts/review-liquid-clay.cjs`. The account completed real onboarding; progress
was never seeded. The original [report.json](report.json) is unchanged.

## Coverage and results

- 52 cases and 82 screenshots: Home, Explore, Quests, Profile, Shop, Country,
  Settings and a real lesson question at 320×568, 390×844 and 768×1024, plus the
  same routes in Swedish, dark mode, reduced motion and enlarged browser text.
- Opened the rendered PNGs for all eight narrow default screens, all eight narrow
  Swedish/dark/enlarged screens, all eight tablet routes, the main 390px screens,
  selected-country/search states, Settings language choices and populated Profile.
- Zero JavaScript errors, horizontal document overflow, text outside the viewport,
  or undersized measured button/tab targets. These checks do not prove that every
  control is visible: the Country switch finding below demonstrates that limit.
- Quest Continue stayed fully visible before and after task scrolling. Home's
  initial hero and scrolled challenge CTA have separate screenshots.
- Actual Explore text entry (`Spain` / `Spanien`) is visible, filtering produces
  the country result, selection clears the query, and the selected country opens
  the verified Madrid pin. The earlier input masking and misplaced lesson country
  pill are resolved in these pixels.
- Chest nudging did not change quest progress or tasks. Achievements and streak
  navigation worked. Unaffordable purchases remained disabled; next unlock and
  the worn level title remained unchanged.
- An actual lesson completed after 35 answer attempts: +60 XP, +25 coins and five
  facts stronger. The subsequent streak chest opened, and populated Profile was
  captured at all three widths.

## Visual findings

**Resolved high — Country favorite at narrow enlarged text.** In
[country-SE-320-sv-dark-glyph2-reduced.png](country-SE-320-sv-dark-glyph2-reduced.png),
the long enlarged country title pushes the favorite switch beyond the right edge.
The 44px control must stay visible without splitting the country name into awkward
fragments. The first fix restored control visibility but split “Sverige” into
“Sveri” / “ge”. The final two-row identity puts flag and favorite above a full-width
title. In the final follow-up, Sweden/Sverige stays a whole line at all three widths
in both modes, and the 44×44 favorite remains fully visible. No font size was reduced.

**Resolved nit: bottom labels nearly touch.** In
[explore-search-320-sv-dark-glyph2-reduced.png](explore-search-320-sv-dark-glyph2-reduced.png),
“Utforska” and “Uppdrag” have very little separation inside the rounded navigation
bar. Both remain readable. The shared label now uses normal tracking; the focused
follow-up records a 3.5px minimum gap in this narrow case, with the existing
1.2× tab-label text scaling retained.

The remaining reviewed surfaces preserve clear hierarchy: navy anchors the
currency/treasure chrome, gold marks rewards, pale clay contains content, and lime
marks the main action. Cards and settings choices retain readable text in both
themes. Country and lesson geography remains actual app data, not reference art.

## Limits

These are real Chromium/react-native-web screens. Browser glyph enlargement
respects declared text caps but does not execute native `fontScale` layout
branches; the separate `../native-layout/` fixtures cover those branches. This
pass does not measure haptics, native rendering performance, physical gestures,
screen-reader speech or every loading/error/offline state. Contrast and build
gates are recorded by the main review, not inferred from screenshot colors.

No part of this was seen on a phone.
