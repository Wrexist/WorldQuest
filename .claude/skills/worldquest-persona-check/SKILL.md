---
name: worldquest-persona-check
description: Decide whether a proposed WorldQuest feature should be built, and for whom. Use before starting any feature not already scoped in the roadmap, when scope is growing, or when choosing between competing ideas. Produces a structured verdict against the personas and the Product Bible.
---

# Persona & product check

Sources: [`docs/product/personas.md`](../../docs/product/personas.md) ·
[`docs/product/product-bible.md`](../../docs/product/product-bible.md) ·
[`docs/product/roadmap.md`](../../docs/product/roadmap.md).

**If you cannot name a primary persona, the feature is not ready to build.** A feature
that serves "users" serves nobody.

## Produce this

```
Feature:          <name>
Primary persona:  <one of the eight, by name>
Also serves:      <others>
Harms:            <who this is actively bad for — and how it's disableable>
Loop stage:       learn | return | share | pay
Metric moved:     <from metrics.md>
Roadmap phase:    <and whether that's the phase we're in>
Complexity cost:  <what we carry forever>
What we say no to in exchange:
Kill criterion:   <the measured condition under which we remove it>
Verdict:          build now | build later | don't build
```

## The eight

| Persona | Wants | Would delete the app over |
|---|---|---|
| **Emma** 10 | Play, collect, unlock | Feeling stupid; walls of text; time pressure |
| **Leo** 13 | Pass the test, beat friends | Being forced through content he knows |
| **Alex** 18 | Mastery, rank, completion % | A ceiling; paying to win |
| **Priya** 24 | 5 calm minutes, offline | Guilt; a session that won't end |
| **Kenji** 34 | Depth, obscurity, correctness | Easy content; **a wrong fact** |
| **Sarah** 36 | Assignments, evidence, safety | Students exposed to strangers |
| **Marcus** 42 | Screen time he doesn't regret | Slot-machine mechanics; ads |
| **Ingrid** 67 | Calm learning, respect | Timers; tiny text; being ranked vs a 14-year-old |

## Three features are actively harmful to someone

**Streaks, leagues, friend challenges** — harmful to Ingrid, to Sarah's classroom, and
to anxious users. That is why Relaxed Mode and Classroom safe mode exist, and why
**none of the three may ever be mandatory**. Any new competitive or pressure mechanic
inherits this requirement.

## Check against the standing no-list

Open chat · loot boxes or randomised paid rewards · energy that blocks learning behind
a payment · general trivia with no scheduling · unmoderated UGC before v4.0 · ads.

If the feature is on this list, the answer is no, and the reason is in the Product
Bible — not a matter of taste.

## The five questions from the Product Bible

1. Which persona asked for this, **in their words**?
2. Which loop stage does it strengthen?
3. What does it cost us in complexity, forever?
4. What do we remove or say no to in exchange?
5. How will we know in two weeks whether it worked?

## Phase discipline

Building v2.0 features during v1.0 is the most expensive mistake available. Check
[`roadmap.md`](../../docs/product/roadmap.md) and say so out loud when a request is
out of phase — then let the human decide.
