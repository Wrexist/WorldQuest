# Onboarding — the second Duolingo transplant

The first transplant took Duolingo's **visual** DNA: one heavy rounded face, a bright
face on a solid darker edge that sinks on press, saturated accents that each mean one
thing. That is written up in
[`.claude/skills/dna-transplant/references/duolingo-worldquest.md`](../../.claude/skills/dna-transplant/references/duolingo-worldquest.md)
and it landed in `tokens.json` and the primitives.

This is the second one, and it takes something different: the **grammar of the flow**.
The app already looked like it had been made by people who care. Onboarding still
behaved like a form.

---

## 1. The feel, in one sentence

*Being shown around by somebody who is pleased you came — not filling in a signup.*

## 2. The donor, and the four mechanics

Duolingo. Not "make it like Duolingo" — these four, each of which a person could
implement:

| # | Mechanic | Why it produces the feel |
|---|---|---|
| 1 | **The mascot asks the question**, out of a speech bubble hanging off him | The same words as a heading are an app labelling a form; in a bubble under a character they are somebody asking you something. This is the whole difference and it costs one component. |
| 2 | **A single-select answer IS the navigation** — no Continue | A button under a chosen answer can only ever agree with it. Removing it halves the presses and removes the pause between deciding and having decided. |
| 3 | **Progress bar and back arrow on one row**, back always live | You can see the end and you can always undo. Mechanic 2 is unsafe without this: an answer that commits on tap needs a way back or it is a trap. |
| 4 | **The mascot reacts** in the beat before the next question | The 260 ms beat already existed and nothing used it but a timer. Atlas has eight poses and the flow was holding four of them perfectly still. |

## 3. What was measured, and what the measurements changed

The donor's numbers were checked against a 320×568 screen before adoption, which is the
step that separates a transplant from a vibe. Two of them did not survive contact.

| Measured | Adopted | Why not as measured |
|---|---|---|
| Mascot at 104 pt (our previous decorative size) | **148**, and **104** under 700 pt of height | The first attempt put him BESIDE the bubble and had to shrink him to 72, because splitting a 320 pt screen left the question four words a line. Stacking them gives both the full width, and the mascot roughly doubles. The arrangement was the constraint, not the size. |
| Wheel picker at 5 rows × 44 = 220 pt | **3 rows (132)** under 700 pt of height | 220 is 39 % of a 568 pt screen before any question, explanation or button. Adding the ask row clipped the picker to a row and a half. Photographed, not predicted. |
| Answer beat before advancing | **260 ms** (`motion.base`) | Kept as measured. Long enough for the tick, the haptic and Atlas's reaction to land, short enough not to feel like a wait. |
| Wheel row text at full Dynamic Type | **capped at 1.4×** | `ROW` is 44 because that is the touch-target floor AND the `snapToInterval`; a row that grew with its text would break the snap or stop being reachable. iOS's own picker scales text inside a bounded cell for the same reason. Only the second cap in the app, and `AppChrome`'s comment on the first one demands that be justified rather than copied. |

The wheel fix is not really ours to claim: `ios-native-audit.md` already recorded this
step overflowing at 320 (O5), and the wheel had *inherited* that problem rather than
solved it — it replaced a chip grid whose oldest decades rendered behind the Continue
button. The transplant is what made it visible again.

## 4. What was rejected, and why

Recording this is the point of step 5. Without it the next person re-litigates it, or
"fixes" the omission.

| Rejected | Why |
|---|---|
| **The reference implementation's code** ([Appllama/top-welcome-screens](https://github.com/Appllama/top-welcome-screens)) | GPL-3.0, and its own README says it is educational reference only with no licence grant for the third-party IP it reproduces. This repo has no `LICENSE` and ships proprietary. Read for mechanics, measured, implemented independently — which is what the transplant method prescribes anyway. |
| Duolingo's **"How did you hear about us?"** | Nothing in this app would consume the answer. `OnboardingScreen`'s own header already rejected it on that ground and the rule stands: a question whose answer goes nowhere is a form, not an onboarding. |
| Duolingo's **38-screen flow** | Ours is eight and one of them is a real lesson. Length is not the mechanic. |
| **Commitment framing** on the daily goal ("I'll commit to 10 minutes") | Manufacturing a promise so it can be invoked later is the guilt setting. `voice-and-tone.md`: Atlas has no guilt setting. |
| **Removing the goal default** so the user must choose | Auto-advance made this tempting — a pre-ticked row looks like a wasted opportunity to collect an opinion. It is not: the tick is what says "ten is fine if you have no view", and the press count shows nobody pays more than before. Agreeing was one press (Continue) and is one press (the ticked row); disagreeing was two and is one. |

## 4b. The difficulty answer is a slider

Asked for directly, and it turned out to be the right shape for the question rather than
a decoration: "just starting → I know some → bring it on" is one axis with a direction,
and three radio rows say nothing about the middle one being *between* the other two. A
track says it in the shape of the control.

Two consequences worth writing down, because both are the kind of thing that gets
"fixed" later by someone who does not know they were decided:

- **It does not advance on being answered**, unlike every other single-select step. A
  drag passes *through* the values on its way to one, so leaving on change would leave on
  the first stop crossed. The level step therefore keeps a Continue.
- **The three labels under the track are text, not buttons.** They were Pressables first,
  so a label could be tapped as well as dragged to — that is three extra controls
  reporting a value the slider already reports, and hiding them from the reader to avoid
  announcing it four times would have made them controls nobody could reach. The track
  takes a tap at any position instead, so the affordance survives and the semantics stay
  in one place. `packages/design`'s own token test caught this, by refusing a `Pressable`
  with no aria state.

It snaps, and every position the thumb can hold is a real value. A continuous slider
resolving to one of three buckets lies about its own precision.

## 5. What the graft did NOT change

The single highest-leverage thing in this flow was already right and was left alone:
**the user finishes a real lesson before being asked for an account.** That is Duolingo's
biggest onboarding decision and WorldQuest already had it. A transplant that "improved"
it would have been the reskin failure mode — moving what was already working.

---

## The audit that started it

Written down because the gap between "we have a mascot" and "the mascot does anything"
is the kind that survives review:

- **No back existed anywhere in the flow.** Seven questions, each final. This file's
  predecessor argued about back *semantics* — "back should step within onboarding, not
  out of it" — as a justification for the single-screen design, and then no back control
  was ever built. The argument was won and the feature was forgotten.
- **Atlas was decoration.** `voice-and-tone.md` says he appears at first launch. He did:
  as a picture above a heading, on three of seven steps, in two of his eight poses.
- **Four of eight steps cost two taps** to answer one question.
- **Four harnesses each had their own copy** of the walk through this flow, and one of
  them — `build-store-shots.cjs` — was still clicking a decade chip the wheel deleted
  two passes ago. Store screenshots were being taken by a harness that could not get
  through the front door. The walk is now
  [`scripts/lib/onboarding-walk.cjs`](../../scripts/lib/onboarding-walk.cjs).

## Two harness bugs this uncovered

Both were found by the checks failing on a change that was actually fine, which is the
useful direction for a false alarm to point:

- **`e2e`'s overlap check stopped at the nearest clipping ancestor.** Clippers nest: a
  wheel row can be perfectly visible inside its 220 pt well while the well itself hangs
  below the bottom of the step's scroller. The check asked the well, got "yes, it's
  there", and reported the row overlapping the Continue button 30 pt beneath it. Measured
  before it was fixed — row at 766–800, well at 585–803, scroller ending at 754. It now
  requires an element to survive *every* clipping ancestor.
- **`WheelPicker`'s scroller was sized by its content, not by its well.** A hundred rows
  tall, invisible only because the well clips it. Nothing rendered wrong; it just meant
  the component's own box reached hundreds of points down the screen, which is invisible
  until something measures it.

## What this still cannot tell you

Every check here is mechanical: `pnpm verify:full` is green, the flow is photographed at
320/390/768, and the accessibility tree has a name for every control. None of that says
whether being asked a question by a small robot in a safari hat is *charming* or
*annoying* on a real phone, whether the 260 ms beat feels like acknowledgement or like
lag under a thumb, whether the haptic on each answer is delightful seven times in a row,
or whether the difficulty slider has the friction a thumb expects — a drag is the one
interaction in this flow that a mouse in Chromium genuinely cannot stand in for. That is `device-pass.md` §4, and it has still not been done.
