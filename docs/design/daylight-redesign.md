> **Current artwork update:** the [playful vector family](assets/playful/PROVENANCE.md) now replaces all 75 illustrations and adds articulated character motion. The earlier clay/Blender sources described below are preserved production assets.

# WorldQuest: daylight expedition

September 26, 2026. Supersedes the palette, elevation and artwork direction of the
original dark mockup. Requested by the owner on this date.

The intended feel is a friendly, tactile geography adventure that is easy to read
on a small phone. The reference is Duolingo's lesson path, physical button press,
and consistent rounded type. WorldQuest keeps its own Atlas character, geography
curriculum, sourced maps, learning engine and kind reward language.

## Visible changes

- White canvas, slate text, quiet borders and pastel illustration fields. Cards
  are flat; only controls have a solid bottom edge. No decorative outer glows.
- A winding lesson path with a clear current step, unit banners, an animated Atlas
  greeting and a treasure prop beside check steps. Real course state still controls
  which lessons start, unlock, and offer practice.
- Explore places sourced continent silhouettes above the names and progress.
  Country and flag answers continue using the original verified data assets.
- Profile keeps identity, level, activity and statistics in separate non-shrinking
  sections. A first-time learner sees an explorer passport invitation in English
  or Swedish. The account and settings routes retain their functional controls.
- Settings groups have visible borders. Lessons use light answer plates and
  readable neutral feedback. Shop and navigation share the new 3D prop family.

## Tokens and motion

`packages/design/tokens.json` v3 is authoritative. Canvas: `#FFFFFF`; primary ink:
`#203C46`; secondary ink: `#4B646D`; tertiary ink: `#526D76`. Accent labels stay
white; the contrast gate now checks `color.text.onAccent` directly rather than
assuming ordinary text is white. Green primary `#3C8506`, blue `#007CAA`, and all
ordinary text have at least 4.5:1 contrast on their intended surfaces. Palette ramps
remain semantic: green progress, blue navigation, gold rewards, orange streaks,
red hearts or destructive actions. Decorative colors are in `color.journey`.

Nunito remains the typeface. Main button labels are 19/26 extra-bold. Cards use
20-point corners and 16-point padding; action faces travel by the existing 4-point
press depth. Atlas's greeting animates only rotation and scale, using the native
driver and three 420 ms segments, then rests. Reduced Motion disables the greeting.
The existing path attention bob remains bounded rather than looping indefinitely.

## Artwork, models, and rebuilds

See [asset provenance](assets/daylight/PROVENANCE.md). Eight transparent raster
masters derive to eight WebP assets, each under 120 KB. The three illustrated Atlas
poses were generated with the built-in image tool. Five original procedural models
were built locally in Blender 5.2.1, with editable `.blend` sources and portable GLBs.
The modeled companion is a simplified 3D adaptation, not the exact illustrated mesh.

The mobile app uses lightweight renders; it does not add a 3D engine or stream GLBs.
The models and their animation tracks are separate reusable production assets.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/build-daylight-models.py
node scripts/build-daylight-art.cjs
node scripts/build-daylight-maps.cjs
node scripts/validate-daylight-models.cjs
pnpm generate
pnpm verify
pnpm e2e
pnpm design:shots
```

Continents derive from Natural Earth via `world-atlas/countries-110m.json` (public
domain), with the installed `countries-list` classifications and ISO numeric bridge.
Orthographic views emphasize the continent; these navigation illustrations are not
used as country boundaries or lesson answer keys. The decorative 3D globe shows
parallels and meridians, deliberately avoiding invented landmasses.

## Review boundaries

Web screenshots exercise the real Expo bundle at 320, 390 and 768 CSS pixels.
They do not establish iOS/Android device rendering, VoiceOver/TalkBack behavior,
haptics or performance. No part of this revision was seen on a phone.
Static GLB validation is recorded in `assets/models/validation.json`; it checks
binary structure, mesh budgets, embedded buffers and animation presence. It is not
a native GPU performance test.

## Verification recorded on 2026-09-26

- `pnpm verify`: passed, including 1,903 tests across the harness, packages, mobile
  and edge functions, TypeScript, content cross-checks, translations, 67 contrast
  checks, accessibility lint and screen-state/scrollability gates.
- `pnpm e2e`: 108/108 steps passed against the real Expo web export, including
  lesson completion, persisted progress, navigation, and 200% text.
- `pnpm design:shots`: passed at 320/390/768 CSS pixels. Screens and component
  fixtures were also opened for visual review; the populated Profile no longer
  overlaps its sections.
- `git diff --check`: passed.
- GLB structure, mesh budgets, embedded buffers and animation tracks: passed.
  Rendered Atlas-wave and chest-opening videos were inspected.

[Before/after screenshot gallery](reviews/daylight-2026-09-26/index.html).
The gallery marks component-fixture captures separately from live-app captures.

Local preview: `node scripts/preview-daylight.cjs`, then
<http://localhost:4188>. It serves the exported app from
`node_modules/.cache/wq-web`; rebuild with the Expo web export after code changes.

The working branch is `feat/playful-world-redesign`, based on `ea0cb34` from
`origin/main`. Changes have not been committed, pushed, or deployed.

### Remaining release checks

`pnpm bundle:native` compiled both iOS and Android successfully, but failed the
size gate: each Hermes bundle is **4.82 MiB**, above the existing **4.6 MiB** limit
by **0.22 MiB**. Asset payload is a separate **10.06 MiB**. The budget was not raised.
No baseline measurement was made, so this review does not attribute the full excess
to the redesign. Native bundle-size reduction and actual iOS/Android device,
screen-reader, reduced-motion and performance passes remain before release.
