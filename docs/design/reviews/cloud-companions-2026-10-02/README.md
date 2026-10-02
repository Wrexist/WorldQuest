# Soft clouds and a stronger Atlas — 2 October 2026

The owner requested the cloud details and prominent mascot shown in their
IMG_3388.png Profile reference. This adds a small shared decorative layer to the
existing liquid clay design, keeping real account progress and actions intact.

## What changed

- Profile's identity has a cloud stage and a 128pt Atlas frame on wider phones,
  112pt on narrow phones. Enlarged text still stacks, with the clouds anchored to
  Atlas above the name. The level/XP panel remains a separate readable surface.
- Guest Profile has a cloud stage limited to its artwork area: 96pt Atlas at 320,
  128pt on wider phones. The lesson action stays outside the decoration.
- Quests and Shop use the same cloud illustration with 96/112pt Atlas frames.
  Text remains in native layout above the decorative layer, and Quests' Continue
  stays outside the scroller.
- Home's current path companion gets a small cloud ground and a 104pt square
  frame, leaving space around the neighbouring lesson target on narrow phones.
- Existing acting, tapping Atlas to laugh, reward states and reduced-motion
  behavior remain. Clouds rise by 4pt on the existing native-driver `motion.drift`
  loop and stop for Reduced Motion and app backgrounding. Dark mode dims them.

This serves Emma's lively guided adventure, Priya's clear content hierarchy and
Alex's enlarged-text/reduced-motion needs. It changes no routes, strings, prices,
learning content or rewards. Maps and question content receive no cloud overlays.

## Asset and implementation

One generated transparent cloud image is shared across the four surfaces. The
[source and reproducible export](../../assets/clay-clouds/README.md) are in the
workspace. The 1536×512 WebP is 76,524 bytes; there is no new dependency or video.
`CloudBackdrop` is decorative, ignores pointer input and stays outside the
accessibility tree. Foreground Atlas remains its own named button.

The first preview stretched the illustration when large text made heroes tall.
The image now preserves its 3:1 proportions. Real Expo export review additionally
caught RN-web injecting the source's 512px intrinsic image height; explicit
`height: 'auto'` lets the width/aspect ratio set the rendered height. This defect
was invisible in the base64-image component fixture, which is why both forms of
evidence are retained.

## Verification and evidence

- `pnpm verify` passed, including 1,167 mobile tests and 49 design tests, typechecks,
  content, i18n, contrast, accessibility lint, reachability and configuration gates.
- Existing Profile/Quests/Shop component coverage passed 60 tests.
- The full browser journey passed 107/107 steps; one conditional flag-image check
  skipped because that lesson had no image question. This preceded the final
  image-height-only correction; the final focused visual review covers that fix.
- [Native layout fixtures](native-layout-final/report.json): 12 cases at 320/390/768,
  Swedish dark mode, native-fontScale 2 branches plus separately enlarged glyphs.
  No overflow or undersized controls. These use explicitly synthetic props.
- [Preview](browser-preview/report.json): real onboarding and earned Profile,
  decoded scenery, normal/reduced boop behavior, cloud drift/stillness and existing
  actions. The intermediate failed `browser-final-failed` capture documents the intrinsic
  image-height issue.
- [Final browser review](browser-final-v2/README.md): 31 cases, 53 screenshots,
  10 boop checks and no JavaScript errors.
- [Tablet width-cap review](tablet-fix/report.json): the final Quests/Shop
  cloud-width cap is checked at 768pt alongside the unchanged 390pt layout.

Full verification preceded final cloud fitting and registry packing. Targeted
consumer tests and mobile typecheck cover the final asset registry representation:
194 flag and 386 map imports, keys, ordering, values and source image bytes remain
identical; generators reproduce the compact path tables. All corresponding
content-pack paths and 18 Flag/CountryMap tests pass.

## Measured cost

The new presentation measured 5,455,364 bytes on iOS and 5,452,843 on Android after
the final tablet cloud-width cap, up 3,208/2,416 bytes from the preceding liquid clay
pass. Artwork is separate from Hermes bytecode. Both platforms compile.

The size gate allocates **5.20 →5.21 MiB** explicitly for this requested shared
scenery and responsive hero treatment. This is a 0.01 MiB increase, not a claim of
unchanged size. Flag/map packing preserves the mappings but saved less in the full
Metro graph than isolated compiler probes predicted; full native measurement is
the authority. The script and current performance tables record the allocation.

Later on **2026-10-02**, the [responsive motion pass](../responsive-motion-2026-10-02/README.md)
measured **5,456,119 B on iOS / 5,453,594 B on Android**, an increase of **755/751 B**
from the cloud-pass measurements above. Both graphs compile within the unchanged
**5.21 MiB** gate. This is bundle evidence, not native runtime verification.

## Limits

Chromium screenshots and synthetic native-fontScale fixtures are complementary;
browser-only glyph doubling does not activate native layout branches. The enlarged
earned Profile can therefore show text clipping in that synthetic browser mode,
while its corresponding native-fontScale layout passes. No learning state was
seeded for the real-app Profile captures.

Physical iOS/Android rendering, VoiceOver/TalkBack and frame timing remain device
checks. No part of this was seen on a phone. No deployment was performed.
