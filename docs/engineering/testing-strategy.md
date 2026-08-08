# Testing strategy

> "Plan it now."

The shape is unusual on purpose: **the engines get near-total coverage, the UI gets
selective coverage, and the whole thing is fast enough that nobody skips it.**

That's affordable precisely because `packages/engines` is pure. A scheduler with no
clock, no network, and no React tests in milliseconds — so we can afford thousands of
cases where they matter most.

---

## The pyramid

```
        ╱  E2E (Maestro)              ~15 flows, the critical journeys
       ╱─────────────────────────╲
      ╱  Integration              ╲   ~80  edge functions, RLS, sync, packs
     ╱───────────────────────────────╲
    ╱  Component (Jest + RNTL)        ╲ ~150 interactive UI, all states
   ╱─────────────────────────────────────╲
  ╱  Unit (Vitest) — the engines          ╲ ~600 pure logic, property tests
 ╱─────────────────────────────────────────╲
```

| Layer | Tool | Target coverage | Runs in |
|---|---|---|---|
| Engines | Vitest | **≥ 90 %, enforced** | < 5 s |
| Components | Jest + React Native Testing Library | Interactive components | < 60 s |
| Integration | Vitest + local Supabase | Every edge function, every RLS policy | < 3 min |
| E2E | Maestro | 15 critical flows | < 10 min |

---

## 1. Engines — where the real testing lives

`packages/engines` is pure, so its tests need no mocks, no DOM, no database.

**Learning engine**
- First review schedules ~1 day out
- A wrong answer reduces stability and shortens the interval
- Intervals grow monotonically across consecutive correct reviews
- `retrievability` ≈ `targetRetention` exactly at `dueAt`
- `masteryOf` transitions at the documented boundaries, not near them
- `selectItems` honours 60/30/10, and degrades sanely when a bucket is empty
- `selectItems` never returns adjacent duplicates or two facts about one entity
- Same seed → identical output
- **`rebuild()` from a log reproduces incremental state exactly** — the recovery
  guarantee, and the one test that must never be skipped

**Property tests** (fast-check), 10,000 cases each:
- No review sequence ever produces `NaN`, a negative stability, or a past `dueAt`
- `selectItems` always returns exactly `count` items when enough candidates exist
- XP is always a non-negative integer
- Coin balance never goes negative through any purchase sequence
- Level is monotonic in XP

**XP engine** — every balance-table row; the daily soft cap; the mastered-repeat
reduction; speed-bonus capping; determinism between client and server.

**Achievements** — each of the six rule types; tier progression; incremental evaluation
matching a full replay; backfill correctness.

**Quests / leagues / progress** — generation determinism per user-day; promotion and
demotion boundaries; the Bronze floor; streak logic across timezone changes, DST, and
freeze consumption.

> DST is the classic streak bug. There is a test for a user in `Europe/Stockholm`
> whose local day is 23 or 25 hours long. Write it before the bug, not after.

## 2. Components

Test **behaviour**, never implementation. No snapshot-only tests — a snapshot proves
nothing changed, not that anything works.

Every interactive component asserts:
- Renders in every documented state (default, pressed, disabled, loading, error)
- Fires its handler once per press, and not while disabled
- Exposes the correct accessibility role, label, and state
- Reads correctly at 200 % font scale
- Honours reduced motion

```tsx
it('announces the correct answer to screen readers', async () => {
  const { getByRole } = render(<AnswerOption option={japan} state="correct" />)
  expect(getByRole('button')).toHaveAccessibilityState({ selected: true })
  expect(getByRole('button').props.accessibilityLabel).toContain('Japan')
})
```

## 3. Integration

Against a **local Supabase**, reset between suites.

- **Every edge function**: happy path, auth failure, rate limit, malformed input,
  idempotent replay.
- **Every RLS policy**: user A cannot read or write user B's rows. Table by table,
  including the ones added last week.
- **Sync**: queue → flush → reconcile; duplicate submits are no-ops; out-of-order
  arrival converges.
- **Content packs**: schema validation, signature verification, generated-item
  correctness, distractor rules.
- **Migrations**: apply cleanly to an empty database *and* to a seeded one.

## 4. E2E (Maestro)

Fifteen flows. Not more — E2E is slow and brittle, and its job is to catch
integration breakage, not to test logic.

1. Fresh install → onboarding → taster lesson → completed
2. Sign up → first lesson → XP visible on Home
3. Complete a Daily Quest end to end
4. Lose all hearts → lesson ends → practice mode still works
5. Answer wrong → correct answer shown → continue
6. Explore → continent → country page
7. **Airplane mode → complete a lesson → reconnect → progress syncs**
8. Streak extends across a simulated day boundary
9. Change language → UI updates without a restart
10. Sign out → sign in → progress intact
11. Deep link into a country page from cold start
12. VoiceOver: complete a lesson end to end
13. 200 % text: complete a lesson without clipping
14. Purchase flow, sandbox *(v2.0)*
15. Delete account → data gone → sign-in fails

Flow 7 is the one that catches the most real bugs. Run it on every release, on real
devices.

## 5. Content testing

Content bugs are the ones users actually notice.

| Check | Enforcement |
|---|---|
| Schema validity | CI |
| Every fact has a source and `verifiedAt` | CI |
| No duplicate IDs; all references resolve | CI |
| Locale completeness for shipped languages | CI |
| Distractors never contain a correct answer | CI |
| Every asset has a licence | CI |
| Generated questions read sensibly | **Human review** of `content:preview` |
| Sensitive items reviewed | Second-author sign-off |

Plus the production signal: the **content dashboard flags any fact below 40 %
accuracy** across a meaningful sample. That's either a genuinely hard fact or a wrong
one — and it finds errors before users report them.

## 6. Performance testing

| What | How | Budget |
|---|---|---|
| Cold start | Automated, real mid-tier Android | < 2.0 s |
| Next-items query | Load test with 10 k synthetic users | p95 < 50 ms |
| Frame rate in lessons | Instrumented profiling | ≥ 58 fps |
| Bundle size | CI, fails on regression > 5 % | < 4 MB — **Contradicted by the enforced gate — see `docs/plan/cowork-handoff.md` §6.** `scripts/bundle-native.cjs` enforces 6.0 MB (raised from 4.5 when `@sentry/react-native` added 1.92 MB) and the current bundle is 5.93 MB: it passes the gate and fails this number. Which one is real is a product decision, not a typo. |
| Memory in a long session | 30-min soak | No unbounded growth |

## 7. Accessibility testing

Automated (`eslint-plugin-react-native-a11y`, contrast checks, 200 % screenshots) on
every commit — **plus a manual VoiceOver/TalkBack pass per screen before merge.**

Automated tools catch roughly a third of real accessibility problems. The manual pass
is not optional and cannot be automated away.

## 8. Beta & release testing

| Stage | Who | Duration |
|---|---|---|
| Internal | Team, TestFlight / Play Internal | Continuous |
| Closed beta | 50–100 recruited across personas | 2 weeks |
| Open beta | 500+ | 2 weeks |
| Staged rollout | 5 % → 25 % → 50 % → 100 % | 5 days, watching crash rate |

**Recruit the beta by persona, not by convenience.** A beta of engineers will not find
Emma's problems or Ingrid's. Include at least: 5 children (with parents), 3 teachers,
5 users over 60, and 3 users who rely on assistive technology.

## 9. Monitoring in production

Sentry (crashes, ANRs, performance) · PostHog (funnels, guardrails) · Supabase logs
(slow queries, errors) · uptime checks on edge functions.

**Alerts that page:** crash-free < 99 % · error rate > 1 % · p95 submit > 2 s · sync
failure rate > 5 % · any spike in `xp_reconciliation_failed` (a bug or a cheat) ·
any content fact dropping below 40 % accuracy.

## 10. What we deliberately don't test

| Not tested | Why |
|---|---|
| Third-party SDK internals | Not ours; we test our adapter |
| Exact pixel positions | Brittle; design review catches this |
| Every screen end to end in E2E | Slow, flaky, low value — component tests cover it |
| Getters, constants, pure re-exports | No logic |
| Generated code | Test the generator instead |

## 11. Rules

1. **A bug fix ships with a failing-test-first.** No test, no fix.
2. **Never skip a test to go green.** Fix it or delete it with a written reason.
3. **Flaky tests are P1.** A flaky suite is a suite nobody reads.
4. Engine coverage below 90 % **fails CI**. UI coverage is monitored, not gated.
5. Tests are documentation — name them as sentences: `it('shortens the interval after
   a lapse')`.
6. `pnpm verify` (typecheck · lint · test · content · i18n · a11y) runs before every
   push and must stay under 3 minutes, because a slow gate is a gate people bypass.
