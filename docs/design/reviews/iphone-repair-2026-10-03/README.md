# iPhone interaction repair ? October 3, 2026

Reported issues: Explore drags scrolling the page, difficult pinch zoom, blocky map edges, lesson controls underneath the Dynamic Island, text-description flag questions, and a low-resolution chest opening.

## Implementation

- The live globe owns a touch sequence until release; Explore and lesson scroll containers pause for that sequence. Pinch-to-one-finger transitions establish a fresh rotation baseline. Release, termination, backgrounding and unmount restore scrolling.
- The full-screen lesson route owns its native safe-area provider/view. This includes warm modal navigation from Home and the optional study screen, which previously escaped the root inset.
- Visual-capable question pools exclude accessible equivalent templates when the visual original is usable. Screen-reader/text-only alternatives remain available. Previously issued description tickets are presented as flag images without changing their item identity or grading.
- Coastline coverage and borders use smoothly weighted country-mask samples; picking keeps exact nearest country IDs. Texture dimensions and GPU allocation are unchanged.
- The approved editable chest has 480px film cells, 64-sample renders, a finite 900ms opening and native-driven stars. See the asset README for memory and compressed budgets.

## Review and evidence

Personas: Alex (exploration and recognisable geography), Priya (quick, uninterrupted learning), and large-text users. Reviewed main tabs, country/region detail, streak and lesson screens at narrow widths; dark Swedish 200% CSS text captures are in `web/`. CSS scaling is not a native Dynamic Type test.

Browser touch events exercised pan, two-finger pinch and return to one finger. Page scroll position stayed unchanged during the globe gesture, and overflow returned to auto after release. `gesture-report.json` contains the measurement. These are real exported app screens; the test reused onboarding preferences in an isolated browser context, not production account data.

`chest/` contains real component fixtures, clearly labeled with test data, including reduced motion, failed/cold decoding, backgrounding and repeated activation checks. Hardware sound/haptics are stubbed and counted; rewards are not submitted.

`pnpm verify` passed, including 1,247 mobile tests, engine/backend tests, content validation, accessibility lint, contrast and workflow checks. Native acceptance and complete browser journeys are recorded below when completed. No claim of physical-device frame-rate or VoiceOver validation is made.

The backend deployed as version `712a424c-44ce-4fa4-9adb-3b3c536cc2f0` from source `f53bc022`; existing feature holds were preserved. The live guest smoke loaded five Swedish beginner questions and deleted its temporary guest without submitting answers or sending email.

## Completed journeys and native review

The full browser journey passed 110/110 checks and real local D1 passed 44/44. The corrected screenshot walker handles auto-advancing matching boards and captures both answer verdicts and the real summary; all four viewport runs have no measured failures.

Native acceptance run 37154480472 passed Android compilation and iOS navigation on source f53bc022 with diagnostics disabled. Reviewed dark iPhone screenshots confirm the warm Home-to-lesson header and optional study are below the status bar and above the home indicator. The native zoom changes 88.75% of sampled textured pixels.

Visual review caught that the first new drag test used a point below the clipped globe. Its green command result was therefore not gesture proof. The corrected replay starts inside the visible map, and the pixel verifier now requires page content below the globe to remain stationary while the map changes, then move after a gesture outside the globe. The old misplaced swipe fails that check (90.35% of the page band changed).

The small left-edge missing polygon remains visible on the iOS simulator. It is not hidden or described as fixed; physical-device occurrence and cause remain unverified.

## Native gesture diagnosis

The stricter early replays captured an unchanged globe. Disposable instrumentation in run 37158810855 established that touch delivery and camera updates were correct: the release camera moved from latitude 20 / longitude 10 to latitude 27.82 / longitude -0.009. The software simulator took about three seconds per GPU frame; an unnecessary scene update on scroll-lock first rendered the old camera, and the comparison screenshot preceded the final frame. Search highlights now retain their identity through scroll-lock changes, with a regression test. The native comparison waits for the renderer's actual idle state. A production-path replay without instrumentation is pending.

## Launch redesign

The native launch configuration referenced the retired robot illustration. It now uses the complete clay Atlas cutout through Expo's splash plugin with matching light/dark canvas colors. The React boot screen has an opaque canvas, a single Atlas/cloud composition, safe-area padding, and scrollable slow/failure states. The first-time welcome shares the same illustration language and keeps the existing Get started / account routes. Returning users incur no added delay. The boot reveal is finite and respects reduced motion; ambient cloud drift is disabled while booting.

This serves first-time Alex and returning commuter Priya: recognisable character, a concrete learning promise, and immediate access once ready. It is screen 1 and the existing onboarding welcome, not a new navigation layer. Primary action remains Get started. The design uses the fast, seamless transition principle in [Apple's launching guidance](https://developer.apple.com/design/human-interface-guidelines/launching) and consistent, expressive character principles from [Duolingo's brand guidance](https://design.duolingo.com/writing/duo), without copying its artwork.

`startup/` contains real exported welcome screens plus boot component fixtures with injected booting/slow/failed props. Fixtures are not measured launch timings. Narrow 320px and 390px light/dark renders were reviewed; physical-device startup timing remains unverified. The native build must be regenerated because the launch configuration changed.

## Final native replay and launch review

Production-path replay [37160169786](https://github.com/Wrexist/WorldQuest/actions/runs/37160169786) passed with diagnostics disabled on JavaScript source `3d0aad19`, using the matching native configuration from build `37159678176`. The globe changed 88.98% of sampled pixels after dragging, the page band changed 0% during that drag, and the page changed 96.95% after scrolling outside the globe. Zoom also passed. `native/final-globe-proof.json` and the final screenshots retain this evidence. Native multisampling is disabled while retaining device pixel density and shader coastline filtering; physical-device performance is not measured.

Both Android and iOS compilation passed in run `37159678176`. Its `startup/native-welcome-light.png` captures the new first welcome on iPhone. The final replay also reviewed the dark welcome and warm lesson/study safe areas. The small left-edge polygon remains visible after the multisampling adjustment and is still an open visual issue.

Startup captures additionally cover a 320x568 CSS 200% text failure state and scrolling to Retry. The final exported browser gesture check passed with zero errors. After correcting scrollable centering, typecheck, accessibility and scrollable checks passed; the latest Ubuntu CI verification also passed. Windows and Ubuntu CI plus database checks all passed in run 37160172222. Signed TestFlight build/submission run 37161062811 is pending at this evidence commit.
