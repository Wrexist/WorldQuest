# WorldQuest globe companion

Original mascot generated with the built-in image-generation tool on 2026-09-27. Source: assets/world-mascot/source.png. Runtime: apps/mobile/assets/art/world-mascot/welcome.webp (640 pixels, transparent alpha, about 50 KB).

Direction: a living blue-and-green globe, oversized expressive eyes, short mitten arms, amber feet, and a coral scarf. Replaces the detailed safari robot in onboarding, character art slots, lessons, path, quests and passport. Existing currency and navigation artwork remains separate.

Motion is a short native-driver whole-character greeting or celebration, not a skeletal rig or facial animation. It stops in background and respects reduced motion. Older robot production files are retained as source history.

Prompt: Create a finished original mascot sprite for WorldQuest, a friendly geography learning app. One single full-body character on a genuinely transparent background with alpha, centered with generous transparent margin. Exceptionally clean professional flat vector-style mascot illustration, bold simple rounded shapes, playful personality and readable at 64 pixels. A plump round sapphire-blue living globe with broad smooth green land shapes, two large separate white oval eyes, dark navy pupils looking slightly right, tiny highlights, and a delighted curved smile. No white face mask, beak, or owl ears. Short blue mitten arms without fingers, one raised in a welcoming wave, amber feet, tiny coral neckerchief as the only accessory. No human torso, robot, helmet, safari hat, map, backpack, labels, text, watermark or frame. Entire character visible. Flat fills with one restrained darker blue shadow, no metallic surfaces or cast shadow. A new original character, not an existing branded mascot.

## Articulated character (September 27)

The accepted concept is now an editable 12-layer vector rig, with lossless transparent runtime textures. Rebuild with `node scripts/build-world-mascot.cjs`; editable SVGs live in `assets/world-mascot/rig`. No new native dependency is required.

`WorldMascot` shares one native-driver timeline across limb pivots, torso anticipation/hop/settle, eye blinking, and pupil glances. Welcome waves; celebration smiles with closed happy eyes and a hop; thinking tilts and glances; encouragement nods gently; resting holds a calm expression. Correct/wrong answers select celebration/encouragement. The full lesson celebration uses the same rig.

Each appearance performs once with two quiet blinks, then rests. Backgrounding, navigation blur and reduced-motion changes stop the timeline and restore a complete static pose. Decorative art remains hidden from assistive technology; an explicit label is announced once. All reward text and progression remain separate and immediate.

Original generated concept remains archived above. This is articulated 2D artwork, not a 3D model or video sprite sheet. Physical iOS/Android verification remains outstanding.

Validation: 57 focused component/lesson tests passed across the runs; TypeScript passed. Browser review completed 22 checks with no page errors, including independent arm movement, live reduced-motion switching, 320/390/768 layouts and lesson navigation. Evidence: reviews/world-mascot-motion-2026-09-27/.

## Motion revision: grounded acting

Replaced the shared coarse keyframes with separate, continuously eased tracks sampled into native interpolation tables. Feet remain planted for greetings, thinking and encouragement. Celebration uses one takeoff/landing; torso compression pivots at the hips. The arm wave, eye glance and scarf follow-through have distinct timing and amplitude.

`mascotPerformance.ts` owns deterministic curves and rig pivots. `useMascotMotion.ts` owns playback, focus/background cleanup and reduced motion. `WorldMascot.tsx` only composes the artwork. Resizing does not restart the performance, and focus resumes quiet eye movement without replaying an earned celebration. Runtime drawing remains transform-only, without a JS frame loop or layout animation.

Revision validation: 15 motion/component tests, TypeScript and 22 browser checks passed. In-app video and sampled motion frames: reviews/world-mascot-polish-2026-09-27/. Native device validation remains outstanding.

## Atlas in real 3D (September 30)

The layered 2D rig (September 27–29, including its shaded re-render and emotion pass)
was retired on owner review: layered flat art could not reach the finish of the island
and the Expedition props. Atlas is now a real 3D character built in Blender.

- **Canonical design (owner's master character sheet, September 30):** a near-spherical
  Earth, slightly wider than tall, satin ocean blue with raised, simplified green land;
  a face set in the ocean with big dark glossy eyes, navy brows, pink blush and a
  burgundy mouth with a pink tongue (teeth only for the big laugh); short blue arms
  shaped like a person's, with cartoon human hands (palm, four fingers, thumb); very short blue legs in chunky mustard boots with off-white soles; a
  khaki explorer hat with a dark band and a globe badge, tilted; a small tan backpack
  with a pocket and a rolled mat. No bandana, and no shoulder straps: on owner review
  (October 1) the strap read as a thick brown cord stuck to his side. The design is locked: every
  render comes from the one script, so proportions cannot drift between outputs.
- **Model:** `scripts/build-globe-mascot.py` builds him procedurally. The land is
  Natural Earth 1:110m (public domain), land only and no borders, painted into
  `land.png` / `land-soft.png` by `scripts/build-globe-mascot-land.cjs`: the crisp mask
  colours it, the soft one raises it. Real coastlines, never invented ones
  (`docs/design/asset-prompts.md`). The Atlantic faces the camera, so the face sits at
  sea. Eyes are layered (white, blue-grey iris, navy pupil, two glints) on a gaze
  pivot, with hinged lids; brows, mouths and blush sit on surface pivots; the hat has
  its own pivot, and the acting moves it a beat behind him: it lifts off at the top of
  a hop, lands late and bounces to rest, wobbles through the laugh and tips after his
  head. Each arm is one seamless tapered limb (narrow at the elbow, a forearm swell, a
  slim wrist), so it has no joint seams. Parts are named for the brief's rig list
  (`GlobeBody`, `Eye_L`, `Pupil_L`, `Eyelid_L`, `Brow_L`, `Arm_L`, `Hand_L`, `Boot_L`,
  `Hat`, `HatBadge`, `Backpack`). Camera: 65 mm, front three-quarter, slightly above.
  Master: `docs/design/assets/world-mascot-3d/atlas.blend`.
- **Not built yet from the brief** (follow-ups, in this order): the expression library beyond the ten moods; walk and run cycles;
  prop poses (magnifier, map, telescope, heart); an armature rig with IK in place of
  the pivot hierarchy; LOD tiers.
- **Faces:** `FACE` in the script sets each of the ten moods' rest look; stills are in
  `docs/design/assets/world-mascot-3d/stills/`.
- **Acting:** `scripts/globe_mascot_acting.py` keys one two-second performance per mood
  (36 frames at 18 fps), every channel starting and ending at rest: welcome waves,
  celebrate crouches and springs, laughing clutches his belly and shakes with tears,
  surprised jolts, proud puts his hands on his hips and winks, sleepy nods off and
  jerks awake, thinking tilts with a hand to his chin, encouraging nods, resting
  breathes, wink winks.
- **Render:** Cycles, AgX Punchy, key, fill, rim and top area lights, a shadow catcher,
  transparent film.
- **Runtime:** `scripts/build-globe-mascot-art.cjs` packs each mood into a 6×6 sheet of
  320 px cells (rendered at 400) plus a 640 px still (`apps/mobile/assets/art/atlas-globe`,
  `src/lib/atlasGlobe.generated.ts`). `WorldMascot` steps through the sheet like the
  treasure chest: no 3D engine, no video. He plays his mood when he appears and again
  every few seconds while visible (sleepy dozes continuously), stops at rest on blur,
  background and Reduce Motion, and shows the still under Reduce Motion. The Atlas
  beside the current step on Home is a button that laughs when tapped.

Rebuild: `blender --background --python scripts/build-globe-mascot.py -- --stills --sheets`
(about 30 minutes for all ten moods), then `node scripts/build-globe-mascot-art.cjs`.
A device pass for smoothness remains outstanding.
