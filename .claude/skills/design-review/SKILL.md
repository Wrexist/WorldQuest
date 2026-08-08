---
name: design-review
description: Review rendered UI against the design system, the mockup and WCAG — by looking at the actual screens, not the diff. Use when UI has changed and someone needs to know whether it is good, before a PR, after a visual overhaul, or when asked to "review the design", "check how this looks", "is this shippable", or "/design-review". Runs the real bundle in Chromium at three viewports first, then reads code only to explain what the pictures showed.
---

# Design review

Adapted from [OneRedOak/claude-code-workflows](https://github.com/OneRedOak/claude-code-workflows)
(MIT — see `LICENSE`). The method is theirs; the harness is this repo's, because the
original drives Playwright MCP and this workspace does not have it. See
`.claude/skills/VENDORED.md` for what changed and why.

## The one rule: Live Environment First

**Look at the screen before you read the diff.** A design review conducted by reading
code is a code review with opinions about colour. Every finding in your report must
trace to something you saw rendered or something the harness measured.

```bash
pnpm design:shots                       # 14 routes × 320 / 390 / 768, plus both flows
pnpm design:shots /lesson /country/SE   # just the ones the change touches
```

Then **open the PNGs** in `node_modules/.cache/wq-design-shots/`. Reading
`report.json` is not looking at the app.

It also drives the two flows, because a route list is not the app. Onboarding is one
route showing four screens and the lesson is one route showing five, so a review that
only visited routes was missing nine of them — and the first review to drive them by
hand found a layout broken at 320, a screen-reader contradiction, and two illustrations
missing. Those shots are named `onboarding-*` and `lesson-*`; open them too.

The script gets past the onboarding gate itself. It did not, the first time it ran,
and produced thirty photographs of onboarding slide one with an identical "finding" on
every route — confident, uniform, and worthless. If every route in a run reports the
same thing, distrust the run before you distrust the app.

## What the harness measures, so you do not have to guess

`report.json` carries the three things a picture genuinely cannot show:

| Measured | Why a screenshot cannot show it |
|---|---|
| Touch targets under 44 pt | A 40 pt chip looks fine and fails under a thumb. This found exactly that on the collection filters. |
| Sideways scroll | Four pixels of overflow are invisible until someone swipes. |
| Unlabelled controls | A screen reader announces "button"; the picture shows an icon that reads fine to you. |

Contrast is **already gated** by `pnpm design:contrast` (23 pairs) and 200 % text by
`pnpm e2e`. Do not re-derive them by eye — cite them.

## Then look, in this order

1. **Squint at it.** Blur the screenshot mentally. Is the hierarchy obvious? Does one
   thing dominate, or does every block weigh the same? Sameness is the generated look.
2. **320 first, not 390.** The design target flatters the design. The floor is where
   it breaks.
3. **Against the mockup** — `docs/design/assets/mockup-v1.png`. Deviations are allowed
   and several are deliberate; they belong in `docs/design/mockup-fidelity.md`. An
   undocumented deviation is a finding.
4. **Against the system** — `docs/design/design-system.md`. One primary green per
   screen. Colour means one thing. Depth on anything pressable.
5. **The five states.** Content, loading, empty, error, offline. A review of the happy
   path is half a review.

## Triage every finding

| Level | Meaning |
|---|---|
| **Blocker** | Broken or unusable. Ships over my objection. |
| **High** | Clearly wrong; fix before merge. |
| **Medium** | Should fix; would not block. |
| **Nit** | Prefix literally with `Nit:` so it can be ignored without guilt. |

## Describe problems, not prescriptions

> ❌ "Change the margin to 16px."
> ✅ "The quest card's title sits closer to the card above it than to its own subtitle,
> so it reads as belonging to the wrong group."

The person who owns the screen knows their constraints. Say what is wrong and what it
costs; let them choose the fix. Exception: if the fix is a token they have missed, name
the token.

## What this cannot tell you, and must say so

react-native-web in Chromium is the real bundle, real router, real tokens, real content
— and it is **not a device**. Font rasterisation, native gestures, iOS/Android layout,
haptics and performance are all invisible here. End every report with the line that is
true of every visual claim in this repo: *no part of this was seen on a phone.*

## Report shape

```markdown
### Design review — <what changed>

**Verdict:** ship / ship with fixes / not yet

**Looked at:** <routes> at <viewports>, N screenshots

#### Blockers
#### High
#### Medium
#### Nits

**Measured:** contrast N pairs pass · 200 % text N/N · targets ≥44pt · <or the failures>
**Not covered:** no device; <anything else>
```

Finish with `/wq-dod` if the change is claiming to be done.
