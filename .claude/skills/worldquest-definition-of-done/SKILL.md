---
name: worldquest-definition-of-done
description: Verify a WorldQuest feature is actually complete before claiming it is. Use before opening a PR, before saying a feature is finished, and when reviewing someone else's work. Walks the full Definition of Done and reports honestly on what is not done.
---

# Definition of Done check

Checklist: [`PROJECT.md §12`](../../PROJECT.md#12-definition-of-done) ·
Reasoning: [`docs/engineering/definition-of-done.md`](../../docs/engineering/definition-of-done.md).

**There is no "we'll do it in a follow-up".** The follow-up never comes — it becomes a
ticket, then a backlog item, then a known issue, then the reason someone with a screen
reader can't use the app.

If the work isn't finished, the honest response is **less scope, fully done** — not
more scope, half done. Report what is incomplete plainly rather than claiming
completion.

## Run this

```bash
pnpm verify        # typecheck · lint · test · content · i18n · a11y
```

Then walk the list by hand — most of it can't be automated.

## Function
- [ ] iOS **and** Android, phone and tablet, down to 320 pt
- [ ] All five states: content · loading (skeleton, not spinner) · empty · error · offline
- [ ] Offline behaviour defined and implemented (queue, cache, or an explicit graceful block)
- [ ] Server-authoritative for anything rewarding

## Quality
- [ ] Unit tests for engine logic; component tests for interactive UI
- [ ] No new `any`, `@ts-expect-error`, or lint suppression
- [ ] Performance budget met on a **mid-tier Android**, not a flagship
- [ ] Error paths logged to Sentry with actionable, PII-free context

## Craft
- [ ] Design tokens only — zero hardcoded colours, spacing, radii, durations
- [ ] Correct motion token; **reduced-motion path actually verified**, not assumed
- [ ] Haptics on every meaningful outcome
- [ ] Sound respects the Settings toggle

## Inclusion
- [ ] Every string an i18n key; `en` + `sv`; no concatenation
- [ ] Screen-reader labels, roles, focus order verified with VoiceOver **and** TalkBack
- [ ] Contrast ≥ 4.5:1; targets ≥ 44×44 pt; colour never the sole signal
- [ ] Survives 200 % text and RTL

## Product
- [ ] Analytics events fired per the spec
- [ ] Serves a named persona; consistent with the Product Bible
- [ ] Copy reviewed against the voice guide — no shaming, no dark patterns
- [ ] Docs updated, including `PROJECT.md` if a rule changed

## Waivers

Allowed only with: a written reason in the PR, a named owner, and a dated follow-up
issue. **More than three open waivers pauses feature work.**

**Never waivable, under any deadline:** server-authoritative rewards · child-privacy
rules · data deletion · shipping a wrong fact.

## Reporting

State exactly what is done and what is not:

> Done except: reduced-motion path unverified on the celebration overlay (waiver
> #142, owner @x, due Friday). Everything else ticked.

Never report "complete" with an unticked box.
