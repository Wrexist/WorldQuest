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
- **Expression library:** the brief's 32 core expressions (01 neutral … 32 welcoming)
  are data in `EXPRESSIONS` in the build script: face, brow tilt, body tilt and arms
  only; the globe never distorts. `--expressions` renders them to
  `docs/design/assets/world-mascot-3d/expressions/`, and
  `node scripts/build-globe-mascot-expressions.cjs` lays out the labelled reference
  sheet `expressions.png`. A design reference, not app art: an expression ships when a
  screen needs it, by joining `FACE` and the acting.
- **Hat fit:** he wears it — the brim sits at his brow, the crown covers the top
  third of the globe. The crown is a little roomier than his head and the brim's hole
  matches the crown, so the tilted hat sits down on him without the globe showing
  through (owner review, October 1: first the globe poked through, then a fix left the
  hat perched on top). Raised arms stop at about 60° above level so the hands pass
  outside the brim; the clash check below holds all of this.
- **Rig:** each arm is a two-bone armature (upper arm, forearm) under a rounded
  shoulder ball set forward of his side; the limb is one mesh skinned to both bones
  with a computed soft blend across the elbow, so a bend stays one smooth surface.
  The hand rides the forearm bone. Fingers have a knuckle and a middle joint, the thumb
  its own joint (`HAND_POSES`: relaxed, open, fist, point, thumbs-up). Arms pose two
  ways: forward kinematics (`arms`, `swing`, `elbow`, `elbow_in`) or IK (`reach`: where
  the wrist goes, `pole`: where the elbow points; pole angle measured at build). The
  hat, eyes, lids, brows, mouths and body keep their pivot hierarchy.
- **Clash check:** `--check` tests every mood's performance (every other frame), every
  expression and every pose for the globe poking through the hat or an arm through the
  hat, and exits non-zero on any. Run it after any change to proportions or poses.
- **Poses:** `POSES` (`--poses`, sheet via
  `node scripts/build-globe-mascot-expressions.cjs poses`): standing, waving,
  thumbs-up, double thumbs-up, pointing four ways, cheering, victory, inviting, shrug,
  hands on hips, thinking (fist on cheek), listening (hand at the ear). IK targets were
  found by searching for the palm nearest each goal with no arm inside the globe. With
  the locked proportions (arms 30–35% of the globe) the front of the face and the
  space in front of him are out of reach, so hand on chin, facepalm, clap, arms crossed
  and hug cannot be posed without longer arms — a design decision for the owner, not a
  rig limit. The owner confirmed on October 1 that the current arm
  proportions stay locked.
- **Not built yet from the brief** (follow-ups, in this order): walk and run cycles;
  prop poses (magnifier, map, telescope, heart); LOD tiers.
- **Faces:** `FACE` in the script sets each of the ten moods' rest look; stills are in
  `docs/design/assets/world-mascot-3d/stills/`.
- **Acting:** `scripts/globe_mascot_acting.py` keys one two-second performance per mood
  (36 frames at 18 fps), every channel starting and ending at rest: welcome waves,
  celebrate crouches and springs, laughing clutches his belly and shakes with tears,
  surprised jolts, proud puts his hands on his hips and winks, sleepy nods off and
  jerks awake, thinking tilts with a hand beside his face, encouraging nods, resting
  breathes, wink winks.
- **Render:** Cycles, AgX Punchy, key, fill, rim and top area lights, a shadow catcher,
  transparent film.
- **Runtime (superseded October 2 by the liquid-clay stills, below):** `scripts/build-globe-mascot-art.cjs` packs each mood into a 6×6 sheet of
  320 px cells (rendered at 400) plus a 640 px still (`apps/mobile/assets/art/atlas-globe`,
  `src/lib/atlasGlobe.generated.ts`). `WorldMascot` steps through the sheet like the
  treasure chest: no 3D engine, no video. He plays his mood when he appears and again
  every few seconds while visible (sleepy dozes continuously), stops at rest on blur,
  background and Reduce Motion, and shows the still under Reduce Motion. The Atlas
  beside the current step on Home is a button that laughs when tapped.

Run `--check` in a separate Blender process before rendering.

Rebuild: `blender --background --python scripts/build-globe-mascot.py -- --stills --sheets`
then `node scripts/build-globe-mascot-art.cjs`. Add `--optix` after `--` to render on
a supported NVIDIA GPU; the default remains CPU. Cycles retains scene data between
frames to avoid rebuilding the static globe and studio, with the same sample counts
and lighting. The packer feathers the shadow at the image edges and steps WebP quality
down to keep each sheet at or below 640 KiB.
The ten-mood still/animation render took about nine minutes on an RTX 3060 with
`--optix` and retained scene data (October 1).

Worn-hat validation (October 1): `CHECK_DONE 0 clash(es)`; all 360 final raw frames
have no alpha above 60 in the top two rows. Minimum top clearance is 24 px for
celebrate, 14 px for surprised, and 27 px for sleepy after lowering the Zzz group.
All ten packed sheets fit 640 KiB (largest: celebrate, approximately 626 KiB).
The post-render component run passed 78 tests; `pnpm verify` passed in the original
working checkout. Browser E2E passed 107 checks, with one skipped because its lesson
did not select an image question. Browser review covers the shared mascot in normal
and reduced motion layouts; a native device pass for smoothness remains outstanding.

## Liquid clay (October 2)

The app's Atlas is now four complete clay poses (welcome, celebrate, thinking,
resting) with the ten moods mapped onto them; prompts and provenance are in
[`assets/atlas-liquid-clay/README.md`](assets/atlas-liquid-clay/README.md). The Blender
sheets above stay as source history and are not imported. Each pose arrives with one
finite native gesture (a hop for a cheer, a head tilt for a thought, a greeting
otherwise) and then rests.

## Alive: the blink (October 9)

Personality: [`voice-and-tone.md`](voice-and-tone.md#atlas--the-mascot). The mascot
research behind this pass: a character reads as alive through *subtle* idle motion, a
blink above all, and big motion belongs only to big moments, which the gestures above
already cover.

- **Frames.** `scripts/build-clay-mascot.cjs` derives `welcome-blink`, `celebrate-blink`
  and `thinking-blink` from the open poses (`scripts/lib/clay-lids.cjs`): it finds each
  eye, fills it with the clay face around it (a Laplace fill, so the light carries
  across without a seam), then lays on resting's own closed eyes, flipped to curve down
  into a calm blink. Same sculpted navy clay as his brows, nothing drawn on. Resting has
  no blink: its eyes are already closed.
- **Invariant.** A blink frame differs from its open pose only around the eyes;
  `scripts/lib/clay-lids.test.cjs` (in `pnpm test`) fails on any other changed pixel,
  because the frame is shown over the pose and any other difference would flicker.
- **Runtime.** `useMascotBlink` loops ONE native timing over the whole cycle and the
  lids are an `interpolate` of it, so the JS thread does nothing between mount and
  blur. The blink frame is a second `Image` laid over the pose; a blink is its opacity
  snapping to 1 for `motion.blink.duration` (120 ms) after each of
  `motion.blink.restMs` (3.4, 4.8, 2.6, 0.16, 5.2 s: uneven, with one double blink).
  A snap, not a fade: the first in-app capture faded over 45 ms and caught open eyes
  showing through closed ones, a ghost.
  It runs only from `space[9]` (64 pt) up, once the open pose has decoded, and stops
  with his eyes open on blur, in the background and under Reduce Motion.
- **Cost.** One more 512 px image decoded per visible Atlas (1 MiB of raw RGBA), no
  layout, no swaps. This is the first idle loop on him since #31 removed the
  sheet-stepping idle for a reported iPhone stutter. **Physical iPhone check
  outstanding**: if it stutters, set `BLINK_MIN_SIDE` in `WorldMascot.tsx` out of reach
  and the blink is off everywhere, with no other change.
