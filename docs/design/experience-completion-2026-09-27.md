ï»¿# Remaining experience work â€” September 27, 2026

This is a completion ledger, not a claim that the whole release is finished.

| Area | Current implementation and evidence | Remaining |
| --- | --- | --- |
| Lessons | Answer selection/correct/wrong states; earned XP; graded-answer sound/haptics with preferences; immediate Continue. Cue, sound and haptics tests pass. | iPhone perception, VoiceOver and Taptic Engine validation. |
| Progression | Saved course credit, summary, reward chain, next-challenge reveal and Home scroll-to-current (instant with reduced motion). Existing two-lesson browser walkthrough exercises an actual unlock. | Physical iPhone walkthrough. This browser run completed two lessons, one intentional mistake, the chest reveal and next node with no errors. |
| Mascot | Shared articulated character; thinking, encouraging, success/resting poses; native-driven curves and lifecycle cleanup. Prior 15 tests and 22 browser checks. | Physical-device smoothness and memory profiling. |
| Rewards | Opening waits for decode; glow and collectible reveal follow the chest; sound/haptic once; restored receipts do not replay; reduced motion settles immediately. Gems remain badges, coins remain money. | Fresh iPhone chest opening and interruption/resume. |
| Passport/customization | Earned dated gems in the passport; live account-scoped subscription. Existing achievements, portraits and earned/bought titles remain real. Purchases now wait for server confirmation; failed/offline/declined purchases grant nothing; unowned titles cannot equip. | Physical restore/network test. Outfits are not supported by the catalogue and are not advertised. |
| Social | D1 weekly leagues and private friend challenges implemented locally. Challenges share ten questions, grade on the server, hide results until completion, save drafts, and support report/block. See `../engineering/d1-friend-challenges-2026-09-27.md` and the league note. Public rollout stays off. | Staged deployment, assigned moderation operator, two real human test accounts. A persistent friend graph and reactions are not implemented. |
| Production | Responsive/reduced-motion/browser walkthroughs, account-scoped sync tests; owner reports iPhone 1.0.0 (10). | Actual-device results on a new build containing these changes, performance, VoiceOver, background/offline recovery and release backend acceptance. |

## iPhone pass

Record device model, iOS version, WorldQuest version/build and whether Development or TestFlight. Verify the installed build contains these changes before using its results.

1. Finish two course lessons, deliberately miss one answer. Confirm no duplicate XP/coins and the next platform/path position matches saved progress after relaunch.
2. Toggle sound and haptics separately. Test a correct answer, mistake and chest. Muting either must work immediately; silent mode/headphones need an explicit result.
3. Open today's chest, tap twice quickly, background during opening, then return. Exactly one dated gem; coin balance unchanged by the gem reveal. Repeat after relaunch.
4. In the shop, disconnect before buying; confirm no ownership is granted. Reconnect and buy an affordable real item once; equip it, relaunch and verify both ownership and the wallet. Switch accounts: no inventory or badges cross accounts.
5. Enable iOS Reduce Motion during a mascot/chest animation. It must settle without hiding the reward or disabling Continue.
6. Use the largest Accessibility Text size and VoiceOver. Check answer labels, verdict, reward, Continue, shop errors and passport pagination. No clipped primary actions.
7. Start a cached lesson, enter airplane mode, finish, relaunch, then reconnect. Progress must recover with one server receipt. Capture any pending/error state before retrying.
8. In a development build, profile repeated lesson/chest/profile navigation on the device. Record dropped frames and memory before/after 20 loops, not a browser FPS estimate.

No physical-device pass, live-social verification or production release is claimed by this document.

## Installed build baseline

Owner reports iPhone version **1.0.0 (10)**. The current session changes are local and have not been packaged or submitted. `app.json` now records 10 as the local baseline; the existing production EAS profile auto-increments the next build. Verify current App Store Connect/EAS numbering before submission in case another build has since been uploaded. No cloud build, Apple submission or distribution was started.

## Verification from this pass

47 shop/streak/collection/profile tests, 23 sound/haptic/answer-cue/sync-isolation tests, and 3 chest tests passed. The real D1/workerd catalogue-purchase acceptance test passed (31 unrelated tests intentionally skipped). Mobile TypeScript and static accessibility lint passed.

`reviews/complete-loop-2026-09-27/report.json`: two completed lessons, one deliberate mistake, next node revealed, reduced-motion 320px layout and zero uncaught errors. The video and chest screenshot are in the same folder.

Local league implementation is recorded below and in the D1 league delivery note. No live-social rollout, cloud build, TestFlight upload, or physical-device pass is claimed.

## Unified UI and private challenge completion

The five tabs, lessons and social screens now share navy text on warm paper, blue
navigation/selection, emerald progress and gold rewards. Tier-colored league banners
remain distinct. The yellow disc behind the globe is removed. Narrow Explore grids
and empty-passport action spacing are corrected.

Private invitations, identical ten-question rounds, server-scored results, saved
answer recovery, block and report are implemented and verified locally. Quiz language
stays consistent between players; new questions restore the viewport and native
screen-reader focus. No challenge XP or coins are advertised or awarded.

See [the screenshot and verification record](reviews/unified-2026-09-27/README.md)
for the completed checks, including 970 mobile tests, 72 Worker/D1 tests, both native
bundles, and the two-account browser walkthrough. Public flags remain disabled.
The remaining release work is a signed build containing these changes, physical
iPhone acceptance, operator ownership and real-account social rollout verification.
