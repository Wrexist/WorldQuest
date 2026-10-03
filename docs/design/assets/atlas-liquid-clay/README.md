# Atlas liquid-clay artwork

Generated with the built-in OpenAI image-generation tool on 2026-10-03. The owner-provided WorldQuest profile mockup (`B5E225DB-B111-4BC1-9A1F-8B8D6857DBFF.png`) supplied the character and material reference. This replaces the runtime Blender sprite sheets, whose moving grid could expose neighbouring frames. Historical Blender sources remain archived, but are no longer imported by the app mascot.

The four 1280px RGBA masters in this directory were inspected before use. Run `node scripts/build-clay-mascot.cjs` to produce complete 512px PNGs in `apps/mobile/assets/art/atlas-clay/` and the typed manifest. No frame slicing, cropping or body-part compositing. Reactions share four consistent whole-character poses across the existing ten logical moods. The app applies a finite native transform after decode, then rests; reduced motion retains expression changes without movement.

Each active image has 262,144 pixels, compared with 3,686,400 pixels per former 1920px sheet. Raw RGBA pixel arithmetic is 1MiB versus 14.1MiB; this is not measured process RAM or iPhone frame-rate evidence.

## Final generation prompts

Welcome, with the supplied profile mockup as reference and `transparent_background: true`:

> Use case: stylized-concept. Asset type: production transparent mascot cutout for the WorldQuest mobile app. Input image is a STYLE AND CHARACTER REFERENCE, not a UI to reproduce. Create ONE isolated full-body Atlas globe explorer matching the charming liquid-clay character beside Explorer in the reference. Round ocean-blue globe body, softly raised green continent shapes, large warm navy eyes with white glints, tiny pink cheeks, friendly open smile, rounded blue mitten arms, short legs and chunky golden-yellow explorer boots. Sandy tan safari hat with brown band and tiny blue/gold globe badge; small tan backpack. Beautiful polished soft clay, rounded sculpted volumes, soft broad highlights, subtle ambient occlusion, premium toy-like 3D character consistent with the reference. Pose: both eyes open, relaxed welcoming stance, one hand gently raised in a small wave. Character completely visible, centered in square canvas, fills about 84% height, keep equal safe transparent margins all around hat, hands and shoes. Clean coherent silhouette, no loose fragments. Front view with very slight three-quarter depth. Real transparent RGBA background, absolutely no interface, no text, no icons, no sparkles, no clouds, no ground plane, no cast shadow outside the character, no panel or background color. Deliver one high quality reusable mascot asset, not a sprite sheet.

Each variant used the generated welcome PNG as reference, retained transparency, and used this shared prefix:

> Use case: identity-preserve. Edit this production WorldQuest liquid-clay mascot cutout. Keep EXACTLY the same character identity, ocean-blue spherical globe body, green raised continents, tan safari hat with brown band and blue/gold badge, tan backpack, gold boots, face proportions, clay materials, lighting, square framing, scale and camera. Only change expression and arm pose as requested. One complete character, clean silhouette with safe margins, real transparent background, no text, no props, no symbols, no sparkles, no extra fragments, no ground shadow.

Celebrate suffix:

> Expression/pose: delighted celebration, both arms raised slightly out to the sides in an excited happy cheer, both eyes bright and open, joyful smiling mouth. Both shoes remain planted at same height. Hands never touch canvas edges.

Thinking suffix:

> Expression/pose: calm thoughtful and encouraging, one mitten resting against cheek near chin, other arm relaxed, both eyes open with kind attentive gaze, gently raised eyebrow and small closed smile. Not worried or sad. Both shoes remain planted at same height.

Resting suffix:

> Expression/pose: peacefully resting with eyes softly closed into two curved smiles, content small closed smile, both hands resting comfortably at sides, upright and relaxed. No sleep symbols. Both shoes remain planted at same height.
