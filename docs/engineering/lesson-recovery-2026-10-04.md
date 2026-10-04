# Interrupted lesson recovery

The D1 app now journals lesson input in account-scoped MMKV storage before
acknowledging each action. Reopening the same course step or practice entry selects
the interrupted issued ticket first and replays its input through the existing
lesson engine. This retains answers, hearts, feedback and the mistake-review round.
A restored unanswered question opens paused; time away is excluded from its timer.

The journal is tied to the exact questions and lesson mode. Malformed or mismatched
data cannot supply cached grades. Account changes invalidate an open controller;
replayed answers do not emit new sounds, haptics or answer analytics. Consecutive
unsubmitted typing/selection changes are coalesced to avoid storing each keystroke.

At completion, the original ticket and answers reach the durable submission queue
before local completion counters update. Only then is the recovery journal removed.
A failed queue handoff retains the journal for reopening. Server receipts remain
authoritative for rewards. Local completion callbacks also check that the account
did not change during the asynchronous handoff.

## Validation and limits

- Recovery tests cover real hook unmount/remount, feedback, timing, review rounds,
  malformed input, exact-question matching and account isolation.
- Queue integration tests cover interrupted-ticket priority offline, failed handoff
  retention and successful enqueue under the original lesson ID.
- Screen tests hold the durable handoff pending and check that completion counters
  wait and cannot update a different account.
- Full `pnpm verify` passed: 1,263 mobile, 782 engine, 102 backend, 162 edge,
  64 API, 49 design, 29 i18n, 22 content and 6 analytics tests, plus 33 tooling
  regressions and the repository's content, accessibility and release configuration
  checks. Existing 13 content and 5 locale warnings remain visible for review.
- The connected local D1 journey passed 44/44 steps, including offline completion,
  reconnect, server reward reconciliation, two browser sessions, sign-out and adult/
  child deletion. It exercised the recovery changes before the final internal
  question-lookup optimization; the full engine suite then verified that optimization.
- iOS and Android Hermes bundles compile at 5.15 MB each under the unchanged
  5.21 MB gate. This is compilation and size evidence, not device performance proof.

Native cold-launch acceptance is still required. Run
`apps/mobile/e2e/native-lesson-recovery.yaml` in English from Home after onboarding
on a D1 candidate. Compare the feedback screenshots before and after force-close,
then verify the paused question resumes. No account or progress is seeded by that
flow. A web reload is not equivalent: browser preview credentials are memory-only.

This recovery applies to D1-issued tickets retained on this device, not a reinstall,
another device, or the legacy local preview. It does not introduce a global resume
banner. Existing server ticket expiration still applies.

## Verification scheduling

Workspace test packages and root Node regression files run sequentially. Backend
test files use one worker so multiple workerd startup/migration jobs do not consume
one another's setup deadline on a loaded Windows machine. Concurrency exercised
inside individual race tests remains intact. No assertions, test lists, coverage
requirements or time limits were relaxed.

Question generation also caches quizzable facts by immutable content index, entity
and attribute. Previously each distractor lookup rescanned every fact of that
entity. The lookup preserves source order and uses weak ownership, so replacing a
pack does not retain the old index or share its eligibility decisions. The existing
782 engine tests pass, including exhaustive duplicate-label and withdrawn-fact
checks. This is reduced composition work, not a measured native frame-rate claim.
