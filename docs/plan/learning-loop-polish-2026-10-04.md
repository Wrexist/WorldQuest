# Learning-loop polish

Owner request: work through the eight agreed improvements in order, preserving the
liquid-clay identity. The intended feel is confident, tactile and forgiving: a
clear next step, immediate truthful feedback and a visible learning outcome.

1. Device quality: audit recovery, gestures, safe areas and motion lifecycle. Prior
   native gesture replay passed; the globe-edge artifact and physical-device FPS,
   Dynamic Type and screen-reader review remain unverified.
2. Delivery: latest GitHub run 37190906064 never started any steps. Annotation:
   "The job was not started because your account is locked due to a billing issue."
   TestFlight build 20 predates immediate answers and softer shadows. Do not claim
   a new release until the build and Apple upload actually succeed.
3. Home: make the current lesson and its position more explicit in the existing
   primary action; retain one recommendation and the real course state.
4. Mistakes: preserve existing end-of-lesson retry and spaced repetition; make
   the purpose of retry clearer without inventing mastery or rewards.
5. Rewards: coordinate the existing summary and actual daily progress, keeping
   Continue reachable throughout. Avoid adding another reward interstitial.
6. Atlas: distinguish reactions by purpose and stop unsolicited replay when merely
   returning from the background; keep explicit taps playful.
7. Onboarding: show a real, optional visual practice interaction before preference
   questions, with no score, reward, network request or account requirement.
8. Motion/audio: verify existing question transitions, reduced motion and toggles;
   repair asynchronous sound setup and cancellation where needed.

Use the existing interaction-design, screen, design-system and localization
workflows. Borrow clarity and feedback, not proprietary artwork or pressure loops.
No scheduler/economy changes are implied by this presentation pass.

## Implementation status

- 1: existing gesture-lock, safe-area, failure/recovery and reduced-motion tests
  are part of verification. Physical-device review and the globe-edge artifact
  remain open; no speculative renderer change was made without reproduction.
- 2: blocked by the account billing lock above. No new TestFlight build claimed.
- 3: implemented next-discovery heading, actual course position/progress and lesson
  count in the current card. Removed the ambiguous pre-lesson XP badge.
- 4: existing retry and scheduling retained; added a plain explanation of the
  repeat question's purpose. Immediate-answer behavior remains intact.
- 5: Atlas/XP/stat entrances are sequenced using shared motion tokens; daily-goal
  progress is visible on the summary. Continue is never gated on animation.
- 6: an ordinary background/focus return no longer restarts the same greeting;
  explicit boops and mood changes still react. Lifecycle regression test added.
- 7: optional welcome-screen flag demonstration implemented with bundled names
  and artwork, teaching before recall and then returning to language/setup.
- 8: staggered entrances settle in background and do not hold interactions;
  simultaneous audio cues await shared configuration, transient setup failures
  retry, and sound-off is rechecked before playback. Regression tests added.

The implemented presentation work does not resolve the two external acceptance
items above. See the rendered evidence in
`docs/design/reviews/learning-loop-2026-10-04/`.
