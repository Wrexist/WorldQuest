# WorldQuest playful artwork

This is the active illustration family as of 26 September 2026. It supersedes the
mixed metallic and clay raster artwork in the application. The previous Blender
models and image-generation masters remain preserved in the adjacent directories;
they are not loaded by the mobile illustration catalogue.

## Authorship and source

The vector character, props, medals, twelve avatar variations, rank emblems,
celebration pieces and navigation illustrations are original geometry authored in
`scripts/build-playful-art.cjs`. They use WorldQuest's teal explorer robot, yellow
hat, cream body and orange scarf. No Duolingo character, illustration, animation
file or brand asset was copied. No third-party image or mesh generator was used
for this vector family. Editable SVG masters sit beside this file.

The continent masks derive from Natural Earth's public-domain geometry through
`world-atlas`, as documented by `scripts/build-daylight-maps.cjs`. They are
decorative navigation art. Existing country flags and factual map answer assets
are preserved; they are not invented illustrations.

## Delivered assets

- 75 replacements cover every existing typed illustration name.
- Seven registered Atlas layers: two arms, two legs, body, head and eyes.
- Thirteen navigation/prop assets, including house, passport, globe, heart, chest,
  a faceted collectible gem and separately registered chest base/lid layers.
- Native icons, adaptive icon, splash and favicon derive from the same vector art.
- 512-pixel transparent WebPs are measured for visible bounds and limited to 120 KB
  each. `validation.json` records sizes and SHA-256 hashes for all 95 derivatives.
- [Contact sheet](index.html) shows every SVG master.

Rebuild from the repository root with `node scripts/build-playful-art.cjs`.
`pnpm build:art` also finishes with this generator, so the legacy build cannot
silently restore the previous family. No extra runtime dependency is required.

## Motion

`AtlasCharacter.tsx` animates separate shoulder and neck pivots, eye blinks,
anticipation, squash/stretch and a small celebration hop. Greetings and reactions
last 1.8 seconds and then settle. `RewardMotion.tsx` gives rewards a 900 ms reveal;
active navigation icons pop once on selection. All transform animation uses the
native driver and the existing motion tokens. Timelines stop on unmount and when
the app backgrounds.

Reduced Motion renders the resting pose immediately. The persisted app setting
is combined with the operating-system preference: either one can reduce motion.
The OS preference is never overridden by the app switch. Web also listens for a
live media-query change. Artwork remains visible and feedback remains readable.

Motion evidence is in [the review](../../reviews/playful-motion-2026-09-26/index.html).
This proves web behavior; it does not establish native frame rate or device
screen-reader behavior. Source and original artwork follow the repository's
licensing terms; this change introduces no external artwork license.

The daily streak chest uses the registered lid and base in `TreasureChest.tsx`.
A single tap runs anticipation, lid lift and a gem burst over 1.8 seconds. The
cosmetic badge is saved immediately; leaving mid-animation cannot lose it. Reopening
or replaying a lesson cannot create another badge for the same local date. Coins
remain the existing server-authoritative currency; gems have no monetary value.
