# Cloud companions — final browser review

**Verdict: the cloud and mascot update is verified.** The tablet composition note
was subsequently resolved in the [focused v3 follow-up](../tablet-fix/README.md).
The browser-only text-stress limitation below remains documented. This folder's
evidence comes from the immutable `node_modules/.cache/wq-clouds-final-v2` export;
the current Quest/Shop evidence uses `node_modules/.cache/wq-clouds-final-v3`.

`scripts/review-liquid-clay.cjs --clouds-only` completed **31 cases and 53 PNGs**:
Home, Quests, Profile and Shop at 320×568, 390×844 and 768×1024, in default light
mode and Swedish/dark/enlarged browser text/reduced motion. A real UI lesson earned
the populated Profile state, which was captured at all sizes in both modes. No
account state was seeded. The [report](report.json) records the source, geometry,
asset decoding and motion samples.

## Main screenshots

- [Profile after the actual lesson](profile-after-lesson-populated-390.png)
- [Quests](quests-390.png)
- [Shop](shop-390.png)
- [Home](home-390.png)
- [Guest Profile](profile-390.png)

The default phone screenshots, earned Profile320/390, tablet Quest, and narrow
dark/reduced screenshots were opened and reviewed. Atlas is more prominent, the
clouds stay with the companion, identity and level/XP remain readable, and the
existing lesson/quest actions remain reachable.

## Verified

- All cloud images decoded and preserve the source's 3:1 proportions. The first
  Home cloud's actual RN-web Image host measures **128×42.65625px** from a
  1536×512 source. Explicit auto height resolves the intrinsic-height regression
  preserved in [browser-final-failed](../browser-final-failed/README.md).
- Clouds remain hidden from assistive technology and have pointer events disabled.
  Their bounds, opacity and asset source are recorded separately from mascot bounds.
- Ten Atlas interactions exercised Home, Quests, Shop, guest Profile and earned
  Profile in both motion modes. Decoded laughing film advances normally; reduced
  motion shows a still. Atlas returns to the original pose. Route and captured
  progress/currency content remain unchanged.
- Cloud transform samples advance after settling in normal motion and remain
  unchanged under reduced motion. The existing film/still behavior is retained.
- Zero JavaScript errors, horizontal document overflow or undersized measured
  button/tab targets. Quest Continue remains fully visible before and after task
  scrolling. Guest Profile's lesson action remains visible at default text sizes.
- Existing chest/progress, Achievements/streak navigation, unaffordable purchases
  and equipped-title checks continue to pass.

## Notes and limits

**Resolved medium — tablet cloud composition.** In [quests-768.png](quests-768.png), the
full-width cloud's right crest grows above the hero and touches the lower edge of
the TopBar. The v3 change bounds Quest/Shop clouds to 384px and aligns them beside
Atlas. The [four-case focused follow-up](../tablet-fix/README.md) verifies the
corrected tablet composition, unchanged phone geometry, decoding, controls and
clearance from the TopBar. The v2 pixels and report are preserved here.

**Browser glyph-only stress limitation.** At earned Profile320, artificial glyph
doubling reports “Utforskare” and “Bemästrade fakta” outside the viewport. This
method deliberately does not execute native `fontScale` layout branches, so those
particular browser pixels are not called clean. The corresponding
[native-branch passport fixture](../native-layout-final/profile-passport-full-sv-dark-fontScale2-320.png)
and [stacked stats fixture](../native-layout-final/profile-stats-full-sv-dark-fontScale2-320.png)
were independently opened and reviewed: both strings fit, and the cloud remains
above the name with Atlas. The fixture is still not a physical device.

No haptic, physical gesture, native GPU performance or screen-reader speech claim
is made by this browser pass. No part of this was seen on a phone.
