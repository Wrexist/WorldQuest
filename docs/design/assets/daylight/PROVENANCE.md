# Daylight asset provenance

Created for WorldQuest on September 26, 2026.

## Illustration masters

`atlas-welcome.png`, `atlas-celebrate.png`, and `atlas-calm.png`: generated using the
host's built-in ImageGen tool. The welcome image is the identity reference for the
two subsequent edits. Originals remain under the host's generated-images directory;
these checked-in copies are the project masters. The source is generated imagery,
not a third-party licensed character or a recovered 3D mesh.

Welcome prompt: "Create a polished mobile geography learning game mascot asset,
a single full-body friendly little explorer robot named Atlas. A completely new
original character for WorldQuest: large rounded aqua/turquoise head, midnight teal
face visor with two friendly cream oval eyes, sunshine-yellow pith safari hat with
a wide brim, tiny apricot neckerchief, cream torso with teal joints, small backpack
and chunky teal boots. Big head small body, delightful toy-like proportions, smooth
matte clay 3D with simple broad shapes, no metallic highlights or intricate
mechanical details. Standing with one hand raised in an enthusiastic friendly wave,
other hand holding a small folded blank travel map. View three-quarter frontal,
whole hat and boots visible, compact silhouette, soft studio light, minimal contact
shadow. Isolated on truly transparent background, centered, fill 85 percent of a
square frame. No text, letters, logos, badges, watermarks, platforms, environment,
or additional characters. High quality game-ready raster illustration legible at
96px."

Celebration edit: preserve the same identity, materials, proportions and lighting;
change the pose to both arms raised, feet apart in a small jump, smiling eyes, no
map, three chunky gold stars, full body with transparent margin. No text, scenery
or watermark.

Resting edit: preserve the same identity and materials; sit comfortably with knees
apart, a blank travel journal across the lap, both hands on the journal, friendly
expression looking toward the viewer. No sadness, confusion marks, scenery,
platform or text. Entire character visible on transparency.

## Procedural 3D masters

`atlas-companion`, `globe`, `treasure-chest`, `star-trophy`, and `heart` are original
procedural geometry authored for this repository in `scripts/build-daylight-models.py`.
No external meshes, textures, paid generation providers, or embedded downloaded
scripts were used. Source code follows the repository's licensing terms; no new
third-party asset license is introduced. GLB files embed their geometry and PBR
materials. Model units are meters; exported glTF is Y-up.

The companion has head-nod and shoulder-wave tracks, the globe a rotation track,
and the chest a lid-opening track. Animation duration is three seconds. Blender
sources and validation hashes live in the sibling `models` directory. Static
preview renders are the corresponding PNGs here. The GLBs are reusable assets;
the app consumes their WebP renders to avoid a runtime 3D dependency.

## Derivatives

`node scripts/build-daylight-art.cjs` preserves transparency, measures subject
bounds, and writes 640-pixel WebPs plus a typed import/geometry manifest. Images
are at most 120 KB each. All native image references resolve to workspace files.
`node scripts/build-daylight-maps.cjs` creates the separate map masks from Natural
Earth; those images do not come from generative art.
