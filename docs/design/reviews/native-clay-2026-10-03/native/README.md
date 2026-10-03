# Native iOS acceptance

The latest run is [37132567836](https://github.com/Wrexist/WorldQuest/actions/runs/37132567836), from commit `e80cc3f48107e870b7bf8ee4ccccae3503cdd0e4`, on an iPhone 16 Pro simulator running iOS 18.5. It used the normal app entry with bounded atlas diagnostics enabled. **The navigation flow passed, but native visual acceptance is still open:** the first quiz was captured before its live globe appeared, and the zoom tap did not change the globe pixels. This is not a final release pass.

## Confirmed in the latest run

- Both independent fresh installs show the correct Atlas mascot, island and clouds. The synchronous onboarding gate prevents Home's artwork from mounting before unfinished onboarding redirects. This is evidence for removal of that measured startup trigger, not a general React Native image-recycling fix.
- The quiz opens directly with all four answers visible. Learn first is optional; its title and return action clear the system insets. Returning to the same question, Pause / Finish here, Home and persisted Home after relaunch pass.
- Explore loads the complete reference catalogue. Cold encoded Sweden and warm encoded France links both open the intended country and its practice action, with relief maps and full totals (Sweden 130, France 174).
- The live Explore globe eventually renders the correct textured Earth. JavaScript and native viewport dimensions agree; framebuffer status is complete, GL error is zero and native presentation succeeds. No premature GLView removal or context resize occurs in this trace.

## Remaining native rendering defects

The first ready lesson draw takes about 5.2 seconds in this simulator trace; Explore takes 14.4 seconds. These measurements include a synchronous diagnostic GL query and are not physical-device FPS measurements. The renderer previously reported ready when textures finished loading, before the first complete globe was drawn, so early screenshots could contain only the country label.

The zoom test now scrolls the globe into the viewport so its control is not under the fixed tabs. XCTest completed the physical plus tap, and the after screenshot was taken about 2.9 seconds later. Only the plus button's pressed pixels changed; no subsequent camera draw was recorded. Merely finding a Zoom out button is therefore insufficient proof. A visual change check and a normal-entry replay without diagnostic instrumentation are required before the next TestFlight candidate is accepted.

Local artifact folder: `node_modules/.cache/native-clay-atlas-diagnostic`. The workflow artifact contains the original screenshots, bounded `native-atlas-diagnostic.json`, native `native-atlas-native.jsonl`, two framebuffer PNGs and the instrumented/original GLView source. Diagnostic code is installed only in the disposable acceptance checkout; it is absent from normal production builds.

## Resolved bundled-file loading failure

The earlier [5485deca run](https://github.com/Wrexist/WorldQuest/actions/runs/37128874643) stopped at Explore's recoverable content error. Both packaged data assets were present and byte-identical. Expo FileSystem 19.0.23's native `File.text()` / `File.bytes()` methods request write permission, while app-bundle paths are read-only. The `cdb54f93` repair uses the official legacy read-only API: UTF-8 for the reference catalogue and Base64 decoded into an owned byte buffer for atlas geometry. Eleven byte-boundary tests include the real 904,180-byte atlas; 110 focused content/atlas tests and strict mobile TypeScript pass. Both subsequent native runs load the reference data, and the diagnostic run reaches both country pages.

The complete CI matrix is green on [e80cc3f4](https://github.com/Wrexist/WorldQuest/actions/runs/37132561893): Ubuntu, Windows and database. The previous production-source revision `cdb54f93` also passed the full matrix and real D1 transaction proof. CI success does not replace the remaining native pixel checks above.

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
