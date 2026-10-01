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
- [ ] **iOS device** — not run (needs a Mac). Required before the gate opens on iOS.
- [x] **Android emulator** (Pixel 6 AVD, API 35, x86_64, host-GPU GL) — renders correctly after two native-only fixes (Evidence 6)
- [ ] **Android physical device** — not run. Required before the gate opens on Android.

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
- [x] Frame timing on the Android emulator (Evidence 6); [ ] on a physical device
- [x] Swedish at 320×568 and 390×844 (Evidence 5)
- [ ] Large accessibility text — **not tested**: the web harness's 2× root font size does not reach react-native-web's px text, so its numbers equal 1×. Needs a device with Dynamic Type / font scale 200 %
- [ ] Explore polish: after a search selection the country card lands below the fold on a 390×844 phone; scroll it into view

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
2. **Renderer proof in Chromium** — `node scripts/atlas-evidence.cjs` (headless Chromium,
   ANGLE → SwiftShader, i.e. a software GPU). First ready 281 ms; draw CPU p50 0.8 ms;
   frame interval ~98 ms (software rasteriser — not a phone number). 40 question changes
   and 8 remounts: JS heap 27.6 MB before and after, one canvas left. Resume after a
   frozen lifecycle: globe still drawn (95.5 % coverage). Resize to landscape: drawn
   (97.2 %) — this caught a real bug, the canvas was blank after a resize until the redraw
   loop waited for the drawing buffer. Explore: search "Spa" → Spain → card ("Spain ·
   Capital · Madrid · Open Spain") → `/country/ES`. **Zero requests left localhost.**
   Zero console errors. Screenshots: `evidence/*.jpg` (14 countries × question/revealed,
   identify, Explore, remount, resize).
3. **Native bundle** — `pnpm bundle:native`: **5.17 MB** iOS and Android (5.24 on arrival,
   ~5.09 before the atlas). Budget 5.1 → 5.2 with attribution in `scripts/bundle-native.cjs`.
4. **Lesson layout** — `node scripts/atlas-lesson-shots.cjs` at 320×568, 390×844, 430×932,
   768×1024, for a capital question (map + pin after grading), a currency question (context
   map) and a "where in the world" question (reveal-only): **no horizontal overflow, no
   element past the right edge, prompt and all four options on screen at every size; Check
   on screen at all but 320×568**, where it follows the options in the scroll by design.
   The reveal-only question showed **no map before answering** at every size. The clipping
   in the original native screenshot did not reproduce in Chromium; it needs re-checking
   on the device it came from. `evidence/lesson/report.json`.
5. **Swedish** — the same at 320×568 and 390×844 with the language set in Settings:
   identical results; capitals and options localised (Peking, Ulan Bator).
   `evidence/lesson/report-sv.json`.
6. **Android emulator** — Pixel 6 AVD, Android 15 (API 35) x86_64, emulator GPU on host;
   debug APK with an embedded production JS bundle (`EXPO_PUBLIC_ATLAS_LAB=1`). Two
   native-only defects found and fixed:
   - **Black globe, correct outlines.** Bisected with pixel probes: clear and halo were
     right, the globe pass sampled empty textures with no GL error. expo-gl decodes images
     only from a `file://` `localUri`; an embedded Android build packs bundled images as
     drawable resources with no file. Fix: the two images ship as `.bin` (raw resources
     with real files), and a non-file URI is now a loud error → fallback, never a black
     globe.
   - **21 ms of draw CPU per frame.** ~40 `getUniformLocation` calls per frame, each a
     synchronous JSI hop. Cached per program: **draw CPU p50 1.6 / p95 4.5 ms, frame
     interval p50 16.7 / p95 22.4 ms (≈60 fps) during a continuous spin**, ready in 600 ms.
   Also fixed: a pin's name wrapped mid-word ("Mad/rid") because it was laid out inside
   the 48-pt pin. Screenshots: `evidence/android/*.jpg`. An emulator is not a phone: the
   gate stays closed on Android until a physical device repeats this.

## Blockers and open acceptance work

- **No physical-device evidence.** iOS needs a Mac; Android ran on an emulator only. The
  gate stays closed on native (open in dev builds, `atlas_globe` flag, or
  `EXPO_PUBLIC_ATLAS_GLOBE=1`). Still to verify on hardware: pan/pinch inside the lesson's
  ScrollView, background/resume, 200 % text, frame pacing on a mid-tier Android, iOS's
  `expo-asset` file path for `.bin` assets.
- **GPU memory is an estimate:** ≈ 75 MB per live context (two 4096×2048 RGBA textures +
  mipmaps); not measured.
- **Toolchain issues met on the way, not caused by the atlas:** `gradlew assembleRelease`
  fails at `createBundleReleaseJsAndAssets` (entry resolved against the monorepo root on
  Windows); the dev client crashes with `getDevServer is not a function`. Worked around
  with `expo export:embed` into a debug APK.
- **Location-tapping assessment** is not built. `countrySelected` events exist; grading,
  tolerances, mastery and an accessible alternative do not, so no lesson awards anything
  for a tap.
