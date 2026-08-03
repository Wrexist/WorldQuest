---
name: dna-transplant
description: Steal the interaction DNA of a best-in-class app from a different domain and graft it onto the screen you are building — deliberately, with the mechanics named and the numbers measured. Use when building or reworking any screen and the answer to "what should this feel like?" is a real product ("make it like Duolingo", "Wallet-style cards", "Spotify's now-playing"), or when a screen works but reads as templated, generic, or AI-generated. Also use when a design brief cites a competitor.
---

# DNA transplant

The method: pick an app that has already solved the *feel* you need — usually in a
completely different domain — name the two or three mechanics that actually produce
that feel, and graft only those. Not a reskin. Not a screenshot copied. The mechanics.

A bank's card deck becomes a country collection. A stocks row with a sparkline becomes
a fact-mastery row. A Tamagotchi's life stage becomes a streak. The domain changes; the
interaction survives, because the interaction is what was good.

**Why cross-domain.** Copying a competitor in your own category produces a worse
version of them. Copying a *different* category imports a solved interaction into a
context where nobody has seen it, which reads as originality. Duolingo's chunky press
mechanic is unremarkable in language learning and startling in a geography app.

---

## The five steps

### 1. Name the feel, in one sentence, before naming the app

"Tactile and forgiving, for a ten-year-old on a bus." If you cannot write that
sentence, you are not doing a transplant, you are doing a reskin — and you will copy
the surface, because the surface is all you have identified.

### 2. Name the donor and the **specific** mechanics

Three at most. Vague admiration transplants nothing. Be able to finish "the feel comes
from ___" with something a person could implement.

Bad: *"like Duolingo"*.
Good: *"one heavy rounded face at every weight; a bright face on a solid darker edge
that sinks 4 px on press; accents that each mean exactly one thing."*

### 3. Measure the donor. Never eyeball it

This is the step that separates a transplant from a vibe. Get real numbers — hexes,
weights, sizes, radii, durations, the ratio between a face and its edge. Use
`worldquest-design-forensics` if there is a URL or a screenshot to measure.

Then **check every measured value against your own constraints before adopting it**,
because a donor's numbers were chosen for the donor's context. See the worked example
below: Duolingo's green is 2.09:1 against white, which is fine on their white canvas
and unusable on ours. Adopting it unexamined would have shipped an unreadable button
with a defensible-sounding rationale.

### 4. Graft the mechanic; keep your own content, constraints and ethics

The donor supplies interaction, not values. WorldQuest took Duolingo's press mechanic
and did **not** take its streak-loss anxiety, its guilt-shaped push copy, or its
red-cross punishment on a wrong answer — all of which are load-bearing for Duolingo's
retention and all of which are banned here by `docs/design/voice-and-tone.md`.

A transplant that overrides your product's ethics is a rejection, not a graft.

### 5. Verify by looking, then write down what you rejected

`pnpm design:shots` and open the pictures. Then record the rejected mechanics and why —
otherwise the next person re-litigates it, or worse, "fixes" the omission.

---

## The worked example: Duolingo → WorldQuest

Real, in this repo, with the commits. Read
[`references/duolingo-worldquest.md`](references/duolingo-worldquest.md) for the full
account including what the contrast gate caught. The short version:

| Mechanic taken | How it landed here | Where |
|---|---|---|
| One rounded face, never below semibold | Nunito 400–900; `body` moved 400 → 600 | `tokens.json` typography |
| Bright face on a solid darker edge, sinks on press | `press3d.tsx`, `depth.button: 4` | Button, AnswerOption, Card |
| Saturated accents, one meaning each | Ramps derived from Duolingo's, darkened to clear contrast | `tokens.json` palette |
| Thick fully-rounded progress with a sheen | `ProgressBar`, height 16 | `ProgressBar.tsx` |

| Mechanic **rejected** | Why |
|---|---|
| Their exact accent hexes | `#58CC02` is 2.09:1 against white. Works on their white canvas, not on our dark one. |
| Uppercase everywhere | Kept for button labels only — a target you hit, not a sentence you read. |
| Streak-loss pressure, guilt copy | Banned by `voice-and-tone.md`. Rule 7: nothing that would be creepy for a ten-year-old. |
| Red punishment on a wrong answer | We state the truth and move on. `AnswerOption` gets a muted surface, never red. |
| Their typeface | Feather Bold is proprietary. Nunito is the closest openly-licensed match. |

---

## The failure modes, all of which happened here

**Adopting a number because the donor uses it.** Every accent needed re-deriving
against a dark canvas. The contrast gate caught it; eyes would not have.

**Transplanting the surface and missing the mechanic.** Brightening the colours without
building the edge-and-face would have produced a green app that still felt like a
dashboard.

**Letting the donor's ethics ride along.** The mechanics that make Duolingo *sticky*
are not the mechanics that make it *feel good*, and only the second kind is wanted.

**Believing your own screenshots.** A transplant is verified by looking at the rendered
app at 320 pt, not by looking at the diff. And none of it has been on a phone.

---

## Related

`worldquest-design-forensics` measures a donor · `frontend-design` for when there is no
donor and you need an original direction · `mobile-app-ui-design` for mobile conventions
by industry · `design-review` to verify the graft · `worldquest-design-system` for where
the values must land.
