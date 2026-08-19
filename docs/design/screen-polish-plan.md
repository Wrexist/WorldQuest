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

### D. The guard cannot see the defect — *fixed, Phase 0*

`deadSpaceBelow` measured from the bottom of the deepest **descendant** to the bottom of
the scroller. A `flex: 1` wrapper is a descendant and it stretches to the bottom, so any
screen that centres its empty state inside a full-height container measured as **zero
dead space** while being visually half empty. That is precisely the shape of
Profile-empty, League-empty and Paywall-failed — the three screens this plan exists for.
The tool passed all three.

Fixed first, because otherwise none of the rest of this is falsifiable and the regressions
come straight back. See Phase 0 below for what replaced it, the second bug the fix
uncovered, and the baseline it produced.

---

## 2. The findings, ranked

Severity is "how much does this cost us", not "how ugly is it".

| # | Screen / state | What is wrong | Cause | Severity |
|---|---|---|---|---|
| 1 | **Paywall — store unreachable / offline / loading / no plans** | Both plan cards vanish; the page becomes a short centred column above ~200 pt of void. The one screen where money changes hands looks broken at the exact moment the user is deciding. | A | **High** |
| 2 | **Account form** (`Save your progress`, `I already have an account`) | 61 % empty at 390. Flat black. No art, no reassurance, no progress indication. Reads like a debug screen for the one flow that protects the user's data. | B + C | **High** |
| 3 | **Streak page** | No week calendar, no milestone ladder, no title in the bar — just a flame, a number, a coin row and a freeze card. Less information than the Profile tab's week strip, and only **two points denser** after a real lesson than with no streak at all. | C | **High** |
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

### Phase 0 — make the defect measurable — **done 2026-08-19**

Nothing else in this plan is arguable until the tool can see the thing we are arguing
about.

1. ~~Fix `deadSpaceBelow`~~ **Done.** It took the bottom of the deepest DESCENDANT of the
   scroller, and a `flex: 1` wrapper is a descendant that stretches to the bottom while
   painting nothing. A node now counts only if it paints — a fill, an image, a border, a
   shadow, or text in a leaf.
2. ~~Add `contentDensity`~~ **Done**, plus `emptiestBand`, from one row scan. The viewport
   in 4 px bands; a band is inked if any painted box crosses it. Density is what fraction
   of the height has anything on it; the band is the largest unbroken run of nothing and
   where it starts. Rows rather than a 2-D grid, because these layouts are a single column
   and a horizontal measure would report the side margins as emptiness on every screen.
3. ~~Render every route and every state shot~~ **Done.** `shot()` measures as well as
   photographs, so the 33 state shots are in the report for the first time — and the
   emptiest screens in this app are states, not routes.
4. ~~Keep both out of `pnpm verify`~~ **Done.** `design:shots` was never in it and is not
   now.

**A second bug, found by the first fix.** With the wrapper problem solved, League and the
account form reported **100 % ink, 0 % gap at 768** — two of the emptiest screens in the
app, measured as completely full. The cause is finding B in §1: both paint
`bg.canvas` over the root gradient themselves, and at 768 that fill is 600 × 1024. Full
height, three quarters of the width — so a rule about full-*bleed* layers let it straight
through. A backdrop is now defined by height and by having no edge of its own, at any
width. Anything with a border, a shadow, a picture or text in it is a surface somebody
drew on purpose.

`MEASURE` moved into `scripts/lib/measure-ink.cjs` to make any of this testable:
`page.evaluate` serialises the function into Chromium, so where it used to live no test
could reach it, which is how it shipped agreeing with every screen it existed to catch.
`scripts/lib/measure-ink.test.ts` drives it against a stub DOM — 11 cases, and reverting
either bug fails 4 and 2 of them respectively. `vitest.edge.config.ts` grew a
`scripts/**` glob; nothing in `scripts/` had been tested before, not by a decision but
because no suite's glob reached it.

#### The baseline

Ink is the percentage of viewport height with anything painted in it; gap is the largest
unbroken empty run. `✎` marks a screen that loses 20 points or more of density between
320 and 768 — a screen that does not grow into the space it is given.

```
                                        320      390      768   320→768
  ✎ account?mode=link              42%  44% 28%  63% 18%  74%    −24
  ✎ profile                        63%  17% 40%  46% 33%  56%    −30
  ✎ league                         63%  20% 43%  46% 35%  56%    −28
  ✎ welcome-back                   72%  11% 45%  43% 35%  55%    −37
  ✎ paywall?source=settings        64%   6% 47%  16% 37%  23%    −27
  ✎ quest-complete                 77%   8% 51%  22% 40%  28%    −37
  ✎ quest                          84%   6% 55%  20% 46%  25%    −38
  ✎ lesson                         86%   5% 65%  15% 54%  21%    −32
  ✎ streak                         78%   7% 68%  18% 54%  34%    −24
    country-SE                     77%   6% 85%   4% 71%  16%     −6
    settings                       80%   8% 81%   5% 81%   4%     +1
    region-EU                      82%   4% 80%   3% 83%   2%     +1
    home                           94%   3% 95%   2% 84%  11%    −10
    shop                           82%   4% 85%   3% 86%   2%     +4
    collection-flags               81%   6% 86%   4% 88%   4%     +7
    achievements                   85%   6% 88%   4% 89%   3%     +4
    quests                         92%   3% 93%   2% 90%   2%     −2
    explore                        87%   5% 86%   3% 92%   3%     +5
```

**A threshold was tried and thrown away.** The rule already in the harness — "flag it when
it is 25 % empty at every width" — is why the only screen it ever named was the account
form: 320 × 568 is a short phone, most screens overflow it, and a screen that overflows
has no gap by construction. What the data shows instead is a scaling failure, and it is
bimodal enough not to need a threshold at all: the screens a review has repeatedly passed
hold their density from 320 to 768, and the screens this plan is about lose a quarter to a
third of it. **There is nothing between −10 and −24.** The gap in the data is the finding,
so the harness prints all eighteen rows sorted and lets a reader see it, rather than
asserting a pass mark.

Four of the nine marked rows are not defects and are not in this plan: `welcome-back`,
`quest-complete`, `quest` and `lesson` are single-purpose screens where one thing to say
is the design. They sit there on purpose, which is exactly why this is a report and not a
gate.

The five that are in the plan — `account`, `profile`, `league`, `paywall`, `streak` — are
findings #1 to #5 in §2, arrived at independently by looking at the pictures. That the two
methods agree is the reason to trust the numbers going forward.

#### What the state numbers said that the pictures did not

Measuring the state shots was step 3 mostly as bookkeeping. It produced the sharpest
finding in this document.

| Screen | empty / new account | after a lesson |
|---|---|---|
| `profile` | 40 % ink, 46 % gap | **86 % ink, 3 % gap** |
| `streak` | 68 % ink, 18 % gap | **70 % ink, 14 % gap** |
| `home` | 95 % | 95 % |
| `quests` | 93 % | 93 % |
| `settings` | 81 % | 81 % |

Profile more than doubles once there is something to show, which says the screen is fine
and its **empty state** is the defect — exactly finding #4, and it sets the target: 86 %
is the ceiling, so 65 % is a floor and not an aspiration.

The streak page moves **two points**. A user with a real streak sees very nearly the same
screen as a user with none — no week filled in, no milestone nearer, nothing that records
what they did. That is finding #3 stated as a number, and it is a better argument for the
week strip and the milestone ladder than "it feels thin" was.

#### Targets for the later phases

Not a gate. A number to be argued with in review, and to notice when it moves the wrong
way.

| Screen | 390 now | 390 after | Why that number |
|---|---|---|---|
| `paywall` (no prices) | 47 % | ≥ 70 % | Two stand-in plan cards restore the footprint the real ones occupy |
| `account?mode=link` | 28 % | ≥ 65 % | The lower bound of the screens a review already passes |
| `profile` (empty) | 40 % | ≥ 65 % | Same |
| `league` (empty) | 43 % | ≥ 65 % | Same |
| `streak` | 68 % | ≥ 80 % | The week strip and milestone ladder are real content, not filler |

### Phase 1 — the shared vocabulary — **`EmptyState` done 2026-08-19**

Eight screens hand-rolled the same three-part empty block with slightly different
spacing, and four hand-rolled a skeleton. That duplication is why fixing this
screen-by-screen would be twelve edits that drift apart within a month.

1. ~~**`EmptyState`**~~ **Done** — `packages/design/src/primitives/EmptyState.tsx`. Art,
   heading, body, action, footnote. The duplication was not the expensive part: all eight
   copies were laid out the same wrong way, `justifyContent: 'flex-start'` with 40–48
   points of top padding, which is a short block pinned to the top of a tall screen.
   Profile and League consume it; the rest follow as their phases land.
2. ~~**Vertical strategy**~~ **Done**, and encoded once. `pnpm scrollable` fails the build
   on `justifyContent: 'center'` in scroll content, correctly — content taller than the
   viewport gets centred past both edges and the ends become unreachable. The shape that
   works is `flexGrow: 1` on the content container and a `flex: 1` centred child inside,
   which centres while the content is short and scrolls once it is not. A caller in a
   plain `View` does nothing and gets the same result.
3. **`AbsentContent`** — written, tested, and **held back until the paywall consumes it**
   in Phase 2a. A primitive with no caller is the shape of `Placeholder.tsx` and of
   `ach.level.climber`, and this repo has spent enough of this branch deleting those.
4. Copy: no new strings. Both screens pass the keys they already had.

#### What it moved, and what it did not

| | ink 390 | gap 390 | gap 768 |
|---|---|---|---|
| `profile` | 40 % → **44 %** | 46 % → **27 %** | 56 % → **31 %** |
| `league` | 43 % → **43 %** | 46 % → **27 %** | 56 % → **31 %** |

The largest gap roughly halves on both; the ink barely moves. That is exactly what
centring can do — it redistributes emptiness rather than filling it, turning one
half-screen hole into two smaller ones. The 65 % targets below are Phase 2's work and are
not met by this, and saying otherwise would make the baseline useless for the phase that
has to hit them.

**League's flat fill went too**, out of sequence. It belongs to finding B and to Phase 4,
but it is the thing that made the harness report this screen as 100 % full, so leaving it
in meant Phase 1 could not be measured. The account form's and `ContentGate`'s stay where
the plan puts them.

#### One test harness gap, now closed

`packages/design`'s suite is `environment: 'node'` with `include: ['src/**/*.test.ts']` —
no jsdom, no `react-native-web` alias, no `.tsx`. So **no primitive in this repo has ever
had a test**, not by a decision but because the only harness that can mount a React Native
component lives in `apps/mobile`. The primitives' tests live there for now and move the day
that package grows a component harness; `apps/mobile` already depends on
`@worldquest/design`, so the import direction is legal.

### Phase 2 — the four worst screens *(two days)*

This is the phase that answers the screenshot.

**2a. Paywall (finding #1) — done 2026-08-19.** The plan region keeps its shape in all
four states. One `AbsentContent` at the cards' measured footprint (220 pt, added up from
the tokens in `PLANS_FOOTPRINT`), carrying the picture, the explanation and — for the one
state that can be acted on — the retry, in the place the decision would have been made.

| | 320 | 390 | 768 |
|---|---|---|---|
| ink before | 64 % | 47 % | 37 % |
| ink after | **77 %** | **52 %** | **46 %** |

**The ≥ 70 % target at 390 is not met, and should not be.** What is left below the
free-forever line is the space the purchase button occupies when there is something to
buy — and that button is deliberately *absent* rather than disabled when there are no
prices, which is a decision recorded at length in the screen and a good one: a dead
primary action sitting three hundred points below the error it cannot act on says the
opposite of the truth about what the user can do. Filling that space would mean inventing
content for a screen whose entire message is that we could not reach the store. 52 % with
a 16 % gap is where `lesson` sits, and nobody has ever called that screen empty. The
target was written before the screen was looked at that closely; this is the honest number.

Two things the work turned up:

- **The primitive was wrong and a test said so.** `AbsentContent`'s first version made
  `loading` a bare `Skeleton` and dropped its children, on the reasoning that a shimmer
  with words on it is a lie. `PaywallScreen.test.tsx` failed inside five minutes: the
  screen deliberately says "Checking prices with the store" while it waits, and that
  decision is older than the component and better than the rule. There is one box now, and
  loading shimmers it from behind. Suppressing an *action* during loading is real and
  belongs to the caller, which knows which of its children is the action.
- **The frame cost height, and the 200 %-text check charged for it.** A border and padding
  on the screen with the least room to spare pushed "Offline packs" under "Not now".
  `STATE_ART` went 88 → 72 and the box's padding is `space[3]` rather than a `Card`'s
  `space[4]`. That art size now carries two measurements in its comment, from two
  different failures of the same check.

**2b. Account form (finding #2) — done 2026-08-19.** The flat `bg.canvas` fill is gone,
so the root gradient shows. `atlas/encouraging` on the link path and `atlas/waving-back`
on sign-in — briefed respectively as "offering an open hand, reassuring, patient, not
pitying" and "greeting someone returning after a long time", which are the two moments.
The single 160-character paragraph became a lead sentence and three ticked lines; nothing
new is promised, it is the same two promises separated so each can be read. A two-step
`ProgressBar` under the header, the same one onboarding uses.

| | 320 | 390 | 768 |
|---|---|---|---|
| ink before | 42 % | 28 % | 18 % |
| ink after | **82 %** | **58 %** | **41 %** |
| gap before | 44 % | 63 % | 74 % |
| gap after | **6 %** | **30 %** | **50 %** |

**58 % against a 65 % target, and the 768 gap is still large.** Both are real and both are
overstated by the harness: this screen's lower half is where the keyboard goes, and the
keyboard is the one piece of chrome a screenshot cannot render. On a phone, a user who has
tapped the field sees a form that fills the visible area — which is why `KeyboardAvoidingView`
is wrapped round it in the first place. Padding the space a keyboard occupies would make
the screenshot better and the screen worse.

**2c. Streak page (finding #3) — done 2026-08-19.** The week strip moved out of
`ProfileScreen` into `components/WeekStrip` and both screens draw the same one. The
milestone ladder renders `STREAK_MILESTONES` and `streakMilestoneReward` — four rungs,
every value read from the balance table, and no coin chip at 365 because there genuinely
is no coin bonus there. It hides itself on a broken streak, because `MilestoneLine`
already refuses to say "3 days to your next milestone" beside "Your streak ended" and a
whole ladder of what you no longer have is that sentence at four times the length. And
the screen finally has a title: `streak:title` had existed since it was written, with no
reader.

| | 320 | 390 | 768 | 320→768 |
|---|---|---|---|---|
| before | 78 % / 7 % | 68 % / 18 % | 54 % / 34 % | −24 |
| after | **75 % / 8 %** | **82 % / 5 %** | **75 % / 10 %** | **−0** |

Past the ≥ 80 % target at 390, and the scaling drop is gone: this screen has left the ✎
group entirely and now sits with Settings and Region among the ones a review keeps
passing. The two-point gap between an empty streak and a real one is closed — the week
strip and the ladder are things that change when you use the app.

**Two bugs the work turned up:**

- **A duplicate React key, live, inherited.** `useWeekActivity` labels days with
  `weekday: 'narrow'` — M T W T F S S in English, two Ts and two Ss — and the strip keyed
  its seven columns on that. Duplicate keys in a list are undefined behaviour: React may
  reuse the wrong node across a re-render, so a bar animates into the wrong column. It had
  been in `ProfileScreen` since the strip was written and nothing saw it until a test
  rendered the component outside a screen. Keyed by index now, which is correct here and
  not a shrug: a fixed-length window of the last seven days in fixed order.
- **A stale reachability allowance.** `STREAK_MILESTONES` was allowlisted as "used inside
  isMilestone"; the ladder gave it a real caller, and `pnpm reachability` failed the build
  until the entry came out. Exactly what that check is for.

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
3. Re-measure against the Phase 0 baseline above and put the before/after beside it.
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
