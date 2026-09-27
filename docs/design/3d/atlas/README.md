# Atlas: original animated WorldQuest character

Authored with the user's supplied **3D Asset Studio** skill. No downloaded character meshes, external textures, or generation service were used. The golden explorer identity is retained; the geometry, materials, face, costume, rig, and performances are new.

## Source and outputs

- `../atlas.scene.js`: named torso, neck, shoulder, wrist, eye, ankle, and scarf pivots; five deterministic performances.
- `../atlas-*.scene.js`: mood-specific render entry points.
- `atlas.glb`: editable model with five named animation clips (`welcome`, `celebrate`, `thinking`, `resting`, `encouraging`), each 2.4 seconds and 36 transform tracks. Model exports in metres, with the studio's 1-unit-to-10-cm conversion on a parent node.
- `../expedition.scene.js`: original decorative island. It is scenery, not an instructional geography map.
- Mood directories: 48 transparent 400px frames and an animated WebP for review.
- `manifest.json`: SHA-256 hashes and byte sizes of the runtime character textures.

## Reproduce

Extract the supplied `3d-asset-studio.skill` archive into `node_modules/.cache/user-skills/3d-asset-studio`, preserving its `scripts` and `references` directories. Run the skill's `scripts/check-env.mjs` before first use.

From the repository root:

```sh
node scripts/render-atlas.cjs
```

This serially renders all five performances and the island, exports the animated GLB, then packages the runtime assets. GPU rendering uses the studio's `--gpu` option. Frames and atlases are lossless WebP to preserve transparent edges. Sources remain editable; the runtime does not include Three.js.

To repack existing inspected renders only:

```sh
node scripts/build-atlas-assets.cjs
```

`pnpm build:art` also calls the packaging step.

## Runtime behavior and limits

Each 48-frame atlas is 2048 × 1536 pixels (12 MiB decoded), sampled at 20 fps. Only the current performance is mounted; after 2.35 seconds its atlas is replaced by a small still. Tiny portrait placements use stills. A poster remains visible during cold texture decoding, and the animation starts only after load. Focus and app-state changes stop or restart the bounded performance. Reduced motion uses an open-eyed expressive still immediately, including when the preference changes while mounted.

Native frame rates and image-cache eviction require measurements on actual iOS/Android devices. Unmounting the atlas removes the view's reference; the platform may retain cached decoded images. Browser playback and reduced-motion behavior are recorded under `../../reviews/atlas-2026-09-26`.

Coins remain the spendable balance. Streak gems remain collectible badges. This character work does not change rewards or progression.
