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
| 5 | P0 | Account link/sign-in without in-app deletion on the shipping route | A06/S07, 5.1.1(v) | ☐ |
| 6 | P0 | Worker: injected clock + stored IANA time zone + local-day rules | S14, prerequisite for E10 | ✅ migration 0007; DST + time-zone-move proof on workerd |
| 7 | P0 | Worker: streaks, hearts, canonical quests, achievements in the revision-guarded batch | B04/B05/S04/S05/E03/S12 | ⏳ streak + milestones done; quests/hearts/achievements open |
| 8 | P0 | Worker: freeze/repair/continue/shop spending with idempotency keys | S06/B09/A04 | ☐ |
| 9 | P0 | App: D1 repository adapter + backend switch; route `D1AccountScreen` | B07/S01/B02 (code part) | ☐ |
| 10 | P0 | App: hydrate memory from `/v1/learning/state`, replay queue on top | L01/L06/B06 | ☐ |
| 11 | P0 | Connected multi-day journey test on real workerd | E10/E11 | ☐ |
| 12 | P1 | Lesson player: select-then-CHECK | Duolingo parity, L05 | ☐ |
| 13 | P1 | Answer sheet slides up with calm tint (motion tokens, Reduce Motion) | Duolingo parity | ☐ |
| 14 | P1 | "Report a problem" on the answer sheet | G08, content-pipeline §report | ☐ |
| 15 | P1 | Mistake review at lesson end (needs learning-science sign-off) | Duolingo parity, L03 | ☐ |
| 16 | P1 | "Create a profile" sheet after lesson 1–2, adults only, max twice | Duolingo parity | ☐ |
| 17 | P1 | Achievement-unlocked full-screen card queue | Duolingo parity | ☐ |
| 18 | P1 | Home card when a freeze was used / repair is available | Duolingo parity | ☐ |
| 19 | P1 | Paywall footer: period, auto-renew, Terms/Privacy links (when IAP ships) | 3.1.2 | ☐ |
| 20 | P1 | Hide analytics opt-out toggle until analytics has a transport | honesty, G02 | ☐ |
| 21 | P1 | `supportsTablet: true` with no iPad pass | A11 | ☐ owner decision |
| 22 | P2 | Summary: time card + staggered reveal; combo glow on progress bar | parity polish | ☐ |
| 23 | P2 | Month streak calendar; share streak (hidden for children) | parity polish | ☐ |
| 24 | P1 | Course path on Home (units/nodes) | L08/P07/U05 | ☐ Phase 3 |

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
3. Domain: publish privacy, terms, support and licence pages; the app's links in `app/settings.tsx:44-46` are still `undefined`.
4. Production backend: an email sender and a deployed Worker with `API_ENABLED=true`, or `EXPO_PUBLIC_SUPABASE_*` in the EAS production environment.
5. Real-device TestFlight pass (A11/U09–U13) and review notes stating guest mode needs no login (A13).
