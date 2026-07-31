# The WorldQuest Product Bible

> One document. A vision that does not change.
> When a decision is contested, this file settles it.
> It changes only by deliberate amendment — with a dated entry at the bottom.

**Version 1.0 · 2026-07-31 · Owner: Founder**

---

## 1. Mission

**Make world knowledge feel like an adventure, not homework.**

Most people leave school knowing perhaps forty countries. Not because the world is
hard, but because it was taught as a list to memorise for a test and then forget.
Knowledge of the world is the cheapest possible form of cultural literacy, and we
deliver it in five minutes a day, in a form people *choose* to open.

## 2. Vision

**By 2030, WorldQuest is where a curious person goes to learn anything visual.**

Geography first, because it is universal, beautiful, finite, and endlessly deep.
Then history, wildlife, art, space, anatomy, architecture. Not because we pivot —
because the engine we build for geography teaches all of them.

The test of the vision: *adding a new subject should be a content release, not an
engineering project.*

## 3. Values

### 3.1 Curiosity over cramming
We reward the *return*, not the grind. A session that ends with "come back tomorrow"
is a better session than one that ends with an exhausted user. We will deliberately
cap what a user can profitably do in a day.

### 3.2 Kind gamification
Momentum, never manipulation. We use streaks, XP, and leagues because they work — and
we constrain them because they can be cruel. Specifically, we will never:

- shame a user for a broken streak or a wrong answer;
- use countdown timers whose only purpose is anxiety;
- make a loss feel like a punishment rather than a fact;
- gate the *next lesson* behind a payment;
- send a notification whose subtext is "you are failing".

The test: **would this feel fine if a ten-year-old's parent watched it happen?**

### 3.3 Everyone can play
Accessibility and localisation are not a phase. They are in the Definition of Done
from the first commit, because retrofitting either is a rewrite.

### 3.4 Truthful content
Every fact carries a source and a verification date. Population figures go stale;
borders are disputed; capitals move. A wrong fact in a learning app is the worst class
of bug we can ship, and we treat it that way — hotfix priority.

### 3.5 Respect the child
A meaningful share of our users will be under 13. Their privacy, their safety, and
their parents' trust are product features, not compliance overhead. Child accounts get
no third-party analytics, no open social features, no ads, ever.

## 4. Brand personality

**Wondrous · warm · confident · playful-but-not-childish · a little cinematic.**

WorldQuest is a night sky full of places you haven't been yet. It is a well-made
expedition, not a classroom and not a slot machine.

**Voice** — an enthusiastic expedition guide who assumes you're capable.
**Mascot** — **Atlas**, a small robot explorer in a safari hat. Atlas is curious and
encouraging, and is never disappointed in you. Atlas appears at emotional beats
(welcome, milestone, comeback), not on every screen.

Full guide: [`../design/voice-and-tone.md`](../design/voice-and-tone.md).

## 5. Target audience

| Tier | Who | Why they matter |
|---|---|---|
| Primary | 10–24, curious, phone-native | Highest engagement, drives virality and league density |
| Secondary | 25–45 self-improvers, travellers, quiz players | Highest retention, highest willingness to pay |
| Tertiary | Teachers (9–15 y/o classes) and parents | Distribution and legitimacy; monetise via classroom/family |

Detail: [`personas.md`](personas.md). **Every feature must serve at least one persona
by name.** A feature that serves "users" serves no one.

## 6. Core principles

These are the rules a feature must satisfy. They are testable on purpose.

1. **Five minutes is a complete experience.** A user who has 5 minutes gets a full
   loop: learn → practise → progress → reward → a reason to return.
2. **Content is data, never code.** If shipping a new country requires a deploy, the
   architecture has failed.
3. **The engine is subject-agnostic.** No geography concept may leak into
   `packages/engines`. It handles *facts*, *items*, and *mastery*.
4. **Progress is always visible.** Every screen answers "how far along am I?"
5. **The server owns the truth.** Rewards, streaks and ranks are computed server-side.
   The client renders.
6. **Offline is a first-class state.** A user on a plane, a bus, or a bad connection
   can still do a lesson. Sync is a background detail.
7. **One primary action per screen.** If two things look primary, one is wrong.
8. **Nothing is a dead end.** Every empty state, error and failure offers the next step.
9. **We measure habit, not time.** Session length is not a goal. Weekly Learning Days is.
10. **If it can be earned, it must be spendable.** Currency without a sink is noise.

## 7. Feature philosophy

**Add features that deepen the loop, not features that widen the surface.**

Before building, a feature must answer:

- Which persona asked for this, in their words?
- Which part of the loop does it strengthen — *learn*, *return*, *share*, or *pay*?
- What does it cost us in complexity, forever?
- What do we remove or say no to in exchange?
- How will we know in two weeks whether it worked?

**Our standing no-list:**

| We will not build | Because |
|---|---|
| An open chat or comment system | Child safety cost we cannot carry |
| Loot boxes or randomised paid rewards | Predatory, and illegal for minors in several markets |
| Energy mechanics that block learning behind a purchase | Violates "kind gamification" |
| A general trivia mode with no scheduling | That's Sporcle; we are not competing there |
| User-generated content before v4.0 + moderation | Unmoderated content in a kids' app is a scandal waiting |
| Ads | Incompatible with our audience and our privacy stance |

## 8. Design philosophy

**Night-sky canvas, glowing content.** Depth, not decoration. Every pixel serves
orientation ("where am I?"), progress ("how far?"), or delight ("that felt good").

- Colour carries meaning: green = progress, blue = go, gold = reward, orange = streak,
  red = risk. Never decoration.
- Motion is physical — things spring and settle. Reduced motion is always honoured.
- Celebration is brief and generous: ≤ 900 ms, then out of the way.
- The map is the hero. Geography deserves to be *seen*, not listed.

Spec: [`../design/design-system.md`](../design/design-system.md).

## 9. Business model

Free forever for the core learning loop. **We never charge for the next lesson.**

| Tier | Price (target) | What it unlocks |
|---|---|---|
| Free | — | All subjects, all lessons, daily quest, streaks, leagues, 5 hearts |
| **Premium** | ~€5.99/mo, ~€39/yr | Unlimited hearts, offline packs, deep stats, exclusive cosmetics, Atlas explanations, no interstitials |
| **Family** | ~€89/yr | 6 seats, parent dashboard, screen-time-friendly reports |
| **Classroom** | per-seat / school | Assignments, class leaderboards, progress export, no social features |

Premium sells **depth and delight**, never access to learning. If a user would learn
less because they didn't pay, the paywall is in the wrong place.

## 10. North Star metric

> **Weekly Learning Days (WLD)** — distinct days in the trailing 7 on which a user
> completed ≥ 1 lesson.

Chosen because it is honest: it cannot be inflated by longer sessions, by
notification spam (which tanks retention), or by dark patterns. It goes up only when
someone genuinely wants to come back.

## 11. Success metrics

| Layer | Metric | v1.0 target |
|---|---|---|
| North Star | Weekly Learning Days | ≥ 3.0 |
| Acquisition | Install → first lesson completed | ≥ 60 % |
| Activation | Day-1 return | ≥ 45 % |
| Retention | D7 / D30 | ≥ 25 % / ≥ 12 % |
| Learning | Facts moved to *Proficient* per active week | ≥ 15 |
| Learning | 30-day retention of mastered facts | ≥ 85 % |
| Engagement | Median session length | 4–7 min *(a range, not a maximum)* |
| Monetisation | Free → Premium (post-v2.0) | ≥ 3 % |
| Quality | Crash-free sessions | ≥ 99.5 % |
| Trust | App store rating | ≥ 4.6 |

**Guardrails we refuse to trade away:** notification opt-out rate < 8 % · sessions per
day median ≤ 3 (we do not want compulsion) · support tickets about "lost progress" ≈ 0 ·
zero child-privacy incidents. Detail: [`metrics.md`](metrics.md).

## 12. Content standards

Every fact in WorldQuest must be:

1. **Sourced** — a named, linkable authority (UN, World Bank, CIA World Factbook,
   UNESCO, national statistics office). Recorded in the pack.
2. **Dated** — `verifiedAt`. Volatile facts (population, currency, GDP, leadership)
   carry a `volatility` tag and a re-verification cadence.
3. **Neutral** — disputed borders, contested capitals and unrecognised states follow
   the documented policy, not an author's opinion. See
   [`../systems/content-pipeline.md#sensitive-content`](../systems/content-pipeline.md#sensitive-content).
4. **Age-appropriate** — readable by a 10-year-old; no graphic conflict, no politics
   as quiz answers.
5. **Licensed** — every flag, photo and map asset has a recorded licence and
   attribution.
6. **Reviewable** — an in-app "report this" path on every fact, triaged weekly.

## 13. The one bet

If we get one thing right, it is this:

> **WorldQuest is a platform, not an app.**

Structured facts + reusable question templates + per-fact mastery + a flexible
progression system means history, astronomy, biology and culture become *content
expansions rather than rewrites*. That single architectural decision, made now, is the
difference between a good geography app and a learning platform.

Everything in [`../engineering/architecture.md`](../engineering/architecture.md)
exists to protect this bet.

---

## Amendments

| Date | Change | Why |
|---|---|---|
| 2026-07-31 | Created from the founder brief | Phase 0 |
| 2026-07-31 | XP is **not** spendable; coins are | The original brief asked "where is XP spent?" Spending a progression score breaks leagues and levels. Split into XP (permanent progression) + Coins (spendable). The mockup already shows both. See [`../systems/xp-economy.md`](../systems/xp-economy.md). |
