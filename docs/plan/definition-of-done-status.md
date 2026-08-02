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
| Haptics on every meaningful outcome | ⬜ **Not implemented at all.** No `expo-haptics` anywhere. `apps/mobile/CLAUDE.md` specifies `impactMedium` on a wrong answer; nothing fires. |
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

## The four that are not "not yet" but "never started"

1. **Haptics.** Specified, zero implementation.
2. **Sound.** A settings toggle wired to nothing.
3. **Sentry.** An error boundary that logs to a console nobody reads in production.
4. **A device.** Everything above ultimately reduces to this one.

The first three are buildable now and are the honest next wave. The fourth is not
something code can fix, and every claim in this repo should be read against it.
