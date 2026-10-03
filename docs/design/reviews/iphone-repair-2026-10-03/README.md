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
