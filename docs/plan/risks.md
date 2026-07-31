# Risk register

What kills this project, ranked by expected damage. Reviewed monthly; a risk that
changes probability or impact gets updated in the same PR as whatever changed it.

**Scoring:** probability × impact, both 1–5. Anything ≥ 15 needs an active mitigation
with a named owner, not a note.

---

## R1 · The loop doesn't retain · **P4 × I5 = 20**

**Risk.** We build all of it — engine, content, design — and D7 lands at 12 %. People
try it, learn something, and never come back.

**Why it's likely.** It's the default outcome for consumer apps. Duolingo took years
and enormous experimentation to get its loop right; assuming ours works first try is
not a plan.

**Mitigation**
- The walking skeleton exists precisely to test the loop early, ugly.
- Beta at 500+ users *before* polish, with retention as the gate on continuing.
- The roadmap has an explicit rule: **D7 < 15 % → stop adding features and fix the
  loop.** More content does not fix a broken loop.
- Ten progression systems, so a plateau in one isn't a plateau in all.

**Early warning:** D1 < 35 % in beta. **Owner:** Product.

---

## R2 · Content quality collapses under volume · **P4 × I4 = 16**

**Risk.** 195 countries × 4+ facts × sources × licences × 2 locales is thousands of
data points. Errors ship. Kenji finds them. A learning app with wrong facts is
worthless, and the reputational damage is asymmetric — one viral wrong fact undoes a
year of good ones.

**Mitigation**
- Sources and `verifiedAt` enforced in CI, not by discipline.
- Second-author review on every pack.
- The production content dashboard flags any fact below 40 % accuracy — it finds
  errors before users report them.
- Content packs ship via CDN, so a fix is same-day with no store review.
- In-app "report this fact" with a weekly triage.

**Early warning:** > 5 reported incorrect facts in a month. **Owner:** Content.

---

## R3 · Landmark licensing is unaffordable · **P3 × I4 = 12**

**Risk.** 300 landmark photographs with clean commercial licences turn out to cost
more than the project's whole budget, or arrive with attribution obligations that
wreck the UI.

**Mitigation**
- Decide in Phase 0, not in v1.5 planning.
- **Illustrated landmarks are a live option** — cheaper, legally clean, more on-brand,
  and they make the app look like itself rather than a stock library.
- Landmarks are already v1.5, so this doesn't block launch.

**Early warning:** a licensing quote above budget. **Owner:** Founder.

---

## R4 · Sync and offline are harder than planned · **P3 × I4 = 12**

**Risk.** Offline-first with server-authoritative rewards is genuinely hard.
Duplicate XP, lost lessons, conflicting streaks. "I lost my progress" is the single
most trust-destroying bug a learning app can have.

**Mitigation**
- Built in the walking skeleton (step 7), not bolted on.
- Idempotency keys on every mutation; the server may safely replay anything.
- `review_log` is append-only and authoritative — state is always rebuildable.
- E2E flow 7 (airplane mode → lesson → reconnect) runs every release on real devices.
- Alert on any spike in `xp_reconciliation_mismatch`.

**Early warning:** any support ticket about lost progress. **Owner:** Engineering.

---

## R5 · Scope creep from the mockup · **P4 × I3 = 12**

**Risk.** The mockup shows 15 beautiful screens including leagues, achievements and
landmarks. v1.0 ships ten of them. The pull to "just also do leagues" is constant, and
it's how a 12-week launch becomes a 30-week one.

**Mitigation**
- The roadmap states the cut explicitly, and this document repeats it.
- Every PR names the persona and the roadmap phase.
- `/wq-persona-check` before building anything not already scoped.
- The mockup is relabelled as the **v1.x vision**, not the v1.0 scope.

**Early warning:** a v1.0 PR touching a v2.0 feature. **Owner:** Product.

---

## R6 · A child-safety or privacy incident · **P2 × I5 = 10**

**Risk.** A data exposure, a moderation failure, or a compliance gap involving
under-13 users. Existential: it ends the product, not just the quarter.

**Mitigation**
- No free text anywhere. No discovery. No social features under 13 — absent, not
  disabled.
- `is_child` enforced in RLS and in the analytics adapter, not just the UI.
- Moderation, reporting and blocking ship *with* the social graph, never after.
- Legal review of the consent flow before v1.0.
- Pre-launch pen test of the auth and reward paths.

**Early warning:** any RLS test failure; any report with no owner. **Owner:** Engineering.

---

## R7 · Solo/small team burnout · **P4 × I3 = 12**

**Risk.** The documentation set in this repo describes a large product. Built by a
small team, the gap between the plan and the week's output becomes demoralising.

**Mitigation**
- The plan is deliberately phased, with the walking skeleton reachable in two weeks.
- v1.0 is ten screens, not fifteen.
- `.claude/` tooling exists to make the routine parts fast.
- **Read the roadmap as a sequence, never as a to-do list.** Nobody is behind on v3.0.

**Early warning:** two consecutive weeks with no shipped increment. **Owner:** Founder.

---

## R8 · FSRS tuning makes the app feel wrong · **P3 × I3 = 9**

**Risk.** Default weights produce too many reviews (a treadmill) or too few (nothing
sticks). Users don't say "the scheduler is miscalibrated" — they say "it's boring" and
leave.

**Mitigation**
- `targetRetention` differs by audience (0.85 kids, 0.90 default, 0.93 completionists).
- Hard floor of 20 % new items so it never becomes reviews-only.
- Calibration tracked monthly: predicted vs observed recall.
- `rebuild()` from `review_log` means we can change the algorithm without losing
  anyone's progress — the tuning risk is genuinely reversible.

**Early warning:** lesson completion < 80 %, or `review_backlog_shown` correlating
with churn. **Owner:** Engineering.

---

## R9 · A competitor ships geography + spaced repetition well · **P2 × I3 = 6**

**Risk.** Duolingo adds a geography course; GeoGuessr adds real teaching; Seterra gets
a good mobile app with scheduling.

**Mitigation**
- Speed on the wedge, then breadth: the platform thesis means v3.0 subjects are cheap
  for us and expensive for a vertical competitor.
- Position with GeoGuessr rather than against it (training ground → destination).
- Our differentiator is the *verifiable learning claim*, which is hard to copy without
  the same architecture.

**Early warning:** any of the three announcing it. **Owner:** Product.

---

## R10 · Supabase limits or pricing bite at scale · **P2 × I3 = 6**

**Risk.** At several hundred thousand users, RLS-heavy queries or edge-function limits
become a cost or latency problem.

**Mitigation**
- The hot path is one indexed query; it's load-tested at 10 k synthetic users in CI.
- Content is not in the database, which keeps it small.
- Engines are framework-free and Postgres is portable — migrating off Supabase means
  changing adapters, not rewriting logic.
- Documented reconsideration trigger: > 500 k MAU (ADR 0003).

**Early warning:** p95 submit > 1 s, or infra cost per MAU above plan. **Owner:** Engineering.

---

## R11 · Accessibility is deferred "just this once" · **P3 × I2 = 6**

**Risk.** A deadline arrives, a11y gets waived on three screens, and the retrofit
never happens. Two personas become unable to use the app.

**Mitigation**
- It's in the Definition of Done, with waivers requiring an owner and a dated issue.
- **More than three open waivers pauses feature work.**
- Automated checks in CI catch a third of it for free.
- Assistive-technology users are in the beta cohort by requirement.

**Early warning:** a second a11y waiver in a month. **Owner:** Engineering.

---

## Retired risks

*(none yet — retire a risk with a dated note explaining what removed it)*
