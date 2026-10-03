# Motion lifecycle repair — 2026-10-03

This pass repairs animation work that survived a hidden screen or an unmounted
component. It does not change artwork, tokens, rest-state layout, or the animation
engine. It serves the beginner starting lessons from Home and browsing between tabs.

## Reproduction and measurements

`apps/mobile/src/components/MotionLifecycle.test.tsx` mounts the real hooks and
components through React Native Web. `Animated.loop` handles record starts and
stops; fake timers advance the real startup delays. Navigation focus and AppState
events are supplied explicitly. All seven regressions failed against the prior
implementation before the production code changed.

| Interaction | Before | After |
|---|---:|---:|
| Blur a scene containing a cloud, path prop and island | 3 active loops | 0 active loops |
| Background before a drift's startup delay expires | 1 active loop after delay | 0 active loops |
| Mount drift while already backgrounded | 1 start | 0 starts |
| Render a cover banner and a banner with an island child | 3 active loops | 1 loop for the visible island |
| Resolve skeleton OS preference after unmount | 1 active loop | 0 active loops |
| Replace a running count-up target | 0 stops of old animation | 1 stop; stale completion ignored |

The scenery test also resumes the app while the tab stays hidden (zero loops),
refocuses it (three loops), then unmounts it (zero loops and no navigation listeners).
Skeleton tests verify background pause/resume, the app's reduced-motion setting,
and `isInteraction: false`. Count-up backgrounding settles to the true total.

## Implementation

- `useSceneDrift` keeps navigation ownership in the app. It forwards focus to the
  design package's existing `useDrift(active)` API; the design package imports no
  navigation dependency.
- `useDrift` owns both its delayed start and the loop. Pausing clears both. Resuming
  creates a fresh loop rather than attempting to restart a stopped loop handle.
- `Skeleton` uses the shared reduced-motion hook. This removes the async start that
  could arrive after unmount and applies live OS/app preference changes.
- `useCountUp` stops the JS animation on cleanup/background and guards the completion
  callback so an interrupted prior total cannot overwrite the current value.

React Navigation documents that inactive tab screens remain mounted, so unmount
cleanup alone does not stop retained-tab work. React Native documents native-driver
animations and the interaction handle that looping animations must avoid when
unrelated list work should proceed. Sources: [navigation lifecycle](https://reactnavigation.org/docs/navigation-lifecycle/),
[Animated](https://reactnative.dev/docs/0.81/animated#loop).

## Verification and limits

Focused component tests: 65 passed (`MotionLifecycle`, `Scenery`, `ProgressBar`,
`CoursePath`, `LessonSummary`, `StreakExtended`). Design motion tests: 12 passed.
Mobile and design TypeScript checks passed. These measure lifecycle behavior, not native FPS,
render-thread cost, or battery usage. Desktop browser timing cannot certify the
reported iPhone stutter as resolved.

Remaining native check: use a release build on the affected iPhone, record Home
scrolling and repeated Home → Quests → Profile → Shop → Home navigation, then
background/foreground and repeat. Capture Instruments frame times and CPU before
and after using the same device and course state. Also verify reduced motion while
animations are active. No native device measurement was available for this pass.
