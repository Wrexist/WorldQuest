# WorldQuest launch brief

Decision: 13 September 2026. Scope confirmed by the owner: **worldwide English/Swedish launch**. This is the launch target, not a claim that this build is ready for public distribution. [Execution checklist](../plan/execution-plan.md) governs release.

## Audience and reason to choose us

The initial audience is geography beginners aged 16–24 who want to recognize countries, flags and capitals in everyday life. Alex (18) represents curiosity and visible progress; Priya (24) represents a calm practice habit that fits around work. Recruit English- and Swedish-speaking testers internationally, rather than restricting the beta to Sweden. Keep the broader personas, including younger learners; targeting adults in marketing does not remove child protections.

Job: “When I see a flag, place name or country in the news, I want to recognize it and know where it belongs, without committing to a long study session.”

Promise: **Practice recognizing countries, flags and capitals in short daily geography sessions.** Five minutes describes a session target, never a guaranteed learning speed. Our ambition is to earn a daily habit through useful geographic ability, accurate content, clear feedback and dependable progress. “Best Duolingo competitor” is an internal ambition; WorldQuest does not teach languages and must not imply otherwise in the listing.

Worldwide means every storefront the eventual release is eligible to serve, with English and Swedish UI/content. Store availability, territorial restrictions, local child-consent requirements, payments and privacy disclosures must be checked in S15/A01–A18 before release. Do not silently select a Sweden-only rollout or treat English availability as worldwide legal clearance. If a territory cannot be supported, record the specific exception and obtain the owner's release decision.

## First week: World foundations

One course, with a default five-minute session. New learners get **Continue today's lesson** as the one green primary recommendation. Explore, collection and optional challenges stay secondary. Resume an unfinished lesson first, then due reviews, then the next course segment; do not ask the learner to choose among five competing courses. Home's one green action is now the course path's current step (the quest card is secondary below it); resuming an unfinished lesson (E02/U08) and putting due reviews ahead of the next segment are not built yet — a step's lesson serves its own due facts first, nothing more.

| Day | Practice objective | Candidate pack entities | Evidence of learning |
|---|---|---|---|
| 1 | Connect familiar flags to countries | SE, NO, US, JP | Identify each in a short baseline; introduce and retest mistakes |
| 2 | Locate the same countries by region | Same four, plus BR and KE | Correct location on an accessible map/text equivalent |
| 3 | Connect capitals to those six countries | Reuse days 1–2 | Recall after explanation, with new distractor order |
| 4 | Broaden recognition across continents | CA, MX, FR, DE, IN, AU | Distinguish new flags and locations from familiar ones |
| 5 | Add capitals and revisit confusion | Reuse all twelve | Retry mistaken pairs without repeating an identical quiz |
| 6 | Mix flag, location and capital directions | All twelve | Answer mixed questions; keep accessible equivalents equivalent |
| 7 | Check what remains after a delay | All twelve; due work first | Compare with baseline; report correct answers and uncertainty |

Implemented as `packages/content/packs/courses/first-week.v1.json` (v1.0.0): one step per day, in two units, each step completed by two finished lessons (the check by one). **One deviation, awaiting the owner's and an editor's approval:** day 1 practises the flags of all six countries days 2–3 use (SE, NO, US, JP, BR, KE), not only the first four. Each fact is asked once per lesson, and the D1 Worker refuses a focused lesson under five questions (`FOCUS_TOO_NARROW`), so four flags would open the course on an empty lesson; it also introduces BR and KE flags before day 6 mixes them. Day 7 has no time gate yet: the check opens when day 6 is done and relies on due-first composition. `pnpm content:validate` composes every step with the real engine and fails one that cannot fill a lesson.

Country IDs above are curriculum candidates drawn from existing entities; display names and facts always come from packs. This is a course specification, not a shipped seven-day scheduler. Phase 3 must implement versioned course data, explanations, delayed review, accessible template diversity and native-speaker editorial approval. Do not claim “twelve countries mastered” after recognition practice. Calling codes, currencies and broader geography stay available for exploration; they are not the beginner course's primary sequence.

## Claim ledger

| Surface | Allowed now | Held until demonstrated |
|---|---|---|
| Onboarding | Short practice; flags/capitals/locations; country count supplied by content | Permanent retention, “before you forget,” all countries on Earth, automatic cross-session adaptation |
| Home | One daily quest; actual lesson/XP counts; pack-derived totals | Validated mastery and due-history accuracy until Phase 2 hydration and Phase 3 assessment pass |
| Account | Link an email and sign in; say recovery is being tested | “Every fact on any phone,” complete backup, all local data erased at sign-out |
| Paywall | No plans in this build; every lesson remains free; dismissible | Premium perks without store/entitlement support, forecast countries/week, guaranteed no charge after ambiguous failures |
| Listing | Geography practice, English/Swedish, available content types | Scientific efficacy, full-world coverage, reliable multi-device recovery, paid/offline extras, live friends |

The runtime's unavailable purchase port returns no products; no-price screens hide Premium perk claims. The priced layouts remain preparatory UI exercised with sample plans in tests. Enabling a billing adapter requires the Phase 5 benefit-by-benefit acceptance checks first.

Home mastery terminology describes the model, not validated ability. The empty-memory wiring is still a release blocker; copy edits do not repair it. Existing store images that show mastery/progress are **historical design assets**, not approved submission assets. Re-capture with real persisted progress and approved copy in Phase 6.

## Draft store copy, English and Swedish

Not submitted. Final metadata length, screenshots, privacy links and storefront availability are A01–A18 checks.

**EN title:** WorldQuest: Geography\
**EN subtitle:** Practice flags and capitals\
**EN opening:** Explore countries through short geography quizzes. Practice recognizing flags, matching capitals and finding locations, with English and Swedish available from the start. Set a daily goal and learn at your own pace.

**SV title:** WorldQuest: Geografi\
**SV subtitle:** Öva flaggor och huvudstäder\
**SV opening:** Upptäck länder med korta geografiquiz. Öva på att känna igen flaggor, koppla ihop huvudstäder och hitta platser. Välj svenska eller engelska, sätt ett dagligt mål och öva i din egen takt.

Do not hardcode the current 65-country total in evergreen marketing. If a campaign needs a number, regenerate the inventory and check quizzable coverage in both languages for that build.

## Prioritization and success

Order work by: (1) safety, payment and progress trust; (2) observable learning; (3) completing the first session and returning tomorrow; (4) accessibility and release reliability; (5) sustainable acquisition. A feature that only increases clicks or XP does not outrank a broken learning/recovery path.

Measure first-session completion, next-day return, weekly learning days, delayed correctness on practiced material, reported wrong facts, lost-progress incidents and opt-out rates. Establish beta baselines before choosing numerical growth targets. No fabricated retention forecast. Monetization experiments, social expansion, new subjects and additional languages stay in their assigned later phases.

Accountable owner: repository owner for product/release decisions; engineering maintains evidence, content editors approve learning material. Next brief review: after Phase 3 course testing, or immediately if safety/learning evidence changes the promise.
