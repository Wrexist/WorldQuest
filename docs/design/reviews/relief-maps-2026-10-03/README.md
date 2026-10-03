# Relief maps and complete country reference

Real Expo web screenshots at 390 × 844 points, Swedish, captured 3 October 2026.
They show the actual routes with the bundled full reference catalogue. These
are browser evidence, not iPhone screenshots or physical GPU performance measurements.

| Surface | Evidence |
| --- | --- |
| Sweden, full 130-fact scope and shared relief map | [Dark](sweden-dark.png) |
| Europe, 2,778-fact scope and relief banner | [Dark](europe-dark.png) |
| Interactive Explore globe | [Light](explore-light.png) |

Independent review covered 14 screenshots across light/dark country top and
footer, region, Explore globe and region tiles, question entry and opt-in study.
No failed visible images, page errors, unintended horizontal text overflow or
blocking overlays. All four answer choices and the study return action remain
reachable. The first review revealed a separate Swedish country-name fallback
bug; its engine fix and regression are included in this change.

Quiz entry shows a question without the study answer cards. The learner can
choose “Lär dig först” before the first normal answer. The exact issued question
set and selection are preserved and study time is excluded from grading.

Native acceptance additionally exercises fresh installs, optional study safe
areas, Explore GPU initialization/zoom and country navigation. Its final run is
recorded in the PR; a browser review does not establish those native results.
