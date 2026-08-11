# Question difficulty — what the fact's 1–5 means, and what the modifier means

Two numbers decide how hard a question is, and they answer different questions.

| Number | Lives on | Answers |
|---|---|---|
| `Fact.difficulty` | the fact, 1–5 | how hard is this **thing to know**? |
| `Template.difficultyModifier` | the template | how much harder does this **way of asking** make it? |

An item's difficulty is the sum, and **the sum is not on the 1–5 scale.** Only
`Fact.difficulty` is; adding a modifier of up to 2 puts an item anywhere in 1–7. Nothing
reads the sum as if it were a fact difficulty — `startLevel` filters on `Fact.difficulty`
alone (`apps/mobile/src/features/onboarding/levels.ts`) — and this line says so because
"1–5" in the title of a page whose central arithmetic produces 7 is exactly the kind of
half-true that gets copied into the next thing somebody writes.

Keeping the two apart is what lets "the capital of France" be easy while "Paris is the
capital of which country?" is a step harder, without anybody writing the same fact down
twice.

---

## Why neither number is measured yet, and what would replace them

The field's standard answers both exist and neither is available to a pre-launch app.

**Classical item difficulty** is the *p*-value: the proportion of learners who answer
correctly, where a higher value means an easier item. For a four-option multiple choice
the target is not 0.5 — a learner who knows nothing still scores 0.25 by guessing, so the
midpoint between chance and certainty is about 0.625, and that is where an item
discriminates best.

**Item response theory** replaces that with a *b* parameter: the ability level at which a
learner has a 50 % chance of answering correctly, on a scale where 0 is average and ±2 is
hard or easy. The 50 % reading is the one- and two-parameter models'; a 3PL adds a
guessing parameter *c*, and there *b* is the ability at which the probability is halfway
between *c* and 1 — for four-option multiple choice, about 0.625 again. Worth stating
because four options is what this app asks in, so the 3PL is the family it would actually
calibrate against. It is the better model and it is not free — calibrating one item takes
roughly 100–1000 responses, which is why IRT is a standardised-testing technique rather
than a classroom-quiz one.

WorldQuest has `review_log`, which is exactly the table those numbers come out of. Until
it has users, both fields are **authored priors**, and `pnpm content:validate` already
says so out loud: it reports that authored capital difficulty runs 1.8 in Europe to 3.7 in
Africa — "a prior written from one learner's horizon and applied to every user on earth".
That warning is not a bug to fix by hand. It is the honest description of a placeholder,
and the fix is observed p(correct), not better guessing.

## How the priors are set in the meantime

**Facts** get the median of that country's other facts, and 3 when it has none
(`build-locations.cjs`, `build-country-facts.cjs`). Median rather than mean, because
difficulty is ordinal and averaging ordinals invents values nobody judged. The assumption
is the defensible one: familiarity is a property of the *country* more than of the
attribute — somebody who knows where Brazil is probably knows its flag.

**Templates** get a modifier from the shape of the task, and the ordering below is the
part that is not arbitrary:

| Shape | Modifier | Why |
|---|---|---|
| Recognition — a picture, answered by picking a picture or a name | 0 | The easiest thing a mind does. Flags are the most-recognised category in geography quizzing: aggregate play data puts flag questions several points above capitals, because flags are visual, repetitive and everywhere while a capital is pure recall. |
| Forward recall — the entity is named, the value is the answer | 0 | The direction the fact was learned in. |
| Reverse — the value is given, the entity is the answer | +1 | One value maps to many entities in the learner's head, so retrieval has more to sort through. It is also the direction nobody studied. |
| Reverse over an arbitrary value — a code, a number | +2 | Nothing about "+81" cues Japan. There is no story, no shape and no etymology to lean on, so the only route is rote. |

`tpl.flag-of-country.mc4` **moved from +1 to 0** when its answers became flags instead of
written descriptions. It was rated harder because matching four sentences of prose is
harder — but that was difficulty coming from the *interface*, not from the fact, and
charging a learner for it was the tell that the question was wrong. Making it a picture
question made it a recognition task, which is where the modifier now says it sits.

## Rules that hold regardless

- **A modifier is never negative.** A way of asking can add difficulty; it cannot make a
  fact easier to know than it is.
- **Difficulty is not the same as the scheduler's difficulty.** `Fact.difficulty` is an
  authored prior about everyone. FSRS infers a per-learner difficulty from that learner's
  own answers, and the two are different numbers on purpose — see
  [`learning-engine.md`](learning-engine.md).
- **Filtering on `difficulty` filters the prior.** A user who picks "easy" is asking for
  facts that are easy in general, not the ones they personally find easy — which would be
  a strange thing to request and a stranger thing to practise. See `focusFilter` in
  `packages/engines/src/lesson/focus.ts`.
- **A question that is unfair is not a hard question.** Ambiguity, self-answering prompts
  and giveaway artwork are dropped at generation or refused by `buildQuestion`; they never
  become difficulty. `scripts/build-country-facts.cjs` is most of an essay about this.

## Sources

- [Classical item difficulty (p-value) and the IRT b parameter](https://www.cogn-iq.org/learn/theory/item-difficulty/) — Cogn-IQ
- [What is Classical Item Difficulty (P Value)?](https://assess.com/classical-item-difficulty-p-value/) — Assessment Systems, on sample sizes for IRT calibration
- [Item Analysis Report – Item Difficulty Index](https://www.questionmark.com/item-analysis-report-item-difficulty-index/) — Questionmark
- [Item Response Theory](https://www.publichealth.columbia.edu/research/population-health-methods/item-response-theory) — Columbia Mailman School of Public Health
- [The Hardest Geography Quizzes, Ranked](https://geographyworlds.com/blog/hardest-geography-quizzes/) — an aggregate-play study; the flags-versus-capitals gap above comes from here and is third-party, not ours
