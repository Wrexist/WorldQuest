# Native D1 account lifecycle evidence

Accepted lifecycle proof at `29fa1f5dab0a6f609c56dcd3b7e791816736d7c8`:
[run 34769929495](https://github.com/Wrexist/WorldQuest/actions/runs/34769929495).
Both platform jobs passed. This is an isolated app ID, real SecureStore/MMKV,
real local workerd/D1 and synthetic email delivery. It is not the production
account UI or a real-mail delivery test.

| Platform | Runtime | Result |
|---|---|---|
| iOS | iPhone 16 Pro simulator, iOS 18.5, Xcode 16.4 | Pending verification survives restart; same owner/progress after link/login; reinstall requires sign-in; recovery and deletion pass |
| Android | API 35 x86_64 emulator | Same lifecycle passes; all three compiled SecureStore persistence/erasure failure tests pass |

`*-account-pending.png` records `PASS_READY_EMAIL_RESTART`.
`*-account-recovery.png` records `PASS_RECOVERY_READY_REINSTALL`.
Both final `*-account-deletion.png` captures were opened and inspected: they read
`PASS_RECOVERY_AND_DELETION` (the Android proof label wraps). The workflow asserts
all three stages and retains the full Maestro diagnostics. No production tokens,
addresses or user data are in these fixtures.

[Full CI](https://github.com/Wrexist/WorldQuest/actions/runs/34769929480) passed on
Windows and Ubuntu, including security, native exports, browser/accessibility
checks and the source database checks. The separate
[D1 job](https://github.com/Wrexist/WorldQuest/actions/runs/34769929565) also passed.

B02 remains open for real account UI, session-expiry/rotation handling and real
delivery. The owner deferred domain purchase; continue with synthetic delivery.
The physical-device/accessibility matrix and public abuse controls remain separate
gates. The subsequent deletion-response-loss change has its own real D1 tests;
these native screenshots predate that change.
