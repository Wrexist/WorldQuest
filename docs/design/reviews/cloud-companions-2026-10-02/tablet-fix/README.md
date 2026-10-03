# Focused tablet cloud verification

**Verdict: resolved.** Quest and Shop cloud layers are bounded to 384px and aligned
beside Atlas, so their visible crests no longer rise into the TopBar. This review
uses the immutable `node_modules/.cache/wq-clouds-final-v3` export.

`scripts/review-liquid-clay.cjs --cloud-tablet-only` captured Quests and Shop at
390×844 and 768×1024: **four cases, six PNGs, zero JavaScript errors**. All four
initial screenshots were opened and visually reviewed. The existing 31-case
journey and motion review was not repeated for this bounded-layout adjustment.

| Width | Cloud Image host on both routes | Result |
|---|---|---|
| 390px | 358×119.328px | Phone geometry is unchanged; controls and text remain clear. |
| 768px | 384×128px | Cloud sits beside Atlas; visible crest clears the TopBar. |

The decoded Image bounds begin at or below the TopBar bottom in these captures;
the visible cloud has additional transparent-art padding above its crest. Every
cloud retains its natural 3:1 ratio, is decorative, and ignores pointer input.
There is no horizontal or text-viewport overflow and no undersized measured
button/tab target. Quest Continue stays fully visible before and after scrolling.

- [Tablet Quests](quests-768.png)
- [Tablet Shop](shop-768.png)
- [Phone Quests](quests-390.png)
- [Phone Shop](shop-390.png)
- [Measurements](report.json)

The [v2 review](../browser-final-v2/README.md) and its original pixels remain
preserved. This focused check does not replace that motion/earned-Profile review
or its stated browser-only glyph-stress limitation.

No part of this was seen on a phone.
