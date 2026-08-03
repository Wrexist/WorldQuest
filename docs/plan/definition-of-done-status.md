# Definition of Done — where this actually stands

Run against [`PROJECT.md §12`](../../PROJECT.md#12-definition-of-done) after the UI
completion waves. The skill's own instruction is the reason this file exists:

> Never report "complete" with an unticked box.

So this is the unticked boxes, named. **The app has never run on a phone**, which is
the single fact that most of the rest follows from.

---

## Automated: green

`pnpm verify` runs typecheck, 631 tests across seven packages, content validation,
i18n completeness, 23 contrast pairs, `lint:a11y`, `reachability` and `five-states`.
`pnpm e2e` runs 47 steps against the real Metro bundle in Chromium — including six
screens re-measured at 200 % text — `pnpm design:shots` renders 10 routes at
320/390/768, and `pnpm edge:test` runs 14 against the vendored edge bundle.

That is a real floor, and it is not the same as done. The section at the bottom on
what the lesson actually asked is the argument for why: every one of those numbers was
green while two thirds of the authored content was unreachable.

---

## ⬜ Function

| Box | State |
|---|---|
| iOS **and** Android, phone and tablet, to 320 pt | ⬜ **Never run on either.** No iOS Simulator without macOS, no Android emulator without `/dev/kvm`. Every layout claim in this repo is a claim about Chromium, now checked at 320/390/768. **Both platforms do now bundle** — `pnpm bundle:native`, 3.74 MB iOS and 3.75 MB Android of Hermes bytecode. Until that script existed the app had only ever been bundled for web. |
| Five states everywhere | ✅ **Audited, and the audit is a script.** `pnpm five-states` checks all 14 screens; 15 states are waived with a recorded reason and the script fails on a waiver the code has outgrown. See below for what it found. |
| Offline behaviour | ✅ Queue, replay on reconnect, backoff, parked work surfaced. Real connectivity as of Wave 7. |
| Server-authoritative rewards | ✅ Nothing on the client writes a balance. Achievements, quests and XP all render predictions and say so. |

## ⬜ Quality

| Box | State |
|---|---|
| Unit + component tests | ✅ 631 passing, plus 14 against the edge bundle. |
| No `any`, no `@ts-expect-error` | ✅ Zero of both outside tests. |
| Performance on a **mid-tier Android** | ⬜ Not measured. There is no device. |
| Errors to Sentry with PII-free context | ⬜ `ErrorBoundary` logs to console and says "reported once it is connected". Sentry is not connected. |

## 🟡 Craft

| Box | State |
|---|---|
| Tokens only | ✅ Guarded by `tokens.test.ts` and `design:contrast`. The whole system was rebuilt around one rounded face and pressable depth — see `docs/design/design-system.md` §4a and §5. |
| Reduced motion **verified** | 🟡 The code path is guarded and unit-tested — and the guard now proves the helpers it trusts actually consult the setting, which it did not before. Still not watched on a device with the setting on. |
| Haptics on every meaningful outcome | 🟡 Built and wired to the answer path and lesson completion, honouring the Settings toggle that until now wrote a preference nothing read. **Unverified on a device** — like everything else here, and a vibration is the one thing a screenshot can never show. |
| Sound respects the Settings toggle | ✅ Six sounds, **generated** rather than sourced, so the project owns them outright. Off by default per §9; the toggle that wrote a preference nothing read now drives them. |

## 🟡 Inclusion

| Box | State |
|---|---|
| Every string an i18n key, `en` + `sv` | ✅ 350 keys, both locales complete, ICU plurals, translator notes. |
| Screen reader verified with VoiceOver **and** TalkBack | ⬜ Neither exists here. Labels and roles are asserted in tests, and **the primary task is now completable with the keyboard alone** — Tab to an answer, Enter to score it, no pointer (`pnpm e2e`). That is the same accessibility action a reader dispatches, so it rules out the failure mode that shipped the tab bar inert. It does not verify announcement quality, focus order as a person experiences it, or the reader's own gestures. |
| Contrast ≥ 4.5:1, targets ≥ 44 pt | ✅ 23 pairs checked; targets sized in code. |
| Survives 200 % text and RTL | ✅ RTL is linted (`lint:a11y`) after two real bugs. 200 % text is now measured on six screens in `pnpm e2e` — see below. |

## 🟡 Product

| Box | State |
|---|---|
| Analytics per spec | 🟡 **18 of 28** declared events fire (was 2). Every remaining one is blocked on a server, an account, or push — none is forgotten. The child no-op was broken; fixed. |
| Serves a named persona | ✅ |
| Copy against the voice guide | ✅ And asserted, not trusted: no-shame, no-guilt, no-dark-pattern rules are tests in the streak, welcome-back, out-of-hearts, paused and sync screens. |
| Docs updated | ✅ |

---

## What is left, and what each is actually blocked on

1. ~~**Haptics.**~~ Built. The wrong-answer pattern is `impactMedium`, never
   `Notification.Error` — that one is two sharp knocks, the pattern iOS uses for a
   failed payment, and this app does not punish a child for not knowing something yet.
   A test asserts the source never reaches for it, because a runtime test would pass
   just as happily with the punishing pattern: both spellings are "a function was
   called".
2. ~~**Sound.**~~ Built — and the reason it sat here for months was a bad
   classification, not a real blocker. It was filed next to flags and landmarks under
   "assets", and it is not the same problem: a national flag is somebody's artwork with
   a licence attached, and a correct-answer chime is a sine wave with an envelope.
   `scripts/make-sounds.py` generates all six, so the project owns them with no licence
   to track and nothing to take down.

   Three decisions worth keeping. **Wrong is a falling major second, not a buzzer and
   not a minor second** — the latter is the sound of a mistake in every film score ever
   written, and this app does not punish a child for not knowing something yet; it is
   the same rule that gives a wrong answer a muted surface instead of red.
   **`playsInSilentModeIOS: false`**, because iOS defaults to playing through the silent
   switch, which is what a music app wants and a game does not. And **off by default**:
   the stored default read `true`, which cost nothing while nothing played and would
   have been wrong the moment it did — a game that starts making noise on a bus has made
   an enemy in ten seconds.
3. **Sentry.** Blocked on a **DSN and an authorised account**, neither of which exists
   in this environment. The `ErrorBoundary` logs to console and says so.
4. **A device.** Not something code can fix — but two things that were being deferred
   to it turned out not to need it:

   - **Native bundling.** `pnpm e2e` exported `--platform web` and nothing else, so the
     app had **never been bundled for iOS or Android at all**. Metro resolves per
     platform — `foo.ios.ts` and `foo.web.ts` are different files, `react-native-web`
     substitutes on one platform only, and a native module that throws at import is
     invisible to a web build that never loads it. This repo has already lost a week to
     exactly that class of bug. Both platforms now bundle, checked by
     `pnpm bundle:native`. It proves the graph compiles; nothing executes the bundle.
   - **Keyboard operability.** A control a screen reader cannot activate is nearly
     always one the keyboard cannot activate either — both go through an accessibility
     action rather than a touch sequence, which is precisely how the tab bar once
     shipped inert on web *and* unreachable by screen reader on every platform. A
     lesson can now be answered with Tab and Enter alone.

---

## Five states: what the audit found

The rule has been in `PROJECT.md` since week one and this box sat at 🟡 "not audited"
for just as long. `pnpm five-states` is that audit, in `pnpm verify` so it stays true.

It found a real, systematic gap on its first run. **`useContent()` can return
`status === 'error'` and every browse screen ignored it.** Explore, Collection, Country
and Region all destructured `status` and read only `status === 'loading'`, so a content
load that failed rendered an empty grid — indistinguishable from an empty collection,
with no explanation and no retry.

Nobody had noticed because content ships in the binary and therefore essentially never
fails. It starts failing the day packs are downloaded (architecture.md §3, week 9), on
exactly the users with the worst connections.

Fixed with `ContentGate`, a wrapper the thin routes use, rather than two more props
threaded through nine presentational screens — the tenth would have forgotten. Routes
are the layer that fetches, so error and offline belong to them; screens keep `loading`
and `empty`, which are about the shape of the data.

Two things about the script itself, because both were the check being wrong:

- **It audits the route and its screen together.** Auditing screens alone reported
  twelve of fourteen as broken when the states were simply in the other half of a
  deliberate split.
- **A stale waiver fails the build.** A waiver that the code has outgrown is a lie
  sitting in a script, and it found one immediately — the achievements screen had
  grown an empty state while its waiver still claimed it could not have one.

15 states are waived across 14 screens, each with a reason that says why the state
*cannot occur* rather than that it is unimportant. "A paused lesson always has a
question behind it" is a decision; "it does not need it" would not be.

---

## 200 % text: what is now checked, and what still is not

The Definition of Done has asked for this since the first week and nothing had ever
looked. `pnpm e2e` now doubles every rendered font size on six screens — Home, the
lesson, Explore, a collection grid, a country page and Profile — and asserts that
nothing clips and the page does not scroll sideways.

**Why doubling the CSS is the honest simulation, not a shortcut.** React Native
multiplies every `fontSize` by the OS accessibility scale before it reaches the view.
react-native-web does not — it writes the number straight into an inline style — so
there is no browser setting to turn on. Doubling every inline `font-size` and
`line-height` reproduces exactly what the native runtime does, on the real bundle, with
the real layout engine. `maxFontScale` is 2.0 in the tokens, so this tests the ceiling.

It checks three things — the three failures the a11y spec names: nothing clipped,
nothing overlapping, no sideways scroll. Getting the first two to mean what they say
took four passes, and each pass was the check being wrong rather than the app:

1. **Clipping only looked at each element's own scroll box.** Text is never cropped by
   itself — the card around it does the cropping — so the check could not see the case
   it was written for. Now it compares the layout box against the box its nearest
   `overflow: hidden` ancestor allows.
2. **That then walked the whole ancestor chain**, reached the scroll viewport, and
   reported Home, Explore and the country page as broken because each has more in it
   than one screenful. Below the fold is not clipped; it is content you scroll to.
3. **Decorative glyphs were counted as text.** The "⚑" standing in for a flag is
   deliberately cropped by its art slot. Only strings containing a letter or digit
   count as copy.
4. **The overlap check excluded the tab bar entirely** — to stop it comparing tab
   labels against whatever had scrolled behind them — which made it blind to the tab
   labels overlapping *each other*, the exact bug that motivated adding it. It now
   compares within a layer, not across.

Each of those was verified by putting the bug back and watching the check fail.

It found three bugs, all the same defect the a11y spec names — a box sized to an
English string at 100 %:

- **Every button clipped its own label.** `Button` set a fixed `height` and capped the
  label at one line. At 200 % an uppercase label is twice as wide as the box drawn for
  it, so "Practise this country" became "Practise this cou". Now `minHeight` and two
  lines.
- **Collection tiles cut country names.** Two lines held every name in English at
  100 %; "Papua New Guinea" wants three at 200 % and was rendering as "Papua New". The
  name is the tile's identity — a country you cannot read is a tile that does nothing —
  so it now has no line cap at all. That was not enough on its own: a country name is
  one unbreakable word, and a three-column grid on a 390 pt screen gives it about
  105 pt, which holds "Chile" and not "Argentina". The grid is now two columns, which
  needs no platform branch and is simply wide enough at every text size.
- **The five tab labels overlapped into a smear.** A tab is one fifth of the screen and
  its label cannot hyphenate. Fixed with `maxFontSizeMultiplier={1.2}` — **not**
  `allowFontScaling={false}`, which is the lazy version and the thing the spec forbids:
  the label still scales, it just stops. It is the only capped string in the app, and
  the cap is mirrored into the DOM as `data-max-scale` so the harness honours the same
  ceiling the native runtime does rather than testing a state that cannot occur.

**What this cannot say.** It measures layout, not experience: whether the reading order
still makes sense at that size, how it feels to use, and anything about a platform's own
scaling curve past 2.0. Those need a device. It also covers six screens, not fifteen —
the six were picked as the ones with the densest text and the tightest boxes, and the
other nine are unchecked.

---

## Analytics: what fires, and what each missing event waits on

**Firing (18):** `app_opened`, `screen_viewed`, `lesson_started`, `question_answered`,
`lesson_completed`, `lesson_abandoned`, `hearts_depleted`, `achievement_unlocked`,
`quest_completed`, `country_viewed`, `search_performed`, `offline_mode_entered`,
`setting_changed`, `error_occurred`, `onboarding_slide_viewed`,
`onboarding_goal_selected`, `onboarding_abandoned`, `taster_lesson_completed`.

The onboarding six were the last unblocked row. Two decisions worth recording:
`search_performed` sends `query_length`, never the query — a free-text field on a
child's device is the easiest place in this app to collect something personal by
accident, and the length answers every question the spec asks of it. And
`taster_lesson_completed` is driven by a `?taster=1` flag from the onboarding hand-off
rather than inferred from "the first `lesson_completed` we ever saw", which would count
every reinstall as an activation.

**Not firing, and why** — none of these is "forgotten":

| Event | Blocked on |
|---|---|
| `fact_mastered`, `fact_lapsed` | Real memory state, which is server-side. The local map is empty. |
| `streak_extended`, `streak_broken`, `level_up` | Server-owned progression (ADR 0006). |
| `signup_completed` | There are no accounts. |
| `coins_spent` | The purchase path is server-side; the client never spends. |
| `sync_conflict_resolved`, `xp_reconciliation_failed` | Need a server to disagree with. |
| `notification_opened` | Push is not wired. |
| `a11y_feature_detected` | Reads OS accessibility settings; the spec marks it aggregate-only, so it is worth doing deliberately rather than in a batch. |

One property is deliberately omitted rather than invented: `achievement_unlocked`
declares `days_to_unlock`, and nothing records when a user started. A number derived
from the earliest locally-logged lesson would read as install-to-unlock and be wrong
for every reinstall. Absent beats confidently wrong.

---

## The one that was not a gap but a defect

`track()` no-ops for child accounts — the rule its own comment calls "the rule a
developer must not be able to bypass by forgetting a UI condition". It was bypassed by
nobody wiring it at all: `setChildAccount` was exported and **never called from
anywhere**, so the flag could only ever hold its default of `false`.

Two things kept it hidden, and either alone would have been survivable:

1. The setter had no caller, so the no-op could not fire.
2. `packages/analytics/package.json` declared `"main": "./src/index.ts"` and that file
   did not exist. Metro resolved the package anyway — the events are in the shipped
   bundle — but **vitest could not**, so `lib/analytics.ts` was not importable by any
   test in the mobile package.

Nothing has leaked: `track` only console-logs until PostHog lands. The severity is
entirely in the timing — the day the transport arrived, every child account would have
emitted third-party analytics from the first frame, and it would have shipped looking
correct.

The default is now `null`, meaning *we have not asked yet*, and unknown is treated as a
child. `useOnboarding` already states the principle for that window: the safe thing to
do when we do not know who is holding the phone is nothing at all. Every claim in this repo should be read
   against it — including the haptics above, which is the one feature whose entire
   output is invisible to every test and screenshot we have.

---

## What the lesson was actually asking

Three defects, found while checking a review comment about flag rendering. They
compound, and only the first was reported.

**1. A question nobody could answer.** `tpl.flag-to-country.mc4` is modality `image`:
"Which country's flag is this?", above four country names. There is not one flag file
in this repo, and no component ever tried to draw one. `pickItemForFact` chose
uniformly among a fact's templates, so one flag question in three was a prompt about a
picture that did not exist — and a wrong answer costs a heart.

The engine now carries `promptAsset` on the *question*, and a host declares what it can
present (`modalities`). `apps/mobile` declares text only, with the reason in the
constant. Nothing is lost: `tpl.flag-describe.mc4` asks the same fact in words, which
is the sibling `accessibility.md` §8 already relies on.

The asset was previously attached to every *option*, including distractors. Nothing
rendered it, so it was wrong quietly — but the template is answered by country name,
so drawing it would have printed the answer beside each one.

**2. Two thirds of the content was unreachable.** `selectItems` documents its input as
"ordered easiest-first" and takes the head of the list. `composeLesson` handed it index
insertion order — which is the order the pack files happen to be listed in the host's
import statement. Capitals were listed first, so a user with an empty memory got
capitals and only capitals; no flag or currency question could appear until all
sixty-five capitals had been seen. Every user's memory is empty on day one.

Flags and currencies were authored, sourced, translated, validated and tested. One
import statement decided the curriculum.

**3. The suite was asserting the bug.** Four E2E steps detected "are we in a lesson?"
with `/capital of|flag|money do people/i` over the English prompt copy. That regex
cannot match `lesson:prompt.currency_reverse` at all — and it never had to, because
defect 2 meant every lesson was capitals. Fixing the selection turned four green steps
red with nothing wrong in the app. They now detect a lesson structurally, by prompt
heading and answer options, which is true of any template in any pack.

The shape worth remembering: a component test renders whatever question it is handed,
and an E2E written against one subject's copy passes for as long as only that subject
appears. Neither could see that the other two thirds never arrived. `reachability.ts`
exists for exported functions nothing calls; this was the same failure one level up, in
data — **content that no code path can reach**.

**Also fixed here:** `composeLesson` was called with a hardcoded `locale: 'en'`, so a
Swedish user got Swedish chrome around English answer options, with the correct answer
sitting there as a foreign word. And the root layout applied `deviceLocale()` on every
mount, so an explicit language choice in Settings survived until the app closed and
never once survived a cold start.
