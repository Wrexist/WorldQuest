# Audit 1: product strategy and competition

**Verdict: compete on remembered geography and an enjoyable daily ritual.** Competing on mascot artwork, coins or the number of screens is unlikely to be defensible. This is a current desk-research comparison, not a claim to have completed native competitor teardowns.

## Product fit

The repository promises world knowledge in five minutes, with geography as the first subject. It also names children, teenagers, adults, older learners, parents and teachers. Supporting all of them equally at launch makes curriculum, accessibility, monetization, privacy and onboarding much harder.

Recommended initial acquisition audience: curious adult beginners and older teens who want to learn geography for travel, news and personal confidence. Preserve protections for younger users who arrive; targeting an older audience does not make the existing child path safe automatically. Add family/classroom distribution only after guardian, recovery and privacy journeys are real. Keep the existing personas as design inputs; choose one initial market rather than deleting everyone else.

Recommended promise: **“Learn where places are, connect them to flags and capitals, and remember them.”** The current app can show pictures and ask questions. Its next claim must be backed by delayed recall, not a counter moving after an answer.

## Competitive comparison

| Product | What public evidence establishes | Repeat-use mechanism / monetization | Where WorldQuest can differ |
|---|---|---|---|
| Duolingo | Broad subject offering, progression, varied exercises, social and character work | Lessons, streaks, quests, competition; free access and paid upgrades | A focused geography curriculum, connected spatial knowledge and measured retention |
| Seterra | Large geographic quiz catalogue and customizable map practice | Topic practice and challenges; website quizzes/printables free, paid ad-free/challenge options | A clear next lesson, explanations and personal spaced review around a complete map |
| GeoGuessr | Location deduction from real-world imagery | Discovery and competitive play; paid offer requires regional verification | Teach foundational geography before deduction, with predictable short sessions and bundled offline material |
| StudyGe | A directly relevant mobile world-geography quiz product | Detailed current retention/paywall behavior not established in this audit | Prove better teaching and recovery, rather than assuming flags/capitals are an unoccupied niche |

Sources checked 2026-09-13: [Duolingo's published product highlights](https://blog.duolingo.com/product-highlights/), [GeoGuessr's own overview](https://www.geoguessr.com/), [Seterra support on free/paid access](https://www.geoguessr.support/support/solutions/articles/206000056685-is-the-seterra-geography-website-free-to-use-), [StudyGe listing](https://apps.apple.com/us/app/studyge-world-geography-quiz/id1444539710). The StudyGe page was intermittently unavailable beyond the initial fetch, so no detailed feature or price claims are made from it.

### Duolingo desk teardown

Positioning: daily game-like learning across several subjects. What it does well: a recognizable habit, varied practice and a strong sense of progress. Its public listing promotes free courses and paid Super benefits including unlimited energy. Selected visible positive reviews describe motivation and perceived progress; they are self-reports, not learning-effectiveness evidence. [Duolingo US listing](https://apps.apple.com/us/app/duolingo-language-lessons/id570060128)

What to adapt: short sessions with a clear objective and a satisfying finish. What to avoid: importing an economy mechanic without showing that it helps learning. The hypothesis that users want less pressure is worth testing; this audit did not obtain a balanced current complaint sample, so it is not presented as a measured market consensus.

Onboarding timing, current regional paywall prices/screenshots, native VoiceOver and a balanced 20 one-star/20 five-star review sample: **not collected**. Do not invent those observations or reuse old research as current. The local competitor-teardown skill requests them for a complete hands-on teardown; P03 below records that remaining research.

### Seterra / GeoGuessr desk teardown

Seterra's broad map practice sets the completeness bar. GeoGuessr sets a discovery/play bar. The repeat-use interpretation in the table is an inference from their product formats. What to adapt: topic breadth and a strong geographic task. What to avoid: assuming that a static fact catalogue becomes a curriculum by adding points. Current native onboarding, accessible interaction, review complaints and storefront prices remain unverified. WorldQuest's opening is the combined teach/retrieve/revisit loop, if it actually works.

### StudyGe desk teardown

Treat this as a direct comparison candidate, not a dismissed trivia app. Its listing establishes the category overlap. Run the same country/flag/capital task and the same seven-day return scenario in both apps before claiming an advantage. Onboarding, retention mechanics, accessibility, complaint themes and regional paywall remain open research. The feature to study first is its geography interaction; the pitfall to avoid is making claims from screenshots alone.

## Correcting the old competitive thesis

The existing research says everyone is locked to a subject vertical. Duolingo's current subject range contradicts that. It also says other geography products “never schedule”; this audit did not establish universal absence. Replace absolute claims with testable comparisons.

| Proposed advantage | Present evidence | What would make it defensible |
|---|---|---|
| Personal spaced geography learning | Engine exists; client memory integration absent | Due reviews work and delayed tests improve over a basic quiz baseline |
| Habit with less pressure | Kind copy, optional pace, local reminders | Better return/completion without worse retained learning or more anxiety |
| Verifiable learning | Mastery model and source metadata | Published measurement method with held-out probes and honest uncertainty |
| Family-friendly | Child UI branches | Server policy, guardian/recovery flows, billing and disclosures validated |
| More subjects via packs | Architecture supports reuse | A successful first course; expansion must still author pedagogy and modalities |

## Action list

| ID | Priority / owner / effort | Action and acceptance |
|---|---|---|
| P01 | P1 / Product / S | Define the initial audience, countries of launch and job-to-be-done in one brief; use it to rank every backlog item. |
| P02 | P1 / Product / S | Make the product promise about observable geographic ability; remove unsupported “scientifically proven” or language-competitor claims. |
| P03 | P1 / Research / L | Complete native Duolingo, Seterra/GeoGuessr and StudyGe task comparisons; date locale/version/price/screenshots and balanced review samples; record accessibility failures as observations. |
| P04 | P1 / Research / M | Observe 8–12 relevant beginners using WorldQuest without coaching; label this qualitative research, not a statistically representative survey. |
| P05 | P1 / Product / S | Prioritize one first-week geography course and one clear daily recommendation; no competing primary CTAs. |
| P06 | P1 / Product / M | Define activation as a useful completed lesson followed by a meaningful return; instrument the steps and denominators. |
| P07 | P1 / Product + Learning / M | Give learners a visible roadmap of places/skills, prerequisites and checkpoints with free topic choice. |
| P08 | P1 / Product / S | Align home, onboarding, paywall and listing claims to current shipped capabilities and country counts. |
| P09 | P1 / Product / M | Define what “learned,” “mastered” and “retained” mean; expose a short user explanation and consistent metrics. |
| P10 | P2 / Product / M | Test a travel/news context path with a small reviewed content set; judge learning and return rate before expanding. |
| P11 | P2 / Product + Design / M | Add an expedition/passport identity through actual learned places, not more currencies; validate that it helps users understand progress. |
| P12 | P1 / Product / S | Specify free vs paid value so learning, accessibility and progress recovery remain coherent for free users. |
| P13 | P2 / Product / M | Test optional friendly challenges only after anti-abuse and account safety work; make social participation opt-in. |
| P14 | P2 / Product / M | Test weekly learning recap and achievable next-week goal; avoid guilt for missed days. |
| P15 | P1 / Product / S | Make the release backlog distinguish required fixes from experiments; owners can say no to scope without losing the idea. |
| P16 | P3 / Product / XL | Evaluate a second subject only after first-course retention and demand gates; require a content/pedagogy plan, not just a new JSON pack. |
| P17 | P3 / Product / XL | Evaluate classrooms/family plans after guardian, roster, accessibility and privacy workflows; avoid building a teacher dashboard for an unvalidated market. |
| P18 | P1 / Product / S | Reconcile README, PROJECT, roadmap and old audits with current code; preserve historical claims as dated history. |

Effort scale: [audit 2](02-learning-content.md). No app ranking, conversion lift or revenue forecast is promised. The most useful competitor is the learner's existing behavior: scrolling, casual quizzes, or doing nothing.
