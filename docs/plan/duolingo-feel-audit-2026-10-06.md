# Duolingo feel audit — 2026-10-06

The owner's verdict on a TestFlight build: the app "lacks the Duolingo feeling,
immersiveness and atmosphere". Three passes went into this list: a web study of how
Duolingo does it, a read of what WorldQuest already has in code, and a look at every
rendered screen in light and dark (`pnpm design:shots`, `WQ_APPEARANCE=dark`).

The finding in one line: the parts exist (3D press, haptics, answer sheet, count-up,
chest, course path), but **the app is silent, the mascot is a still picture, and
rewards don't move**. It looks like Duolingo in a screenshot and feels unlike it in
the hand.

## Fixed in this branch

- **Shop wallet: pale box with a globe behind the coins.** `CoinWallet` drew
  `geo/clay/world.webp` at 20% opacity. That still is opaque RGB with a light-blue sky,
  so on navy it read as a washed-out rectangle. Removed, along with the now-unused
  `WorldMapArt`. Clay map stills are only safe filling their own frame.

- **Bug 1, clouds:** dark mode now uses a baked night-blue `backdrop-dark.webp` at full
  opacity, instead of the white art at 14%.
- **Bug 2, country map:** the map takes the full column and gets a thin frame edge.
- **Bug 3, mark on the flag:** a picture answer's mark sits in the card's top corner,
  off the artwork.
- **Bug 4, lesson scroll:** superseded by the owner's call on 2026-10-09: **nothing
  scrolls when you answer.** The feedback sheet now lies over the lesson (it used to
  shrink the scroll view, which recentred the question and moved it even without a
  scroll), the question is top-aligned so the spare height sits where the sheet lands,
  and a wrong picture answer shows the right picture in the sheet ("The right one:")
  instead of pointing at a tick the sheet may cover. Measured in the web build: 0 px of
  movement on 20 of 20 answers at 390×844 and 375×667; on a 375×667 phone the sheet
  still covers a map question's options, which the sheet's own picture and an iOS
  scroll inset make up for.
- **Bug 5, Home landing:** Home lands on the unit banner's edge when the banner and the
  step both fit. At 320 pt they do not, and the step wins, as before.
- **Gap 1, sound:** `useSoundAsk` offers sound once on Home, after the first finished
  lesson. Accepting plays the chime. Button taps and a coin sound are still open.
- **Gap 2, rewards that move:** the summary's coin tile counts up from zero once it has
  arrived, then pops. The header's coin and streak counters pulse when their number
  rises — never when coins are spent. Coins flying across the screen to the counter are
  still open: the summary has no header to fly to.
- **Gap 4, the run:** a "3 in a row!" badge pops under the progress bar after a correct
  answer, once the run reaches the "on a roll" point. **Heart loss is deliberately not
  animated:** the motion rules give a wrong answer a gentle settle and nothing that
  punishes, and a breaking heart is exactly that.

- **Gap 8, wrong-answer copy:** a wrong picture answer gets one line ("The right one has
  the tick.") instead of two flag descriptions; a screen reader still hears both.
- **Gap 5, confetti:** `ConfettiBurst` throws 28 pieces out of Atlas on a perfect lesson,
  over the still burst, which stays as the Reduce Motion frame.
- **Gap 6, unit colour:** a continent's unit tints its header with that continent's
  identity colour (`illustration.unitTint`), checked by `design:contrast`.
- **Gap 3, Atlas reacts:** each pose has its own one-off movement — a hop for a cheer, a
  head tilt for a thought — and a wrong answer shows the thinking pose. **No idle loop:**
  it was removed in #31 for a reported iPhone stutter, and a constant animation would
  risk bringing it back. New poses (a real "oops") need new art.

## A. Bugs (rendered evidence)

| # | Sev | Where | What | Fix |
|---|---|---|---|---|
| 1 | High | Home, Shop, Quests, Profile, onboarding (dark) | `CloudBackdrop` draws white clouds at `illustration.cloudOpacity.dark` 0.14 — grey smoke under the mascot | Dark-lit cloud asset, or a soft blue glow in dark |
| 2 | High | Country page (dark) | `ClayMap` stills have an opaque sky; 64 files with pale corners float as a pasted photo | Frame full-width, or ship alpha/navy-sea variants |
| 3 | High | Lesson, wrong flag answer | The wrong mark sits on the flag, over the very feature the feedback names (`AnswerOption` `artFrame`) | Move the mark to the border/badge |
| 4 | High | Lesson feedback at 320/390 | `revealOptions` (`LessonScreen.tsx`) scrolls the prompt under the header | Count the header in the inset, or pin the prompt |
| 5 | Med | Home | `useScrollIntoView` lands the daily goal half under the floating header | Subtract header height from the viewport |
| 6 | Med | TopBar (dark) | Streak chip navy, coin chip cream; Shop drops the coin chip | Dark gold tone; one rule for all tabs |
| 7 | Med | Lesson summary at 320 | Island art pushes "+XP" under the sticky footer | Shrink art on short screens |
| 8 | Med | Summary XP hero, Profile XP pill (dark) | Gold surfaces turn olive/brown | Dark-mode gold surface with gold rim |

## B. Feel gaps, ranked by impact per minute

| Rank | Gap | Today | Duolingo pattern | Est. |
|---|---|---|---|---|
| 1 | Sound | `sound` defaults **off**, no prompt offers it, `soundTap` has no callers, no coin sound | Every event fires sound + haptic + visual together | 60 min |
| 2 | Rewards that move | No coin count-up on summary; nothing flies to a counter | Coin/XP arcs to the header counter, counter pulses | 90 min |
| 3 | Atlas reacts | 4 static PNGs, one bounce on mount, wrong answer shows the same waving pose | Idle breathing/blink, cheer, think, gentle-oops (never sad) | 120 min (motion on existing poses); new poses need art |
| 4 | Combo + hearts | Combo only recolours the bar; heart loss just changes a number | "3 in a row" badge pops; heart cracks and drops | 60 min |
| 5 | Confetti | `celebration/burst` is a still image | Particle burst on perfect lesson / streak | 45 min |
| 6 | Unit colour | Every unit shares one palette | Each unit owns a colour across banner and nodes | 60 min + design tokens |
| 7 | Home path depth | New user sees one node | Path fills the screen; locked nodes and chests lead off | 60 min |
| 8 | Wrong-answer copy | Up to five lines of bold text | One short line plus the answer | 30 min, i18n en+sv |

## Excluded on purpose (rule 7: kids are users)

Guilt notifications, sad or crying mascot states, paid streak repair, hearts that
block learning behind a timer or payment, "streak at risk" urgency animation,
countdown FOMO, demotion framed as loss.

## Sources

Duolingo blog: world-character-visemes, new-duolingo-home-screen-design,
streak-milestone-design-animation, reshaping-duo, core-tabs-redesign,
improving-the-streak. 60fps.design shots (lesson complete, 5-in-a-row, quest point
trail, chest open, league reveal). Timings in third-party teardowns are not
Duolingo-published — treat any millisecond value as `TODO(verify)` before it becomes
a token.

Screenshots: `node_modules/.cache/wq-design-shots{,-dark}/` in this worktree (not committed).
