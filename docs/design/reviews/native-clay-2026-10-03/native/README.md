# iOS simulator evidence

Captured on 2026-10-03 from commit `47f99d98`, on an **iPhone 16 Pro simulator running iOS 18.5**. This run used the normal app entry, with asset diagnostics off, English, light appearance and default text size. These are native simulator captures, not browser or physical-device evidence.

**Later runs reproduced first-install image corruption.** The clean captures below establish only this individual run's result. [The lifecycle diagnostic](image-lifecycle.md) records correct image loads followed by stale shop-image dimensions on recycled onboarding views, and explains the synchronous tab startup guard and its remaining native verification scope.

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

**Country link acceptance remains pending.** The `47f99d98` run failed the required Sweden assertion after `worldquest://country/%53%45`. Diagnostic run `37124372363` then exposed a harness timing race: the optional Open check gave up at 13:09:27, before the iOS confirmation appeared at 13:09:30; the alert remained visible at failure. No URL event reached the app, while the ready parser resolved the encoded country to `SE`.

The next normal-entry replay, `37125516177`, failed its required 30-second Open wait: Home stayed visible, with no confirmation or country navigation observed through 36 seconds after dispatch. LaunchServices recognized the app handler, then logged `NSOSStatusErrorDomain -10814` while fetching a bundle record for scheme approval. The same warning occurred in earlier runs that did show consent, so it is not established as the cause. These runs have not demonstrated an app routing defect.

A stronger normal-entry replay remains pending: stop the app before the encoded Sweden link, following [Maestro's pinned 2.10 recipe](https://raw.githubusercontent.com/mobile-dev-inc/Maestro/cli-2.10.0/e2e/demo_app/.maestro/commands/openLink.yaml), handle confirmation when present, and require Sweden; then send an encoded France link without stopping the app and require France. Bounded waits allow either consent or the destination to appear, while both country and practice-action assertions remain mandatory. The six screenshots above remain from `47f99d98`.

Source: `node_modules/.cache/native-clay-ios-final/_temp/`; Maestro evidence is under `native-flow/.maestro/tests/2026-10-03_123500/native-smoke/`. The copied PNGs are byte-identical to their source captures. Physical iPhone/Android frame pacing, largest OS text, screen readers, haptics and lock/unlock remain unverified by this run.
