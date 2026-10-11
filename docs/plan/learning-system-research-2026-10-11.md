# A better training system: research and plan (2026-10-11)

Owner's request: research similar apps and sites, look at their questions and how their systems
work, and build a better one using the techniques proven to work; perfect every question; add a
lot more to learn. Plus, during the work: categories per country (famous people, places…) to
practise something specific; smooth, professional motion everywhere.

Three research passes (20 products, the learning-science literature, licensable data sources) and
an audit of all 26,983 generated questions. Sources are cited inline; anything unconfirmed is
`TODO(verify)`.

---

## 1. What the best products do, and where they fail

Products covered: Seterra, Lizard Point, JetPunk, Sporcle, StudyGe, Worldle, Globle, Travle,
Countryle, Flagle, GeoGuessr (+ Learnable Meta), Duolingo, Anki *Ultimate Geography*, Quizlet,
Brainscape, Memrise, Kahoot, Flags 2, Flags of All World Countries, GeoMaster.

**Nobody combines the three things that matter.** The map games (Seterra, Lizard Point,
JetPunk, Sporcle) have great question formats and no memory model: no spacing, no review. The
memory tools (Anki, Brainscape) schedule well but self-grade and look like spreadsheets. The
daily puzzles (Worldle family) are delightful once a day and teach little. Duolingo has the loop
and no geography. That is the gap WorldQuest is built for.

Ideas worth taking, by source:

| Idea | From | Why |
|---|---|---|
| Contrast notes for look-alike flags ("Chad: blue nearer the pole than Romania's") and those pairs as wrong answers | Anki UG; Seterra "Very Similar Flags" | Teaches the difference instead of punishing the confusion |
| Capital hints and multi-capital rules (South Africa, Bolivia) | Anki UG CONTRIBUTING | Kills the "two right answers" bug |
| Published inclusion rules, pinned sources, edits lagged months | Anki UG | Ends "is X a country?" and stale-capital churn |
| Old names accepted as answers (Kiev, Burma, UAE) | Anki UG, Globle | Correct answers never marked wrong |
| Step-down help: 3 tries with hints → no hints → 1 try; single-colour map | Lizard Point, Sporcle "No Outlines" | Desirable difficulty with a ladder |
| A wrong guess is shown where it is, with direction | Worldle; app-store requests | Built in the map quiz (#38) |
| Bonus-round chain: one country, several facts in a row | Worldle | Interleaving as a game |
| Neighbour-path puzzle, higher/lower attribute clues | Travle, Countryle | Reasoning, not recall |
| Label hard questions as hard | Duolingo | "I don't feel as bad, because you warned me" |
| Mistakes review that costs nothing; Energy for correct runs instead of losing hearts | Duolingo (Energy test: beginners 2× more likely to run out of hearts) | Challenges our hearts design — an owner decision |
| "X % of players get this" | JetPunk | Calibrates difficulty, softens a miss |
| Tolerant typed grading | Quizlet | Already ours (`matchTyped`) |
| Explain the clue after every answer | Learnable Meta | Elaborative feedback |

Failures to block (each has a real example in the research): the answer printed on the flag
(Nicaragua, Paraguay); several capitals and one "correct"; one name, two places (Georgetown /
George Town); disputed capitals as plain fact; stale capitals and flags; exact-string grading;
civil vs state flags; targets too small to tap; misleading distance feedback; unanswerable
territory questions; maps zoomed too far for context; speed scoring that rewards guessing.

## 2. What the evidence says works (with effect sizes)

| Technique | Evidence | Status here |
|---|---|---|
| Retrieval practice | g = 0.50; cued recall 0.61 vs recognition 0.29; with feedback 0.73 (Rowland 2014, doi:10.1037/a0037559) | Core ✓ |
| Spacing | +64 % recall at the best gap; best gap ≈ 10–20 % of the retention interval (Cepeda 2008) | FSRS ✓; same-day repeats still possible |
| **Successive relearning** — practise to a correct recall, then relearn across sessions | Recall a week later ~20 % → ~80 % (Rawson et al. 2018); works with 8th graders | **Biggest gap**: a miss is re-asked once, unscheduled |
| Interleaving confusable visual items | g = 0.67 for visual material (Brunmair & Richter 2019) | Not targeted |
| Explanatory feedback | g = 0.49 vs answer-only 0.32 vs right/wrong 0.05 (Van der Kleij 2015) | Answer + map ✓; no "why" line |
| Errorful generation / pretesting with immediate feedback | Kornell, Hays & Bjork 2009 | New facts cost no heart ✓ |
| Recall beats recognition; each direction is its own memory | Bertsch 2007 d = 0.40; Pan & Rickard 2018 | One memory per fact today |
| Plausible, competing distractors | Little et al. 2012; Roediger & Marsh 2005 | Fixed in this pass for fame questions |
| Rewards: informational praise helps, contingent tangible rewards hurt children | Deci, Koestner & Ryan 1999; leaderboards lowered scores (Hanus & Fox 2015) | XP/coins are contingent — review |
| Overlearning fades; stop drilling at criterion | Rohrer et al. 2005 (geography facts) | ✓ shape |
| Children are overconfident: never let self-rating decide mastery | Rhodes & Tauber 2011; developmental studies | ✓ |

## 3. Audit of our own questions (2026-10-11)

All 95 templates × sampled questions, read by hand, plus automated checks:

1. **Implausible wrong answers on "where is X from?"** — Marlon Brando beside Barbados,
   Jamaica and Haiti; a Norwegian club beside Vatican City. *Fixed:* `distractors.peersOnly`
   keeps only countries that have that kind of thing (`peers.test.ts`); 20 templates.
2. **Misspelt names from Wikidata labels** — "Andrcu Onana", "Takuma ano", "Rafael Márquez El
   piojo". *Fixed:* names now come from Wikipedia article titles where unqualified
   (`scripts/fetch-fame-titles.cjs`); 518 names cleaner ("Real Madrid CF", "Lacoste", "Honor").
   Titles with a qualifier ("Liverpool F.C. (Montevideo)", "Istiqlal Mosque, Jakarta") keep the
   label: stripped, the first is a more famous club and the second names the city.
3. **Close-number wrong answers inside a measuring difference** — the United States at "about
   9,400,000 km²" beside "about 9,700,000 km²", which another atlas prints. *Fixed:*
   `nearest-values` never offers a figure within 10 % of the answer.
4. Still open: contrast notes for look-alike flags; a "why" line on every miss; multi-capital
   and same-name hints audited against the UG rules.

## 4. Data sources for more content

Natural Earth (public domain) for every map; Wikidata (CC0) as primary; GeoNames (CC BY 4.0) as
the independent cross-check. **The CIA World Factbook was discontinued on 4 Feb 2026** — usable
only as a frozen archive. UNESCO text is non-commercial: Wikidata only. World Bank capital
coordinates are wrong (Bolivia's "La Paz" sits in central Bolivia) — never used.

Best additions, in order: US states (map, capital, flag); capitals on the map; Canadian
provinces; Australian states; German Länder (Berlin and Hamburg have no capital); Japanese
prefectures; Swedish counties and landskap; Brazilian and Mexican states (most Mexican states
have no official flag); UK countries (Northern Ireland has no official flag — never asked);
seas, gulfs and straits; lakes, deserts, ranges, islands, peaks per continent (Elbrus vs Mont
Blanc and Kosciuszko vs Puncak Jaya are definitions — ask Africa, Asia, South America only);
driving side (197), demonyms (194), Olympic hosts. Avoid: national animals and dishes, mottos,
government type, coastline length, exact populations, historical flags.

## 5. The plan

Each phase is one PR, verified and merged before the next.

1. **Question quality** *(this PR)* — the three fixes above, this document.
2. **Learning engine** — successive relearning (a missed fact comes back later in the same
   lesson until answered right, max 3, then tomorrow); a multiple-choice "correct" counts as
   weaker evidence than recall; no same-day repeat of a fact already answered right; "mastered"
   means recalled (typed or tapped) on separate days, the last at ≥ 21 days.
3. **Categories on every country** — the country page lists what there is to learn about it
   (basics, map, famous people, places, companies, clubs…), each practisable on its own.
4. **More to learn** — subdivisions with maps (US states first), capitals on the map, physical
   features, driving side and demonyms; each with sources and a cross-check.
5. **Feedback that teaches** — contrast notes for look-alike flags; a sourced "why" line on misses.
6. **Motion** — one pass over every screen for smooth, consistent, reduced-motion-safe movement.

**Owner decisions needed:** hearts vs Duolingo-style Energy (§1); whether child accounts keep
leaderboards opt-in only (§2).
