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
| 1. Splash | ✅ — mark, wordmark, and a slow/failed escalation with a way out |
| 2. Onboarding | ✅ — slides → age gate → goal → taster lesson, gated on first launch |
| 3. Home | ✅ |
| 4. Daily Quest | ✅ |
| 5. Lesson runner ★ | ✅ — 3 of 5 question types; the other two are licence-blocked, not unbuilt |
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
| 1.1 | **Splash** (#1) | ✅ No minimum duration — a splash held open so a logo can be admired is an app made slower on purpose. Silence under 1.2 s, a status line past it, and past 10 s it stops claiming to be loading and offers a way out, because a splash that never resolves looks identical to a crash. Never blames the connection: we do not know that it was. |
| 1.2 | **Onboarding** (#2) | ✅ 3 value slides → age gate → daily-goal picker → **taster lesson**. The rule that makes it work, now asserted in the E2E: the user is inside a real lesson before any sign-up ask exists. |
| 1.3 | **Age gate → child branch** | ✅ Neutral birth-year entry; the E2E asserts the string "are you over 13" never appears. Under-13 sees the child note and is never offered sign-in. |
| 1.4 | **Daily goal** | ✅ Written to preferences, so Settings and the reminder scheduler read one value. |

Building the splash turned up the thing that made it worth building: **it was
unreachable, and so was any splash we could have written.** `expo-splash-screen` was
held open until the fonts landed, and the fonts landing is exactly the moment the React
splash stops rendering — so the native image covered precisely the window our screen
was for, on every platform. A slow state, a failed state and a retry button, none of
which could be reached on any device. The native splash is a static image: it cannot
say "this is taking a while", cannot offer a retry, and cannot distinguish working from
wedged. So its job now ends the moment React can paint, and everything after that
belongs to a screen that can speak. The accepted cost is that the splash paints in the
fallback face — the fonts are what it is waiting for.

The E2E cannot cover it, and now says so instead of pretending: on web, expo declares
the faces as `@font-face` in the HTML head, so `useFonts` resolves immediately and
there is no pending state to catch. Holding the `.ttf` responses for six seconds was
tried — the requests are genuinely delayed and the app boots straight past them. An
earlier version of that step "passed" against a page that had already booted and a
screenshot that showed Home. The steps that remain assert the property the splash
exists for (a cold start never paints a blank rectangle) rather than one it cannot
observe.

Two other things came out of Wave 1. `Card` gained `onPress` + `role` + `aria-checked`,
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
| 2.3 | **Favourites** | ✅ A star on the country page and a fourth collection filter, over one `useSyncExternalStore` so two screens can never disagree. It is a **star, not the mockup's heart** — red hearts are the lives you lose in a lesson, and one glyph meaning two things teaches a ten-year-old neither. It changes what you can *find*, never what you are *asked*: boosting starred countries in the scheduler would let a user starve their own review queue, and "study what you like" is the instinct spaced repetition exists to overrule. |
| 2.4 | **Search** (+ H14 empty) | ✅ Diacritic-insensitive, with an empty state that offers a way onward. |

Building the collection screen surfaced three bugs in `Card`, all invisible until a
percentage-width tile existed:

- **The caller's `style` was applied twice** — once to the gradient wrapper and once to
  the inner view. Margins had been silently doubling on every card in the app; a
  `width: '31%'` tile became 31% of 31% and rendered its label one character per line.
- **Then the fix for that had its own bug**, found by 2.3. Moving `style` to the wrapper
  alone meant `padding`, `alignItems`, `justifyContent` and `gap` — instructions about
  a card's *children* — landed on a box whose only child was the inner view, while the
  inner view kept its default `padding: space[4]`. A tile asking for 8 px got 24, which
  left 63 px of text on a 111 px tile and broke "Stockholm" mid-word. The tell was that
  the two branches disagreed: with no gradient module — component tests, the screenshot
  renderer, the design preview — there was only ever one box and everything was correct,
  so every test passed and only the shipped bundle was wrong. A `Card` is now exactly
  one box with the gradient as an absolutely-positioned child, which is the only shape
  in which a caller's style can mean one thing.
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
| 4.1 | **Currency facts** | ✅ 64 countries, `slow` volatility, full names ("Swedish krona", not "krona") so the value identifies the country wherever it can. Zimbabwe is absent: its currency changed twice in five years and the USD circulates — a fact already drifting is worse than a gap. **Language is deliberately still open** — Belgium, Switzerland, Canada, India and South Africa have several official languages, and picking one is exactly the unilateral call the content policy forbids. |
| 4.2 | **Population** (`slow` volatility) | ⬜ **Deliberately not started.** 65 populations means 65 numbers that must each be right and dated, and approximate figures are the worst kind of wrong in a learning app. It needs one authoritative dataset with a citable release, not sixty-five searches. |
| 4.3 | **Templates for the new attributes** | ✅ `tpl.currency.mc4` and `tpl.currency-reverse.mc4`. 449 items now, 415 askable. |
| 4.4 | **Speed round** | ✅ `/lesson?mode=speed`, entered from Quests. `timeLimitMs` lives on the lesson, not the template, so the same item is worth the same everywhere. A timeout records the question as *unanswered* rather than as a wrong guess and costs no heart — running out of time is not the same mistake as being wrong, and the feedback says so. The countdown is a bar rather than ticking digits: digits demand attention that belongs on the question. |

### Wave 5 — the hidden screens that are not gated on auth
| # | Work |
|---|---|
| 5.1 | ✅ **H2 Welcome back** (7+ days). Gated on the local activity log, shown once per return, and it says the one thing a returning user needs: *everything you learned is still here*, with the counts beside it as evidence. Due facts are "ready for review", never "overdue". There is a way out that is not a lesson. |
| 5.2 | 🟡 **H7 done, scoped.** Not a blocking screen — a full-screen "no internet" would be a lie about this app: content ships in the binary and the queue replays on reconnect, so a lesson works in a tunnel. It disables the two controls that genuinely need a server (freeze, repair — spends against a server-authoritative balance, ADR 0006) and names the connection as the reason, before the coin gap, so a user who is offline *and* short is not sent looking for coins that would not have helped. **H10 sync conflict remains** — `reconcile()` exists in the engine with a notify threshold, but nothing calls it, so the UI would be unreachable until there is a server to disagree with. |
| 5.3 | 🟡 **H13, H14 and the starred-collection empty state are done.** The rule they follow: an empty state names the *next step that fixes it*, and offers a way to take it. Achievements said "one lesson away" and gave you no way to start one — a signpost pointing at a wall. **H12 (friends) is deliberately not built**: the catalogue asks for an invite CTA, and there is no invite mechanism, no accounts, and no friends feature — building a button that cannot invite anyone is worse than the honest empty tile already on Home. It lands with friends, in v1.5. |
| 5.4 | **H3 update required**, **H4 maintenance** — server-flagged |

### Wave 6 — the states the engine already had and the UI never showed

Three screens in a row turned out to be *unreachable* rather than unbuilt, which is
now the first thing to check before building anything: the splash (the native one
covered exactly its window), the offline banner (`isOffline` was a hardcoded `false`),
and now **out of hearts**. The machine has set `outOfHearts` since it was written and
had a `REVIVE` event to go with it; nothing rendered either, so the lesson carried on
at zero hearts and the whole mechanic was decorative.

| # | Work | Why |
|---|---|---|
| 6.1 | **Out of hearts** (lesson state, screen-catalog §5) | ✅ A fork, not a wall. The one sentence that matters is *the next lesson starts with a full set* — hearts reset per lesson, so this is never a lockout, but a ten-year-old who has just been stopped does not know that. It is said **before** any offer to spend coins. No countdown (the next lesson does not wait for a refill, so a clock would be both a lie and pressure); no way to buy coins; and `REVIVE` resumes at the *next* item, because paying to re-answer the one you just missed is paying for the answer. |
| 6.2 | **Paused / network-lost mid-lesson** | ⬜ The machine has `PAUSE`/`RESUME`; nothing sends them. Same pattern again. |

**The question types are 3 of 5, not 2.** Flag → country, country → capital and the
speed round all ship; currency is a bonus fourth axis. The two missing —
tap-the-country and landmark → country — are the map-geometry and photo-licensing
decisions, so they are blocked rather than pending.

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
