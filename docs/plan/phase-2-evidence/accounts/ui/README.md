# Native account UI acceptance evidence

Accepted at `80dcdd1`, [run 35025186129](https://github.com/Wrexist/WorldQuest/actions/runs/35025186129):
both platform jobs passed, and the unchanged-binary
[iOS replay](https://github.com/Wrexist/WorldQuest/actions/runs/35028042727) passed
against that run's signed archive. This is the isolated proof app: real
SecureStore/Keystore/MMKV, real local workerd/D1, synthetic email delivery, and an
app ID that is not the production one. It is not a real-delivery or
physical-device test.

## What this run proves

| Capture | Opened | Shows |
|---|---|---|
| `*-final-account-pending.png` | no — asserted by the flow | `PASS_RENEWAL_READY_RESTART`, pending verification survives restart |
| `*-final-account-recovery.png` | no — asserted by the flow | `PASS_RECOVERY_READY_REINSTALL` |
| `*-final-account-deletion.png` | iOS: yes, Android: yes | `PASS_RECOVERY_AND_DELETION` |
| `*-final-ui-code.png` | iOS: yes, Android: yes | the eight-digit D1 code screen: "Enter your code", `00000000` placeholder, Confirm, resend cooldown |
| `*-final-ui-linked.png` | iOS: yes, Android: yes | "Your email is linked" |
| `*-final-ui-delete-confirmation.png` | iOS: yes, Android: yes | "Delete account", permanent-deletion copy, destructive "Send me a code" |
| `*-final-ui-deleted.png` | iOS: yes, Android: yes | "Your account is deleted" |

This is the first revision in which the rendered account screens completed the
whole journey on iOS: link, restart, confirm, delete. The screens shown are the
real `D1AccountScreen`; the harness only supplies the injected client and mailbox.
`ios-final-ui-delete-confirmation.png` also speaks to the roadmap's open question
about the deleted copy: what the fixture renders is immediate permanent deletion,
with no 30-day claim to reconcile.

## The two harness faults this run had to fix

`ios-initial-open-prompt.png` is the earlier failure at `2b654a8`: the home screen
with "Open in WorldQuest Account Proof?", the app never launched, and no app
process appears in the runtime log after the handoff. `xcrun simctl openurl` does
not always deliver a custom scheme to a just-reinstalled app, so both flows now
tap `Open` when the prompt is present and continue when it is not.
`ios-final-ui-open-prompt.png` is that prompt being dismissed on the accepted run.

The second fault: `ui.yaml` had never passed on iOS. It called `hideKeyboard`
after two number-pad fields, and a number-pad has no dismiss key on iOS, so
Maestro failed with the keyboard legitimately on screen. Removing it then broke
Android, where a tap while the keyboard is open is consumed dismissing it — the
"Send me a code" tap registered and the app stayed on the email step. The fields
and buttons are in `D1AccountScreen.tsx:66-68` (birth year) and `:91-96` (code);
the flow now hides the keyboard on Android only.

## Runner flakes, recorded rather than smoothed over

Android failed twice at this revision without any flow fault: a corrupted NDK
download during compile, then losing the app launch before `restart.yaml` ran —
the pre-launch emulator flake already recorded in the parent README. Nothing in
the repository changed between those attempts and the green one; the accepted
Android captures come from the rerun of the same revision.

## Not accepted here

- **`returnKeyType="done"` and `onSubmitEditing` on the number-pad fields are
  inert on iOS** (`D1AccountScreen.tsx:95`). The visible Confirm button covers the
  journey, but a return-key submission never fires and the keyboard cannot be
  dismissed without the button. Worth its own fix before calling the screen done.
- **Real email delivery, production app screens and the public D1 route.** B02
  stays open; the app still uses the legacy adapter.
- **Physical devices and accessibility matrix.** These are simulators.
