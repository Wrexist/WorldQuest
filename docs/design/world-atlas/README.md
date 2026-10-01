# World atlas — implementation checklist and evidence log

The ONE tracking document for the 3D atlas (ADR [0017](../../adr/0017-3d-world-atlas.md)).
Update it as work lands; do not start a second planning document.

Reference images (concept art, **not** factual maps): [`../world-atlas-handoff/references/`](../world-atlas-handoff/references/).
Nothing was traced, cropped or pin-matched from them. Their inconsistencies are corrected:
distractors stay neutral after grading, the correct answer has a check mark as well as
colour, order is stable, there is no compass (north is always up), and no population,
language or favourite control appears without data behind it.

Generated coverage: [`coverage.generated.md`](coverage.generated.md) ·
manifest with sources, checksums and per-pin provenance: [`atlas-manifest.generated.json`](atlas-manifest.generated.json).

## How to run it

```bash
pnpm fetch:atlas      # once: downloads Natural Earth + GeoNames to node_modules/.cache, freezes scripts/data/atlas-places.snapshot.json
pnpm build:atlas      # deterministic assets + registry + coverage (needs Python 3 + Pillow for the texture step)
pnpm dev              # dev builds have the globe on every platform; open /atlas-lab for the renderer proof
pnpm atlas:evidence   # web export with the lab, browser GL screenshots + timings + lesson layout measurements
```

Turn the globe on in a production-like build: `EXPO_PUBLIC_ATLAS_GLOBE=1`, or the
`atlas_globe` remote flag. Without either, iOS and Android keep the flat locator map.

## Checklist

### A. Audit and baseline
- [x] Read PROJECT.md, CLAUDE.md, ADR 0008, build-maps/locations, lesson + explore code, tokens, i18n
- [x] Baseline lesson layout measured at 320×568 / 390×844 / 430×932 / 768×1024 (no horizontal overflow in Chromium; see Evidence 4)
- [x] Bundle baseline: ~5.09 MB of a 5.1 MB budget before this work

### B. Renderer proof
- [x] `expo-gl ~16.0.10` (SDK 54's pinned version) + raw WebGL; three.js rejected on bundle size (ADR 0017)
- [x] In-app proof at `/atlas-lab` (dev builds / `EXPO_PUBLIC_ATLAS_LAB=1`; constant-folded out of production)
- [x] Sphere, local texture, country overlay, projected marker, resize, remount, cleanup — **web (Chromium) verified**
- [ ] **iOS device** — not run. Required before the gate opens on iOS.
- [ ] **Android device/emulator** — not run (see Blockers). Required before the gate opens on Android.

### C. Data + one complete lesson
- [x] Registry keyed by pack IDs; no names, no second country database (`data/atlas.generated.ts`)
- [x] Build pipeline: 1:10m cut geometry, ID raster, picking rings, anchors, frames, checksums, coverage report
- [x] Capital places: Natural Earth source, GeoNames cross-check ≤ 25 km, inside-country check, reasoned aliases
- [x] Capital-name flow: country shown → choice → graded → verified pin + name; fallback names it as text
- [x] Renderer failure → flat fallback, lesson keeps grading; not retried every question

### D. Reuse + Explore
- [x] Identify-country (map) template uses the same view (`identify-country` mode)
- [x] Map-safe templates show context; map-revealing attributes (continent, hemisphere, coast, neighbours, area) get no map until graded — **this also closes a pre-existing giveaway in the flat locator**
- [x] Explore: region filter, shared globe, tap-to-select, search → focus, card → existing country page (Learn/Review), accessible region list
- [x] Small countries: unquantised outlines for 38, ring markers for 32, smallest-containing-shape picking

### E. Polish + verification
- [x] English + Swedish strings; summaries obey the disclosure policy
- [x] 48-pt recentre/zoom buttons outside the accessible image; pins/labels hidden from the tree
- [x] Reduce Motion: camera cuts instead of flying; no flight over 70° of arc
- [x] Render on demand, no loop when still; AppState resume redraws; lost context remounts
- [ ] Device frame timing and memory — not measured (no device run)
- [ ] Large-text and Swedish screenshots at all sizes — see Evidence 5 for what was run

## Evidence log

Each entry: what ran, where, the result. Browser GL is SwiftShader (software) unless stated;
it proves correctness of output, not phone performance.

1. **Unit + contract tests** — `apps/mobile/src/features/atlas/**` (89 tests): coordinate
   round trips incl. antimeridian and poles; camera ⇄ GPU matrix agreement; occlusion at the
   horizon; framing with insets; picking against the shipped binary (Madrid, Suva on both
   sides of 180°, Chukotka, Lesotho-in-South-Africa, Vatican-in-Rome, Jakarta and Jayapura
   for Indonesia); every anchor inside its country; every pin inside/on its country's
   coast; every capital fact pinned or listed with a reason; shipped files match checksums;
   disclosure per mode × phase; label occlusion/collision; GL resources reused across
   questions and deleted on unmount (fake context); renderer failure inside a real lesson.
2. **Renderer proof in Chromium** — `node scripts/atlas-evidence.cjs`. Results recorded in
   `evidence/report.json` and the PNGs beside it.
3. **Native bundle** — `pnpm bundle:native`: 5.17 MB iOS / 5.16 MB Android after trimming
   (5.24 on arrival). Budget 5.1 → 5.2 with attribution in `scripts/bundle-native.cjs`.
4. **Lesson layout** — `node scripts/atlas-lesson-shots.cjs`: overflow, cut elements and
   on-screen checks per viewport, before and after answering. Results in
   `evidence/lesson/report*.json`.
5. **Locale and text size** — the same script with `WQ_LOCALE=sv` and `WQ_TEXT_SCALE=2`.

## Blockers and open acceptance work

- **No native GPU evidence.** iOS needs a Mac; the Android `Pixel_6` AVD exists on this
  machine but no device build was produced in this pass. Until one is, the gate stays
  closed on native (it is open in dev builds). What to verify on device: texture upload
  from `Asset` (both JPEG and the ID PNG decode with exact bytes), `highp` fragment
  precision, pan/pinch inside the lesson's ScrollView, background/resume, frame pacing.
- **Performance budgets are estimates.** GPU memory ≈ 75 MB per live context (two 4096×2048
  RGBA textures + mipmaps); not measured on a device.
- **Location-tapping assessment** is not built. `countrySelected` events exist; grading,
  tolerances, mastery and an accessible alternative do not, so no lesson awards anything
  for a tap.
