# Screen polish plan — the screens that look unfinished

Written 2026-08-19, after rendering all 18 routes plus the 33 state-shots at
320 / 390 / 768 (`pnpm design:shots`) and looking at every one of them.

The trigger was the paywall's store-unreachable state: a headline, a small picture, a
sentence, four ticks, and then two hundred points of nothing above a footer. It is not
the only one. This plan names the rest, finds what they have in common, and puts the
work in an order where each phase makes the next one cheaper.

---

## 1. The three root causes

Almost every "boring / incomplete" screen in the app is one of three things. This
matters because there are eleven symptoms and three fixes.

### A. When the content is missing, the screen deletes its layout instead of holding its shape

The paywall's price section renders two `PlanCard`s. When the store cannot be reached
those two cards are not *replaced* — they are simply absent, and everything below slides
up. The result is a page whose bottom half is empty and whose top half is a stack of
centred text.

`ContentGate`, `HomeScreen`, `ProfileScreen` and `CollectionScreen` already do the right
thing: they draw a `Skeleton` in the shape of the thing that has not arrived. The paywall
never adopted it. Neither did the error or offline branches of any screen — skeletons are
used for *loading* only, and the app has four content-absent states, not one.

**The rule this breaks** is already written down in `apps/mobile/CLAUDE.md`: "skeleton,
never a spinner on primary content". It was read as being about loading. It is about
absence.

### B. Three screens still paint a flat canvas over the root gradient

`ScreenBackground` says in its own header that "screens no longer paint their own
background — that is what made the token unreachable, since a flat fill on top of a
gradient is just a flat fill." Three did not get the memo:

- `src/features/league/LeagueScreen.tsx:255`
- `src/features/account/AccountScreen.tsx:282`
- `src/components/ContentGate.tsx:111` (the loading branch)

This is why League and the account form read as flat black while Home and Explore have
atmosphere. It is three lines, and it is the single highest ratio of visible improvement
to risk in this document.

`StickyFooter` also fills with `bg.canvas`, and that one is legitimate — it needs an
opaque base so scrolled content does not show through. It should get a gradient fade
rather than a hard edge, but that is polish, not a bug.

### C. Two screens were built as one block and never got a second tier

The streak page and the account form are not *broken*; there is simply less on them than
the destination implies. The streak page has no week calendar — the Profile tab has one,
so the dedicated streak screen shows less streak information than the tab that links to
it. The account form is a paragraph, a text field and a button on an otherwise bare page:
`design:shots` measures it as 42 % / 61 % / 72 % empty and that is the *only* screen the
tool flags, which brings us to the fourth problem.

### The guard cannot see the defect

`deadSpaceBelow` in `scripts/design-shots.cjs:439` measures from the bottom of the
deepest painted descendant to the bottom of the scroller. A `flex: 1` wrapper *is* a
painted descendant and it stretches to the bottom, so any screen that centres its empty
state inside a full-height container measures as **zero dead space** while being visually
half empty. That is precisely the shape of Profile-empty, League-empty and Paywall-failed
— the three screens this plan exists for. The tool passed all three.

So the guard has to be fixed first, or none of the rest of this is falsifiable and the
regressions come straight back.

---

## 2. The findings, ranked

Severity is "how much does this cost us", not "how ugly is it".

| # | Screen / state | What is wrong | Cause | Severity |
|---|---|---|---|---|
| 1 | **Paywall — store unreachable / offline / loading / no plans** | Both plan cards vanish; the page becomes a short centred column above ~200 pt of void. The one screen where money changes hands looks broken at the exact moment the user is deciding. | A | **High** |
| 2 | **Account form** (`Save your progress`, `I already have an account`) | 61 % empty at 390. Flat black. No art, no reassurance, no progress indication. Reads like a debug screen for the one flow that protects the user's data. | B + C | **High** |
| 3 | **Streak page** | No week calendar, no milestone ladder, no title in the bar — just a flame, a number, a coin row and a freeze card. Less information than the Profile tab's week strip. | C | **High** |
| 4 | **Profile — empty** | Art + heading + line + button pinned to the top third; two thirds void. First thing a new user sees on that tab. | A | Medium |
| 5 | **League — empty / error / offline** | Same shape as #4, plus the flat-black background. | A + B | Medium |
| 6 | **Achievements list** | 30 uniform rows, all at 0 %, no tier colour, no grouping, no "closest to unlocking" hero, no filter. The tier system exists in the data and is invisible on screen. | C | Medium |
| 7 | **Collection grid** | Two columns at 390 for 65 tiles = a 33-row scroll. Uncollected tiles are `opacity: 0.45`, which at a glance is not different enough from collected to make collecting feel like anything. | C | Medium |
| 8 | **`StickyFooter` edge** | Hard opaque line where content scrolls under it. Everywhere it is used. | B | Low |
| 9 | **Country page — unlearned** | Five identical "Learn it first" rows. Honest, but five repetitions of one string is a wall. | C | Low |
| 10 | **Shop** | Item rows are correct and slightly plain; the owned/affordable/unaffordable distinction is carried only by a button label. | C | Low |
| 11 | **`Placeholder.tsx`** | Scaffolding component from before the tabs existed. Now unreferenced. | — | Low (delete) |

Screens that were checked and are **fine** — Home, Explore, Quests, Region, Country
(learned state), Lesson, Lesson summary, Quest complete, Welcome back, Settings, all six
onboarding steps, and every offline variant. Nothing below is about them.

---

## 3. The phases

Five phases. Each one ends green on `pnpm verify` and is independently shippable — this
is not a big-bang redesign, and #2 in the list above should not have to wait for #11.

### Phase 0 — make the defect measurable *(half a day)*

Nothing else in this plan is arguable until the tool can see the thing we are arguing
about.

1. Fix `deadSpaceBelow` (`scripts/design-shots.cjs`) to ignore descendants that have no
   painted surface of their own — no background, no border, no text, no image. A stretch
   wrapper stops counting as content; the deepest *real* pixel becomes the floor.
2. Add a second measure beside it, `contentDensity`: painted area ÷ viewport area. Dead
   space at the bottom is one failure mode; a screen that is 15 % ink spread evenly over
   a tall page is the other, and the paywall is that one.
3. Render every route **and every state shot** through both, and commit the resulting
   numbers as the baseline in this document.
4. Keep both **out of `pnpm verify`**, for the reason the existing note already gives: a
   threshold here either fires on screens that are meant to be sparse or is set so loose
   it fires on nothing. They go in the report; a person decides.

**Done when** the three screens named in §1 report the emptiness a human sees, and the
baseline table is in this file.

---

### Phase 1 — the shared vocabulary *(one day)*

Eight screens hand-roll the same three-part empty block with slightly different spacing,
and four hand-roll a skeleton. That duplication is why fixing this screen-by-screen would
be twelve edits that drift apart within a month.

1. **`EmptyState` in `packages/design/src/primitives/`** — art, heading, body, optional
   primary action, optional secondary action. One spacing rhythm, one art size (140, with
   the paywall's measured 88 as an explicit prop override — see the note at
   `PaywallScreen.tsx:122`, it is a 200 %-text constraint and not a style choice).
   Replaces the blocks in Profile, League, Collection, Country, Region, Explore, Shop and
   the paywall. `FailureState` becomes a thin wrapper over it rather than a parallel
   implementation.
2. **Vertical strategy for empty states inside a scroller.** `pnpm scrollable` forbids
   `justifyContent: 'center'` on scroll content, and correctly — it makes long content
   unreachable. The fix is `contentContainerStyle={{ flexGrow: 1 }}` plus a centred child
   *inside*, which centres when short and scrolls when tall. Encode it once, in
   `EmptyState`, so no screen has to get it right again.
3. **`AbsentContent`** — the missing half of the skeleton story. Same footprint as the
   content it stands in for, in four flavours: `loading` (shimmer), `error` (dashed
   outline + retry), `offline` (dashed outline + the offline line), `unavailable` (flat
   outline). All four preserve layout; only the fill changes.
4. Copy: every new string is a key in `en` and `sv` with a translator note. No new copy is
   invented where an existing key says the same thing.

**Done when** `EmptyState` and `AbsentContent` exist with tests, and at least Profile and
League consume them with no visual regression at 320 / 390 / 768.

---

### Phase 2 — the four worst screens *(two days)*

This is the phase that answers the screenshot.

**2a. Paywall (finding #1).** The plan region keeps its shape in all four states. Two
`AbsentContent` cards the size of the real `PlanCard`s, so the page is the same page
whether or not the store answered — `loading` shimmers, `error` carries the retry
*inside* the card where the missing price is, `offline` says so, `unavailable` states it
plainly. The perk list and the free-forever line stay where they are instead of sliding
up. Nothing about the purchase logic changes; this is layout only, so the state machine
and the analytics stay as they are.

**2b. Account form (finding #2).** Drop the flat `bg.canvas` fill so the root gradient
shows. Give it the art the rest of the app gives a moment like this and the three
reassurances the body copy currently compresses into one paragraph — what is saved, what
we do with the address, what we never do — as a short list rather than a wall. Two-step
progress ("email → code"), because a form that does not say how long it is feels longer.
Same treatment for `mode=signin`.

**2c. Streak page (finding #3).** Add the week strip the Profile tab already has —
extract it into a shared component rather than writing a second one, since two week
calendars that can disagree is exactly the class of bug this repo keeps finding. Add the
milestone ladder: the XP economy already funds days 7 / 30 / 100 / 365, `StreakScreen.tsx:61`
notes that no screen ever mentioned them, and "6 days to your next milestone" is currently
a sentence with no picture of what it is counting towards. Add the missing screen title.
**No new numbers** — every value comes from the balance table.

**2d. League + Profile empty states (findings #4, #5).** Consume `EmptyState` from Phase
1; drop League's flat fill. Mostly free once Phase 1 has landed, which is why they are
here and not earlier.

**Done when** all four render with no void below the fold at 390, `contentDensity` is
above the Phase 0 baseline for each, and `pnpm verify` is green.

---

### Phase 3 — the two flat lists *(one and a half days)*

**3a. Achievements (finding #6).** Three changes, no new data:
- Group by state — *close to unlocking* / *in progress* / *earned* / *not started* —
  instead of one flat 30-row list in catalogue order.
- Show the tier. Bronze / silver / gold exist in the pack and in the ledger and are
  invisible on the screen; the tier ring around the icon is the cheapest way to make a
  gold tier look like something worth having.
- A hero row for the nearest unlock, which is the only row a returning user wants.

**3b. Collection (finding #7).** Three columns at 390 rather than two — the code at
`CollectionScreen.tsx:421` already reasons about this and chose two for widths where it
is "simply wide enough", which is true at 320 and generous at 390. And make an
uncollected tile *read* as uncollected: `opacity: 0.45` is a dimming that survives being
glanced at. Desaturation plus a dimmed frame, keeping the name legible, keeping the
existing screen-reader labelling that already states the collected state in words.

**Done when** both screens are legible at 320 and neither has changed what it counts.

---

### Phase 4 — depth and finish *(one day)*

The small things that make the difference between "correct" and "made".

1. `StickyFooter` gets a gradient fade instead of a hard opaque edge (finding #8).
2. `ContentGate`'s loading branch stops painting flat canvas (finding #10 in §1 B).
3. Country page: five "Learn it first" rows become one summary line plus the rows,
   so the repetition is stated once (finding #9).
4. Shop rows carry their state — owned / affordable / not yet — in the row and not only
   in the button label (finding #10).
5. Delete `Placeholder.tsx` and its `nav:*.soon.*` keys. Its own header says it deletes
   itself when the last real screen lands. The last real screen landed (finding #11).

---

### Phase 5 — verify, look again, record *(half a day)*

1. `pnpm verify` and `pnpm verify:full`.
2. `pnpm design:shots`, then **look at every PNG** — the harness says it itself:
   "nothing measurable is wrong — now LOOK at the pictures, which is the part this cannot do."
3. Re-measure `contentDensity` against the Phase 0 baseline and put the before/after in
   this document.
4. Update `docs/plan/ui-completion.md` and `docs/design/device-pass.md` — a change this
   broad invalidates rows in both, and docs are part of the product.

---

## 4. What is deliberately not in this plan

- **No new art.** Everything above uses illustrations already in `assets/art/`. New art is
  a separate, slower track and none of these findings need it.
- **No new economy numbers.** The streak milestone ladder renders values the balance table
  already funds. If a number is not in `docs/systems/xp-economy.md` it does not appear.
- **No re-theming.** The palette, the type scale and the motion tokens are not the
  problem — three screens declining to use them is.
- **No new screens.** Every finding is a screen that exists.
- **Nothing in the lesson runner.** It is the best screen in the app and the most
  expensive to destabilise.

## 5. Order, and why this order

Phase 0 first because a design problem nobody can measure is a design problem that comes
back. Phase 1 before Phase 2 because eight screens share one defect and fixing it eight
times is how eight screens end up with eight slightly different empty states. Phase 2
before Phase 3 because #1 and #2 are on the paths where the user gives us money and gives
us their data, and #6 and #7 are on the paths where they browse. Phase 4 last because
none of it is load-bearing and all of it is visible.

Roughly a week end to end. Phases 0–2 are the ones that answer the complaint; 3 and 4 are
the difference between "fixed" and "finished".
