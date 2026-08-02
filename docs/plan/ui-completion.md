# Finishing the app — every screen, every feature

The companion to [`asset-independent-work.md`](asset-independent-work.md), which is now
largely done. That list asked *"what can ship before any artwork exists?"* This one asks
the harder question: **what is still missing between here and a v1.0 someone would pay
for**, and in what order does building it hurt least.

Scope is [`../product/screen-catalog.md`](../product/screen-catalog.md) — 15 designed
screens, 22 hidden ones — plus the systems behind them. Anything the roadmap marks
**v2.0 stays out**; building v2.0 during v1.0 is the most expensive mistake available
([`PROJECT.md §2`](../../PROJECT.md)).

**Every screen ships five states: content · loading · empty · error · offline.** That
multiplier is the single most underestimated number in the project, and it is why the
counts below look small and the work does not.

---

## Where we actually are

| Designed screen | State |
|---|---|
| 1. Splash | ⬜ — no splash at all; the app flashes straight to Home |
| 2. Onboarding | ✅ — slides → age gate → goal → taster lesson, gated on first launch |
| 3. Home | ✅ |
| 4. Daily Quest | ✅ |
| 5. Lesson runner ★ | ✅ *(2 of 5 question types)* |
| 6. Feedback | ✅ *(inline in the runner)* |
| 7. Country page | 🟡 — About grid has capital only; no population, currency, language |
| 8. Explore — globe | ⬜ — blocked on map-geometry licensing, not on effort |
| 9. Explore — continents | ✅ |
| 10. Flags collection | ✅ — plus a countries twin, search, and three filters |
| 11. Landmarks collection | ⬜ — blocked on photo licensing |
| 12. Leagues | ⛔ **v2.0** — out of scope by the roadmap |
| 13. Profile | ✅ — level, earned title, band-relative XP bar, seven-day activity |
| 14. Achievements | ✅ |
| 15. Settings | ✅ |

Hidden screens: H8 (crash) and H9 (404) done. H6/H11/H15 inline. **H1–H5, H7, H10,
H12–H14, H16–H22 remain**, and most of the account ones are gated on auth existing.

---

## The order, and why

Sequenced so each wave makes the next cheaper, and so the things a user meets *first*
get built *first* — a polished Home behind a missing onboarding is a polished room
nobody reaches.

### Wave 1 — the first ninety seconds
The part of the product every user sees and we have never built.

| # | Work | Why now |
|---|---|---|
| 1.1 | **Splash** (#1) | Covers the auth check and content-index load. 1.2 s budget — past that it is a loading screen wearing branding. |
| 1.2 | **Onboarding** (#2) | ✅ 3 value slides → age gate → daily-goal picker → **taster lesson**. The rule that makes it work, now asserted in the E2E: the user is inside a real lesson before any sign-up ask exists. |
| 1.3 | **Age gate → child branch** | ✅ Neutral birth-year entry; the E2E asserts the string "are you over 13" never appears. Under-13 sees the child note and is never offered sign-in. |
| 1.4 | **Daily goal** | ✅ Written to preferences, so Settings and the reminder scheduler read one value. |

Two things came out of building it. `Card` gained `onPress` + `role` + `aria-checked`,
because a selectable card is the shape of the goal picker, the year chips, and every
collection tile still to come. And a real bug: **TypeScript does not type-check
hyphenated JSX attributes**, so `aria-label` on a `Card` compiled, did nothing, and
left the goal options with no accessible name. Only the component test found it — the
screen looked perfect.

### Wave 2 — collection, which is what makes it a game
Retention in this genre is collection, not quizzing. We have 65 countries and no
surface that shows a user what they have.

| # | Work | Why now |
|---|---|---|
| 2.1 | **Flags collection** (#10) | ✅ Grid, `0 / 65`, uncollected tiles dimmed but **visible**. Each tile holds a 3:2 art slot, so the sourced SVGs drop in without a relayout. |
| 2.2 | **Countries collection** | ✅ Same route, keyed on entity mastery from `packages/engines/progression`. `mastered` is the bar, not `burnished` — a collection you can only finish by overlearning every entry is one nobody finishes. |
| 2.3 | **Favourites** | ⬜ The Country page already draws a heart that does nothing. |
| 2.4 | **Search** (+ H14 empty) | ✅ Diacritic-insensitive, with an empty state that offers a way onward. |

Building the collection screen surfaced two bugs in `Card`, both invisible until a
percentage-width tile existed:

- **The caller's `style` was applied twice** — once to the gradient wrapper and once to
  the inner view. Margins had been silently doubling on every card in the app; a
  `width: '31%'` tile became 31% of 31% and rendered its label one character per line.
- And the one that mattered most: **the tab bar was a `View` with `onTouchEnd`**.
  That fires for a finger and nothing else — no mouse click, no keyboard, and no
  screen-reader activation, because VoiceOver dispatches an accessibility action rather
  than a touch sequence. The app's primary navigation was inert on web and unreachable
  with a screen reader **on every platform**. There is now a guard against
  `onTouchEnd`/`onTouchStart` in any primitive.

The E2E was complicit: its tab steps asserted `text.length > 40`, which Home satisfies,
so four tabs "passed" while never leaving Home. They now click by ARIA role, assert
`aria-selected`, and require text only that screen shows.

### Wave 3 — progression the user can feel
Every number below already exists in an engine and is invisible in the UI.

| # | Work | Why now |
|---|---|---|
| 3.1 | **Level + title + XP bar** on Profile | ✅ `Level 20 · Navigator`. The maths moved into `levelProgress` in the engine — the curve is exponential, so progress is the position *inside* the band, and computing that in a component is how a bar ends up disagreeing with the number beside it. Found on the way: `TITLES` pointed at a `titles:` namespace that did not exist, so every title would have rendered as a raw key. |
| 3.2 | **Streak UI** — flame, freeze, repair | ✅ `/streak`, reached from the Home badge. Every refusal names its reason, and the cooldown carries the number of days. |
| 3.3 | **Weekly activity bars** on Profile | ✅ Seven fixed slots, scaled to the user's own best day rather than to a goal, recorded locally the instant a lesson ends so the chart is right offline. |
| 3.4 | **Shop / coin sink** | ✅ *as the streak screen, deliberately not as a store.* Freezes and repairs are the only sinks that exist without artwork — the cosmetics that form the real sink all need assets. A two-row store would be a shop in name only, and "buy a freeze" is a decision made while looking at the streak it protects, not while browsing a catalogue. |

The kid-safety rules are asserted, not trusted. The component tests and the E2E both
check the shipped copy for: no way to buy coins, no "hurry"/"last chance"/"expires
soon", no seconds ticking on the repair window, nothing sold that confers an advantage
at learning, and the standing promise that coins come from lessons and never from
money. A freeze is never offered at the cap — selling a third takes coins for nothing.

### Wave 4 — more game, from content rather than code
Each new **attribute** multiplies across every country; each new **template**
multiplies across every fact. This is the cheapest content leverage available.

| # | Work | Why now |
|---|---|---|
| 4.1 | **Currency + language facts** | Completes the Country page About grid, and both are stable and sourceable. |
| 4.2 | **Population** (`slow` volatility) | Shown with `as of <year>`, and **never a quiz answer** — volatile facts may not be. |
| 4.3 | **Templates for the new attributes** | Currency → country, language → country, and their reverses. |
| 4.4 | **Speed round** | A lesson mode, not a screen. Same items, a clock, different scoring. |

### Wave 5 — the hidden screens that are not gated on auth
| # | Work |
|---|---|
| 5.1 | **H2 Welcome back** (7+ days) — "The world missed you", streak repair offered, no guilt |
| 5.2 | **H7 blocking no-internet**, **H10 sync conflict** |
| 5.3 | **H12/H13/H14 empty states** — friends, achievements, search |
| 5.4 | **H3 update required**, **H4 maintenance** — server-flagged |

### Deliberately not built
| Item | Why |
|---|---|
| **Leagues (#12)** | v2.0. The tile on Home stays a tile. |
| **Explore globe (#8)** | Map geometry is an unresolved licensing decision, not an effort problem. The continent grid is the shipping fallback and is already the accessible one. |
| **Landmarks (#11)** | Every photo needs a recorded licence before ship. Authoring 300 unlicensed photos is worse than shipping without the screen. |
| **H16–H22 account screens** | Gated on real accounts. Anonymous sessions are all that exist today. |
| **Friends / social** | v1.5. The Home tile is honest about being empty. |

---

## Rules this list does not get to bend

- **Five states each.** A screen with only its content state is a third of a screen.
- **Tokens, keys, and content.** No hex, no literal string, no invented number.
- **`pnpm e2e` must stay green**, and every new screen gets a step in it. It is the only
  thing in the repo that runs the bundler, and it already caught an app that could not
  build at all.
- **Kids are users.** Nothing on this list may become a dark pattern in
  implementation — the shop especially. No timed offers, no loss framing, no
  purchasable advantage over another child.

**Live status lives here.** Tick a row in the same commit that does the work.
