# ADR 0017 — One 3D world atlas, raw WebGL on expo-gl

**Status:** Accepted (native rollout gated — see Consequences) **Date:** 2026-10-01
**Supersedes:** the interactive half of [ADR 0008](0008-vector-maps.md). The static
locator PNGs that ADR's pipeline produces stay, as the atlas's fallback.

## Context

Lessons and Explore need a real, interactive globe: country focus and highlight states,
capital pins anchored to verified coordinates, rotation, zoom, tapping, and search —
offline, and without the map ever answering the question it sits beside. ADR 0008 chose
`react-native-svg` vectors for this and it was never built; the shipped maps are 4:3 PNG
locators. The request (2026-10-01, with four concept mockups) asks for ONE reusable atlas
driven by question-specific scene configuration, not a picture per question.

Constraints measured, not assumed:

- Expo SDK 54, React Native 0.81.5, React 19.1, New Architecture. `expo-gl ~16.0.10` is
  the SDK's pinned GL module.
- The native Hermes bundle stood at ~5.09 MB against a 5.1 MB budget before this work
  (`scripts/bundle-native.cjs`). three.js alone is ~0.6 MB.
- The app also ships on web (react-native-web), which is where headless evidence runs.

## Decision

1. **Renderer: raw WebGL (GLSL ES 1.00) on `expo-gl`'s `GLView`**, one class
   (`GlobeRenderer`), no three.js and no React-Three. The scene is one UV sphere, a halo
   quad and an outline line set — a scene graph buys nothing here and costs the budget.
2. **Surface: Natural Earth II shaded relief, 1:50m** (public domain), downscaled to a
   4096×2048 equirectangular JPEG, shipped as `surface.bin` (see Consequences). No baked
   borders, names or labels.
3. **Countries: one cut geometry, used three times.** Natural Earth 1:10m admin-0
   (via `world-atlas@2.0.2`; the original shapefile for countries under 3°, which
   world-atlas's quantisation collapses) is projected once with d3's equirectangular
   projection at `precision(0)`. d3 cuts at the antimeridian and closes Antarctica at the
   pole, so no ring wraps. The cut rings are (a) rasterised into a 4096×2048 **country-ID
   texture**, NEAREST-sampled, with a 256×4 state texture holding each ID's highlight —
   so a highlight change is a 4 KB upload, never a geometry rebuild; (b) written to a
   binary for **picking** (even-odd containment, smallest containing shape wins, so
   enclaves Natural Earth did not cut out — Vatican City in Italy — resolve the same way
   in both); (c) measured for label anchors (pole of inaccessibility) and camera frames.
4. **Places: capital coordinates from Natural Earth populated places**, matched to the
   pack's own capital fact by name (with a reasoned alias table), cross-checked against
   GeoNames (independent, never shipped) within 25 km, and checked to lie inside the
   country within 5 km of its coast. A capital that fails any step gets no pin and is
   listed in `docs/design/world-atlas/coverage.generated.md`. Review-required capitals
   are excluded.
5. **Coordinate convention** (`apps/mobile/src/features/atlas/geo/types.ts`): degrees,
   `{ lat, lon }` objects; world space right-handed, +Y north, +Z at (0°, 0°), +X at 90°E;
   texture u = (λ+180)/360, v = (90−φ)/180, row 0 north, no flip. North is always up —
   there is no roll, so there is no compass to keep honest. The GPU's matrix, marker
   projection and tap unprojection are computed by the same function.
6. **Disclosure is a pure, typed policy** (`scene/lessonScene.ts`). The renderer receives
   an `AtlasSceneSpec` — highlights, pins, labels, accessible summary — and is never told
   a question, an answer or a grade. Modes: `capital-name` (capital hidden until graded),
   `identify-country` (no name anywhere, including the accessible summary, until graded),
   `context` (map-safe attributes), and reveal-only for attributes a map answers by being
   looked at (continent, hemisphere, coast, neighbours, area). Unknown attributes are
   reveal-only. The flat fallback reads the same spec.
7. **Rollout gate** (`atlasAvailability.ts`): on by default only on platforms with GPU
   evidence (web, via Chromium). iOS and Android get it in development builds, via the
   `atlas_globe` remote flag, or `EXPO_PUBLIC_ATLAS_GLOBE=1`; everyone else keeps the flat
   locator under the same policy.

## Alternatives considered

| Option | Why not |
|---|---|
| three.js on expo-gl (direct) | ~0.6 MB of bytecode for features this scene does not use; r163+ assumes WebGL 2, which expo-gl implements only partially. |
| @react-three/fiber native | three.js plus a reconciler, more native surface, same budget problem. |
| A globe helper (globe.gl, react-globe.gl) | DOM-based: HTML labels, browser globals, CDN textures. Not native. |
| Triangulated country polygons on the sphere | Correct only with antimeridian/pole handling, subdivision and z-fighting work per shape; the ID raster gets holes, islands, poles and the dateline right by construction, and the vector rings remain for picking. |
| Mapbox / map SDK | Online, per-request cost, tiles with baked labels — ADR 0008's reasons still hold. |
| Skia | A 2D canvas: the sphere, lighting and depth would all be hand-built anyway. |

## Consequences

**Buys us:** one implementation for lessons and Explore; offline by default (textures,
rings and places are bundled assets); a disclosure policy that is unit-tested phase by
phase; highlights that follow the verified borders; pins that sit on two-source
coordinates; a renderer that draws only when something changed.

**Costs us:**

- **Bundle:** +~0.08 MB of bytecode after trimming. `BUDGET_MB` moved 5.1 → 5.2 with the
  attribution recorded in `scripts/bundle-native.cjs`. Assets: +2.1 MB download (texture
  1.1 MB, rings 0.9 MB, ID raster 0.15 MB), outside the bytecode budget.
- **GPU memory (estimated, not measured):** two 4096×2048 RGBA textures ≈ 32 MB each,
  +⅓ for the surface's mipmaps ≈ 75 MB per live context. One context per mounted view.
- **Native acceptance is partly open.** The Android emulator renders correctly at ~60 fps
  (README, Evidence 6) after two native-only fixes this ADR now depends on: images ship as
  `.bin` because expo-gl decodes only from a `file://` path, and uniform locations are
  cached because each lookup is a synchronous JSI hop. No physical device and no iOS yet;
  the gate stays closed on native until they are recorded.
- Raster borders are as fine as 0.088° per texel; the subject's outline is drawn as
  vector lines on top. Countries under 64 texels (32 of them) get a ring marker.

## Reconsider when

- Device evidence shows the GPU memory or frame time above budget on the agreed
  representative devices → a 2048 tier for both textures.
- Location-tapping assessment ("tap Spain") is specified with grading tolerances and
  mastery rules → the `countrySelected` event already carries what grading needs.
- The bundle budget is revisited via lazy citations, which recovers more than this costs.
