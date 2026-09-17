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

## Eight-digit code lifecycle

Accepted at `4383e3e`, [run 35225680635](https://github.com/Wrexist/WorldQuest/actions/runs/35225680635):
both platform jobs passed, including the new `codes.yaml` scenario. The proof
server ages the real rows, because a device proof cannot wait out a five-minute
code or a day-long session, and the expiry that matters is the server's.

| Capture | Opened | Shows |
|---|---|---|
| `ios-final-codes-resend-refused.png` | yes | a resend refused by the server: the rate error, not a success |
| `ios-final-codes-expired.png` | yes | the entered code with "That code is invalid or expired…" after the challenge was aged server-side |
| `*-final-codes-recovery.png` | iOS yes, Android yes | "Sign in again" with the sentence that local progress stays with its original account |
| `*-final-codes-recovered.png` | no — asserted by the flow | recovery continues on a fresh guest, at "Your year of birth" |

The resend assertion is deliberately two-stage. While the client's own countdown
runs, the Resend button is disabled (`D1AccountScreen.tsx:98`), so a tap can
never reach the server — the first attempt asserted the rate error against a tap
that did nothing. The flow now waits the client's floor out, restarts the
*server's* floor, and taps: the server refuses even though the device believes
the floor has passed, which is the rule that matters.

## Found by this run, not yet fixed

- **An ended session shows a generic connection error on the recovery screen.**
  Both `*-final-codes-recovery.png` captures show "That didn't work. Check your
  connection and try again." under recovery copy that has just explained the
  session ended. `SESSION_EXPIRED` and `AUTH_REQUIRED` are absent from
  `errorKeys` (`D1AccountScreen.tsx:11-18`), so `state.error` falls through to
  `account:error.generic` (`:131`). A session ending is normal here, and the
  banner blames the network for it.
- **`returnKeyType="done"` and `onSubmitEditing` on the number-pad fields are
  inert on iOS** (`D1AccountScreen.tsx:95`). The visible Confirm button covers the
  journey, but a return-key submission never fires and the keyboard cannot be
  dismissed without the button.

## Harness lessons this scenario cost

Maestro matches `text` selectors in full, so the four assertions first written as
fragments of longer sentences could never match; they now assert the exact copy,
which is the stronger claim. The cold-start waits in all three flows moved from
120 to 300 seconds after the iOS proof finished 15 seconds past a 120-second
deadline with the whole result on screen.

## Not accepted here

- **Real email delivery, production app screens and the public D1 route.** B02
  stays open; the app still uses the legacy adapter.
- **Physical devices and accessibility matrix.** These are simulators.
