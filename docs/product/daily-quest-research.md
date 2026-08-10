# The daily loop — research, and what it changes

Written August 2026, after the practice picker was rejected: *"I wanted it to be simple
for users with an already structured quiz. Make the app a quest each day."*

That instinct is right, and this document is the evidence for why, plus the one structural
finding that makes it cheap to build.

---

## 0. The finding, first

**The Daily Quest has always been a precise specification of a session, and nothing has
ever played it.**

`packages/engines/src/quests/index.ts` composes five tasks a day, and every task carries
its own `factIds` — the exact facts that task needs answered. Meanwhile Home's Continue
button starts a *generic* lesson, and the quest advances only as a **side effect**: if the
lesson happens to include a fact a task happens to want, the counter moves.

So the app has a structured daily quiz already built, and plays a shuffle instead. Slot 2
says "Know the flag — these four flags", the lesson serves whatever the scheduler picked,
and the user watches a progress bar move for reasons they cannot see. That is the gap
between what this app is and what the user just asked for, and closing it is mostly
*deleting the indirection* rather than building a feature.

Everything below is why that is the right shape.

---

## 1. What the daily-habit products actually do

### One thing, once a day, finishable

Wordle's single-puzzle-per-day limit is repeatedly named as the mechanic rather than a
constraint: it builds anticipation, prevents burnout, and makes the session a *ritual*
attached to an existing routine (coffee, commute) rather than an open-ended app you could
always do more of.([Blossom](https://blossomgame.net/the-psychology-behind-daily-wordle-habits/),
[Economix Everyday](https://economixeverday.substack.com/p/why-youre-addicted-to-wordle-habit))
The scarcity is doing work that unlimited content cannot: when you *could* always play
more, no particular moment is the moment.

Duolingo's unit is a **finished lesson**, deliberately not a trivial tap — set the bar too
low and the streak stops meaning anything.([Deconstructor of
Fun](https://duolingo.deconstructoroffun.com/mechanics/streaks)) It runs **three** daily
quests, each unlocking a chest, with a fourth chest for completing all
three.([duoplanet](https://duoplanet.com/duolingo-chests/),
[Cherish Study](https://cherishstudy.com/duolingo-daily-quests/))

### The picker is the anti-pattern

The habit literature is consistent: identify the **one action you want repeated** and
introduce it early and unmistakably; "one screen, one message, one action".([Procreator](https://procreator.design/blog/mobile-app-design-patterns-boost-retention/),
[Appcues](https://www.appcues.com/blog/mobile-onboarding))

A configuration screen in front of the core action inverts that. It asks the user to make
four decisions before they have done anything, and every one of those decisions is a place
to bounce. Worse, it makes the session *different every day* — and a ritual is a thing that
is the same every day. **The picker was a feature that made the habit harder.**

### Testing beats reading, which is why a quiz is the right daily unit

This is the part that makes a daily quiz more than a retention trick. Repeated testing
produces long-term retention, and the effect is large: learners who self-tested retained
roughly **61 %** of material a week later against roughly **40 %** for
re-reading.([Kudo](http://kudoquiz.com/?p=2494), reporting the classic testing-effect
result) A daily quiz on spaced material is the single best-evidenced study habit there is,
which means the retention mechanic and the *learning* mechanic are the same mechanic here.
That is a rare and valuable alignment, and it is the reason this product can chase a daily
habit without the usual guilt about it.

---

## 2. Streaks — the honest version

### They work

Streak-based loss aversion is one of the most replicated findings in behavioural
economics: losing hurts about **twice** as much as an equivalent gain
feels good (Kahneman & Tversky).([This Is Glance](https://thisisglance.com/learning-centre/how-can-loss-aversion-psychology-transform-app-retention))
Duolingo reports a **14 %** day-7 retention lift from streak wagers, and third parties
attribute a large share of its retention to the streak
generally.([Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/streaks))

### And they backfire, measurably

This is the part a product spec usually leaves out. Roughly **40 % of users who break a
60-day-plus streak abandon the product within two weeks** — the streak's own length becomes
the reason quitting feels
reasonable.([Marketing Monsters](https://marketingmonsters.io/blog/the-science-behind-streak-based-motivation))
Breaking is a *double* loss: the behaviour you valued, plus the record. Wordle shows the
shape plainly — about **90 %** of players reach a 3-day streak and only about **20 %**
sustain 30 days.([Blossom](https://blossomgame.net/the-psychology-behind-daily-wordle-habits/))
There is even a literature on run-streaking as a behaviour-change technique that backfires
once the streak ends.([medRxiv](https://www.medrxiv.org/content/10.1101/2024.12.26.24319676.full.pdf))

> ⚠ Every number in this section is third-party and several are secondary reporting of
> primary work. They are directionally consistent and none of them is ours. Treat them as
> reasons to design a certain way, **not** as targets. Our own targets live in
> [`metrics.md`](metrics.md) and are the only numbers we hold ourselves to.

### What that means for us

Forgiveness has a dose-response and it is not monotonic: two streak freezes beat one, and
three are about the same as two — too much forgiveness erodes the habit it protects.([Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/streaks))

**Our existing design already lands on the right side of every one of these**, and that is
worth stating because it means the research changes nothing about the streak — only about
what the streak is attached to. [`progression.md §5`](../systems/progression.md) already
specifies: a cap of **2** freezes; repair within 48 h, once per 30 days; longest streak
remembered forever; streaks hideable entirely in Settings; and *"losing a streak is stated,
never mourned"*. That last rule is the direct countermeasure to the 40 % abandonment
finding — the moment a streak breaks is the moment a product decides whether the user is a
failure or a person who had a Tuesday.

---

## 3. What changes

### The Daily Quest becomes the session, not a tracker

One card. One button. It plays the quest's own facts, in slot order, resumable all day.
Finishing it is the day's ritual and what holds the streak.

The mechanism is already there and needs one new field: a lesson focused on a **set of fact
ids** — which is exactly what a quest task is. `LessonFocus` gains `factIds`, and
"play the quest" becomes "compose a lesson from the incomplete tasks' facts".

### The practice picker goes

Not buried — **removed**. It is a configuration screen in front of the one action this app
wants repeated, and section 1 is the argument. What survives is the machinery underneath
it, because the same `focus` now serves things that are *not* configuration: the quest
above, "Practise this country" on a country page, and "Start" on a continent page. Those
are structured entry points with a subject; the picker was a form.

### What we are NOT building today, and why

- **The shareable result grid.** Worldle's spoiler-free 🟩🟨⬛ grid is the cheapest viral
  loop this product will ever have, and the research is unambiguous about why it
  spread.([EraGuessr](https://eraguessr.ai/guides/geography-wordle-alternatives),
  [wordle.global](https://wordle.global/en/globle)) It is also **v1.5** in
  [`roadmap.md`](roadmap.md), and it requires the Daily *Challenge* — one shared puzzle
  identical for every user — which is a different feature from the Daily *Quest*. Building
  it now is the mistake the roadmap names first: *"the most expensive mistake available to
  us is building v2.0 features during v1.0."* Worth doing next; not worth doing instead.
- **Chests and a reward ladder per task.** Duolingo's bronze/silver/gold chest per quest is
  effective and is also a variable-reward surface. Our economy already pays per task and a
  bonus for all five ([`xp-economy.md`](../systems/xp-economy.md)); adding a second reward
  layer needs an economy simulation run, not a UI change.
- **Anything that adds urgency.** [`quests-and-liveops.md §7`](../systems/quests-and-liveops.md)
  bans "2 HOURS LEFT!!" outright, and §1 bans mentioning a missed quest ever again. The
  40 % abandonment finding is what those rules were anticipating.

---

## 4. The one thing to measure

If this works, **quest completion rate** should track D7 far more tightly than "lessons
started" ever did, because the quest is now a thing you can finish rather than a thing that
happens to you.

If D7 does not move, the loop is wrong and the answer is not more features —
[`roadmap.md`](roadmap.md) already says so: *"v1.0 D7 < 15 % → the loop is broken. Do not
add features; fix the loop."*

---

## Sources

- [Deconstructor of Fun — Duolingo streak mechanics](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- [Trophy — Duolingo gamification case study](https://trophy.so/blog/duolingo-gamification-case-study)
- [duoplanet — Duolingo chests](https://duoplanet.com/duolingo-chests/) · [Cherish Study — daily quests](https://cherishstudy.com/duolingo-daily-quests/)
- [Blossom — the psychology of daily Wordle habits](https://blossomgame.net/the-psychology-behind-daily-wordle-habits/)
- [Economix Everyday — habit loops and cognitive payoff](https://economixeverday.substack.com/p/why-youre-addicted-to-wordle-habit)
- [Smashing Magazine — designing a streak system](https://www.smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/)
- [Marketing Monsters — the science behind streak motivation](https://marketingmonsters.io/blog/the-science-behind-streak-based-motivation)
- [This Is Glance — loss aversion and app retention](https://thisisglance.com/learning-centre/how-can-loss-aversion-psychology-transform-app-retention)
- [medRxiv — the backfire potential of run streaking](https://www.medrxiv.org/content/10.1101/2024.12.26.24319676.full.pdf)
- [IADB — highlighting streaks and student effort](https://publications.iadb.org/publications/english/document/Streaking-to-Success-The-Effects-of-Highlighting-Streaks-on-Student-Effort-and-Achievement.pdf)
- [KudoQuiz — daily quiz challenges and retention](http://kudoquiz.com/?p=2494)
- [Procreator — mobile design patterns that boost retention](https://procreator.design/blog/mobile-app-design-patterns-boost-retention/) · [Appcues — mobile onboarding](https://www.appcues.com/blog/mobile-onboarding)
- [EraGuessr — geography Wordle alternatives](https://eraguessr.ai/guides/geography-wordle-alternatives) · [wordle.global — Globle + Worldle](https://wordle.global/en/globle)
