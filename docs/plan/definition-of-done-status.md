# Definition of Done — where this actually stands

Run against [`PROJECT.md §12`](../../PROJECT.md#12-definition-of-done) after the UI
completion waves. The skill's own instruction is the reason this file exists:

> Never report "complete" with an unticked box.

So this is the unticked boxes, named. **The app has never run on a phone**, which is
the single fact that most of the rest follows from.

---

## Automated: green

`pnpm verify` runs typecheck, 358 tests across seven packages, content validation,
i18n completeness, contrast, `lint:a11y` and `reachability`. `pnpm e2e` runs 41 steps
against the real Metro bundle in Chromium.

That is a real floor, and it is not the same as done.

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
| Analytics per spec | 🟡 Three events fire. The spec lists more. |
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
4. **A device.** Not something code can fix. Every claim in this repo should be read
   against it — including the haptics above, which is the one feature whose entire
   output is invisible to every test and screenshot we have.
