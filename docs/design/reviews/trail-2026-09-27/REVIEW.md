# Trail, quests and wallet review

The island now has fixed lesson stops on the painted trail. Completing an individual
lesson fills a gold dot; completing a stop moves the explorer to the next stop. Home
keeps the current stop in view, including when progression enters another unit.
The objective card sits below the scene so it does not cover the landscape.

Daily quests have distinct colored task badges and animated completion stamps.
The summary retains the illustrated treasure scene. The shop wallet uses emerald
cartography, existing coin artwork, a bounded entrance motion and balance-change
feedback. Coins remain the real spendable balance; streak gems remain collectibles.

Movement respects reduced motion. The explorer is a moving 2D cutout, not a new
articulated 3D rig. The island and treasure illustrations are static artwork.

## Verification

- Mobile TypeScript check passed.
- 40 targeted CoursePath, QuestScreen and ShopScreen tests passed.
- The new progression regression completes multiple lessons, all first-unit stops,
  and enters the next unit. Stop coordinates remain unchanged and one current stop
  and one guide remain active.
- 17 browser checks passed: all five tabs at 320, 390 and 768 pixels; loaded artwork;
  no horizontal overflow; locked-step explanation; actual lesson launch.
- Accessibility lint and the 19-screen scrolling check passed.
- `git diff --check` passed (existing line-ending warnings only).

Screenshots in this directory were captured from the exported app after real
onboarding. They show an empty account; no sample balance or progress was inserted.
Browser captures use reduced motion for deterministic screenshots. This is web
validation, not an iOS or Android device performance measurement.
