# Handoff — the work that cannot be done in a container

Everything in the release checklist that a coding agent in this repo genuinely cannot
close, written as prompts you can hand to Claude Cowork (or a person) without needing this
conversation's context. One prompt per task, self-contained, with the evidence trail
already gathered.

**Read this first:** each item below is blocked on a *device*, an *account*, or a
*person* — not on effort. Anything that was blocked only on effort has already been done;
see `docs/plan/definition-of-done-status.md` for what is closed and
`docs/engineering/security-review-2026-08.md` for the review that was outstanding.

Ordered by what unblocks the most downstream work. **§3 is the one to do first** — it is
a two-minute dashboard change, and until it is done the account flow that shipped in
PR #11 fails for every user in exactly the same way.

Last refreshed 2026-08-15, after PR #11 merged. Items 3 and 4 are new; the old §3 (feature
flags) is closed and moved to the table at the bottom.

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
> **Analytics:** 18 of 28 declared events fire; the rest are blocked on a server, an
> account, or push. See `docs/engineering/analytics-spec.md` for the registry. Stand up
> the backend, then build the dashboards the release checklist asks for. Note that
> `lib/analytics.ts` no-ops for child accounts and treats an unknown age as a child —
> verify that holds against real traffic, because it is a COPPA commitment and not a
> preference.
>
> Then run a beta by persona (`docs/product/personas.md`) and report the crash-free rate.

---

## 3 · The Supabase email templates — a shipped feature is broken until this is done

**Needs:** Supabase dashboard access. Two minutes, no code.
**Closes:** accounts working at all. This is the highest-priority item on this page.

Accounts shipped in PR #11: a user adds an email, gets a **six-digit code**, and types it
back into the app. Supabase's default templates send `{{ .ConfirmationURL }}` — a magic
link. Against the defaults every account attempt fails in exactly the same way: the user
receives an email containing a link and no number, and the app sits waiting for six digits
they do not have. Nothing in the code can detect or work around this.

> In the Supabase dashboard for the WorldQuest project, go to **Authentication → Email
> Templates**. Edit both the **Magic Link** and the **Change Email Address** templates so
> each includes `{{ .Token }}` — the six-digit code — rather than only
> `{{ .ConfirmationURL }}`. Keep the link if you like; the code is what the app reads.
>
> Then verify end to end on a real build: Settings → Account → "Save your progress",
> enter an address, and confirm the email contains six digits and that entering them
> completes the flow. Do the same for "I already have an account" on a second device.
>
> The symptom to watch for in support afterwards is several users at once saying "I never
> got a code" while the email they received contained a link — that is this setting, not a
> bug. It is written up in `docs/product/support-notes.md`.

---

## 4 · Raising the league flag — needs production data, not more code

**Needs:** a deployed database with real users on it, and someone to watch two numbers.
**Closes:** the league actually existing for anyone.

Everything is built and merged. The engine, the schema, the RLS (35/35 tests green in CI),
the screen, the Home chip, the Settings opt-out, and — as of `20260815110000` — the weekly
placement, scoring and close-week jobs. The flag `weekly_league` is seeded at
`enabled = false, rollout_percent = 0`, deliberately.

> In the WorldQuest project's database, bring the weekly league up carefully.
>
> **First, prove the jobs run.** They are scheduled with pg_cron, but the migration
> degrades to a notice if pg_cron is laid out differently on the host — so check the
> schedule exists before assuming it does:
>
> ```sql
> select jobname, schedule from cron.job where jobname like 'league-%';
> -- expect: league-refresh-xp '13 * * * *', league-place '19 * * * *', league-close '5 0 * * 1'
> ```
>
> If they are missing, schedule them by hand with those cron expressions. Then run each
> once manually and check the return value is sane rather than an error:
>
> ```sql
> select public.league_place_members();   -- users placed
> select public.league_refresh_xp();      -- rows whose weekly_xp changed
> select public.league_close_week();      -- cohorts closed (0 until a week has passed)
> ```
>
> **Then check the shape of what it produced**, because this is the part no test can
> reach — cohort sizes and band spread only exist once real people are in them:
>
> ```sql
> select c.tier, c.division, c.band, count(*) as members
>   from public.league_cohorts c join public.league_members m on m.cohort_id = c.id
>  where c.week_id = (date_trunc('week', now() at time zone 'utc'))::date
>  group by 1,2,3 order by 1,2,3;
> ```
>
> A healthy result is cohorts of roughly 20–30. A long tail of cohorts with 2 or 3 members
> means the band buckets are too narrow for the population size — widen `league_band` so
> more people share a band, rather than shipping leagues where a user competes with two
> other people and always finishes third.
>
> **Only then raise the flag**, one step at a time:
>
> ```sql
> update public.feature_flags set enabled = true, rollout_percent = 5
>  where key = 'weekly_league';
> ```
>
> **What to watch is not engagement.** `docs/systems/social-and-leagues.md` §4 exists
> because a leaderboard can raise engagement while making the product worse. The two
> numbers that decide whether this stays are **next-day return among users in the bottom
> half of a cohort**, and the **opt-out rate**. If people who are losing stop coming back,
> the feature is working exactly as designed and should be removed anyway. Halt with
> `enabled = false`, which reaches a foregrounded device within one poll interval.
>
> Under-13 accounts must never appear. They are blocked three times over — a trigger, the
> RLS, and a client that does not send the query — but confirm it once with real data:
>
> ```sql
> select count(*) from public.league_members m
>   join public.profiles p on p.id = m.user_id where p.is_child;
> -- must be 0, always
> ```

---

## 5 · Store submission and the data-safety declaration

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

## 6 · Two illustrations — blocked on credits, and one on licensing

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

## 7 · Decisions only a person can make

Neither is a task. Both block a checklist box. The first now has a measurement task in
front of it, which is worth doing before deciding.

### The bundle is at the wall, and the next change fails CI

The contradiction this section used to describe is resolved. Sentry was removed on
2026-08-09 to hold the budget rather than raise it (see the header of
`apps/mobile/src/lib/reporting.ts` for that decision and what it cost), and the gate came
back down: **4.6 MiB**, against a current bundle of **4.60 MiB**. It passes by nothing at
all, which means the next line of application code fails CI.

Two things are already known, so nobody has to rediscover them:

- **The documented target is 4 MB and the gate is 4.6 MiB.** `PROJECT.md:297`,
  `architecture.md:187` and `testing-strategy.md:156` all say 4; the gate has been raised
  three times with the reason recorded each time. The unit matters: `bundle-native.cjs`
  divides by 1024 twice, so its numbers are MiB while the documented 4 is unqualified. If
  the target was ever meant as decimal MB it is 3.81 MiB. Pick the number *and* the unit.
- **Deduplicating repeated strings does nothing.** This was tried: 45.5 KB of identical
  `license`/`attribution` strings were collapsed out of the content packs and the bundle
  moved by 0.00 MB, because Hermes already deduplicates strings into its bytecode string
  table. `flag-icons` appears **once** in the compiled output despite sixty-five source
  copies. The command that proves it is in `bundle-native.cjs`. Do not spend an afternoon
  on "the same string is repeated N times" — it is never a lever here.

**What has never been measured is where the 4.6 MiB actually goes.** That is the next
step and it is a task, not a decision:

> In the WorldQuest repo, measure the native bundle's real composition and report it.
>
> ```bash
> npx expo export --platform android --dump-sourcemap
> ```
>
> Attribute the bytes to modules — `source-map-explorer` or equivalent over the emitted
> map. Then say plainly which three things dominate and what each would cost to remove or
> defer. Note that Metro has no route-level code splitting on native, so "lazy load it"
> does not reduce shipped bytes; it only defers evaluation. Only removing a dependency, or
> not writing the code, actually recovers budget.
>
> Do not raise `BUDGET_MB` as part of this. Raising it is the decision below; measuring is
> what makes that decision informed rather than a shrug.

The decision that follows the measurement: hold 4 MB and cut something real, or raise the
documented number to match reality. `PROJECT.md` is edited deliberately, so an agent
should not pick this unilaterally — but with 0.00 MiB of headroom, the next feature forces
the question whether or not anyone chooses to answer it.

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
| Support docs | `docs/support/known-issues.md` and `docs/product/support-notes.md` — the questions users will ask and the honest answer to each. What still needs a person is a support *function* to hand it to. |
| Feature flags | Built. `feature_flags` table, client bucketing by `hash(key + userId) % 100`, closed by default. Three flags seeded off: `quest_cover_page`, `quest_completion_screen`, `weekly_league`. This was §3 of this document and is no longer a blocker. |
| Accounts | Built and merged — email + six-digit code, linking in place so no progress moves. Blocked only on §3 above, which is a dashboard setting. |
| The daily reminder | Built. Local notifications, quiet hours in a tested engine, permission asked after the third lesson. Delivery on a real device is part of §1. |
| The store-review prompt | Built. Cannot fire in TestFlight by design, so §1 is where it gets seen. |
| Leagues | Built end to end, including the weekly placement/scoring/close jobs. Flag closed; raising it is §4. |
