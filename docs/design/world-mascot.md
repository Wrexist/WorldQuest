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
