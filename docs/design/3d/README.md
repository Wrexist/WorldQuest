# WorldQuest soft adventure assets

This pass uses the user-supplied **3D Asset Studio** skill (attached 2026-09-26). The runtime remains React Native: no WebGL renderer or model loader ships to the phone.

## Reproduce

Unpack `3d-asset-studio.skill` into a local tool directory and run its `scripts/check-env.mjs`. It passed with Three.js 0.170.0 and the local RTX 3060. On Windows, the supplied `inspect.mjs` needs its model path passed through `toUrl(model)` from `browser.mjs`; raw drive paths become unsupported `file:` fetches. That local compatibility fix does not affect asset geometry.

1. Run Blender with `--background --python scripts/build-chest-v2.py` to rebuild the editable chest and its GLB animation tracks.
2. Run Blender with `--background --python scripts/render-chest-gem.py` for the matching collectible silhouette.
3. Run the skill's `render.mjs docs/design/3d/worldquest-rewards.scene.js --out docs/design/3d/rewards --export glb --gpu`.
4. Run the skill's `render.mjs docs/design/3d/chest.scene.js --out docs/design/3d/chest --png --quality 1 --gpu`. Lossless masters avoid visible edge blocks in the compressed sequence.
5. Run `node scripts/build-soft-assets.cjs`. It measures visible alpha bounds, packages the native atlas, and generates the typed asset registries. `pnpm build:art` also invokes this packaging step.

## Art direction and motion

Rounded turquoise chest, warm yellow straps, recessed interior, physical rear hinge, and one violet collectible gem. Anticipation takes the first quarter of the two-second sequence; the lid opens before the gem rises and settles. Six glTF tracks preserve the source motion. The inspected chest has 22,332 triangles, 64 meshes, five materials and no textures; the studio fits it to a 20 cm toy. The app ships the rendered texture rather than the GLB.

The native atlas has 40 frames in an 8-by-5 grid, 320 px per cell (2560 by 1600, approximately 16.4 MB decoded). Quantized native-driver transforms select complete frames without React updates or per-frame file loads. Reduced motion jumps straight to the final pose; backgrounding stops playback. The atlas is about 1.23 MB lossless. Full-resolution source frames are 480 px square.

The heart, rounded star and coin stack share one studio, camera and material family. They are rendered from the supplied skill's procedural helpers, with an original rounded star outline. Their exported GLB is an editable source artifact, not an app dependency. The golden Atlas poses, original earth and hourglass are retained from the existing repository. No paid provider or external model library was used.

Coins remain spendable currency. Opening a daily chest records one dated cosmetic gem; rendering and animation never alter the wallet. Existing guards keep the claim idempotent.

## Visual and build evidence

See `../reviews/studio-2026-09-26/` for the app captures and chest interaction recording. Source model inspection is recorded in `chest-inspection.json`; raster hashes and dimensions are in `../assets/chest-v2/validation.json`. These checks cover browser presentation and static asset structure; they do not establish native device frame rate or VoiceOver behavior.
