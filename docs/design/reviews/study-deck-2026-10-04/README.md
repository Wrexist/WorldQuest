# Optional study: a calmer discovery deck

The lesson's optional Learn first screen now shows one unique fact at a time.
It serves Leo's targeted study and Emma's need for less reading on one screen.
The entry remains Lesson → Learn first, with Back to quiz as the primary action.
No account, network request, score, reward, or scheduling change was added.

## Design review

The previous rendered screen stacked every association and map in one long list.
The deck gives the current fact a larger map and clearer answer hierarchy, with
a count of unique discoveries. Navigation is explicit; there is no timer or
automatic advancement. Only the current map is mounted.

An initial 320-pixel capture revealed navigation below the scroll fold. The final
layout keeps Previous, Next discovery, and Back to quiz outside the scroller.
The 200% text review revealed mid-word wrapping in narrow navigation buttons;
intrinsic button widths let the row stack when the enlarged labels need it.

Cards use the existing 180ms SceneEntrance transition. Reduced motion presents
them immediately, and backgrounding settles the transition. The first and last
navigation boundaries are disabled. Returning to the quiz preserves its original
unanswered question; study never records an answer.

## Validation and limits

- Real web export reviewed at 320, 390, and 768 pixels, plus 320 dark/reduced motion
  with 200% CSS text. This approximates large text; it is not iOS Dynamic Type.
- All 28 lesson integration tests pass, including forward/backward navigation, the last
  card boundary, and returning to the same quiz without restarting or answering.
- Workspace typechecking, translation completeness, accessibility lint, scrollability,
  and five-state checks passed. Final deck capture checks navigation targets are at
  least 44 points, all footer controls remain on screen, and there is no sideways overflow.
- The broader browser flow passed 109/109 checks before the final responsive
  footer adjustment; targeted deck captures exercise the final footer.
- Full `pnpm verify` did not pass: three unchanged engine stress tests timed out
  while another project's workers heavily loaded the machine. An isolated engine
  retry with one worker reduced this to the exhaustive unique-label test timeout.
  No test timeout, coverage threshold, or engine code was changed.
- Native performance, VoiceOver/TalkBack, and physical-device safe areas remain
  unverified. The existing GitHub billing block still prevents a new TestFlight build.

No part of this was seen on a phone.
