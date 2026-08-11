# What is left before a TestFlight build

Written 2026-08-11, against `main` at `5e2f048`; revised the same day after review, with
the bundle figures re-measured on this branch.

This is the list. It is deliberately *not* the release checklist — most of what
`docs/engineering/definition-of-done.md` asks for at release is not asked for by
TestFlight, and conflating the two is how a beta gets blocked on store screenshots.

Every row below is evidence from this repo or a named gap. Where something could not be
checked from this environment it says so rather than assuming; where a claim depends on
a schema this environment cannot reach, it is marked `TODO(verify)`.

---

## First: which TestFlight?

The answer changes the list, and the two are usually run together as if they were one
thing.

**Internal testing** — testers who are members of the App Store Connect team for this
app. A build becomes installable within minutes of processing. **No Beta App Review.**
No test information, no screenshots, no marketing copy. This is the one that closes
[`device-pass.md`](device-pass.md), and it is the one this document is scoped to.

**External testing** — anybody else, by email or public link. Apple runs **Beta App
Review** on the first build of each version, and it is a real review: a reviewer opens
the app. That adds a second list, at the bottom.

Two facts about TestFlight worth holding regardless: a build expires 90 days after
upload, and export compliance is already declared, so it will not stop at the upload
prompt. `apps/mobile/app.json` declares it **twice, deliberately** — once as Expo's
`ios.config.usesNonExemptEncryption: false`, which Expo maps to `Info.plist`'s
`ITSAppUsesNonExemptEncryption`, and once as that native key directly under
`ios.infoPlist`. Belt and braces on a declaration whose absence turns every single
upload into a manual questionnaire.

---

## The blockers, in the order they will bite

### 1 · Apple signing credentials — ❌ the one true blocker

A `production` build is a store build, and a store build needs an Apple **distribution
certificate** and an **App Store provisioning profile**. `eas build --non-interactive`
will not mint them — that is in eas-cli's own code, quoted in
[`eas-build-profiles.md`](../engineering/eas-build-profiles.md#ios-signing--the-prerequisite-ci-cannot-satisfy).
It reuses what exists or it throws `MissingCredentialsNonInteractiveError`.

Nothing in this repo, in CI, or in an agent session can fix this. It is one interactive
sitting from a machine logged into the Apple ID that owns the Apple Developer Program
membership for `com.wrexist.worldquest`:

```bash
cd apps/mobile
npx eas credentials     # iOS → production → distribution certificate + App Store profile
```

EAS stores them against the project; every later CI build reuses them.

**Check it costs a second, before the bill:** `pnpm check:ios-creds` with an
`EXPO_TOKEN` set. Both workflows already run it on their cheap job. Note that it is
**fail-open** by design — it passes on no token, no network, or an unexpected response
— so a *pass* from it without a token proves nothing. Read its output, not its exit
code.

### 2 · The app may have no backend in any build profile — ⚠️ `TODO(verify)`, and check this first

`apps/mobile/src/lib/supabase.ts:31-32` reads `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **Neither appears in any profile in
`apps/mobile/eas.json`** — the `env` blocks there set only `EXPO_PUBLIC_ENV`. `.env` is
not committed, correctly.

That is where the evidence stops, and the distinction matters. `eas.json` shows the
*committed* configuration only. EAS Build also injects variables from the EAS
environment a profile resolves to, managed in the Expo dashboard or through
`eas env:set`, and nothing in this repository can see whether those exist. So the honest
statement is conditional: **`isConfigured()` returns false only if the selected EAS
environment supplies neither variable either.** If it does supply them, this row is
already closed and nothing needs doing.

It is first on the list anyway, because it is one command to settle
(`eas env:list --environment production`) and because of what it costs to get wrong.

If it *is* wrong, the failure is not a crash. It is worse in one specific way: it is
silent. Everything gated on `isConfigured()` simply does nothing —

| Gated on `isConfigured()` | What a tester sees |
|---|---|
| `useProgress` (`useProgress.ts:46`) | XP, coins, streak, mastery count all read as a local/zero state |
| `useShop` (`useShop.ts:112,134`) | no purchase, no spend |
| `lib/sync.ts:160` | the offline queue never drains |
| `useSubscriptionSync` (`useSubscriptionSync.ts:54`) | entitlement never syncs |

Everything the repo says is server-authoritative — rule 6 — is exactly the half that is
dark. A device pass on that build verifies the client and proves nothing about the
system.

**Fix, if the check comes back empty:** either add the two variables to the `preview`
and `production` `env` blocks (a publishable key is publishable — `.env.example` already
commits one, and the service-role key is nowhere near the client), or set them as EAS
environment variables scoped to those environments. Either works; the second keeps the
value out of the repo, the first keeps it reviewable in a diff.

### 3 · The build number collides on the second cloud build — ❌ confirmed

`eas.json` sets `cli.appVersionSource: "local"` and `build.production.autoIncrement:
true`. With a *local* version source the increment is written back into `app.json` — on
a GitHub runner whose working tree is discarded at the end of the job. So run #2 and run
#3 both produce the same `CFBundleVersion`, and App Store Connect rejects a build number
it already has for that version string.

The `--local` workflow does not have this problem: `eas-build-local-ios.yml` resolves
the number itself with `scripts/next-build-number.mjs` (App Store Connect lookup + 1,
epoch-seconds fallback) and stamps it into `app.json`. The **cloud** workflow,
`eas-testflight.yml`, does not — it relies on `autoIncrement` alone.

This started as `TODO(verify)` — `docs.expo.dev` is blocked from the environment this
document was written in, and EAS's versioning semantics are not something to state from
memory. It was settled in review against Expo's own build-versioning reference:
with `appVersionSource: "local"` the local project stays the source of truth and EAS
does not write versions to its servers, so nothing carries between runs. Confirmed, not
inferred.

Two fixes, either of which is small:

- **`cli.appVersionSource: "remote"`**, so EAS keeps the counter. Note the migration
  step: an app already known to App Store Connect needs `eas build:version:set` once to
  seed the remote value, or the first remote build starts below what Apple has on file.
- **Reuse `next-build-number.mjs`** in `eas-testflight.yml` exactly as the local
  workflow does — no migration, and it already works in this repo.

Not changed here because it is a one-line edit with an operational tail (the seeding
step, and which of the two the project wants to live with), and this document is the
list rather than the change. Do it before the second build, not after the first one is
rejected.

### 4 · The device pass has never been done — ❌ and it is the point

[`device-pass.md`](device-pass.md) is the checklist, and four Definition of Done boxes
close there and nowhere else: VoiceOver/TalkBack, performance on a mid-tier Android,
whether Nunito actually renders, and haptics. A TestFlight install nobody has opened is
the same unverified state the checklist exists to end.

This is not a blocker *to* the build — it is the reason for it. Listed here so it is not
mistaken for done once the build lands.

### 5 · `eas.json` has never run to completion — ⚠️

Two attempts on 2026-08-09, both dead on config before compiling anything (`$comment`
keys; then no EAS project link). Both causes are now fixed and guarded by `pnpm
check:eas`. The file is still, in the words of its own doc, a first draft. Treat the
first successful build as part of the task.

---

## `eas.json` — the review

Read against the file as committed. Findings beyond the two already listed above:

| # | Finding | Severity |
|---|---|---|
| 1 | No `EXPO_PUBLIC_SUPABASE_*` in any committed profile | ⚠️ `TODO(verify)` — §2. Conditional on what the EAS environment supplies, which is not visible from the repo. |
| 2 | `appVersionSource: "local"` + `autoIncrement` on a cloud CI build | ❌ confirmed — §3. Breaks the *second* build, not the first. |
| 3 | `preview-simulator` has no `env`, so it gets no `EXPO_PUBLIC_ENV` where its sibling `preview` gets `"preview"` | 🟡 **harmless, because the variable is dead.** Nothing in `apps/mobile` reads `EXPO_PUBLIC_ENV` — not a component, not a hook, not even `types/env.d.ts`, which declares the two Supabase keys and a Sentry DSN and not this one. It is set in two profiles and consumed nowhere. The asymmetry is the smaller finding; the dead variable is the real one. Delete it, or give it a reader. |
| 4 | `development` likewise has no `env` | 🟡 moot for the same reason as row 3. A dev client reads a local `.env` regardless. |
| 5 | No `channel` on any profile | 🟡 EAS Update is not wired. Not needed for TestFlight. It *is* worth knowing before the rollback plan's "halt a rollout in minutes" claim is tested — that currently rests on feature flags alone. |
| 6 | `submit` has no `android` block | 🟡 not a TestFlight concern. Play internal testing will need one. |
| 7 | `production` does not set `distribution` | ✅ correct — store is the default. Noted so nobody "fixes" it. |
| 8 | `appleTeamId: "S3U8B8HH96"` is present, but `eas-build-profiles.md` says "`appleTeamId` is still unset" | 📝 doc drift. The doc is wrong; fix the doc. |
| 9 | `eas-testflight.yml:36` points at `docs/engineering/release-checklist.md`, which does not exist | 📝 dead link. Point it at this file and [`device-pass.md`](device-pass.md). |
| 10 | No committed ASC credentials; strict JSON; both named profiles present | ✅ `pnpm check:eas` guards all three |

Nothing in the file is malformed. The gaps are omissions, and one of them (§2) is the
kind that produces a build that runs perfectly and is wrong.

---

## What is honestly ready

Not a formality — this is the part that means the list above is short.

- ✅ `pnpm verify:full` green, per [`definition-of-done-status.md`](definition-of-done-status.md):
  typecheck, 1 002 tests, content validation, i18n, 26 contrast pairs, a11y lint,
  escape-hatches, reachability, five-states, scrollable, economy sim, EAS config check,
  plus `bundle:native`, `e2e` (67 steps) and `a11y:tree` (10 routes). **Re-run it on the
  exact commit you build** — it is fast and it is the whole point of having it.
- ✅ Both native platforms bundle — **4.26 MB of Hermes bytecode each against a 4.3 MB
  gate**, plus 9.70 MB in 345 assets shipped beside the bundle rather than parsed at
  start. Measured by `pnpm bundle:native` on this branch, 2026-08-11, not quoted from
  another document — the first draft of this line said "4.07 against 4.1", which was
  true when `definition-of-done-status.md` recorded it and had been overtaken twice
  since. **0.04 MB of headroom is not headroom**: the next dependency is the one that
  breaks the gate, and that is worth knowing before a build rather than during one.
- ✅ Icon, splash, adaptive icon, favicon — derived by `pnpm build:art` from delivered
  masters, square and alpha-free as App Store Connect requires at upload.
- ✅ iOS privacy manifest: `NSPrivacyTracking: false`, empty collected-data list, one
  required-reason API (UserDefaults, CA92.1). Required since 2024; fails at *upload*
  without it.
- ✅ Android `permissions: []` with `RECORD_AUDIO` explicitly blocked.
- ✅ App Store Connect app record exists (`ascAppId 6799761965`); bundle id
  `com.wrexist.worldquest`. **Unverified from here that the two match** — one lookup in
  App Store Connect settles it, and a mismatch fails at submit.
- ✅ `EXPO_TOKEN` and the three `APP_STORE_CONNECT_*` secrets are present — proven, not
  assumed: run #2 came back with a live build-number lookup of `1`.
- ✅ Security review recorded (`security-review-2026-08.md`); rollback plan written with
  a named decision-maker; feature flags built and their migration applied.
- ✅ i18n complete in `en` and `sv` — 441 keys, ICU plurals, 397 translator notes.

---

## Known-and-accepted for a beta

These are real, they are not blockers for internal testing, and a tester should be told
about them rather than left to find them.

- **Purchases do nothing.** `features/paywall/purchases.ts` exports `UNAVAILABLE`, a
  port that reports the store as unreachable — deliberately not a fake that succeeds, so
  every caller has always had to handle the failure branch. The paywall renders, prices
  come from `SAMPLE_PLANS`, and pressing buy takes the error path. No billing SDK is
  installed. This is fine for internal testing and is a **hard blocker for external
  testing**, where a reviewer will press that button (see below).
- **No crash reporting.** `@sentry/react-native` was removed to hold the bundle budget.
  `ErrorBoundary` reports to a console sink; nothing leaves the device. So a beta crash
  is only as visible as a tester's willingness to describe it. Worth deciding
  consciously before handing builds to people who are not you.
- **Achievement and quest awards are still optimistic** — the unlock is evaluated on
  device; the XP and coins behind a tier are not yet paid by a server path.
- **No sign-in**, so no sign-out. Anonymous session per device. A tester who reinstalls
  starts over, and that will read as a bug unless they are told.
- **Tablet has never been seen.** `supportsTablet` is `true` and no tablet layout has
  ever been rendered anywhere but Chromium at 768.

---

## Not blockers — do not let these hold a beta

Each of these is on the *release* checklist and belongs there.

Store screenshots and metadata · data-safety declarations · staged rollout percentages ·
crash-free-sessions ≥ 99.5 % · release notes in product voice · analytics dashboards ·
a support function. Apple's exact screenshot pixel sizes are `TODO(verify)` in
[`asset-prompts.md §14`](../design/asset-prompts.md) and can stay that way for now.

---

## If you want external testers too

Everything above, plus — because a human reviewer opens the app:

1. **A billing SDK behind the `PurchasePort`.** A paywall that always errors is an
   Apple Guideline 2.1 rejection ("app exhibited bugs"), and if any copy names a price
   it is also a 3.1.1 conversation. The port exists precisely so this is a small,
   contained change: implement `plans` / `purchase` / `restore` / `manageBilling`.
   RevenueCat, StoreKit 2 direct and `react-native-iap` all fit the interface.
2. **Subscription products created and priced** in App Store Connect, in the "Ready to
   Submit" state, with a subscription group — a build referencing product IDs that do
   not exist gets an empty plans list, not an error.
3. **Test information** in App Store Connect: what to test, a beta contact email, and a
   demo path. There is no sign-in, so "just open it" is the honest answer.
4. **The kids question, answered deliberately.** The paywall's parental gate stays
   (Apple requires a gate on the purchase surface), and the app declares no tracking and
   no data collection. If the app is ever put in the Kids Category the rules tighten
   further — that is a product decision, not a config one, and it should be made before
   the first external build rather than after a rejection.

---

## The order

1. `eas env:list` — one command, and it decides whether §2 is a blocker or already
   closed. Cheapest thing on the list; do it before anything else.
2. `npx eas credentials` — one interactive sitting, and nothing on the TestFlight route
   can start until it exists. *(Only Isac can do this.)*
3. Fix the build number (§3) — five minutes now, a rejected submit later.
4. `pnpm verify:full` on the commit you are about to build.
5. `pnpm check:ios-creds` with `EXPO_TOKEN`, and *read the output* — it is fail-open,
   so its exit code is not the answer.
6. Run the **iOS TestFlight** workflow.
7. Install it and walk [`device-pass.md`](device-pass.md) end to end. That is the
   deliverable, not the build.

Steps 1, 3 and 5 are the ones that are cheap now and expensive after a macOS runner has
been paid for. That is the whole reason this document is ordered the way it is.

**And if all you want is the device pass**, steps 2, 3 and 6 are not on your path at
all: `--profile preview` builds an installable app with no store, no App Store
certificate and no build numbering, needing only your test devices' UDIDs registered.
See [`device-pass.md`](device-pass.md), which now names both routes.
