# User personas

Eight people. **Every feature must serve at least one of them by name.** A feature
that serves "users" serves nobody, and a feature that serves all eight is probably a
platform change in disguise.

Each persona has an **anti-feature**: the thing that would make them delete the app.
Those are as binding as the wants.

---

## 1. Emma — 10 · the kid

> "Can I play the globe game?"

| | |
|---|---|
| **Life** | Year 5. Plays Roblox and Minecraft. Uses a shared family tablet. |
| **Attention** | 4–8 minutes, hard stop. Reads slowly. Skips instructions. |
| **Motivation** | Cute things, collecting, unlocking, showing her friend at school |
| **Learning goal** | None. She is here to play. Learning is a side effect — the whole trick. |
| **Return trigger** | The pet/avatar she's growing; the streak flame; "one more" |
| **Needs** | Big tap targets · imagery over text · instant feedback · Atlas · collections · no reading walls |
| **Anti-feature** | Anything that says she got it *wrong* in a way that stings. Timed pressure. A wall of text. |
| **Monetises via** | Her dad (see Marcus) |
| **Serves the metric** | WLD, virality (school word-of-mouth) |

**Design consequence:** the lesson screen must be playable with the sound off, the
text unread, and one thumb.

---

## 2. Leo — 13 · the school-driven learner

> "We have a map test on Friday."

| | |
|---|---|
| **Life** | Secondary school. Geography homework. Competitive with two friends. |
| **Attention** | 10–20 min in bursts, spikes before tests |
| **Motivation** | Not looking stupid; beating his friends; actually passing |
| **Learning goal** | Real and specific — *this* continent, *by* Friday |
| **Return trigger** | Friend challenges; the leaderboard; a test deadline |
| **Needs** | Topic-scoped practice ("Europe only") · a cram mode · friend challenges · accuracy stats |
| **Anti-feature** | Being forced through content he already knows. Not being able to pick a region. |
| **Monetises via** | Rarely — but drives classroom adoption from below |
| **Serves the metric** | Session depth, referral |

**Design consequence:** *free choice of topic* is not optional. A rigid linear path
loses Leo on day one. This is where Duolingo would fail him.

---

## 3. Alex — 18 · the competitive explorer

> "I want to know every flag. All of them."

| | |
|---|---|
| **Life** | Gap year, travelling, follows GeoGuessr streamers, on the app daily |
| **Attention** | 20–40 min, will binge |
| **Motivation** | Mastery, rank, completion percentages, being *good at this* |
| **Return trigger** | League standing; a season ending; an unfinished collection at 96 % |
| **Needs** | Leagues · seasons · hard modes · speed rounds · global completion % · deep stats · prestige |
| **Anti-feature** | A ceiling. Content that runs out. Being beaten by someone who paid. |
| **Monetises via** | Cosmetics and prestige, not power |
| **Serves the metric** | Retention, league density, content demand |

**Design consequence:** we need *far* more content than the MVP suggests, and a
progression that keeps going past "done". Alex is why v3.0 exists.

---

## 4. Priya — 24 · the commuter self-improver

> "I'd rather do this than scroll."

| | |
|---|---|
| **Life** | First job, 25-minute commute, deleted two habit apps this year |
| **Attention** | Exactly one session, then she's at her stop |
| **Motivation** | Feeling like the day wasn't wasted; quiet self-improvement |
| **Return trigger** | The streak; the morning notification; the fact that it's *easy* |
| **Needs** | Offline · one-handed · a session that *ends* · no login friction · calm visuals |
| **Anti-feature** | Guilt. Noise. A session that won't let her stop. A tunnel with no offline. |
| **Monetises via** | Annual Premium, on a whim, if the app has earned it |
| **Serves the metric** | WLD, D30, revenue |

**Design consequence:** offline lessons are a v1.0 requirement, not a nice-to-have.
Priya is on the metro.

---

## 5. Kenji — 34 · the trivia competitor

> "I got 47 out of 50. What did I miss?"

| | |
|---|---|
| **Life** | Pub quiz team captain. Plays Worldle, Sporcle, JetPunk. Reads the answer explanations. |
| **Attention** | 30+ min, several times a week |
| **Motivation** | Winning; obscure knowledge; being the person who knows |
| **Return trigger** | Daily challenge; global leaderboard; new hard content |
| **Needs** | Hard difficulty · exhaustive content · a *review my mistakes* screen · sources for facts · global daily |
| **Anti-feature** | Easy content. Wrong facts — he will notice, and he will post about it. |
| **Monetises via** | Premium for stats and depth |
| **Serves the metric** | Content quality bar, credibility, organic advocacy |

**Design consequence:** Kenji is our free QA team. The fact-sourcing standard in the
Product Bible exists largely because of him.

---

## 6. Sarah — 36 · the teacher

> "Can I see who actually did it?"

| | |
|---|---|
| **Life** | Teaches geography to 12–14 year olds, four classes, no budget authority |
| **Attention** | 10 min of prep on a Sunday |
| **Motivation** | Engagement she doesn't have to manufacture; evidence of work done |
| **Return trigger** | Assignment deadlines; her own class asking for it |
| **Needs** | Class codes without student emails · assignments · progress export · no social/chat · a safe mode |
| **Anti-feature** | Anything that exposes students to strangers, or requires 30 parent-consent forms |
| **Monetises via** | School purchase order, once she can prove it works (v2.0) |
| **Serves the metric** | Distribution, legitimacy, seasonality that survives summer |

**Design consequence:** classroom mode is *social features off*, not social features
moderated. Ship it as a separate role from day one of the schema — see
[`../engineering/security-privacy.md`](../engineering/security-privacy.md).

---

## 7. Marcus — 42 · the paying parent

> "I'd genuinely rather she used this than YouTube."

| | |
|---|---|
| **Life** | Two kids (10, 7). Guilty about screen time. Pays for things that feel worthwhile. |
| **Attention** | Two minutes, monthly, in the parent dashboard |
| **Motivation** | Screen time he doesn't feel bad about; visible learning |
| **Return trigger** | A weekly "here's what Emma learned" summary |
| **Needs** | Family plan · per-child progress · time limits · ad-free guarantee · a clear privacy story |
| **Anti-feature** | Anything that looks like a slot machine. Ads. Chat with strangers. A confusing subscription. |
| **Monetises via** | **The Family plan — our highest-value conversion** |
| **Serves the metric** | Revenue, trust, App Store rating |

**Design consequence:** Marcus buys the *absence* of things. The no-list in the
Product Bible is a sales asset.

---

## 8. Ingrid — 67 · the lifelong learner

> "I've been to 40 countries. I'd like to know the rest."

| | |
|---|---|
| **Life** | Retired, travelled widely, uses an iPad, larger text enabled |
| **Attention** | 15–20 relaxed minutes, most mornings |
| **Motivation** | Keeping sharp; genuine interest; no competition at all |
| **Return trigger** | Habit and pleasure. Not streaks — she'd shrug at losing one. |
| **Needs** | Large text · high contrast · no time pressure · a *relaxed mode* · rich facts and photos |
| **Anti-feature** | Timers. Tiny text. Being ranked against a 14-year-old. Cartoon noise. |
| **Monetises via** | Annual Premium without hesitation, if it respects her |
| **Serves the metric** | D30, accessibility quality, rating |

**Design consequence:** **Relaxed Mode** — no timers, no hearts, no leagues, larger
type — is a v1.5 setting that also happens to be the accessibility mode. Building it
once serves Ingrid, Emma, and every user with an anxiety disorder.

---

## Coverage matrix

| Feature | Emma | Leo | Alex | Priya | Kenji | Sarah | Marcus | Ingrid |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Daily Quest | ● | ● | ● | ● | ● | ○ | ○ | ○ |
| Streaks | ● | ● | ● | ● | ○ | ○ | ○ | ✗ |
| Free topic choice | ○ | ● | ● | ○ | ● | ● | ○ | ● |
| Leagues | ○ | ● | ● | ○ | ● | ✗ | ○ | ✗ |
| Collections & avatar | ● | ○ | ● | ○ | ○ | ○ | ○ | ○ |
| Offline lessons | ○ | ○ | ○ | ● | ○ | ○ | ○ | ● |
| Deep stats / mistakes | ○ | ● | ● | ○ | ● | ● | ● | ○ |
| Friend challenges | ● | ● | ● | ○ | ● | ✗ | ✗ | ✗ |
| Relaxed mode | ● | ○ | ○ | ○ | ○ | ● | ● | ● |
| Parent dashboard | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ |
| Classroom mode | ○ | ● | ○ | ○ | ○ | ● | ○ | ○ |

● core · ○ neutral · ✗ **actively harmful — must be disableable**

Three features are actively harmful to someone: **streaks, leagues, and friend
challenges**. That is the argument for Relaxed Mode and for classroom safe mode, and
it is the reason none of the three may ever be mandatory.

---

## How to use this document

Invoke the `worldquest-persona-check` skill, or `/wq-persona-check <feature>`. The
answer format:

```
Feature:         Weekly league promotion streak
Primary persona: Alex (competitive explorer)
Also serves:     Leo, Kenji
Harms:           Ingrid, Sarah's students → must be off in Relaxed/Classroom mode
Loop stage:      Return
Metric moved:    WLD, D30
Cost:            League service must run a weekly job; one more state to test
Kill criterion:  If <15% of eligible users engage in 3 weeks, remove it
```

If you cannot name a primary persona, the feature is not ready to build.
