# Native iOS acceptance

The adaptive-animation [normal run 37143395111](https://github.com/Wrexist/WorldQuest/actions/runs/37143395111), source `5ea88f44`, **passes** with every diagnostic disabled. It completes the live lesson map, optional study, persisted Home, rendered zoom, cold encoded Sweden and warm encoded France. The original PNGs were reviewed and are checked in below. The frame-completion bridge also compiles on Android. A small simulator viewport-edge artifact remains explicitly documented; this is not a claim of defect-free physical-device rendering.

## Current evidence

| Source and run | Result and limit |
| --- | --- |
| `b377262d` — [37140772660](https://github.com/Wrexist/WorldQuest/actions/runs/37140772660) | iOS compiled and completed the full Maestro flow: onboarding, quiz/study, early exit, persisted Home, Explore, cold Sweden and warm France. The zoom captures changed only **777 of 388,056 pixels (0.20%)**. The automated pixel step encountered a Bash 3.2 empty-array error; the same verifier was run locally against the original captures and failed. This is not successful rendered-zoom evidence. |
| `11dc2750` — [37141766361](https://github.com/Wrexist/WorldQuest/actions/runs/37141766361) | Android source compilation passed for Expo GL Kotlin and Java, and the release APK was uploaded. This confirms the explicit `Object` null fix for Expo Promise's overloaded Java API. No Android runtime or pixel claim follows from compilation. |
| `d5ddca55` — [37141991343](https://github.com/Wrexist/WorldQuest/actions/runs/37141991343) | iOS event-only diagnostic and full flow passed. Both captures contain live textured frames; **406,085 of 449,328 interior pixels changed (90.376%)**. Final camera distance **2.8475** completed at **18:02:17.206 UTC**, presented at **18:02:17.212**, and preceded the final capture at **18:02:18.163**. Controls and exterior UI are excluded from the pixel comparison. |
| `5ea88f44` — [37143395111](https://github.com/Wrexist/WorldQuest/actions/runs/37143395111) | **Passed:** ordinary iOS run with every diagnostic disabled. The first-lesson capture contains the complete highlighted US globe and all four answer cards, with loading absent and no fallback. Explore zoom changes **406,085 of 449,328 interior pixels (90.376%)**, from the live baseline to the enlarged target. Full flow and strict country-link assertions pass. [Original verifier result](globe-zoom-proof.json). |

The fresh-install artwork repair prevents Home's images from mounting before unfinished onboarding redirects. Repeated native captures show the complete Atlas, island and clouds. This removes the measured startup trigger; it is not a general React Native image-recycling fix. See [image-lifecycle.md](image-lifecycle.md).

The quiz starts directly with all four answers visible. Learn first is optional; its title and return action clear the system insets. Pause / Finish here, persisted Home, the complete reference catalogue, and country practice routes pass. Earlier quiz screenshots could show the disclosure-safe preview while live GL loaded; the final ordinary run waits for the complete lesson map before capturing it.

## Frame completion and adaptive animation

The earlier [event-only run 37137965337](https://github.com/Wrexist/WorldQuest/actions/runs/37137965337), source `626f524c`, established the original backlog: the real zoom press reached JavaScript, but 28 submitted frames produced no zoom presentation before termination. Synchronous GPU queries in an earlier diagnostic changed that behavior. Submission alone therefore could not establish readiness or rendered zoom.

The pinned Expo GL patch now acknowledges GPU completion asynchronously. [WorldAtlasView](../../../../../apps/mobile/src/features/atlas/WorldAtlasView.tsx) permits one frame in flight and coalesces newer camera requests. Readiness, labels and hit testing follow the completed camera, while the preview remains disclosure-safe and cannot accept map answers. Background and destroyed contexts invalidate pending work. Geometry, textures and shader quality are unchanged. The [native frame-completion report](../../../../engineering/native-gl-frame-completion.md) records the platform boundary, lifecycle tests and rebuild requirement.

The `d5ddca55` trace shows that coalescing works, but its first almost-stationary interpolation frame still took **2.387 seconds**, followed by **2.865 seconds** for the final target. The 420 ms animation had already finished. The preceding normal run captured about 4.55 seconds after physical release, consistent with a capture before the second expensive frame completed; that normal run had no completion trace to prove its exact timing.

The `5ea88f44` change uses the last successful native frame duration. When it is at least the full **420 ms** animation duration, the next camera move submits the target directly and avoids the redundant near-start frame. A later fast completion restores animation. Failed, stale and background-spanning completions are excluded, and a new context starts without a sample. This preserves rendering quality and adapts to measured performance rather than a simulator or device model. Ordinary acceptance now confirms the target zoom reaches the capture without diagnostic instrumentation.

The event-only run records input, camera updates, completion and native presentation without GL readbacks or framebuffer snapshots. The verifier requires presentation before the baseline and after the real press when trace data is available, preventing a preview-to-first-frame change from masquerading as zoom. The Bash pixel-step failure was fixed before the successful `d5ddca55` run.

## Remaining visual limitation

A small triangular background notch remains in the left ocean of both the diagnostic and final ordinary [zoomed simulator image](explore-zoomed.png). It matches mesh triangle 6769 crossing the viewport edge. Its indices, winding, depth and positive clip-space `w` are valid; buffers do not resize or lose context. Identical geometry, shaders and camera in browser GL do not reproduce it. This supports further native rasterization investigation, not a proven physical-device defect or a justified quality reduction. The native result is accepted for the tested flows and zoom delivery with this known visual limitation retained.

## Resolved bundled-file loading failure

The earlier [5485deca run](https://github.com/Wrexist/WorldQuest/actions/runs/37128874643) stopped at Explore's recoverable content error even though both packaged data assets were byte-identical to source. Expo FileSystem 19.0.23's `File.text()` / `File.bytes()` requested write permission for read-only bundle paths. The `cdb54f93` repair uses the official legacy read API: UTF-8 for the reference catalogue and Base64 decoded into an owned buffer for atlas geometry. Byte-boundary regressions include the real 904,180-byte atlas. Subsequent native runs load Explore and the full country pages, including Sweden's 130 facts and France's 174.

## Artifacts and reviewed captures

Downloaded evidence is under `node_modules/.cache/native-clay-frame-gate-normal` (`b377262d`), `node_modules/.cache/native-clay-frame-gate-events-only` (`d5ddca55`) and `node_modules/.cache/native-clay-adaptive-normal` (`5ea88f44`). The diagnostic cache contains bounded JavaScript/native traces. The ordinary cache contains the original startup/flow PNGs and pixel report, with no diagnostic instrumentation. Injection is confined to disposable diagnostic acceptance checkouts and is absent from production builds.

**The checked-in PNGs below are original captures from the successful ordinary `5ea88f44` run**, on iPhone 16 Pro / iOS 18.5. They replace the historical `47f99d98` captures; those remain in Git history and their limitations are documented in [image-lifecycle.md](image-lifecycle.md).

| Reviewed capture | Scope |
| --- | --- |
| [First welcome](welcome-first-launch.png) | Complete Atlas, island and clouds on a fresh install. |
| [Second welcome](welcome-second-launch.png) | Artwork after another independent fresh install. |
| [Daily goal](daily-goal.png) | Three goal cards and Continue fit. |
| [Region](region.png) | Seven choices and Continue fit. |
| [First lesson](first-lesson.png) | Complete live globe, four answer cards, Learn first and Check fit. |
| [Home](home-relaunch.png) | Current course step persists after relaunch. |
| [Optional study](optional-study.png) | Answers appear only after choosing Learn first; return remains available. |
| [Explore baseline](explore-globe.png) / [zoom](explore-zoomed.png) | Live textured baseline and enlarged camera, including the documented edge artifact. |
| [Sweden](country-sweden.png) / [France](country-france.png) | Cold and warm encoded links, relief maps, 130/174 facts and reachable practice actions. |

The full [5ea88f44 CI matrix](https://github.com/Wrexist/WorldQuest/actions/runs/37143380525) passes Windows, Ubuntu and database. Seventeen focused view tests and strict mobile TypeScript pass for adaptive motion; fourteen tooling regressions cover native completion, lifecycle, diagnostics and screenshot acceptance.

Native acceptance uses bundled local lesson composition because the workflow does not set production API variables. Separate hosted guest smoke and D1 tests cover production lesson parsing, question delivery and paged progress, as recorded in the [main review](../README.md) and [full-content report](../../../../engineering/full-content-reference-2026-10-03.md). Native exports remain below the unchanged 5.21 MiB Hermes budget; bundling and unit tests do not replace rendered acceptance. No physical iPhone/Android frame pacing, largest OS text, screen-reader, haptics or lock/unlock claim follows from these simulator captures.
