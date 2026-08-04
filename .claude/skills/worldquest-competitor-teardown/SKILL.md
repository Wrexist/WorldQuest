---
name: worldquest-competitor-teardown
description: Research and document a competitor product for WorldQuest. Use when analysing a competing app, updating competitive research, or evaluating a new entrant. Produces a structured teardown answering the five standard questions.
---

# Competitor teardown

Existing research:
[`docs/product/competitive-research.md`](../../docs/product/competitive-research.md).

## The five questions (every teardown answers all five)

1. What do they do well?
2. What keeps users coming back?
3. What do users complain about?
4. How do they monetise?
5. **Where can WorldQuest be meaningfully different?**

Question 5 is the point. A teardown that only describes the competitor is a wasted day.

## Required sections

```markdown
### <Product>
**Positioning** — one sentence, in their words
**Onboarding** — timed, screenshotted, step by step. How long to the first real
                 moment of value?
**Core loop** — the 30-second version
**Retention mechanics** — what actually brings people back, ranked
**Monetisation** — model, price, paywall placement, with a DATED screenshot
**Accessibility** — 5-minute VoiceOver check. Most competitors fail this; it's a gap.
**Reviews** — top 20 at 1★ and 5★. The 1★ reviews are the most valuable research
              available and almost nobody reads them.
**The one thing to steal**
**The one thing to avoid**
**Where WorldQuest wins**
```

## Accuracy rules — these matter more than the analysis

- **Never state a price, user count, or revenue figure you haven't verified today.**
  Mark it `TODO(verify)` with the date you checked.
- Distinguish **observation** ("the paywall appears after lesson 3") from **inference**
  ("they're optimising for early conversion"). Label the inference.
- Qualitative product observation ages slowly. Numbers age in weeks.
- If a claim comes from a news article or a blog post, cite it and note that it's
  second-hand.

An unverified number that escapes into a pitch deck is worse than no number.

## Where to look

App Store and Play listings (with dates) · the actual product, used for a week ·
1★ and 5★ reviews · their changelog (shows what they're betting on) · their careers
page (shows what they're building) · their support docs (shows what breaks).

## Then update the synthesis

A teardown that doesn't change the gap table at the bottom of
`competitive-research.md` hasn't been finished. Ask: does this competitor close one of
our five gaps? Does it open a new one?

## Re-verification cadence

Each product quarterly; the whole document before any external use.
