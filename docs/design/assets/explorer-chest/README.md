# Explorer chest

Original editable WorldQuest prop, modeled from the user-approved explorer-trunk concept in `approved-reference.png`. The app uses renders of this exact model, so the small icon and opening animation share the same materials, silhouette and contents.

The warm domed leather shell, broad caramel straps, rounded brass bumpers, ocean-blue panels and globe latch follow the approved visual direction. The lid and globe latch open together around a real rear hinge. Gold XP medallions, a folded decorative route map and a small gold star rise after the opening. The animation is one finite ceremony, not an idle reward loop; displaying the asset does not award currency or XP.

## Files

- `explorer-chest.blend`: editable geometry, named materials, packed texture, lighting, camera and keyed opening.
- `explorer-chest.glb`: portable model with embedded texture and opening animation. Blender uses meters/Z-up; glTF exports meters/Y-up.
- `closed.png` / `opened.png`: transparent 640px master renders with identical framing.
- `frames/00.png` through `frames/39.png`: transparent 480px film frames, rendered with 64 Cycles samples.
- `textures/world-inlay.png`: color texture derived directly from the existing Natural Earth land mask.
- `provenance.json`: approved source digest, land-source provenance, topology and generation receipt.
- `validation.json`: runtime hashes/budgets, all frame alpha bounds and binary glTF inspection.
- `import-validation.json`: actual Blender glTF re-import and sampled animation bounds.

Runtime WebP files are in `apps/mobile/assets/art/explorer-chest/`; their typed imports and normalized still bounds are in `apps/mobile/src/lib/explorerChest.generated.ts`. The sprite is 8 columns × 5 rows of 480px cells, 40 source poses played over the 900ms celebration token. Keep that framing intact when displaying the sheet; the separate geometry bounds allow a static thumbnail to be centered without the opening's headroom.

## Rebuild

Run from the repository root with Blender 5.2 and the repository's installed Node dependencies:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/build-explorer-chest.py
node scripts/build-explorer-chest-art.cjs
```

Set `WQ_CHEST_PREVIEW=1` for the two master stills without the film. The model is rendered with Cycles, denoising, soft area lights and an 80mm three-quarter camera. All film poses are checked for alpha safe padding. The animation has anticipation, rear-hinged opening, delayed content lift, overshoot and settle.

## Provenance and validation scope

The source concept was created with ImageGen and approved by the user in this conversation. The exact prompt, including composition and negative constraints, is retained in `concept-prompt.txt`; the approved image is the visual authority. The implementation specification was: “Warm tan domed explorer trunk, broad caramel bands, rounded gold corner protectors/feet, navy inset panels with real Natural Earth world map silhouettes, round blue globe graticule latch. Open reveals gold XP medallions, folded route map and small gold star; latch and lid hinged together at rear; no purple gem.” No paid provider jobs or outside model downloads were used.

The continent shapes are [Natural Earth public-domain land](https://www.naturalearthdata.com/about/terms-of-use/), via `world-atlas/land-110m.json` and the repository's existing `build-globe-mascot-land.cjs` mask. The route marks on the parchment are decorative; they do not depict coastlines or borders. Original geometry and renders are WorldQuest project assets under the project's usage terms.

Local validation covers Blender generation/rendering, glTF binary structure, embedded images, animation presence, triangle/file budgets, every frame's transparent padding, and compressed runtime sizes. A fresh Blender glTF import also reconstructed all 206 mesh objects and the single combined animation; sampled bounds confirm that the imported lid actually moves. The asset-production CLI is not installed on PATH in this workspace, so these are repository validation receipts rather than `game-dev` canonical-package receipts. UI playback and reduced-motion behavior are verified by the app integration separately.

## October 3 mobile quality repair

The opening now uses a 3840 x 2400 WebP sheet (1,061,202 bytes) and finite native-driven reward stars. The sheet stays below a 4096px texture dimension and is mounted only during opening; its decoded RGBA footprint is about 36.9 MB. Reduced motion shows the opened still. Blur, backgrounding and decode failure retain the existing single-completion behavior. This improves the resolution and timing of the approved model.
