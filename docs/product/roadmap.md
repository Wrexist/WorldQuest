# Roadmap

Not a promise of dates — a promise of **order**, with an exit criterion for each
phase. We do not start the next phase until the current one exits.

> The most expensive mistake available to us is building v2.0 features during v1.0.
> The second most expensive is skipping Phase 1.

---

## Phase 0 — Foundations · *no product code*

**Goal:** make every subsequent decision cheap.

Product bible · personas · competitor teardowns · IA · screen catalogue · design
system · learning engine spec · content pipeline spec · XP economy · data model ·
analytics spec · security & privacy · ADRs · `PROJECT.md` · `.claude/` tooling.

**Exit:** every document in [`../README.md`](../README.md) exists and has been read
end-to-end by whoever will build from it. Status:
[`../plan/phase-0-checklist.md`](../plan/phase-0-checklist.md).

**Do not skip.** Phase 0 is two weeks that saves six months.

---

## Phase 1 — Walking skeleton · *~2 weeks*

**Goal:** prove the architecture with one vertical slice, end to end. Ugly is fine.
Fake is not.

```
sign in (Supabase, anonymous) 
  → load a real content pack (5 European flags)
  → run 5 items through the real lesson state machine
  → grade with the real FSRS scheduler
  → write user_facts + review_log + xp_ledger via a real edge function
  → show real progress on a real Home screen
  → kill the network mid-lesson and have it still work
```

**Deliberately excluded:** design polish, animation, onboarding, sound, more than one
question type, more than one language file (but the i18n *plumbing* is in).

**Exit criteria — all four:**
1. A real answer changes a real `due_at` on a real server.
2. The whole slice runs offline and reconciles on reconnect.
3. `packages/engines` has zero React/network imports and ≥ 90 % test coverage.
4. Adding a sixth flag requires editing **one JSON file** and nothing else.

Criterion 4 is the thesis test. If it fails, stop and fix the architecture.

---

## v1.0 — MVP · *the mockup, shipped*

**Goal:** a stranger downloads it, learns something, and comes back tomorrow.

**Content** — countries, flags, capitals for all 195 UN member states + observers.
~600 facts, 4 question templates, ~2,400 items.

**Features**

| Area | Scope |
|---|---|
| Learning | Lesson runner · 4 question types · FSRS scheduling · mastery states · review queue |
| Loop | Daily Quest (5 challenges) · streaks + freeze · hearts (never blocking) · XP + coins |
| Explore | Globe · continents · country pages · flags collection |
| Progress | Explorer level · region mastery · country completion · basic profile |
| Onboarding | Taster lesson before account · age gate · goal picker |
| Platform | Offline lessons · sync queue · en + sv · full a11y · analytics · Sentry |
| Screens | Mockup 1–10, 13, 15 + hidden screens H1–H22 |

**Explicitly not in v1.0:** leagues, achievements, landmarks, friends, premium,
shop, classroom, family. *(Yes, that means cutting four screens from the mockup. The
mockup is the v1.x vision, not the v1.0 scope.)*

**Exit criteria:**
- D7 retention ≥ 25 % and WLD ≥ 3.0 in a ≥ 500-user beta
- Crash-free sessions ≥ 99.5 %
- p95 "next items" query < 50 ms
- Zero known incorrect facts
- Full a11y pass on VoiceOver + TalkBack

**Cut-line:** if we're late, cut the 3D globe (fall back to screen 9) and cut coins
(XP only). Never cut offline, a11y, or i18n — those cost 5× to retrofit.

---

## v1.5 — Depth · *reasons to stay*

Landmarks (screen 11) · collections + collection completion · achievements
(screen 14, first ~120) · avatar & cosmetics shop — **the first real coin sink** ·
weekly quests · friend challenges · daily shareable challenge (the Worldle grid) ·
**Relaxed Mode** · home-screen widget.

**Why this order:** v1.0 gives people a reason to start; v1.5 gives them a reason not
to stop. The shop matters more than it looks — until coins are spendable, they're
noise (Product Bible, principle 10).

**Exit:** D30 ≥ 12 % · ≥ 40 % of users own a cosmetic · share rate ≥ 5 % of DAU.

---

## v2.0 — Social & business · *the company becomes a business*

Leagues + seasons (screen 12) · friends & social graph · seasonal live-ops calendar ·
**Premium** · **Family plan** (Marcus) · **Classroom mode** (Sarah) · parent
dashboard · es · de · fr · pt.

**Prerequisite that cannot be skipped:** moderation, reporting, and blocking must ship
*with* the social graph, not after it. A kids' app with unsupervised social features
is a headline waiting to happen.

**Exit:** free → premium ≥ 3 % · ≥ 100 classrooms · league participation ≥ 30 % of WAU ·
zero safety incidents.

---

## v3.0 — Beyond geography · *the thesis pays off*

History · culture · food · wildlife · UNESCO · Atlas AI explanations for wrong answers ·
custom study lists.

**The whole point:** these ship as **content packs**, not features. If v3.0 requires
significant engine work, Phase 1's exit criterion 4 was not really met — that's the
signal to go back and fix the foundation.

**Exit:** a new subject goes from brief to production in **≤ 2 weeks with no engine
changes**.

---

## v4.0 — Platform · *WorldQuest as infrastructure*

Space · economics · geology · climate · custom learning paths · community-authored
packs with moderation · a public content SDK · possibly a web learner app.

---

## The parallel track: content

Content is the long pole and it does not respect release boundaries. Start now.

| When | Content work |
|---|---|
| Phase 0 | Fact schema · sourcing policy · licensing audit for flags and photos |
| Phase 1 | 5 countries, hand-authored, to prove the pipeline |
| v1.0 build | All 195 countries × core facts · 4 templates · sv translation |
| v1.0 ship | Fact-checking pass by a second author · source URLs recorded |
| v1.5 | ~300 landmarks (licensing is the bottleneck, start early) |
| v2.0 | 4 more locales · seasonal event content for 12 months |
| v3.0 | The next subject |

**Licensing for landmark photography is a v1.5 blocker that must start in v1.0.**
Flag SVGs are largely public domain; photographs are not. Budget for it.

---

## What would make us change this plan

- **Phase 1 exit criterion 4 fails** → stop, refactor the content layer. Everything
  downstream depends on it.
- **v1.0 D7 < 15 %** → the loop is broken. Do not add features; fix the loop.
  More content will not save a loop that doesn't work.
- **Classroom demand arrives early** (unsolicited teacher signups) → pull classroom
  forward from v2.0; it is the cheapest distribution we have.
- **A competitor ships geography + spaced repetition well** → shift the wedge to
  breadth (v3.0 subjects) sooner, and lean on the platform thesis.
- **Landmark licensing proves too expensive** → replace with illustrated landmarks,
  which is also more on-brand. Decide by v1.0 ship.
