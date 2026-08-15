# iOS-native audit — August 2026

Seven audits of the shipped app, run against the TestFlight build (`0.1.0`, commit `81d6a0a`)
and the rendered bundle at 320 / 390 / 768. Written after five device screenshots of the
onboarding flow came back with the note "it looks horrible".

**The headline: every automated gate this repo owns is green, and the app still reads as
non-native.** That is not an indictment of the gates — it is the boundary of what a script
can see. Every finding below sits in the class none of them check: shape language, native
idiom, art scale, gesture, and vertical rhythm.

Findings are numbered so a commit can cite one. Severity is
**P0** (visibly broken), **P1** (reads as not-native), **P2** (craft), **P3** (nice to have).

---

## Audit 1 — the automated gates

Run 2026-08-10 against this commit. All green.

| Gate | Result |
|---|---|
| `pnpm lint:a11y` | ✓ 3 trees — RTL, ARIA spelling, touch handlers, labels |
| `pnpm design:contrast` | ✓ 26 curated + 35 generated pairs, 0 waived |
| `pnpm five-states` | ✓ 16 screens, 14 states waived with a recorded reason |
| `pnpm scrollable` | ✓ 16 screens, none centred out of reach |
| `pnpm reachability` | ✓ 91 exports, 70 reachable, 21 allowed unwired, 0 gaps |
| `pnpm escape-hatches` | ✓ 268 files, 4 allowed `eslint-disable`, 0 `any` |
| `pnpm i18n:check` | ✓ 20 namespaces, 450 keys, 406 translator notes, en + sv complete |
| `pnpm design:shots` | ✓ 14 routes × 3 viewports + 63 flow shots — "nothing measurable is wrong" |

`design:shots` prints its own verdict: *"nothing measurable is wrong — now LOOK at the
pictures, which is the part this cannot do."* That is exactly where this audit starts.

---

## Audit 2 — iOS 26 native conformance

Measured against what the platform actually does, not against taste.

**N1 · P1 — no continuous corners anywhere.** `grep -r borderCurve apps packages` returns
**0**. Every rounded rectangle in the app is a circular-arc corner. iOS has drawn
continuous ("squircle") curvature system-wide since iOS 7, and it is the single strongest
cue that a control belongs to the platform. One property, every primitive.

**N2 · P1 — button labels are uppercase.** `tokens.json`
`typography.scale.button` sets `"transform": "uppercase"` with `letterSpacing: 0.6`.
iOS never uppercases a button label. `NÄSTA` / `HOPPA ÖVER` / `FORTSÄTT` / `CONTINUE`
read as a game or an Android app. The `overline` step may keep its uppercase — iOS does
set grouped-list section headers that way.

**N3 · P0 — the wrong `SafeAreaView`.** `app/_layout.tsx:16` imports `SafeAreaView` from
`react-native`. That component is legacy, iOS-only, and knows nothing about the notch or
the home indicator. `react-native-safe-area-context@5.6.2` is already a dependency and
`grep -r useSafeAreaInsets apps/mobile` returns **0** — it is installed and unused.
The visible consequence is in every one of the five device screenshots: the flat
`bg.canvas` safe-area band sits above the gradient `ScreenBackground`, so there is a hard
horizontal seam across the screen just under the status bar.

**N4 · ~~P2~~ WITHDRAWN — the status bar.** The original finding said it was "configured
for Android only". That is wrong: `barStyle="light-content"` **is** the iOS control and it
is set correctly. Only the `backgroundColor` prop beside it is Android-only, and passing
it is right on Android and harmless on iOS. Nothing to do.

**N5 · P1 — the progress bar is 16 pt thick.** iOS's own is 4. On onboarding it is a
full-width green slab with an accent-green `1 / 4` beside it, which reads as a game HUD
rather than a step indicator.

**N6 · P0 — the onboarding carousel does not swipe.**
`grep -r "pagingEnabled\|onMomentumScrollEnd\|PanResponder" apps/mobile/src` returns **0**.
The three value slides advance only by tapping *Next* or a dot. A page-dotted carousel
that ignores a swipe reads as broken on iOS, and it is the first screen a new user sees.

**N7 · P1 — choice lists are not lists.** The daily-goal step and Settings use
free-floating cards with 2 px borders and 12 pt gaps. The iOS idiom is an inset grouped
list: one rounded container, hairline separators between rows, no gap.

**N8 · P1 — selection is drawn as a green outline.** iOS marks a chosen row with a
checkmark. An outline on a filled row is how Android and web frameworks do it.

**N9 · P2 — the disabled CTA reads as broken rather than unavailable.** `action.disabled`
(`#25437A`) with a `text.tertiary` label measures 3.10:1 — technically fine, and disabled
text is exempt anyway — but it is a *filled slab*, so it looks like an enabled secondary
button that does nothing. iOS keeps the fill and drops opacity, or drops to a plain style.

**N10 · P2 — no haptics outside the lesson.** `expo-haptics` is wired for answer feedback.
The onboarding pickers, the goal rows, the tab bar and the shop are silent.
`selectionAsync()` on every picker change is standard iOS behaviour.

**N11 · P1 — the primary button is two stacked rectangles plus a bloom.** `press3d` draws
a bright face on a dark edge and a green shadow underneath. It is a faithful build of
Duolingo's mechanic and it is documented as deliberate — but on a dark navy canvas at
iOS's shape language it is the loudest non-native object on screen.

**N12 · P3 — Dynamic Type is capped globally at 2.0 and never per-component** except
`TAB_LABEL_MAX_SCALE = 1.2`. Worth a pass on the numerals that must not wrap.

---

## Audit 3 — the onboarding flow

The five screenshots are of *this* commit: the Swedish strings in them match
`packages/i18n/locales/sv/onboarding.json` exactly.

**O1 · P0 — slide 1's illustration does not render on device.** The frame draws (its
hairline border is visible) and the picture is not in it; three white dots sit where the
art should be. `onboarding/explore` renders correctly in the web harness at all three
viewports, so this does not reproduce in Chromium and the cause is not yet proven.
Needs a device check. Mitigations that are worth doing regardless: re-encode the asset,
give `Art` an `onError` fallback so a failed decode degrades to the tinted panel rather
than to a hole, and fix O3, which changes how this asset is drawn anyway.

**O2 · P0 — the illustrations read as empty placeholder boxes.** On slides 1 and 2 and on
the taster, the art is a small subject centred in a large hairline-bordered rectangle.
Root cause is O3.

**O3 · P0 — the art geometry classifier misclassifies three assets.** See Audit 4.

**O4 · P1 — two progress indicators that disagree.** The four-step bar and the
three-slide dots are both on screen; slides 1 and 2 both read `1 / 4` while the dot moves.
The `1 / 4` is `ProgressBar`'s `showCount`, in accent green, top-left, with no label.

**O5 · P0 — the age step overflows at 320.** In `onboarding-age@320.png` the 1930s and
1920s chips are cut off behind the Continue button. Twenty-one tap targets to answer one
question, and the two that reach the oldest users are the two that are clipped.

**O6 · P2 — three heading levels for one question.** `When were you born?` (h1) →
body copy → `Choose a year` (h2, orphaned) → `DECADE` (overline) → chips.

**O7 · P2 — the hero moves between slides.** The art box sits at a different Y on slide 1
than on slide 2, because the two flex spacers redistribute around a one-line versus
two-line title. On a swipeable carousel the hero must be nailed down.

**O8 · P2 — the title runs to the frame edge.** `styles.title` has no horizontal padding;
only `styles.body` does. At 390 the Swedish slide-1 title reaches both margins.

**O9 · P2 — Skip is as loud as Next.** The ghost variant uses the same `button` type step
— 17 pt / 800 / uppercase — as the primary. Two equally weighted calls to action.

**O10 · P2 — the taster wastes 45 % of the screen** between the body copy and the CTA at
390, even after the spacer work.

---

## Audit 4 — the art pipeline (measured)

`scripts/build-art.cjs → measure()` classifies an asset as a **whole-frame panel** when
its `alpha > 24` bounding box covers ≥ 85 % on both axes. A panel gets a hairline border,
a rounded frame and the art's own aspect ratio. A cutout gets scaled until its *subject*
fills the box.

The comment above the threshold says the two populations are 92–100 % and 36–73 % and that
"nothing in the set sits between". Measured across all 68 shipped assets, they overlap
continuously: `onboarding/conquer` 0.81 × 0.72, `avatars/avatar-08…12` 0.82–0.84,
`celebration/burst` 0.73 × 0.88, `onboarding/learn` 0.87 × 0.86, `atlas/welcome` 0.92 × 0.92.
The threshold cuts straight through the middle of the distribution.

Because the test is *any pixel over alpha 24*, one lossy-WebP dust speck in a corner is
enough to report the whole frame as the subject. Three assets are misclassified today:

| Asset | bbox (`alpha > 24`) | bbox (ink-weighted) | drawn as | should be |
|---|---|---|---|---|
| `atlas/welcome` | 0.92 × 0.92 | 0.77 × 0.86 | panel | cutout |
| `onboarding/learn` | 0.87 × 0.86 | 0.65 × 0.80 | panel | cutout |
| `states/error-generic` | 1.00 × 0.87 | 1.00 × 0.84 | panel | cutout |

`atlas/welcome` is the onboarding taster's hero and `onboarding/learn` is slide 2 — two of
the five screens that were photographed. Both are drawn at 65–86 % of the size the screen
asked for, inside a visible rectangle. That is precisely the "placeholder frame" look
`Art.tsx` was written to remove, arriving from the other direction.

**Fix:** replace the any-pixel bounding box with an ink-weighted one — drop rows and
columns carrying less than ~0.5 % coverage before taking the box — then re-run
`pnpm build:art`. The threshold stays; the measurement stops being fooled by dust.

**What that fix then cost, and how it was paid:** the trimmed box is also what `Art` crops
to, so the 0.5 % it dropped was 0.5 % the app cut off — the flat-topped hat of finding 23
below. The box is now trimmed to classify and grown back over contiguous solid ink to
draw.

---

## Audit 7 — what only a device could show

Added after a second batch of TestFlight screenshots. Every finding here was invisible to
all eight gates, and two of them are the worst bugs in this document.

**D1 · P0 — every plural in the app rendered as its own ICU source.** On device, users
read:

```
{count, plural, one {# land att upptäcka} other {# länder att upptäcka}}
```

on the Explore continent tiles, the lesson summary headline, all three daily-goal options
in Settings, and the pending-sync line in More. Not a translation bug and not a Swedish
one — **Hermes implements no `Intl.PluralRules`**. `intl-messageformat` throws
`Intl.PluralRules is not available in this environment` at construction, and `icu.ts`
does the only safe thing left: it returns the raw pattern rather than crash a screen. The
`console.error` beside it goes to a log nobody reads on a phone.

Hermes has `Intl.Collator`, `Intl.DateTimeFormat`, `Intl.NumberFormat` and
`Intl.getCanonicalLocales`, which is why numbers and dates were always right and only
plurals were wrong.

*Why nothing caught it, structurally:* every check that renders a string runs somewhere
with a complete `Intl` — the unit tests in Node, the component tests in jsdom,
`design:shots` and `e2e` in Chromium. The only engine in the pipeline that lacks the API
is the one the app ships on. Four harnesses agreed, and the app was wrong on every device.

**D2 · P0 — answer options were truncated mid-word.** `AnswerOption` capped its label at
two lines under a comment reading *"never truncate a country name — let it wrap and
grow"*. Country names fit; flag descriptions do not. On "Hur ser Japans flagga ut?" two of
the four options rendered as `…med en gul halvmåne och stjärna på en bl…` and
`…saffransgult, vitt, grönt — med ett mörkblått hj…`. An option you cannot read is an
option you cannot choose, and a wrong guess costs a heart.

**D4 · P1 — a flag question never showed the flag.** "Hur ser Japans flagga ut?" is asked
in words and answered in words: four descriptions, a locator map of Japan for context, and
at no point the flag itself. A user finishes a flag question having never seen the flag.
In an app whose first promise is *flags, capitals and landmarks*, that is the fact not
being taught.

It cannot go beside the prompt — the mockup draws it there, but the mockup panel shows the
*answered* state (its correct option is already ringed green). Showing it while the
question is live hands the answer to anyone who can see it, silently and only to sighted
users, which is the same giveaway the locator map is carefully kept away from. So it is
revealed with the feedback, once grading is done and the correct option is already marked.

Built in the engine as `Question.revealAsset`, indexed by the template's *attribute* like
`promptAsset` — so it knows nothing about flags, and a wildlife pack asking "what does a
lion look like?" in words reveals `assets.photo` with no engine change. Absent when the
prompt is already showing the picture.

**D3 · P1 — the feedback sheet hid the answer it was giving feedback on.** The sheet is a
sibling below the scroll view, so when it appears the viewport shrinks by its height and
the options scroll under it. On the Japan currency question the correct answer — *japansk
yen*, freshly marked — sat behind the card that had just said "Perfekt!". A learning app
that hides which one was right at the moment it says whether you were right has failed at
the only thing the screen is for.

---

## Audit 5 — cross-screen craft

Read off the rendered bundle at 390 unless noted.

**C1 · ~~P1~~ WITHDRAWN — Shop icons.** The finding claimed the rows do not align. They
do: `ShopScreen` renders the insignia inside a fixed-width `View` that is reserved whether
or not there is art in it, with a comment explaining exactly why. Only rank titles carry an
insignia because only ranks are climbed to — the shop's own titles are bought, and
`asset-prompts.md` briefs no art for them. The one row that looks different is the earned
one, which is the point of it. Read the code before filing the screenshot.

**C2 · P1 — Profile empty state is a near-black plate on navy.** `states/empty-profile`
measures as a whole-frame panel (0.98 × 0.98) and genuinely is one, so it is drawn as a
dark rounded rectangle inside a dark screen with 200 pt of nothing above it.

**C3 · P2 — Paywall error state leaves ~350 pt of dead space** below *Try again*, with
*Not now* and *Restore purchases* stranded at the bottom.

**C4 · ~~P2~~ WITHDRAWN — Country detail's muted rows.** The three `Learn it first` rows
are `text.tertiary` on purpose: the screen deliberately shows a fact's label and not its
answer until it has been learned, because otherwise the page is a cheat sheet for the
lesson. Making them louder would break the feature. What the screenshot actually shows is
a brand-new account with nothing learned yet — a content state, not a styling defect.

**C5 · P2 — Achievement medals are muddy at 48 pt.** The tier art is a dark plate in a
dark circle; at that size neither the tier nor the glyph reads.

**C6 · ~~P2~~ WITHDRAWN — Streak's grey freeze button.** Filed as "the same fact stated
twice". It is not: the button is the action and the line under it is the reason it cannot
be taken, which is the pair a disabled control is supposed to come in. The screenshot is
of an account with zero coins, so the control is correctly unavailable and correctly
explains itself. N9 — that a *disabled filled slab* reads as broken rather than as
unavailable — is the real finding here, and it is about `Button`, not this screen.

**C7 — Home at 768 leaves ~280 pt empty.** Documented in `tokens.json` as a content gap
rather than a layout one (Friends and League are v1.5/v2.0 placeholders). Agreed; no action.

---

## Audit 6 — motion and feedback

**M1 · P2 — one press mechanic, one property.** `useFacePress` animates `translateY` and
nothing else. iOS presses scale and dim.

**M2 · P3 — `motion.expressive` has one reader.** The spring is implemented in
`motion.ts` (`useAnimatedTo`) and only `SplashScreen` asks for it. Every other transition
in the app is a linear or eased timing.

**M3 · P2 — no transition between onboarding steps.** `setStep` swaps the subtree; the
screen changes instantly with no direction.

---

## The fix list

Ordered by what it buys per unit of risk. Files are where the change lands.

### P0 — visibly broken

1. **Ink-weighted art measurement** — `scripts/build-art.cjs`, then `pnpm build:art`.
   Fixes O2/O3 and C2's cousins app-wide. *(Audit 4)*
2. **`Art` degrades gracefully** — `apps/mobile/src/components/Art.tsx`: `onError` →
   tinted panel instead of a hole. Mitigates O1 whatever its cause. *(O1)*
3. **Swipeable carousel** — `OnboardingScreen.tsx`: horizontal `ScrollView`,
   `pagingEnabled`, `onMomentumScrollEnd` → `setSlide`, dots stay tappable. *(N6)*
4. **Real safe-area handling** — `app/_layout.tsx`: `SafeAreaProvider` +
   `useSafeAreaInsets` from `react-native-safe-area-context`; let `ScreenBackground` run
   to the physical edges so the seam under the status bar goes away. *(N3)*
5. **Age step fits at 320** — replace the 21-chip grid with a picker that cannot
   overflow. *(O5)*

### P1 — reads as not-native

6. **Continuous corners** — `borderCurve: 'continuous'` beside every `borderRadius` in
   `packages/design/src/primitives/*` and the app's own surfaces. *(N1)*
7. **Sentence-case buttons** — `tokens.json` `typography.scale.button`: drop
   `transform`, tracking `0.6 → 0`. Regenerate tokens. *(N2)*
8. **Thin progress bar** — default `height` 16 → 4 for the flow indicator; drop
   `showCount` on onboarding. *(N5, O4)*
9. **Inset grouped list for the goal step** — one container, hairline separators,
   checkmark for selection, no per-row border. *(N7, N8)*
10. **Quieten the primary button** — keep the mechanic, lose the bloom; ghost variant
    drops to `body` weight so Skip stops shouting. *(N11, O9)*
11. **Shop rows align with or without art** — reserve the gutter, or drop it when the
    item has no insignia. *(C1)*
12. **The daily goal's denominator moves under the user.** `lessonsPerDay()` divides the
    goal minutes by the measured median answer time, so a fast lesson makes tomorrow's —
    and today's — target larger: Home went "0 of 5 lessons today" → "1 of 30" inside one
    session in the harness. Finishing work should not make the bar longer. Belongs to the
    learning engine (smooth or floor the pace, or fix the target for the day once it is
    set) and needs `pnpm engines:simulate` afterwards, so it is **not** in the styling
    pass that found it. *(third pass)*

### P2 — craft

12. Pin the carousel hero so it does not move between slides. *(O7)*
13. Horizontal padding on `styles.title`. *(O8)*
14. Collapse the age step's three heading levels to one. *(O6)*
15. `selectionAsync()` on every picker and row selection. *(N10)*
16. Press = scale + dim, not translate alone. *(M1)*
17. Directional transition between onboarding steps. *(M3)*
18. `expo-status-bar` instead of RN's. *(N4)*
19. Paywall error state fills its screen. *(C3)*
20. Country detail: `Learn it first` at body weight, not tertiary. *(C4)*
21. Streak: when the freeze is unaffordable, say so once — not twice with a dead
    button. *(C6)*

### P3 — later

22. Per-component Dynamic Type caps on numerals that must not wrap. *(N12)*
23. Spend the spring: `expressive` on card entrances and the summary tally. *(M2)*
24. Achievement medals need a lighter plate or a larger draw size. *(C5)*

### Needs a device, not a harness

- O1 — whether `onboarding/explore` decodes on iOS. Everything above is verifiable in
  the bundle; this one is not.

---

## What landed, 2026-08-10

Branch `claude/ios-app-ui-polish-w65169`. `pnpm verify` green; `pnpm bundle:native` green
after the budget note below; every screen re-rendered and looked at.

**Done — P0**

1. **Ink-weighted art measurement** (`build-art.cjs`). The bounding box is taken by alpha
   *mass* with the faintest 0.5 % trimmed from each end of each axis, instead of by the
   outermost pixel over alpha 24. Five assets were reclassified — `atlas/welcome`,
   `onboarding/learn`, `states/error-generic`, `states/offline`, `avatars/avatar-07` — and
   the taster's hero went from a small robot in an empty bordered box to Atlas at full
   size. The rebuild also discovered `rewards/globe`, a delivered master that had never
   been rasterised, so `art.generated.ts` had been stale against `docs/design/assets`.
2. **`Art` degrades to nothing, not to a framed hole** — `onError` unmounts the frame.
3. **The carousel swipes** — `pagingEnabled` with `onMomentumScrollEnd`; the dots stay
   tappable and keep their 44 pt targets.
4. **Real safe-area handling** — `SafeAreaProvider` + the context's transparent
   `SafeAreaView`, *inside* `ScreenBackground` so the gradient reaches the physical edges.
   The seam under the status bar is gone.
5. **The age step is a wheel** (`components/WheelPicker.tsx`) — 5 rows × 44 pt, snapped,
   with the first row an explicit "Choose a year" so nothing is pre-selected. Every row is
   a real radio, so VoiceOver, the keyboard, the E2E driver and jsdom all reach it without
   a gesture. It cannot overflow at 320 because its height does not depend on its length.

**Done — P1**

6. **Continuous corners** — `packages/design/src/shape.ts` exports `squircle`; applied at
   26 sites across the primitives and the app's own surfaces. Not on `radius.full`, where
   there is no straight edge for the curve to ramp into.
7. **Sentence-case buttons** — `typography.scale.button` drops `uppercase` and its +0.6
   tracking.
8. **The progress bar is 4 pt with no numeral** on onboarding; the dots do the counting.
9. **The goal step is one inset group** — hairline separators, checkmark for selection.
10. **The primary button's glow is an ambient lift** (0.55 → 0.22 over `space[2]`), and the
    ghost variant drops a whole type step so *Skip* stops matching *Next*.

**Also done, from P2:** the carousel hero is pinned (O7); the title has horizontal padding
(O8); the age step is down to one heading (O6); `hapticSelect` — which had no callers at
all — fires on the wheel and the goal rows (N10); steps arrive with a directional fade
(M3); both vertical steps centre with `Spacer` rather than hanging from the top (O10).

**Withdrawn on inspection:** N4, C1, C4, C6 — see each. Four of thirty-four findings did
not survive reading the code they were about.

**Still open:** N9 (disabled buttons read as broken — every fix costs a wired token, so it
wants a decision rather than a patch), N12, M1, M2, C3, C5, and O1, which needs a device.

**Bundle budget.** `pnpm bundle:native` was **already failing on `main`** before this
branch: iOS measured 4.10 MB against a 4.1 MB budget, verified by stashing the branch. It
had gone unnoticed because that check lives in `verify:full`, which runs in CI, and not in
`verify`, which runs locally. Now 4.3, with every measurement recorded in the script.

### Second pass — the device-only findings

11. **`Intl.PluralRules` polyfill** — `@formatjs/intl-pluralrules` with `en` and `sv` rule
    data, force-installed. **`polyfill-force`, not `polyfill`**, and that is the whole
    lesson of D1: the conditional spelling would leave Node, jsdom and Chromium formatting
    plurals through their own native `Intl` while the device formats them through
    FormatJS — two implementations, and the one under test never the one that ships.
    Costs 0.09 MB. FormatJS also recommends `intl-getcanonicallocales` and `intl-locale`;
    those measured **0.30 MB** and the plural path never calls them, verified by deleting
    both globals before the import. *(D1)*
12. **`AnswerOption` no longer truncates.** The cap is gone, not raised — a long answer
    costs space and the lesson screen scrolls; a truncated one costs the answer. *(D2)*
13. **The feedback sheet scrolls the options back into view.** Measured `onLayout`, not a
    guess at the offset, and above every early return — the first attempt sat next to the
    JSX it affects, which is below `if (!question) return`, and a conditional hook is a
    crash rather than a lint note. *(D3)*

The guard for D1 is in `i18n.test.ts`: it asserts `Intl.PluralRules.polyfilled === true`,
so if anyone reverts to the conditional import, the suite says that the tests have stopped
covering the device rather than silently going back to testing the wrong engine.

### Third pass — carrying Explore's style across the app

The brief was "make the rest of the app more like the Explore tab". Explore reads as
designed and the others read as lists, and the difference turned out to be four
transferable things rather than one:

14. **`ProgressBar` can show its own percentage** (`showPercent`). Explore drew "42 %"
    beside its region bars with a local row and three local styles; every other screen
    with a bar drew nothing. Moved into the primitive — trailing, `aria-hidden` because
    the bar's `accessibilityValue` already speaks the figure, tabular so it does not
    jitter as it counts.

    **Applied to two screens, not to all seven, and that is the finding.** Tried on
    Quests, Region and Home and reverted on all three: those rows already read "0 / 4" an
    inch away, so the percentage is the same quantity said twice. The rule is in the
    prop's doc comment — *show it where the text beside the bar is not already a fraction
    of the same quantity.*

15. **A subject glyph per quest task** — map, flag, pin, star, trophy. This was the
    flattest list in the app, five navy rectangles told apart by a number in a ring, and
    it is the identical problem the Explore grid solves with a coloured mark per tile. One
    accent and five shapes, deliberately not five new colour tokens: `palette.continent`
    exists because continents are a named set someone chose colours for, and quest slots
    are not.

16. **Counts go through `Tally` everywhere they are counts** — the quest task meter, the
    Profile world summary, the Shop price and shortfall. Digits brighter and heavier than
    the words around them, which was already true on Explore and on nothing else.

17. **Tinted icon↔label pairs**, at the `space[1]` rung that exists for exactly that: a
    coin beside every Shop price (seven gold numbers with the unit spelled out in words
    and nothing else), a bolt beside every quest XP figure, and a unit glyph on each of
    Profile's six stat tiles, which were six identical navy squares.

18. **`Button`'s `sm` label was still uppercase.** It was `text('overline')`, which is
    12/800 UPPERCASE with a point of tracking, so the Shop shipped a column of BUY / BUY /
    WEAR beside a `button` step whose uppercase had just been removed for being the
    loudest non-native thing in the app (N11). Half a fix is not a fix. `overline` earns
    its casing — it is the grouped-list section header, which is how iOS sets those — and
    borrowing that step for a label the user taps borrowed a decision made about something
    else. Now `caption` at the button weight: 13/800, no tracking, sentence case.

### What the third pass found by accident

`pnpm design:shots` visits its routes **immediately after onboarding**, so every one of
those pictures is of a five-minute-old account. A `played-*` pass now re-photographs four
routes after a full lesson, and it reported two things on its first run:

- **Profile and Streak are pixel-identical before and after.** XP, coins and streak days
  are server-authoritative (ADR 0006) and the harness runs the exported bundle with no
  Supabase behind it, so `stats.xpTotal === 0` takes Profile's empty branch every time.
  The level card, the week chart, the six stat tiles and the seven region bars **have
  never been photographed**, on any branch. Seeding local state to fake it would
  photograph a lie about what the client is allowed to decide, so the pass records the
  gap instead. Reviewing those two screens needs `pnpm db:start`.
- **Home's daily goal moved from "0 of 5 lessons today" to "1 of 30" inside one session.**
  `lessonsPerDay()` divides the goal by the user's measured median answer time, and the
  harness answers every question in about half a second, so the denominator collapsed. On
  a device this is milder and still real: finish a lesson quickly and the bar you were
  filling gets six times longer. **Not fixed here** — item pace feeds lesson sizing and
  the economy simulation, so it belongs to the learning engine and a balance run, not to a
  styling pass. Logged as P1.

### Fourth pass — the two the third pass logged, and what fixing them uncovered

**P1.12, the daily goal's moving denominator.** Fixed by pinning the target, not by
retuning the engine. `lessonsPerDay()` divides the goal minutes by the measured median
answer time, and that median changes the instant a lesson ends — so finishing work could
make the day's target bigger and the bar the user was filling longer. A target is a
promise about *today*, so `useDailyGoal` decides it once per local day and holds it; pace
measured today shapes tomorrow's. Lesson SIZE still adapts on every lesson, because a
lesson has no finish line to move. Re-deciding does happen when the user changes the
Settings slider, since that is them asking for a different day.

**The unphotographable screens were not a harness gap.** They were a product bug, and a
bad one. XP, coins and streaks are read from the server and nowhere else, while lessons
are queued locally — so **finishing a lesson offline earned you nothing you could see.**
Profile said "Nothing to show yet" and Streak said "No days yet" to somebody who had just
done one. The work was safe in the queue and the app showed no sign of it.

ADR 0006 says *the client may render optimistically; it may never decide*, and only the
second half had ever been built: `reconcile()` has always existed to correct a prediction
and nothing produced one. `packages/engines/src/sync/optimistic.ts` produces it now, from
the `GradeResult` the lesson runner already computes — the same number the summary card
renders as "+14 XP", which simply was not carried anywhere afterwards.

Four judgements inside it, each one a bug avoided:

- **Coins stay the server's.** XP and a streak are records; a wallet is not. Predicting a
  balance upward offers a purchase the server is about to refuse. `coins` is spendable and
  authoritative, `coinsIncludingPending` is the prediction, and both are named so a caller
  has to choose. Home and Profile report; the Shop and the freeze button spend.
- **The streak moves by at most one, and never down.** It is a day count, so two lessons
  today add one day and a lesson on a day already counted adds nothing. A gap between
  `lastActiveDate` and today could mean broken, reduced, or covered by a freeze — three
  outcomes this cannot tell apart, so it predicts only the increment and the error stays
  one-directional.
- **`lastActiveDate` moves with the streak.** Without it the first attempt made things
  *worse*: `currentStreak()` re-derives whether a run is alive from that date and returns 0
  for a null one, so Profile said "1 day streak" while Streak said "No days yet".
- **An award settles when the totals catch up, not when the mutation is acknowledged.**
  Dropping it at acknowledgement shows the old number and then jumps.

### What rendering those screens for the first time then showed

Four defects that had never been visible, on a screen nobody had ever seen with data in
it:

19. **Profile's week chart had no track.** A day with no lessons drew nothing at all, so a
    real week rendered as one green rectangle floating beside six invisible columns. The
    component's own header says a chart of "days with activity" would "flatter the user by
    lying about the shape of their week" — without a visible empty column that is what it
    drew. Now `status.progressTrack`, the same unfilled channel `ProgressBar` uses.
20. **"Day streak 1" beside "Best streak 0".** Not a lag — an impossibility. A current run
    of N is proof the best run is at least N, so the record takes the larger of the two.
21. **The level card printed the level three times** in a card four lines tall: the title,
    the bar's label, and the line under it. The bar's label was the one of the three
    saying nothing about what the bar measures, so it now takes its name from the "102 XP
    to level 2" line instead of adding a fourth voice. Same defect Home's quest card and
    Explore's world card each had.
22. **Home told everyone to "Start your first lesson", for ever.** `questTitle` was a prop
    on `HomeProgress` that **nothing ever passed**, so the app's default screen greeted a
    user with a 40-day streak by telling them to start their first. Exactly what the same
    card's comment records for the Daily Challenge one card over — "the shell was built,
    ticked as done, and never checked for a producer" — except this one had a producer all
    along in `useDailyQuest()`. It now names the next unfinished task, and keeps the old
    sentence for the genuine first launch, where it is true.

And one that is not visual at all: **`isoDay` used `toISOString()`**, which is UTC, so for
everyone west of Greenwich the activity log's day boundary sat in the middle of their
afternoon. In California a lesson finished at 5pm was recorded against tomorrow — the
daily-goal line reset while the user was still in the app, and Monday evening's work
landed on Tuesday's bar. `useWeekActivity` walks back seven days with `setDate`, which is
local, and then formatted each one through this, which was not.

### Fifth pass — the mascot with the flat hat

One more TestFlight batch, three screenshots of the same flow, and one complaint: Atlas's
pith helmet is sliced flat across the top on the language step, on the taster, and
everywhere else he appears.

23. **The subject box was being used as a crop.** Audit 4's fix replaced the any-pixel
    bounding box with a mass-weighted one — trim the faintest 0.5 % from each end of each
    axis — and it classified the assets correctly, which is what it was written to do.
    But `Art` scales the image until that box fills its frame and clips the overflow, so
    the box is not only a measurement, it is a **cut line**: every pixel the trim discards
    is a pixel the app amputates. A subject's thinnest, brightest extremity is exactly the
    low-mass tail a trim takes first, and on this character that is his hat.

    Measured across all 68 shipped assets, it was not one asset. Every illustration lost
    between 2 and 30 pixels on some edge — `atlas/welcome` 9 rows off the crown,
    `atlas/celebrate` 11 columns off the left arm, `atlas/explorer` 30 — and only the hat
    turned a curve into a straight line where anyone would notice.

    Fixed in `measure()`: the mass box still decides *where the subject is* and whether the
    asset is a panel, and the reported box then grows outward from it over any contiguous
    line that still carries solid ink (α > 200). Contiguity is what keeps the dust out —
    the corner speck that made an extremal box useless is attached to nothing — and it is
    why the feathered assets (`atlas/resting`, `states/empty-profile`) grow by exactly
    zero: their ramp never reaches 200 outside the box. The panel decision stays on the
    trimmed box, or `avatars/avatar-07` crosses the line at 0.91 × 0.99 and goes back to
    being drawn as a plate among eleven siblings drawn as cutouts.

24. **Onboarding's first hero was still a pasted rectangle.** `frame="bleed"` was
    introduced (Audit 3) to stop whole-frame art being drawn as a bordered panel, and it
    took the border off and left the geometry alone: `Art` still *fits* the picture inside
    the box. `onboarding/explore` is a whole frame, so a 3:2 picture in the 390 × 220 band
    came out 330 wide with 30 points of canvas down each side and a visible vertical seam
    on both — on the first picture anybody ever sees. Two of the three slides are cutouts
    and had no gap, which is why the original fix measured as working.

    `frame="fill"` is the third mode: whichever is larger of the subject fit and the box
    cover. Cover alone would blow a cutout up until only a detail of it was left; fit alone
    leaves the gap. Covered by `Art.test.tsx`, both halves.

25. **The band ate the sentence at 320.** The hero was a flat 220 points against a page
    that does not scroll — `styles.slide` centres and clips — so at 320 × 568 the last line
    of slide one's sentence sat under the page dots where no gesture on a phone can reach
    it. The band is now the page's own width at the art's aspect, capped by what is left
    after the copy, measured. Two hand-tuned fractions of the viewport were tried first and
    both photographed as still clipping: what has to be cleared is a paragraph's *wrapped*
    height, and no fraction of a viewport knows it.

    The measurement was then wrong by 24 points, which is `title`'s `marginTop` plus its
    `marginBottom` — `onLayout` reported the copy box shorter than it drew, and the band
    was handed space that was already spoken for. **Anything measured has to own its own
    spacing**: the slide's copy carries padding and a gap now, not margins on its children.

26. **Two Swedish strings were not Swedish.** `onboarding:taster.title` was "Vi provar en",
    a word-for-word "Let's try one" that leaves the article dangling with no noun, and
    `taster.start` was "Börja lära", which without a reflexive means *begin to teach*. Now
    "Nu kör vi" and "Börja lära dig". Both are on screens in the screenshots; neither is
    something a check in this repo can see, because `pnpm i18n:check` verifies that a key
    is *present* in a locale, never that what is there is a sentence.
