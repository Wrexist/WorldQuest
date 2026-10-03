# Native iOS acceptance

The latest [event-only trace](https://github.com/Wrexist/WorldQuest/actions/runs/37137965337), source `626f524c`, identifies a native rendering backlog: the real zoom press reaches JavaScript and submits 28 frames, but no zoom frame is presented before the app stops. The **uninstrumented** [37136532907](https://github.com/Wrexist/WorldQuest/actions/runs/37136532907), source `79e35538`, changes zero globe pixels and later remains on SpringBoard after accepting a cold Sweden link. Native acceptance remains open until the frame-completion repair passes an ordinary iOS/Android run.

## Confirmed in the diagnostic run

- Both independent fresh installs show the correct Atlas mascot, island and clouds. The synchronous onboarding gate prevents Home's artwork from mounting before unfinished onboarding redirects. This is evidence for removal of that measured startup trigger, not a general React Native image-recycling fix.
- The quiz opens directly with its highlighted relief map and all four answers visible. Learn first is optional; its title and return action clear the system insets. Returning to the same question, Pause / Finish here, Home and persisted Home after relaunch pass.
- Explore loads the complete reference catalogue. The earlier [e80cc3f4 run](https://github.com/Wrexist/WorldQuest/actions/runs/37132567836) also opened cold encoded Sweden and warm encoded France links, with relief maps and full totals (Sweden 130, France 174). The latest run does not repeat that country-flow proof because the simulator did not launch the app for its first link.
- The live Explore globe eventually renders the correct textured Earth. JavaScript and native viewport dimensions agree; framebuffer status is complete, GL error is zero and native presentation succeeds. No premature GLView removal or context resize occurs in this trace.

## Rendered zoom proof and remaining acceptance

The renderer now leaves a disclosure-safe static relief map under the live surface until a complete textured frame is submitted, with initial highlights applied. It no longer clears an opaque incomplete frame while textures load. The first Explore draw takes about 5.5 seconds in this diagnostic trace, down from 14.4 seconds in the previous run; subsequent inspected frames take about 3.1–3.5 seconds. These measurements include synchronous diagnostic GPU queries and are **not** physical-device FPS or normal-build latency measurements.

The zoom test centres the globe above the fixed tabs before tapping. The trace records press-in, the real onPress, camera animation, final camera state and successful frame presentation. The screenshot verifier finds **406,085 of 449,328 interior pixels changed (90.38%)**, with mean RGB delta 38.68 and textured images before and after. Controls, status text and exterior UI are excluded. The same verifier correctly rejects the earlier unchanged-camera artifact. Its five fixture tests reject blank/unchanged and control-only changes.

That result does **not** repeat without instrumentation: the normal run changes **0 of 446,664 pixels**, despite healthy texture in both captures. Both fresh startups, Home counters, quiz answers and optional study render correctly, but the first-quiz screenshot still shows the static preview while the live map loads. Installed Expo GL source confirms that normal frame submission queues work asynchronously, whereas diagnostic `getError()` synchronizes the queue.

The event-only trace settles the cause: press-in, press-out and onPress all arrive, the camera animation completes, and 28 frames are submitted by 17:01:29 UTC. Only the first two frames present, before the zoom; none of the zoom frames presents before termination at 17:01:35. Its apparent 98.55% screenshot change is a false positive caused by capturing the static preview before the initial live presentation. The strengthened verifier rejects this trace: diagnostic acceptance now requires native presentation before the baseline and after the real zoom press, as well as changed textured interior pixels. Eight verifier tests include missing/late presentation and midnight timestamps.

The repair adds asynchronous GPU completion to the pinned Expo GL native module and keeps at most one frame in flight, coalescing newer camera requests. The GL queue waits for GPU completion without blocking JavaScript or the UI thread. Readiness, labels and hit testing follow the completed camera; loading previews do not accept map answers. Backgrounding pauses deadlines and submission, and stale completions after destruction are ignored. Geometry, texture and shader quality are unchanged. See [native-gl-frame-completion.md](../../../../engineering/native-gl-frame-completion.md) for the boundary, native lifecycle checks and rebuild requirement. Native compilation and normal rendered acceptance remain required; local tests cannot prove those pixels.

A small triangular background patch in the diagnostic zoomed left ocean is under review. It matches one otherwise valid mesh triangle crossing the viewport edge; rendering identical geometry in browser GL does not reproduce it. This has not been established on a physical device. The unchanged normal camera cannot determine whether it persists. No speculative renderer-quality reduction has been made.

The earlier failed cold-link attempt reached LaunchServices without consent or an application launch; the later normal run delivered a complete touch and dismissed consent with “Button Pressed” but still created no WorldQuest process. The `-10814` warning also occurs in the successful previous run, so it is not a proven cause. The acceptance workflow now preapproves only this app scheme in its disposable simulator and waits up to 45 seconds for each exact destination. This still requires a cold encoded Sweden launch and warm France navigation with their practice actions. Whether it resolves the simulator handoff must be established by the next run.

Local artifact folder: `node_modules/.cache/native-clay-atlas-preview-diagnostic`. The workflow artifact contains the original screenshots, bounded `native-atlas-diagnostic.json`, native `native-atlas-native.jsonl`, framebuffer PNGs and the instrumented/original GLView source. `native-globe-zoom-local.json` is the verifier result run locally against that original artifact: the workflow originally skipped the checker after the later link failure. The checker now runs even when a later navigation step fails. Diagnostic code is installed only in the disposable acceptance checkout; it is absent from normal production builds.

## Resolved bundled-file loading failure

The earlier [5485deca run](https://github.com/Wrexist/WorldQuest/actions/runs/37128874643) stopped at Explore's recoverable content error. Both packaged data assets were present and byte-identical. Expo FileSystem 19.0.23's native `File.text()` / `File.bytes()` methods request write permission, while app-bundle paths are read-only. The `cdb54f93` repair uses the official legacy read-only API: UTF-8 for the reference catalogue and Base64 decoded into an owned byte buffer for atlas geometry. Eleven byte-boundary tests include the real 904,180-byte atlas; 110 focused content/atlas tests and strict mobile TypeScript pass. Both subsequent native runs load the reference data, and the diagnostic run reaches both country pages.

The complete CI matrix is green on [626f524c](https://github.com/Wrexist/WorldQuest/actions/runs/37137968272): Ubuntu, Windows and database. Local frame-gate validation passes the atlas suite, strict mobile TypeScript, native wrapper/Java lifecycle tests and both 5.13 MiB Hermes bundles against the unchanged 5.21 MiB budget. The previous production-source revision `cdb54f93` also passed real D1 transaction proof. CI success does not replace complete uninstrumented native acceptance.

## Historical captures

The checked-in PNGs in this folder are from commit `47f99d98`, not the latest map build. They establish only that individual run's appearance. Later first-install corruption was reproduced and is documented in [image-lifecycle.md](image-lifecycle.md). Final replacement screenshots remain pending.

| Historical capture | Scope |
| --- | --- |
| [First welcome](welcome-first-launch.png) | Complete Atlas, island and clouds in this individual run. |
| [Second welcome](welcome-second-launch.png) | Artwork after terminate/relaunch. |
| [Daily goal](daily-goal.png) | Three goal cards and Continue fit. |
| [Region](region.png) | Seven choices and Continue fit. |
| [First lesson](first-lesson.png) | Four answer cards and Check fit without duplicate safe-area padding. |
| [Home](home-relaunch.png) | Current course step persists after relaunch. |

Native acceptance uses bundled local lesson composition because the workflow does not set production API variables. Separate hosted guest smoke and D1 tests cover production lesson parsing, question delivery and paged progress, as recorded in the [main review](../README.md) and [full-content report](../../../../engineering/full-content-reference-2026-10-03.md). No physical iPhone/Android frame pacing, largest OS text, screen readers, haptics or lock/unlock claim follows from these simulator captures.
