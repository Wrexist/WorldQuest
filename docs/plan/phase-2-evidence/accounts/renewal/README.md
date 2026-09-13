# Native session renewal evidence

Runtime implementation: `512b0463955aa5c1a53975321bf8fa885ee7b44a`.
Original [native run 34780651323](https://github.com/Wrexist/WorldQuest/actions/runs/34780651323).
Only synthetic data, a separate app ID, local workerd/D1 and real native
Keychain/Keystore are used. The app's production account UI remains separate.

Android API 35 passed the entire flow. `android-account-pending.png` shows
`PASS_RENEWAL_READY_RESTART`: a committed renewal response was intentionally lost
and both credentials remained in protected storage. After process restart,
`android-account-recovery.png` confirms renewal/link/login kept the original owner
and 42 XP. `android-account-deletion.png` confirms reinstall recovery followed by
account/credential deletion. The pending and final captures were opened and
inspected. `android-secure-store-tests.xml` records three compiled Kotlin failure
tests, with zero failures/errors/skips.

The initial iOS job passed renewal and restart, but its final assertion timed out.
The assertion capture (`ios-initial-timeout.png`) shows the simulator home screen.
The runtime log shows the new app process starting at 20:38:03 UTC, 68 seconds
after the URL handoff. The subsequent failure capture
(`ios-initial-account-failure.png`) visibly shows `PASS_RECOVERY_AND_DELETION`.
Both images were opened and inspected. This is evidence of a delayed simulator
launch, not a passing workflow. Keep the original failure recorded.

The reinstall assertion now permits 120 seconds for simulator launch; each app
API request still has its original 15-second timeout. The dedicated replay
workflow uses the original signed binary without rebundling, verifies its
signature and records its archive hash. It refuses runtime/dependency drift
between the build revision and replay revision. Replay acceptance is pending
until its job and final captures are inspected.

Full [Windows/Ubuntu CI](https://github.com/Wrexist/WorldQuest/actions/runs/34780651351)
and [D1 CI](https://github.com/Wrexist/WorldQuest/actions/runs/34780651322) passed at
the implementation revision. Local verification with two additional readback-loss
tests passes 1,599 tests. None of this enables the production API or real email.
