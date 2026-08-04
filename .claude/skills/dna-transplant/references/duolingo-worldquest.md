# Worked example: Duolingo → WorldQuest

A real transplant, in this repo, with the numbers. Kept as a reference because the
useful part of a case study is the arithmetic and the rejections, not the outcome.

The brief was: *"make it like Duolingo — completely the same style"*, against a mockup
(`docs/design/assets/mockup-v1.png`) that is dark navy where Duolingo is white.

---

## Step 1 — the feel, before the app

> Tactile and forgiving, for a ten-year-old on a bus.

Note what is *not* in that sentence: "green", "chunky", "gamified". Those are surface.
The sentence is about how using it should feel, which is what determines which
mechanics are worth taking.

## Step 2 — the mechanics, named specifically

1. **One rounded face, at heavy weights, everywhere.** Duolingo sets its whole
   interface in a single rounded face and almost never below semibold.
2. **Solid depth.** Every pressable is a bright face sitting on a darker edge, and the
   face sinks flush on press.
3. **Saturated accents that each mean exactly one thing.** Green is progress and
   correct. Red is hearts. Gold is earned.

Three. Not "the Duolingo look".

## Step 3 — measure, then check against our constraints

Duolingo's published accents, measured against white — the colour their labels are:

| Accent | Hex | Contrast vs white |
|---|---|---|
| green | `#58CC02` | **2.09:1** |
| blue | `#1CB0F6` | **2.44:1** |
| gold | `#FFC800` | **1.55:1** |
| red | `#FF4B4B` | 3.30:1 |

Our floor for a large bold label is 3.0:1. **Three of the four fail.**

They are not wrong for Duolingo. On a white canvas the button reads as one bright
object and the label rides on it. On our dark navy the same button is a bright rectangle
with a label you squint at.

So the ramps were derived rather than copied: each accent darkened until white clears
**3.15:1** — headroom over the floor, not sitting on it — with the bright original kept
one step up the ramp for everything that carries no text.

| Token | Value | Role |
|---|---|---|
| `green.400` | `#58CC02` | Duolingo's own — progress fill, correct, sheen. Nothing sits on it. |
| `green.500` | `#47A502` | The face that carries a white label. 3.16:1. |
| `green.600` | `#337701` | The edge underneath it. |

The same shape for blue, gold, flame, red, purple.

### What the gate caught that eyes would not have

1. **The option edge at 2.31:1 against the canvas.** An answer option's border is the
   only thing separating it from the one below; below 3:1 it is decoration, and four
   options become one dark field.
2. **The fix was worse than the bug.** The first colour that passed was a saturated
   blue — which made every *idle* option look **selected**, because blue is the
   selection colour three lines down in the same file. Luminance was the requirement;
   hue was free, and the free choice had to be the one that means nothing. Final:
   `#5E6E88`, a neutral slate.

Neither is visible in a screenshot. Both are one script away.

## Step 4 — graft, and refuse

### Taken

| Mechanic | Landing |
|---|---|
| One face, heavy | Nunito 400–900. `body` 400 → 600, because a 400 face at 16 px on a dark canvas shimmers. Inter + Baloo 2 deleted — a dashboard grotesque wearing a display face as a hat. |
| Face on an edge, sinks on press | `press3d.tsx`. `depth.button: 4`, animating **only** `translateY` so it stays on the native driver; the socket owns the layout height so nothing below a button moves. |
| Accents with one meaning | Derived ramps, above. |
| Thick rounded progress + sheen | `ProgressBar` height 16, sheen inset one space step, grows with the fill. |
| Fat bottom border on pressable cards | `Card` — a border, not a socket, because that component's own history says what happens when it grows a second box. |

### Refused

| Mechanic | Why |
|---|---|
| The exact hexes | See above. |
| Feather Bold | Proprietary. Nunito is the closest openly-licensed match. |
| Uppercase everywhere | Kept for button labels only. Uppercase is marginally harder to read; it buys a uniform target shape, which is worth it on a thing you hit and not on a thing you read. |
| Streak-loss pressure, guilt-shaped push copy | `voice-and-tone.md`. Asserted by tests on the streak, welcome-back, out-of-hearts and paused screens — no-shame and no-dark-pattern are unit tests here, not aspirations. |
| Red flash / buzzer on a wrong answer | `AnswerOption` gets a muted surface, never red. The haptic is `impactMedium`, never `Notification.Error` — that pattern is what iOS uses for a failed payment. A test asserts the source never reaches for it. |

The refusals are the interesting half. Duolingo's retention mechanics and its
*feel-good* mechanics are different sets, and only the second was wanted.

## Step 5 — verify by looking

`pnpm design:shots` at 320 / 390 / 768, then open the pictures. The 200 %-text pass in
`pnpm e2e` then found three separate boxes sized to an English string at 100 % — every
button clipped its own label, collection tiles cut country names, and the five tab
labels overlapped into a smear.

None of that is visible at 100 % in a screenshot. All of it is what "shippable" means.

**And none of it has been seen on a phone.**

---

## Commits

- `8817e3e` — the token and primitive rebuild
- `1be1827` — 200 % text measurement, and the two bugs it caught
- `9ae4eb1` — overlap detection, and the three it caught
