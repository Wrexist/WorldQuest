# Cohesive adventure redesign

Baseline: `bcbabee`, branch `feat/cohesive-adventure-redesign`, Windows / Node 22 / Chromium.
The September 27 owner brief overrides historical robot/ivory design directions.

## Required
- [x] Fresh verification and rendered baseline; preserve failures separately.
- [x] Reactive light/dark/system semantic themes, including module-level styles and native chrome.
- [x] Home: honest zero progress, explicit unit/lesson scopes, compact primary action, real daily history.
- [x] One globe mascot identity across production surfaces; preserve old source masters.
- [x] Complete learning slice, existing teaching/feedback/reward/recovery behavior verified.
- [x] Consistent Explore, Quests, Profile, Shop and settings; accessible localized controls.
- [x] Regression tests, rendered phone/tablet/dark/large-text review, before/after evidence.

## Preserve
Five tabs; original launcher icon; Nunito; verified flag/map geometry; earned coins and
collectible streak badges; deterministic engines; authoritative reward and purchase ports;
account-scoped persistence and outboxes; feature flags; optional sound/haptics/reminders.
No duplicate Learn tab, sample balances, fabricated opponents, new quiz engine or backend.

## Prerequisite-gated expansion
Native auth and Workers/D1 cutover, real-money billing, hosted transaction proofs,
league/social safety, live-event schedules, editorial certification and store publication
retain their independent gates in `docs/plan/execution-plan.md`. No deployment or migration.
Physical iOS/Android testing requires a newly installed native build and an available device;
browser screenshots and native exports cannot supply that evidence.

## Decisions and inspection
The board is visual direction, not a source of prices, counters or navigation labels.
Current `PlatformUnit` incorrectly fills the current segment at zero completed; correct it.
Current Profile uses robot passport artwork; replace its production use with the globe.
77 runtime TSX modules read semantic colors, many in module-level styles. Theme work must
rebuild those values reactively without remounting navigation or resetting lesson state.
Baseline commands: `pnpm verify`; design-shots against the freshly exported `bcbabee` bundle.
Current results follow below.

Baseline failure: `pnpm verify` reached mobile tests after passing workspace typechecks,
engine/API/content/backend tests. QuestScreen cannot import expo-linear-gradient in Vite:
`LinearGradient.js:17 Expression expected` (untransformed package JSX). Reproduced with
`pnpm --filter @worldquest/mobile exec vitest run src/features/quests/QuestScreen.test.tsx --maxWorkers=1`.
Stopped the known-failing aggregate run before editing; remaining aggregate gates will run
on the final revision. This regression predates this branch and is included in this fix.


## Implemented

- Reactive semantic light/dark/system appearance across navigation, screens, sheets,
  feedback, maps and state panels. Palette switches preserve component state.
  Preferences reload on account changes; a mounted reader cannot write the prior
  account's settings into the new account.
- Home presents the actual daily target/history, the current unit and clear lesson
  action. Zero completed steps has zero completed fill. Unit steps and lessons within
  a step are labeled separately. The whole course remains available through a toggle.
- One globe mascot on production surfaces, including Profile; historical robot source
  masters are retained and their provenance explicitly marked as historical.
- A pre-lesson teaching view uses unfamiliar associations from the actual composed or
  issued questions. It does not start the answer timer or grant rewards. Verified maps
  and flags remain content-driven. Speed practice retains its existing behavior.
- Explore searches installed countries and localized regions, reports real coverage,
  shows mastery and opens existing country details. Region browsing and collection
  filters remain available. No illustrative dots or invented world-map interaction.
- Country details deliberately expose verified reference facts before testing. Reading
  grants no progress. This supersedes the old hidden-answer rule on reference pages;
  assessment answer concealment and grading are unchanged.
- Quest chest compositing uses the existing gradient primitive and smoothly blends its
  artwork. This also fixes the baseline Vite import regression.
- EN/SV copy, plural forms, appearance controls, and repeatable screenshot/test drivers.

No new backend, currency, paid integration, state library or runtime 3D engine. Coins
remain spendable currency; streak gems remain collectible badges. The launcher icon
is unchanged. Existing quest/shop/account/reward engine behavior is retained.

## Verification evidence

Environment: Windows, Node 22.18, pnpm 9.15, headless Chromium / Expo React Native Web.
Baseline screenshots: 20 routes at three sizes plus 111 flow/state captures.
After: 20 routes at 320x568, 390x844, 430x932 and 768x1024, plus 156 flow/state captures.
Additional full route matrices cover Swedish/dark/reduced-motion and 150% browser text.
The latter honors the pre-existing native tab-label scaling cap. Initial uncapped
browser simulation was corrected; it was not evidence of the actual native text cap.
Selected captures are [checked in here](assets/cohesive-adventure/README.md).

Commands and results:
- `pnpm verify:full`: its `pnpm verify` stage passed (983 mobile tests in 113 files;
  engine, API, backend, content, design, localization and edge suites also passed).
  Content validation/crosschecks, accessibility/static checks, economy simulation,
  backend boundaries, inventory and workflow checks passed.
- Native export stage passed for iOS and Android: 4.53 MB each, below the 4.6 MB
  existing budget; 10.09 MB of accompanying assets. This is bundle evidence only.
- The aggregate then stopped because local port 4173 was occupied. No unrelated
  service was stopped. Browser and accessibility gates were resumed on separate ports.
- Follow-up mobile typecheck, locale validation and focused tests passed after the
  country-reference and final localization changes. Country reference: 14 tests;
  lesson/achievement follow-up: 30; account preference follow-up: 8. Final status-label
  contrast follow-up: 82 tests; fresh iOS/Android bundles and typecheck also passed.
- Light contrast: 119 pairs; night contrast: 54 pairs passed. One existing locale
  advisory remains: the ordinal `Question {count} of 10` is flagged by the plural
  heuristic, although it intentionally names a question position, not a quantity.
- `node scripts/review-phone-layout.cjs`: 9/9 four-answer layouts passed at 390x759,
  375x667 and 320x568. Dark repetition passed the same nine, plus a live OS-theme
  switch preserving the actual selected lesson answer.
- `node scripts/a11y-tree.cjs` on port 4199 passed: 11 routes/states, including both
  teaching and questions, with named controls and reading-order focus.
- Full browser flow: 106 passed, 1 explicitly skipped (the run reports 107/107
  recorded steps). The generic lesson did not contain an image question. Targeted
  flag layout/capture passes exercise flag questions separately. No uncaught errors.
  The run covers actual completion, pending/recovery UI, quest/achievement updates,
  chest reveal, course advancement/replay, keyboard use and 200% text states.
  The added Explore search exposed a selector matching a retained, hidden tab; the
  driver now targets the visible search input without weakening its result assertions.
- Country-reference change was made after the full browser export: its 14 focused
  tests, fresh typecheck and four-size real route render passed. The rest of the
  browser flow did not need to be rerun for that isolated reference-text change.

Raw local evidence is under `node_modules/.cache/redesign-*.log` and the corresponding
screenshot directories. These are not production analytics or native-device evidence.

## Performance scope

Both native bundles remain within the existing budget, but with only 0.07 MB headroom.
No new runtime raster/model files were added. A five-sample local Chromium Home-ready
probe measured median 401 ms before and 243 ms after; see [samples](assets/cohesive-adventure/performance.json).
This was warm local web navigation with other verification running, not a controlled
native startup/FPS/energy benchmark. It does not justify a native smoothness claim.

## Untested and external gates

- Physical iOS/Android: install a development build containing this branch, then run
  `docs/plan/device-pass.md` for safe areas, Dynamic Type, VoiceOver/TalkBack, touch,
  sound/haptics, background/process interruption, weak-network recovery and performance.
  The previously reported iPhone 1.0.0 build 10 does not establish coverage of this branch.
- Cloudflare/D1 auth/cutover and hosted transactional/account-isolation acceptance
  remain separate gates in `docs/plan/execution-plan.md`. No production migration,
  remote reset or deployment was run. Existing local backend tests passed, but that
  is not proof of the deployed service or guest-to-account native journey.
- Payments/restore, store entitlements, leagues/social eligibility and child safety,
  configured live events, privacy/content certification and store publication retain
  their existing prerequisites. This redesign does not declare them shipped or ready.
- Browser enlarged-text and accessibility-tree checks do not replace native assistive
  technology testing. Cold-process lesson restoration is not asserted by these captures.

This is a reviewable redesign increment, not a launch-readiness declaration.


Final visual review corrected selected-status ink in dark mode (settings chips,
answer letters and completion checks). `text.onStatus` is checked against its actual
filled status backgrounds at 4.5:1 in both themes; ordinary surface text retains its
existing checks. There are no contrast waivers. The corrected settings render was
opened and checked, and all nine dark question layouts were repeated successfully.

No PR, deployment, migration, store release or paid service action was performed.


## Follow-up: destination hierarchy and unit artwork

Home and Explore retain their primary-tab roles. Home prioritizes the current
lesson; Explore prioritizes selecting a region or finding a country. This increment
serves Priya, the commuter self-improver, without introducing another navigation destination.

- Explore now places illustrated regions immediately after the compact real-world
  progress summary. Collection shortcuts remain available below the regions.
- Removed the redundant answer-XP explainer from Explore; reward rules remain at
  the lesson entry where they explain the action being taken.
- Reused the existing transparent globe render in Home's unit banner. It hides on
  narrow layouts or enlarged native text so the lesson entry retains priority.
- Reduced the Explore globe footprint and summary padding without reducing touch
  targets, truncating progress labels, changing counts or adding fabricated fills.

Reviewed actual exported Home/Explore renders at 320x568, 390x844, 430x932 and
768x1024, with a second dark/Swedish/reduced-motion/150%-browser-text matrix.
At 390x844 the first two region cards and Home's start button are fully visible.
At 320x568 Home preserves its existing scroll-to-current-lesson behavior; enlarged
text scrolls naturally. Browser text simulation does not simulate native fontScale.

Targeted Explore/course tests: 54 passed. Mobile TypeScript: passed.
No dependency, backend, economy, factual art, new motion or app-icon changes.
Native devices, screen readers and mid-tier Android performance remain untested
in this increment; the external release gates above remain open.

Follow-up verification: `pnpm verify` passed. The real exported browser flow
recorded 107 steps: 106 passed and one explicitly skipped because that generated
lesson contained no image question. No uncaught browser errors. Logs are in
`node_modules/.cache/refinement-verify.log` and `refinement-e2e.log`.


## Reward motion refinement (September 28)

Reference: user screenshot of the OneThirdDesigner celebration post and
https://x.com/onethirdesigner/status/2103749509616648627. Direct video retrieval
returned HTTP 403; its actual motion was not inspected. The screenshot's focal
reward composition informs direction, not a claimed frame-by-frame reproduction.

The existing RewardMotion wrapper now uses an eased preparation, lift and settle
(180 + 260 + 180 ms) instead of linear multi-bounce keyframes. Overshoot is restrained
to 6% for ordinary rewards and 4% for confetti. Native transform animations are
non-interaction work; buttons are never gated by the reveal. Inactive/background
mounts and reduced motion show the final state, and backgrounding stops playback.
No claim, XP, coin, chest persistence or asset changes.

Validation: mobile TypeScript passed; 76 chest/streak tests passed. The actual Expo
web export passed `node scripts/review-reward-motion.cjs`: multiple moving states,
a settled non-looping tail, static reduced-motion states and no uncaught errors.
Frame samples and full-context browser recordings live in
`node_modules/.cache/reward-motion-review/`. The settled screen was opened for
visual inspection. This does not establish native frame rate or physical-device
motion quality. Full repository verification was not repeated for this component-only
increment; the preceding layout increment's full pass is recorded above.
