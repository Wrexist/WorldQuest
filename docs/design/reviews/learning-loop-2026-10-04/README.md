# Learning-loop polish review

The current Home card now prioritizes what to learn and where it sits in the
course. Its 320-point capture keeps the full recommendation and Start action
visible. No guaranteed XP total is advertised before the lesson.

The optional welcome demonstration teaches one bundled flag/name pair before
asking for recall. Answer selection gives immediate feedback; its explanation
scrolls into view while Continue stays outside the scroll area. The dark 320-point
large-text capture checks that reading and continuing remain possible.

Completed lessons coordinate the existing Atlas, XP and statistic entrances;
daily progress is explicit. Reduced motion shows settled values immediately.
The existing mistake retry and server scheduling remain unchanged.

An initial extra tutorial button squeezed the first value slide at 200% text.
Moving the tutorial entry to the scrollable welcome layout resolved that observed
regression. No navigation or lesson checks were removed to accommodate the change.

`pnpm verify` passed, including 1,251 mobile tests and the engine/backend/content,
translation, contrast, accessibility and workflow checks. Both native bundles
compile at 5.14 MB, below the unchanged 5.21 MB limit. Tutorial browser checks passed
at 390/light and 320/dark with 200% CSS text and reduced motion; Home captures at
320, 390, 430 and 768 passed layout measurements. The final full browser journey
also passed all 109 checks. These are exported-app browser captures.
CSS text scaling is not native Dynamic Type verification. The
globe-edge artifact and physical-device frame rate still require native review;
GitHub billing prevents a new TestFlight build. No part of this review was seen on
a phone.
