# iOS launch audit, 25 September 2026

Three read-only audits of `claude/ios-launch-readiness-cc9070` at `d4d8de6`, run in
parallel: Duolingo workflow/popup parity, App Store submission readiness, and the
D1 backend cutover. Baseline `pnpm verify` passed at that revision on Windows.
This file ranks what they found. The [execution checklist](execution-plan.md)
stays canonical for audit IDs; this is the working order for the iOS release.

Duolingo behaviour below is from knowledge of the 2025–26 iOS app, not a fresh
device teardown (P03 remains open). Where exact parity would break rule 7 or the
notification rules, the ethical equivalent is listed instead of the copy.

## Ranked work fixable in this repository

Status: ✅ done on this branch · ⏳ in progress · ☐ open.

| # | Pri | Item | Closes | Status |
|---|---|---|---|---|
| 1 | P0 | Cloud TestFlight builds reuse one build number | A10 | ✅ `3d9164c` |
| 2 | P0 | Privacy manifest said "collects nothing"; generic microphone string | A07/S09 (manifest part) | ✅ `3d9164c` |
| 3 | P0 | First lesson ends on a paywall with nothing to buy; Restore does nothing | U03, A02 scope | ✅ `SELLING` gate; paywall/Premium/Restore return with a real port (A01) |
| 4 | P0 | Streak-extended celebration and quest progress never shown (flag seeded off, read only via legacy adapter); rate prompt unreachable | Duolingo parity | ✅ `afterLesson.ts` chain: summary → streak → quest → (paywall) → Home; e2e asserted |
| 5 | P0 | Account link/sign-in without in-app deletion on the shipping route | A06/S07, 5.1.1(v) | ✅ on D1 builds: D1 account route deletes in-app; Settings › Privacy › Delete account (`8a09aa9`) |
| 6 | P0 | Worker: injected clock + stored IANA time zone + local-day rules | S14, prerequisite for E10 | ✅ migration 0007; DST + time-zone-move proof on workerd |
| 7 | P0 | Worker: streaks, hearts, canonical quests, achievements in the revision-guarded batch | B04/B05/S04/S05/E03/S12 | ✅ streaks, milestones, quests, server hearts replay, achievements (migrations 0007–0010, workerd proofs) |
| 8 | P0 | Worker: freeze/repair/continue/shop spending with idempotency keys | S06/B09/A04 | ✅ migration 0009; S06 race, replay and cooldown proofs |
| 9 | P0 | App: D1 repository adapter + backend switch; route `D1AccountScreen` | B07/S01/B02 (code part) | ✅ repository, `EXPO_PUBLIC_BACKEND=d1` switch, D1 account route + storage host, server-issued lessons with offline tickets, D1 queue in the sync loop, server quest on the Quests tab |
| 10 | P0 | App: hydrate memory from `/v1/learning/state`, replay queue on top | L01/L06/B06 | ✅ on D1: server composes from its memory; account-scoped cache of `/v1/learning/state` refreshed after each receipt (legacy path still empty) |
| 11 | P0 | Connected multi-day journey test on real workerd | E10/E11 | ✅ `pnpm e2e:d1` 31/31 on the real bundle and real Worker: online, streak beat, server quest, offline ticket, reconnect sync, ledger; then link, a second phone signing in, both phones learning on one account, sign-out, sign-in again, deletion, and a child's phone (protected on the server, no email asked). 33/33. Concurrent submission (E11) still open |
| 12 | P1 | Lesson player: select-then-CHECK | Duolingo parity, L05 (timer now stops at Check; L05 itself stays open) | ✅ `feat/lesson-check-sheet`; SELECT/CHECK in the engine machine, e2e asserted |
| 13 | P1 | Answer sheet slides up with calm tint (motion tokens, Reduce Motion) | Duolingo parity | ✅ `feat/lesson-check-sheet`; `useRiseIn`, `feedback.*Edge` tokens; device pass for VoiceOver focus still owed |
| 14 | P1 | "Report a problem" on the answer sheet | G08, content-pipeline §report | ✅ on D1 builds: reasons only, idempotent, 30/day, erased with the account; in `pnpm e2e:d1` |
| 15 | P1 | Mistake review at lesson end (needs learning-science sign-off) | Duolingo parity, L03 | ✅ missed questions re-asked once, practice only (no hearts, XP or scheduling); relearning-step review by learning science still open |
| 16 | P1 | "Create a profile" sheet after lesson 1–2, adults only, max twice | Duolingo parity | ✅ after lesson 1–2, adults only, twice max, after server confirms no email; copy promises only what linking does (`d8c6016`) |
| 17 | P1 | Achievement-unlocked full-screen card queue | Duolingo parity | ✅ card per tier after the summary; on D1 from server receipts only |
| 18 | P1 | Home card when a freeze was used / repair is available | Duolingo parity | ✅ freeze-kept and repair-open cards on Home; component and static-render evidence (no web backend) |
| 19 | P1 | Paywall footer: period, auto-renew, Terms/Privacy links (when IAP ships) | 3.1.2 | ☐ |
| 20 | P1 | Hide analytics opt-out toggle until analytics has a transport | honesty, G02 | ✅ hidden behind `ANALYTICS_CONNECTED` until G02 (`8a09aa9`) |
| 21 | P1 | `supportsTablet: true` with no iPad pass | A11 | ☐ owner decision |
| 22 | P2 | Summary: time card + staggered reveal; combo glow on progress bar | parity polish | ✅ time tile (answering time, neutral colour, never "speed"), tiles two by two and dealt in with `useStagger`; the lesson bar turns flame from three right in a row, the moment the sheet says "on a roll" |
| 23 | P2 | Month streak calendar; share streak (hidden for children) | parity polish | ✅ month calendar from the on-device lesson log (runs drawn as one pill, the week starting where the phone's does, grid hidden from screen readers behind a count); "Share your streak" opens the system share sheet for confirmed adults only, with no link and no tracking |
| 24 | P1 | Course path on Home (units/nodes) | L08/P07/U05 | ☐ Phase 3 |
| 25 | P1 | Web harness: previous tab's content shows through a newly selected tab (transparent scenes) | U09 | ☐ check on device first |
| 26 | P1 | Euro distractor capitalised ("Euro" among lowercase short names) gave the answer away | L14 | ✅ euro short names, currencies pack 1.0.1 |
| 27 | P0 | Signing in on a new phone: "I already have an account" bounced back to onboarding; the account screen then offered "Start as guest"; after signing in, onboarding started again | U04, B02 (web part) | ✅ gate lets `/account` through; `?mode=signIn` opens on signing in; a sign-in finishes onboarding in the account's scope; `pnpm e2e:d1` second phone |
| 28 | P0 | Every identity change remounts the app, so the account screen lost its flow: no "Your email is linked" or "Welcome back", and a refused code left the device paused in an empty guest scope (onboarding again) | S01, B02 | ✅ flow state outlives the screen; the host reopens the paused owner on a refusal; component and host tests |
| 29 | P0 | Onboarding's birth year never reached the server: every guest `unknown`, adults asked twice, children unprotected server-side until the account screen | S02 | ✅ age band sent when onboarding finishes (or when a later guest is made); the Worker keeps the band only |

## Deliberately not copied from Duolingo

| Duolingo | Rule | WorldQuest instead |
|---|---|---|
| Hearts refill on a timer or for gems; Super offered from out-of-hearts | Rule 7 | Hearts reset per lesson; coin continue; no paywall for children |
| "Wait, don't go! You'll lose your progress" | Rule 7 | `Paused`: "Keep going" / "End now, your answers are saved" |
| Notification ask at first launch; guilt pushes | notifications skill | Ask after lesson 3; no-guilt copy, 2/day budget |
| Streak-loss warnings, demotion in red, Streak Society | Rule 7 | Celebrate milestones; repair window stated plainly |
| Friend suggestions, contact sync | Rule 7, roadmap v2 | Deferred; hidden for children |
| Gems | ADR 0011 | Coins only |

## Owner actions no code can close

1. `cd apps/mobile && npx eas credentials` → iOS → production: distribution certificate and App Store profile. Then `pnpm check:ios-creds` with `EXPO_TOKEN` and read its output.
2. App Store Connect: age rating, Kids Category decision (S15), App Privacy label matching the manifest above, EU trader status, agreements/tax/banking.
3. Domain: publish privacy, terms, support and licence pages, then set `EXPO_PUBLIC_PRIVACY_URL`, `_TERMS_URL`, `_LICENCES_URL` and `_SUPPORT_URL` in the EAS production environment (`src/lib/links.ts`); no code change needed.
4. Production backend: an email sender, remote migrations 0002–0009 and a deployed Worker with `API_ENABLED=true`, then `EXPO_PUBLIC_BACKEND=d1` and `EXPO_PUBLIC_D1_URL` in the EAS production environment.
5. Real-device TestFlight pass (A11/U09–U13) and review notes stating guest mode needs no login (A13).
