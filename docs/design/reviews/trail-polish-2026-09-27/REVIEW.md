# Trail motion and lesson emphasis

Continues the accepted illustrated island direction. The new user-supplied Duolingo
screenshots inform three mechanics: a distinct active-step ring, a strong contextual
lesson action, and feedback tied to earned progress. WorldQuest retains its own
artwork, currency and course data. No new social features, league rules or reward
amounts are introduced by this pass.

## Changes

- The active lesson has a native segmented ring. Its gold fraction uses actual
  completed lessons / required lessons. A new step begins empty.
- A small Start label lives on the map; the action panel below it is emerald.
- The explorer eases between stops and responds when lesson progress changes.
  Position motion is separate from layout reporting, so opening an explanation
  no longer restarts the movement.
- Selecting a locked or completed step brings its explanation into view above
  the tab bar. The current step remains a one-tap lesson launch.
- Quest badges and the treasure summary emit a short decorative star burst on
  progress increases. Already-earned progress, rerenders and daily resets do not
  trigger it. Reduced motion suppresses it; backgrounding stops it.
- Existing completed quest stamps no longer bounce every time the screen mounts.

## Evidence

27 targeted component tests passed, including multi-lesson/unit progression,
ring fractions and reward animation suppression. Mobile TypeScript and accessibility
lint passed. The browser report contains 18 passing checks across five tabs at
320/390/768 pixels, including automatic explanation visibility and a real lesson
launch. `git diff --check` passed with existing line-ending notices only.

Inspected `home-320.png` and `map-inspection.png`: active marker and start label
remain readable, the card is above navigation, and the illustrated path is visible.
Screenshots use reduced motion; they are not evidence of animation performance.

Not verified in this pass: full repository verification, 200% text, native device
performance, VoiceOver or TalkBack. The explorer is still a 2D cutout moving over
static art, not a newly articulated 3D model. No part of this was seen on a phone.
