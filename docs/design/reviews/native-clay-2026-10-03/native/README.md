# iOS simulator evidence

Captured on 2026-10-03 from commit `47f99d98`, on an **iPhone 16 Pro simulator running iOS 18.5**. This run used the normal app entry, with asset diagnostics off, English, light appearance and default text size. These are native simulator captures, not browser or physical-device evidence.

The native acceptance workflow does not set production `EXPO_PUBLIC_*` API values. The app therefore selects the unconfigured backend (`kind: 'none'` in [backendConfig.ts](../../../../../apps/mobile/src/lib/backendConfig.ts)) and composes lessons locally from [bundled content packs](../../../../../apps/mobile/src/lib/content.ts). This run verifies native UI, local storage and core navigation; it does not exercise the production network end to end. The separate real hosted guest smoke documented in the [main review](../README.md) covers production authentication/lesson parsing and question delivery.

| Capture | Visible result |
| --- | --- |
| [Welcome: first launch](welcome-first-launch.png) | Complete Atlas, island and clouds; Get started and existing-account actions visible. |
| [Welcome: second cold launch](welcome-second-launch.png) | Correct artwork survives terminate/relaunch without clearing state. |
| [Daily goal](daily-goal.png) | All three goal cards and Continue visible; selected goal is clear. |
| [Region](region.png) | All seven choices and Continue visible; continent labels fit without horizontal clipping. |
| [First lesson](first-lesson.png) | All four answer cards and Check fit after removing duplicate lesson safe-area padding. |
| [Home after relaunch](home-relaunch.png) | Current course step persists; Start challenge and tabs remain visible; zero progress reads as empty. |

The core flow passed: onboarding, explicit goal/region Continue, lesson introduction, first question, Pause → Finish here → Continue, Home, then app termination/relaunch with the current course step still present. The lesson was abandoned before answering; this run does not establish lesson completion or reward behavior. Visual inspection found no additional blocking layout defect in these six captures.

**Country link acceptance remains pending.** The `47f99d98` run failed the required Sweden assertion after `worldquest://country/%53%45`. Later diagnostic run `37124372363` identified a harness timing race: the optional Open check gave up at 13:09:27, before the iOS confirmation appeared at 13:09:30; the alert was still visible in the failure capture. No URL event reached the app, while the ready parser resolved the encoded country to `SE`. This establishes a missed system confirmation, not an app routing defect. A final replay using the normal app entry and a required, bounded wait for Open remains pending; the Sweden assertion stays required. The six screenshots above remain from `47f99d98`.

Source: `node_modules/.cache/native-clay-ios-final/_temp/`; Maestro evidence is under `native-flow/.maestro/tests/2026-10-03_123500/native-smoke/`. The copied PNGs are byte-identical to their source captures. Physical iPhone/Android frame pacing, largest OS text, screen readers, haptics and lock/unlock remain unverified by this run.
