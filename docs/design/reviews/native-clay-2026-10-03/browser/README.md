# Onboarding browser review

Actual Expo web export in Chromium, reviewed on 3 October 2026. These are browser
captures of the real app, not native iPhone or Android evidence.

The focused run covers welcome, daily goal, region and taster at 320×568,
390×844 and 768×1024. Each screen is captured in English/light at normal text,
and Swedish/dark with 200% rendered text and Reduced Motion: **24 cases, 34 PNGs**.
The additional scrolled captures show that content below the initial viewport
remains reachable while the primary action stays visible.

## Result

- Every primary action is fully visible before and after scrolling.
- All three daily goals and all seven region options are reachable.
- No page overflow, horizontal text clipping, or targets below 44×44 CSS pixels.
- Choosing 20 minutes or Europe selects the option and waits for Continue.
- All twelve Reduced Motion cases retain a stable mascot transform across samples.
- No uncaught browser errors. Measurements are in [report.json](report.json).

Visual inspection covered the narrow welcome, goal and region screens; all four
screens at 390; tablet region; and the narrow/tablet Swedish enlarged-text cases.
The unbounded flat welcome panel is gone. Goal and region choices now share the
clay reflection, rim and selected state, and Atlas has a compact stable frame.

The first enlarged-text run found the WorldQuest wordmark wider than the 320px
viewport. Its scaling is now capped at 1.3 as a logo; all explanatory text and
controls keep full scaling. The final captures and measurements pass.

## Representative evidence

- [Welcome, 320](welcome-320-en-light-normal.png)
- [Daily goal, 390](goal-390-en-light-normal.png)
- [Region, 390](region-390-en-light-normal.png)
- [Taster, 390](taster-390-en-light-normal.png)
- [Welcome, Swedish 200%, scrolled](welcome-320-sv-dark-text200-reduced-scrolled.png)
- [Goals, Swedish 200%, scrolled](goal-320-sv-dark-text200-reduced-scrolled.png)
- [Regions, Swedish 200%, scrolled](region-320-sv-dark-text200-reduced-scrolled.png)
- [Taster, Swedish 200%, scrolled](taster-320-sv-dark-text200-reduced-scrolled.png)

## Reproduce

```powershell
pnpm --filter @worldquest/mobile exec expo export --platform web --output-dir ../../node_modules/.cache/wq-native-clay-web
node scripts/review-native-clay.cjs node_modules/.cache/wq-native-clay-web
```

Use a separate export directory if another review process is already serving the
current one. The capture script uses an ephemeral localhost port and fresh browser
contexts. It drives visible onboarding controls and stops before starting the
taster; it neither seeds an account nor creates lesson/reward state.

## Limits

The accessibility pass doubles browser glyphs. It does not set React Native's
`fontScale`, so the native stacked question and single-column region branches are
not exercised by this export. Long region names can wrap within two columns here;
their complete labels remain reachable without horizontal clipping. The native
font-scale branch, VoiceOver/TalkBack, gestures, haptics and frame performance need
separate device verification. No part of this run was seen on a phone.
