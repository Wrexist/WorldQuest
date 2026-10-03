# First-install image corruption

Run [37127497726](https://github.com/Wrexist/WorldQuest/actions/runs/37127497726), commit `34eecdf939e8e552556c0fd8ef21db9b3af81b1d`, reproduced white shop masks in place of Atlas, island and clouds on an iPhone 16 Pro simulator with iOS 18.5. The second process launch rendered correctly. This run kept the normal Expo Router entry and added an opt-in probe to the installed React Native Image component in its disposable CI checkout.

The first-launch trace records correct JavaScript handles, metadata and resolved file URIs throughout. No Expo source transformer was installed. It records three shop images mounting at `13:55:57.022Z`, the onboarding redirect at that same time, and those images unmounting at `13:55:57.042Z`. The three onboarding images then mount. At `13:55:57.344Z`, each receives a correct native load followed by another load with the shop image's dimensions:

| Image / native tag | First native load | Subsequent native load |
| --- | --- | --- |
| Atlas / 836 | 1536 × 1536 | 576 × 576 |
| Island / 832 | 640 × 640 | 576 × 576 |
| Cloud band / 828 | 1110 × 370 | 576 × 576 |

The PNG shop mask is 192 × 192; this simulator's native PNG load events report three times that size. The subsequent load events retain the current Atlas/island/cloud URI. React Native 0.81.5's `RCTImageComponentView.didReceiveImage` builds that URI from the current view state, while taking dimensions and pixels from the delivered UIImage. Its observer proxy queues delivery on the main thread; removing a subscription does not revoke an already queued delivery. The repeated load events and visible replacement therefore support stale native image delivery after view recycling, rather than incorrect JavaScript asset registration or copied PNGs.

The app fix checks validated, local onboarding completion synchronously in the tab layout and redirects before the tab navigator or Home mounts. It removes this measured startup trigger and needs no network request or loading placeholder. Five component regressions cover fresh online/offline installs, malformed saved state, completed offline startup, and rereading completion after a transition. These regressions establish that Home and its tab images never mount before onboarding; they do not test native decoding.

This change does **not** repair React Native's general stale-callback behavior. A framework-level repair would need request-specific observer identity and lifetime-safe queued delivery; comparing the existing per-view observer pointer is insufficient. No framework patch is included. Acceptance must inspect fresh-install native captures after the app fix; the workflow now captures two fresh installations, with the later Maestro flow separately checking persisted progress across a normal relaunch. No physical-device frame-pacing claim follows from these screenshots.

Evidence is preserved in the run's `ios-native-evidence` artifact, particularly `native-image-first-launch.json`, `native-image-second-launch.json`, `ios-startup.png`, and `ios-second-startup.png`. Local originals are in `node_modules/.cache/native-clay-image-lifecycle/_temp/`. The later diagnostic Maestro flow stopped at the English selector with Welcome still visible, so this run does not establish country-link acceptance.
