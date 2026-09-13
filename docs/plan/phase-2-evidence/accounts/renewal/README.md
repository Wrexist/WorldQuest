# Native session renewal evidence

**Final accepted runtime: `fadcfe52ef1c81a64f46914f8ec199fdf2fdc982`.**
[Native run 34782079778](https://github.com/Wrexist/WorldQuest/actions/runs/34782079778)
passes on both platforms, including the repeated old-client logout regression.
The final `ios-final-*` and `android-final-*` captures retain that evidence;
both recovery and deletion captures were opened and inspected on each platform.
Full Windows/Ubuntu CI and 1,601 local tests pass. Production account screens,
real email delivery and the physical-device/accessibility matrix remain open.

Initial implementation: `512b0463955aa5c1a53975321bf8fa885ee7b44a`.
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
between the build revision and replay revision. [Replay 34781662605](https://github.com/Wrexist/WorldQuest/actions/runs/34781662605)
passed at `35e0b63`. Its final capture (`ios-replay-account-deletion.png`) was
opened and reads `PASS_RECOVERY_AND_DELETION`. The archive hash matches the
downloaded original binary:
`cb1a209a41815047e511022736a2ed7f0a52b53efc299957c9ffd34c191ad028`.

Full [Windows/Ubuntu CI](https://github.com/Wrexist/WorldQuest/actions/runs/34780651351)
and [D1 CI](https://github.com/Wrexist/WorldQuest/actions/runs/34780651322) passed at
the implementation revision. Local verification with two additional readback-loss
tests passes 1,599 tests. None of this enables the production API or real email.

The subsequent `fadcfe5` guard makes repeated logout on an old client a no-op
after successful erasure and shares simultaneous erase requests. Its native
probe signs back in and deliberately calls the old logout callback again before
checking the recovered account. Fresh [native acceptance at fadcfe5](https://github.com/Wrexist/WorldQuest/actions/runs/34782079778)
is recorded separately; the earlier binary does not contain this additional guard.
The final iOS job passed on iPhone 16 Pro / iOS 18.5. Its `ios-final-*` recovery and
deletion captures were opened and inspected. Android's first final-revision
attempt lost its emulator connection before the first app launch; the retained
`android-final-first-attempt-failure.json` records `device offline`, with no
account assertions executed. Only that job was restarted on a fresh runner.
The retry passed every account assertion at the same code revision.
`android-final-secure-store-tests.xml` again records three passing native tests.
