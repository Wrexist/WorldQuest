# Definition of Done — where this actually stands

Run against [`PROJECT.md §12`](../../PROJECT.md#12-definition-of-done) after the UI
completion waves. The skill's own instruction is the reason this file exists:

> Never report "complete" with an unticked box.

So this is the unticked boxes, named. **The app has never run on a phone**, which is
the single fact that most of the rest follows from.

---

## Automated: green

`pnpm verify` runs typecheck, 611 tests across seven packages, content validation,
i18n completeness, contrast, `lint:a11y` and `reachability`. `pnpm e2e` runs 41 steps
against the real Metro bundle in Chromium, and `pnpm edge:test` runs 14 against the
vendored edge bundle.

That is a real floor, and it is not the same as done. The section at the bottom on
what the lesson actually asked is the argument for why: every one of those numbers was
green while two thirds of the authored content was unreachable.

---

## ⬜ Function

| Box | State |
|---|---|
| iOS **and** Android, phone and tablet, to 320 pt | ⬜ **Never run on either.** No iOS Simulator without macOS, no Android emulator without `/dev/kvm`. Every layout claim in this repo is a claim about Chromium at 390×844. |
| Five states everywhere | 🟡 Built on the screens that have them; not audited screen-by-screen against the catalogue. |
| Offline behaviour | ✅ Queue, replay on reconnect, backoff, parked work surfaced. Real connectivity as of Wave 7. |
| Server-authoritative rewards | ✅ Nothing on the client writes a balance. Achievements, quests and XP all render predictions and say so. |

## ⬜ Quality

| Box | State |
|---|---|
| Unit + component tests | ✅ 358 passing. |
| No `any`, no `@ts-expect-error` | ✅ Zero of both outside tests. |
| Performance on a **mid-tier Android** | ⬜ Not measured. There is no device. |
| Errors to Sentry with PII-free context | ⬜ `ErrorBoundary` logs to console and says "reported once it is connected". Sentry is not connected. |

## 🟡 Craft

| Box | State |
|---|---|
| Tokens only | ✅ Guarded by `tokens.test.ts` and `design:contrast`. |
| Reduced motion **verified** | 🟡 The code path is guarded and unit-tested; it has not been watched on a device with the setting on. |
| Haptics on every meaningful outcome | 🟡 Built and wired to the answer path and lesson completion, honouring the Settings toggle that until now wrote a preference nothing read. **Unverified on a device** — like everything else here, and a vibration is the one thing a screenshot can never show. |
| Sound respects the Settings toggle | ⬜ **There is no sound.** The toggle in Settings writes a preference nothing reads — the same shape of bug as the daily goal was before Wave 7. |

## 🟡 Inclusion

| Box | State |
|---|---|
| Every string an i18n key, `en` + `sv` | ✅ 350 keys, both locales complete, ICU plurals, translator notes. |
| Screen reader verified with VoiceOver **and** TalkBack | ⬜ Neither exists here. Labels and roles are asserted in tests; *focus order and task completion are not verified*, and the skill is explicit that this is the part that matters. |
| Contrast ≥ 4.5:1, targets ≥ 44 pt | ✅ 14 pairs checked; targets sized in code. |
| Survives 200 % text and RTL | 🟡 RTL is now linted (`lint:a11y`) after two real bugs. **200 % text is unverified** — no scale harness exists. |

## 🟡 Product

| Box | State |
|---|---|
| Analytics per spec | 🟡 **12 of 28** declared events fire (was 2). The rest are listed below with what blocks each. The child no-op was broken — see below; fixed. |
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
2. **Sound.** Blocked on **assets**, not on code. There are no audio files, and the
   same licensing question that holds up flags and landmarks holds up a correct-answer
   chime. The Settings toggle still writes a preference nothing reads.
3. **Sentry.** Blocked on a **DSN and an authorised account**, neither of which exists
   in this environment. The `ErrorBoundary` logs to console and says so.
4. **A device.** Not something code can fix.

---

## Analytics: what fires, and what each missing event waits on

**Firing (12):** `app_opened`, `lesson_started`, `question_answered`,
`lesson_completed`, `lesson_abandoned`, `hearts_depleted`, `achievement_unlocked`,
`quest_completed`, `country_viewed`, `offline_mode_entered`, `setting_changed`,
`error_occurred`.

**Not firing, and why** — none of these is "forgotten":

| Event | Blocked on |
|---|---|
| `fact_mastered`, `fact_lapsed` | Real memory state, which is server-side. The local map is empty. |
| `streak_extended`, `streak_broken`, `level_up` | Server-owned progression (ADR 0006). |
| `signup_completed` | There are no accounts. |
| `coins_spent` | The purchase path is server-side; the client never spends. |
| `sync_conflict_resolved`, `xp_reconciliation_failed` | Need a server to disagree with. |
| `notification_opened` | Push is not wired. |
| `onboarding_slide_viewed`, `onboarding_goal_selected`, `taster_lesson_completed`, `onboarding_abandoned` | Buildable now — the next honest slice of this row. |
| `screen_viewed`, `search_performed` | Buildable now. |
| `a11y_feature_detected` | Buildable, but it reads OS accessibility settings and the spec marks it aggregate-only; worth doing deliberately rather than in a batch. |

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
