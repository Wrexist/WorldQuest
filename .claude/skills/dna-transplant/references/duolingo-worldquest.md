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

---

# The second graft: the correct-answer sheet

The first transplant took the *chrome* — type, press mechanic, accents, progress. This
one took a **frame**: the panel a user sees ten to twenty times a lesson, which is the
most-repeated moment in the product.

## Step 1 — the feel

*Someone is pleased with you, and they're right there.* The mascot's arrival is the
reward; the number is the receipt. Our version had the receipt and not the arrival.

## Step 2/3 — the mechanics, and what measuring changed

Three were named from looking. **Measuring the reference contradicted the first one**,
which is the whole argument for step 3:

| Named from looking | What the pixels said |
|---|---|
| "The mascot breaks the panel's top edge" | **False.** Its top is 89 px *below* the panel edge. It never touches it. |
| "Confetti around its head" | True, but it belongs to the *character* — `atlas/celebrate` already carries its own burst. It is not a layer on the panel. |
| "The panel owns the primary action" | True, and the load-bearing one. |

What is actually happening is better than what it looked like: the mascot's lower body
is **occluded by the CONTINUE button**, so it reads as leaning out from behind the
furniture. Had the first reading been built, two of the three mechanics would have been
constructed around something that was not happening.

Measured, as ratios rather than points:

| | Reference | Ours |
|---|---|---|
| Mascot width | 320 / 852 = **37.5 % of the sheet** | `MASCOT_OF_SHEET` |
| Mascot left inset | 62 / 852 = 7.3 % | `space[3]` inside a sheet already inset `space[4]` |
| Mascot bottom | occluded by the button | drawn first, button paints over |
| Primary action | inside the panel | sheet moved out of the scroll flow into the pinned footer |

**Keeping it as a ratio was not pedantry.** A constant 150 was tried first and 320pt
exposed it: 38 % of a 390 screen is 47 % of a 320 one, so the smallest phone got a
mascot half the width of its sheet.

## Step 4 — rejected, and why

| Rejected | Why |
|---|---|
| The owl | We have Atlas. That was the brief. |
| **"Gems" as the lesson reward** | ADR 0011 makes coins and gems *different currencies*. A lesson awards coins; labelling them gems would teach the wrong economy to keep a screenshot. |
| Bare icon+number rewards instead of pills | `Stat` is the design system's reward chip and appears identically on Home and the streak screen. Taking the donor's lighter treatment *here only* would make one value look like two things. The cost is real and accepted: at 320 the two chips wrap to a second row. |
| The solid red heart | Ours is a token pair that clears contrast. Theirs is a colour we would have to re-derive against a dark canvas — the same trap as the accents in the first graft. |

## The fourth mechanic, which looked best and is a trap

**A flag beside each answer option.** The reference puts Poland's flag against "Polish
złoty", the EU's against "Euro". It looks like the best idea on the screen. It was
recorded here as "deferred, worth doing" — and that was wrong, which is worth leaving in
rather than editing out.

`packages/engines/src/content/types.ts` already carried the reason: per-option art was
tried once and removed, because for a template answered by country name it prints the
answer beside each name. The currency question looks like it escapes that — none of the
four flags is Germany's. It does not. `buildQuestion` builds the correct option as
`{ id: item.entityId }`, so **the option's entity is the entity in the prompt**: drawing
its flag puts Germany's flag against "Euro" and hands over the answer to anyone who
recognises a flag and knows nothing about currencies. Silently, and only to sighted users
— the worst shape a giveaway can take, and the same shape the locator rule exists to
prevent.

The donor hangs the flag on the **value** (Euro → the EU flag), not on the entity the
value came from. That is not expressible in our content model: a `Fact`'s value is
`{ id?, names? }` and only an `Entity` carries `assets`. It needs value-level assets
*and* a licensed symbol per currency with a source and a `verifiedAt`.

**This is the step-4 failure mode in the skill, caught one layer later than it should
have been:** the donor supplies interaction, not values, and "make the question easier to
answer without knowing the fact" is a value this product does not hold. A transplant that
overrides your product's ethics is a rejection, not a graft — and in a learning app,
correctness is the ethic.

## Consequence

`celebration/burst-wide` is now unused. It was built for the frame this replaced — a
ribbon straddling the top edge of a card that is no longer a card in the scroll flow —
and the character carries the confetti now. Moved to `NOT_SHIPPED` rather than left in
the bundle, per the rule the league badges earned.

---

# Graft four: the Home screen

The reference was our own Home IA, redrawn in the donor's visual language — same
greeting, same "Today's Quest", same 0/5, same Explore card, same five tabs, in white
and their green with their owl. That framing is unusually honest about what a transplant
is for: the information architecture was already right, so anything left is mechanics.

## Measured, not eyeballed

`.wq-measure-ref.cjs` (throwaway; `measure-design.cjs` needs a live URL and this was a
PNG). Geometry only — the palette was rejected before measuring, so the adoptable part is
the arithmetic. Numbers off an 853×1844 render:

| | Reference | Ours, at 390 |
|---|---|---|
| Hero card, share of screen height | 28.3 % | 29.4 % |
| Hero card inset from screen edge | 4.3 % of width | 4.1 % |
| Hero card aspect | 1.49 : 1 | 1.44 : 1 |
| Character, share of card width | 28.1 % | 36.9 % |
| Economy chips in the header | 2 | 0 |

**The card was already right.** That is the finding that justified measuring instead of
redesigning: three of the four proportions were within a point and a half, so the visible
difference between the two screenshots is not the card's geometry at all. Two rounds of
eyeball-driven "make the card more like the reference" would have moved numbers that were
already correct.

Segmenting the PNG took three attempts and each failure is worth recording, because each
produced a confident wrong number: a global bbox over "green pixels" returned 91 % of the
page (the tab bar's Home icon and the "EXPLORE THE WORLD" label are green too); row
density at a 30 % threshold cut the card off two thirds down (beside the white CTA the
only green left is two thin margins); and a "warm or near-white" character mask reported
the mascot as 100 % of the card's width, because the card's own white heading is
near-white. The card's height was finally taken from a single column 8 px inside its left
edge, which is green for its whole height.

## Mechanics taken

| Mechanic | How it landed |
|---|---|
| **The economy lives in the header, from the first screen** | Coins chip beside the bell; the streak badge moved up from the greeting row so the two are one group. The balance was already on Home — in a `Stat` inside the LEVEL card, below the fold and gated on `!isNewUser`, so the currency the product turns on was invisible to the only user who has never seen it. |
| **One count and one bar, measuring the same thing** | The card drew `questDone / questTotal` under "0 of 5 lessons today" — a different quantity. Hidden for new users, so nobody had seen them stacked; showing the bar revealed "0 of 5 lessons" above "Progress 0 / 10". The bar is the goal's now, `showCount` off, and quest-task progress stays on Quests where all five tasks are drawn. |
| **The scaffold is shown at zero** | `!isNewUser` hid the bar from exactly the user it scaffolds for. An empty bar says "there is a shape to fill"; nothing says nothing. |

## Mechanics rejected

| Rejected | Why |
|---|---|
| **The green card and the white canvas** | This is the surface, not the mechanic. Our identity is the night sky and a gold character; a brand-coloured hero block is *their* brand doing the work, and on a dark canvas dominance comes from light rather than from fill. Adopting it would repeat graft one's original error — the donor's numbers were chosen for the donor's context. |
| **The inverted CTA (white button on a coloured card)** | Falls with the above: it is only coherent if the card is the accent block. Our card is a surface and the button is the accent, which is one primary green per screen. |
| **The owl** | We have Atlas. |
| **A live "INVITE FRIENDS" button** | Friends is v2.0 in `roadmap.md`. A bright CTA for a feature that does not exist is building v2.0 during v1.0 *and* a dark pattern under rule 7. The placeholder stays honest and inert. |
| **The gem chip** | ADR 0011: coins and gems are different currencies, and only coins exist. `rewards/gem` is already in `NOT_SHIPPED`. |
| **A streak chip at 0** | Their header shows the streak always. `HomeScreen.test.tsx` records the opposite decision and it is the right one — "0 day streak" is a worse first impression than none. Coins show at zero and the streak does not, and that is not an inconsistency: a wallet reading 0 is a fact about a balance, a streak reading 0 is a verdict on the person holding it. |

---

# Graft five: Explore and the Profile empty state

A second reference, same framing as the fourth: our own screens redrawn in the donor's
visual language. Two phones — Explore on a dark canvas, the Profile empty state on a
light one, which is the mock being inconsistent rather than a mechanic.

Most of what it shows was already known and already recorded, which is itself the
useful result:

- **The landmark silhouette layer** is `asset-prompts.md §8b`, written from an earlier
  reference and still not drawn — including the legal note that the Eiffel Tower, Christ
  the Redeemer and the Sydney Opera House are all encumbered.
- **The globe on the world card** is `§10 progress/globe`, briefed and marked *not yet
  drawn*, with the instruction to draw generic landmasses or none.
- **Flat continent colours instead of photographic skies** is the trade `ArtScrim`'s
  header already argues both sides of. The skies are delivered and better-looking; the
  silhouette is additive, not a replacement.

## The one mechanic that was neither drawn nor recorded

**The digits are emphasised against their words.** "0 / 56 learned" sets the numbers
brighter and heavier than the sentence around them — on the tiles, the world card, the
Home quest card. Ours drew each line in one flat colour, so the only numbers on Explore
had exactly the weight of the word "learned".

It appears in *both* references and I missed it on the first one, which is worth
recording as a method failure: I measured the first reference's geometry, found the card
already correct, and stopped — without measuring its typography, where the actual
difference was.

| Taken | How it landed |
|---|---|
| Digits brighter and heavier than their words | `Tally` + `splitTally` in `packages/design`, applied to the Explore tiles, both world cards, the region rows, and `ProgressBar`'s label — which is where most of this app's counts actually live. |

It takes the **already formatted string** and restyles the digit runs inside it. A
component taking `{ learned, total }` would have to decide where the word "learned" goes,
which is the translator's call and the concatenation rule with extra steps. `\p{N}` and
not `[0-9]`, because `Intl.NumberFormat('ar')` emits Arabic-Indic digits and an ASCII
splitter would stop working there without failing anywhere.

## Rejected

| Rejected | Why |
|---|---|
| **Flat continent fills replacing the skies** | See above and `ArtScrim`. The skies are delivered, and the contrast problem the flat fill solves has already been solved by the scrim. |
| **Those three landmarks specifically** | Encumbered — §8b carries the detail. A silhouette is still a derivative of the structure. |
| **A framed plate under the empty-state art** | The reference's empty-state illustration is a CUTOUT with sparkles, sitting directly on the page. Ours is a baked plate, which is why it needed a radius and then a hairline to stop reading as pasted. That confirms the fix is a new master with a transparent background, not more framing — the framing is a holding action and should be recorded as one. |
| **The owl, the white canvas, the brand green** | As graft four. |
