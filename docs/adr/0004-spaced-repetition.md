# ADR 0004 — FSRS over SM-2

**Status:** Accepted **Date:** 2026-07-31

## Context

The product's core claim is that users *retain* what they learn. That requires a real
scheduling algorithm, and the choice determines both retention quality and how much
reviewing we ask of people — which is directly a retention risk (a review treadmill is
the top reason people abandon spaced-repetition tools).

## Decision

**FSRS** (Free Spaced Repetition Scheduler): a three-component memory model
(difficulty, stability, retrievability) with fitted weights and an explicit
`targetRetention` parameter.

## Alternatives considered

| Option | Why not |
|---|---|
| **SM-2 (Anki classic)** | Simple and proven, but a heuristic ease factor with no explicit retention target and no way to fit to our data. Published comparisons consistently show FSRS reaching the same retention with meaningfully fewer reviews. |
| **Leitner boxes** | Trivial to implement, far too coarse. Fine for flashcards on paper. |
| **A custom scheduler** | We are not going to out-research the spaced-repetition community, and we'd have no benchmark to check ourselves against. |
| **Simple "wrong → show again soon"** | Not learning science. It's what every quiz app already does, and it's the gap we're targeting. |

## Consequences

**Buys us:** an explicit, tunable retention target we can expose as a product setting;
fewer reviews for the same retention; the ability to fit weights to our own review log;
measurable calibration (predicted vs observed recall) — the honest metric nobody else
in the category publishes.

**Costs us:** more complex maths than SM-2; requires accumulating a review log before
tuning helps; needs a rating (1–4) that our binary UI must derive from correctness plus
response time.

**Critical mitigation:** `review_log` is append-only and authoritative, and
`rebuild()` recomputes all state from it. Changing weights or even the algorithm never
costs a user their progress. That makes this decision genuinely reversible.

## Reconsider when

Our own calibration data shows a materially better fit from another model — which we
can only know because we're logging the data to find out.
