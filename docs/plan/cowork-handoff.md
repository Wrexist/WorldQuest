# Handoff — the work that cannot be done in a container

Everything in the release checklist that a coding agent in this repo genuinely cannot
close, written as prompts you can hand to Claude Cowork (or a person) without needing this
conversation's context. One prompt per task, self-contained, with the evidence trail
already gathered.

**Read this first:** each item below is blocked on a *device*, an *account*, or a
*person* — not on effort. Anything that was blocked only on effort has already been done;
see `docs/plan/definition-of-done-status.md` for what is closed and
`docs/engineering/security-review-2026-08.md` for the review that was outstanding.

Ordered by what unblocks the most downstream work.

---

## 1 · The device pass — blocks four checklist boxes at once

**Needs:** an Expo account, and **both** an Android phone and an iPhone to close this
fully — one device closes only its own platform.
**Closes:** real-device E2E, **device** performance budgets (cold start and frame rate —
*not* the bundle budget, which is unresolved and is a decision, see §6), and the device
halves of haptics and reduced motion. Screen readers split by platform: TalkBack needs
Android, VoiceOver needs iOS, and neither substitutes for the other.

> I have a physical device and an Expo account. In the WorldQuest repo, work through
> `docs/plan/device-pass.md` end to end and record the result in that file as you go,
> ticking each box or writing what actually happened instead.
>
> ```bash
> npx eas build --profile preview --platform android   # .apk, sideload it
> npx eas build --profile preview --platform ios       # internal distribution
> ```
>
> `eas.json` was written from the documented schema and **has never been run** — treat the
> first build as part of the task, not as setup that will obviously work.
>
> **Do both platforms if you have both devices, and if you only have one, say which.** The
> screen-reader box cannot be closed by one device: TalkBack is Android and VoiceOver is
> iOS, and passing one tells you nothing about the other. Leave the untested platform's box
> open rather than ticking the row. If you only have one device, do **Android** — wider
> hardware spread, worse average performance, and the accessibility service that behaves
> least like the web.
>
> Four things to be especially suspicious of, because nothing has ever seen them:
> - **Tablet layout.** `supportsTablet` was `false` until that document was written and is
>   now `true`, and the design system defines an `lg ≥ 600` breakpoint with a two-column
>   Explore that has never rendered on hardware. Expect problems here.
> - **Fonts.** If headings render in the system font rather than a round heavy Nunito,
>   `useAppFonts` failed silently — that is a real bug, not a cosmetic one.
> - **The lesson at 320×568.** It compacts below a 700pt viewport height
>   (`SHORT_SCREEN` in `LessonScreen.tsx`). Confirm all four answer options are visible
>   and tappable without scrolling on the smallest phone you have.
> - **Cold start.** The budget is under 2.0 seconds. Measure it, do not estimate it.
>
> Every layout claim in this repo is a claim about react-native-web in Chromium. You are
> the first person to check any of them against a real screen — where the harness and the
> device disagree, the device is right and the repo comment is the bug.

---

## 2 · Telemetry, then a beta — blocks the crash-free number and the dashboards

**Needs:** a Sentry account (or equivalent) and an analytics backend.
**Closes:** crash-free ≥ 99.5 % in beta, analytics dashboards, and finding 2 of the
security review.

> In the WorldQuest repo, wire up real telemetry and verify it end to end.
>
> **Sentry:** `apps/mobile/src/lib/reporting.ts` is built and never proven —
> `Sentry.init` only runs when `EXPO_PUBLIC_SENTRY_DSN` is set, and no DSN has ever
> existed, so no crash report has ever left a device. Set a DSN in a staging build,
> trigger a crash, and confirm an event arrives.
>
> **The property that must survive:** the payload carries no message text, enforced by the
> `CrashReport` type having no field that can hold free text. A React error string
> routinely contains a prop value, and in this app a prop value can be something a child
> typed into the collection search. When you verify the event, check the *absence* of a
> message field, and do not "improve" the integration by adding one.
>
> **Analytics:** 32 of 44 declared events fire (audited 2026-08-19); the rest are blocked on a server, an
> account, or push. See `docs/engineering/analytics-spec.md` for the registry. Stand up
> the backend, then build the dashboards the release checklist asks for. Note that
> `lib/analytics.ts` no-ops for child accounts and treats an unknown age as a child —
> verify that holds against real traffic, because it is a COPPA commitment and not a
> preference.
>
> Then run a beta by persona (`docs/product/personas.md`) and report the crash-free rate.

---

## 3 · Feature flags — blocks the staged rollout, and the rollback plan depends on it

**Needs:** a product decision about where flags live (remote config vs. Supabase table).
**Closes:** the staged-rollout box, and step 3 of `docs/engineering/rollback-plan.md`.

> In the WorldQuest repo, design and build the feature-flag system for a staged rollout.
> **It does not exist** — `docs/plan/build-order.md:97` describes the ladder
> (5 → 25 → 50 → 100 %) as intent, and there is no flag store, no remote config, and no
> gating anywhere in the code.
>
> Read `docs/engineering/rollback-plan.md` first: it explains why this matters more here
> than in a typical app. The app binary cannot be recalled, so a flag is the only way to
> turn something off without shipping a new version, and without one every release is
> 100 % on arrival.
>
> Constraints from this repo that will shape the design:
> - The server is authoritative for rewards and entitlements; flags must not become a
>   second, client-trusted source of truth about what a user is entitled to.
> - The app works offline by design. A flag system that fails closed on a metro train
>   turns a working app into a broken one — decide the offline default deliberately and
>   write down why.
> - Kids are users. No flag may enable third-party tracking on a child account.
>
> Propose the design before building it; this is architectural.

---

## 4 · Store submission and the data-safety declaration

**Needs:** App Store Connect and Play Console access, and a human who can sign.
**Closes:** "store metadata, screenshots and data-safety declarations match reality
exactly".

> In the WorldQuest repo, prepare and verify the store submissions.
>
> The assets exist and are derived rather than hand-made: `pnpm build:store` produces the
> icons, feature graphic and wordmarks from delivered masters, and there are 6 iPhone and
> 6 iPad screenshots under `docs/design/assets/store/`. The iOS privacy manifest is in
> `apps/mobile/app.json` — `NSPrivacyTracking: false`, empty `NSPrivacyCollectedDataTypes`,
> `permissions: []`, microphone blocked on Android.
>
> **The part that needs you rather than a script:** the checklist says the declaration must
> match reality *exactly*, and nobody has compared it against what the app actually sends.
> Once telemetry is live (task 2), watch real traffic from a real build and confirm the
> declaration is still true. If Sentry or analytics send anything the manifest does not
> declare, the manifest is wrong and fixing the manifest is not the fix.
>
> Also confirm: the app declares an under-13 audience path, and Apple requires commerce
> behind a parental gate for that audience. `SettingsScreen` omits the premium section
> entirely for child accounts by design — check that this satisfies the reviewer rather
> than assuming it does.

---

## 5 · Two illustrations — blocked on credits, and one on licensing

**Needs:** image-generation credits; and for the second, a licensing decision.
**Closes:** the last two rows of `docs/design/mockup-fidelity.md`.

> In the WorldQuest repo, finish the two remaining illustrations.
>
> **`progress/globe` (§10):** fully briefed in `docs/design/asset-prompts.md` and
> preflighted at 2 credits. The only blocker was "Out of credits in the selected
> workspace". Generate it, then run `pnpm build:art` to derive the app variants.
>
> **§8b continent silhouettes:** blocked on credits *and* on subject matter. Each needs a
> recognisable landmark per continent, and `docs/systems/content-pipeline.md` forbids
> improvising around encumbered or politically contested subjects. Pick subjects that are
> unambiguously unencumbered before generating anything — that is a judgement call a
> credit top-up does not resolve.
>
> **Do not hand-draw a replacement for anything you cannot generate.** A hand-drawn flag
> or an invented coastline is a wrong fact in a learning app, and an invented border is a
> political claim. `pnpm build:flags` and `pnpm build:maps` both exit rather than guess,
> and so should you.

---

## 6 · Two decisions only a person can make

Neither is a task. Both block a checklist box.

### The bundle budget contradicts itself

`PROJECT.md:297`, `docs/engineering/architecture.md:187` and
`docs/engineering/testing-strategy.md:156` all say the mobile bundle must be **under
4 MB**. The enforced gate in `scripts/bundle-native.cjs` is **6.0 MB**, raised from 4.5
when `@sentry/react-native` added 1.92 MB — with the reasoning recorded in that file. The
current bundle is **5.93 MB**: it passes the gate and fails the constitution.

One wrinkle worth knowing before deciding: `bundle-native.cjs` divides bytes by 1024 twice, so its 6.0 and 5.93 are **MiB**, while the documented 4 is unqualified. If the target was ever meant as decimal MB it is 3.81 MiB, and the gap is wider than it looks. The docs were not silently reunitised — inventing a stricter target while recording a contradiction would be its own small dishonesty — so pick the number *and* its unit.

Someone has to decide which number is real. The options are genuinely different products:
raise the documented budget and accept the size for crash visibility, or hold 4 MB and
drop or lazy-load Sentry. `PROJECT.md` is edited deliberately, so an agent should not pick
this unilaterally — and 0.07 MB of headroom means the next dependency forces the question
anyway.

### Waiver owners, and the rollback decision-maker

The release checklist asks that every waiver carry an owner and a dated issue, and that a
rollback decision-maker be named and available for 48 hours. `docs/plan/*.md` currently
names **nobody**, and every "built but unverified" row in
`definition-of-done-status.md` is owned by no one. That is how a waiver quietly becomes a
permanent exemption. Names cannot be invented from inside the repo.

---

## What is already closed, so nobody redoes it

| Was ❌ | Now |
|---|---|
| Security review | `docs/engineering/security-review-2026-08.md` — no blocker, two ⚠️ findings recorded |
| Rollback plan | `docs/engineering/rollback-plan.md` |
| Release notes | `docs/release-notes.md` — drafted, marked pending the device pass |
| Pseudo-locale screenshots | `pnpm design:shots` runs an `en-XA` pass over 6 routes × 3 viewports; clean at +40 % inflation |
| Support docs | `docs/support/known-issues.md` — the questions users will ask and the honest answer to each, plus the known-issues table. What still needs a person is a support *function* to hand it to. |
