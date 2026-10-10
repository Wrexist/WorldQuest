# Map quiz: find the country on the map

**Status:** built 2026-10-10 on `feat/map-mode`. Owner's request: "choose like Europe, the globe
shows Europe, it tells you a country, and you have to click where it is."

**Persona:** every one of them, and the child first. This is the geography game people already
know from school (Seterra, Lizard Point) and the one thing a globe in a learning app is
obviously for. **Phase:** v1.0 — it adds a way of asking about facts the pack already has
(`location`), not a new subject.

---

## 1. What it is

1. Explore → choose a continent chip → **Find countries in Europe**. The continent page offers
   the same button under Start.
2. A lesson of the usual length: "Find Austria on the map". The globe shows Europe. Every
   country in play is tinted faintly; nothing is named; microstates wear a ring.
3. Tap a country → it lights (not named) → **Check**. Tap another to change your mind first.
4. **Right:** it turns green, its name appears, the camera eases in on it, and the sheet says
   "You found Austria on the map." with the usual reward.
5. **Wrong:** no sheet yet. The tapped country stays lit and named, and a strip over the bottom
   of the map says "You tapped Hungary. Austria is west of Hungary. 2 more tries." Tap again.
   Found on try 2 or 3 → "Found it on try 2." After three misses → "Here's Austria.", the
   country lit, named and framed beside the last miss.
6. Missed countries come back in the end-of-lesson review and to FSRS, like any other miss.

No timer. No sudden death. Hearts follow the ordinary rules (a new fact never costs one).

## 2. What other games do (research, 2026-10-10)

| Product | Wrong answer | Small countries | Source |
|---|---|---|---|
| Seterra | 3 tries, colour by try (white, yellow, dark yellow, red), then the right area flashes | — | [3][4] |
| Lizard Point | Study → Practice (3 tries, hints) → Test (3 tries) → Strict (1 try) | single-colour map is the hard mode | [6] |
| Sporcle picture click | a wrong click does not end the game; "minefield" is opt-in | — | [7] |
| JetPunk | — | arrows and circles; "clicking close… will also work" | [8] |
| Worldle | distance, an 8-way arrow and a closeness % per miss | small countries don't repeat within 7 days | [9] |
| Globle | warmer colour = closer; earlier guesses stay on the globe | — | [10] |
| GeoGuessr | Streaks ends on a miss — an opt-in mode for experts | — | [13] |
| Duolingo | mistakes are reviewed at the end of the lesson and return sooner | — | [16] |

Touch: snapping to the nearest target (the "bubble cursor") beats a plain pointer [17]; 44 pt
iOS / 48 dp Android minimum targets [19]; players ask for zoom because they cannot hit
Luxembourg [21].

## 3. Learning science, and what it decided

- **Retrieval beats restudy, for maps too** [22]: the drill asks; it never shows names first.
  Study is Explore, where every country is named and one tap away.
- **An error corrected at once is better than no error** [23], strongest when the learner was
  confident. So every miss ends in the correction: the tapped country named, the direction to
  the answer, and after three tries the answer itself.
- **Spacing** [16][24]: misses go to the lesson's own review round and to FSRS. Nothing new.
- **Timers for children are contested** [26]: none here.
- Not adopted, on purpose: interleaving across regions (moderate, inconsistent effect [25]; a
  drill is one region), stars per region and a study → practice → test ladder (later, if the
  drill earns its place — the ladder is Explore → drill → the review FSRS already schedules).

## 4. Decisions

| Decision | Why |
|---|---|
| A template, `tpl.find-on-map.tap` (`input: "tap"`), on the existing `location` fact | Content > config > code. Same fact, same memory row, same scheduler; the drill is a way of asking. |
| Every country of the region is an option | The Worker grades only options it issued, so the map may accept exactly those. Grading, hearts and rewards are unchanged. |
| Only the FIRST tap is graded | The server is authoritative and never sees a retry. Tries 2 and 3 are practice: they earn nothing, and the sheet says the country will come back. |
| Select, then Check | A fat-finger tap on a continent is easy; Check is the moment you commit, as everywhere else in a lesson. |
| Tap tolerance (`geo/pick.ts`): ring first, then the outline, then the nearest land within ~22 pt | JetPunk's circles and near-miss tolerance [8], the bubble cursor [17]. Vatican City is otherwise untappable. |
| Rings on every small country in play, not only the answer | A ring on the answer alone would be the answer. |
| Direction hint: "Austria is west of Hungary" | Worldle's arrow [9] as a sentence, with the learner's own tap as the landmark. Initial great-circle bearing between the two countries' anchors (inside each by construction). |
| The hint sits on the map, not above it | The lesson never moves on an answer (owner, 2026-10-09). |
| The reveal frames the answer above the sheet | The sheet overlays; `insets.bottom` = how much of the map it covers, measured in the window. |
| Zoom and recentre buttons on the drill's globe | Gesture-free zoom for small countries (WCAG 2.5.1). |
| Screen readers get `tpl.location-of.mc4` for the same facts | `docs/design/accessibility.md` §8: same facts, same progress, asked by ear. |
| The globe fails → "The map couldn't load…" and End | A drill cannot be answered without it; answers so far are kept. Explore hides the button where the globe is off. |
| Ordinary lessons never tap | A tap needs a pickable map the host did not offer; the filter is in `itemsForFact`, so placement and quests inherit it. |

## 5. Where it lives

- `packages/content/packs/geography/templates.v1.json` — `tpl.find-on-map.tap`
- `packages/engines/src/content/index.ts` — `itemsForFact({ input })`, tap options, no locator
- `packages/engines/src/lesson/compose.ts` — `ComposeInput.input`, `tapFilter`, no pairs
- `packages/backend/src/lesson-tickets.ts` — `input: 'tap'` on prepare
- `apps/mobile/src/features/atlas/scene/locateScene.ts` — the scene, the reveal frame, the compass
- `apps/mobile/src/features/atlas/geo/pick.ts` — which country a finger meant
- `apps/mobile/src/features/lesson/LessonScreen.tsx` — `input="tap"`, tries, the hint, the sheet
- Entry: `ExploreAtlas` (region chip) and `RegionScreen` (secondary button) → `/lesson?region=EU&input=tap`

## Sources

[3] https://handwiki.org/wiki/Company:Seterra · [4] https://teachersfirst.org/single.cfm?id=15887 ·
[6] https://lizardpoint.com/geography/europe-quiz.php · [7] https://www.sporcle.com/games/bortoluka/badge4 ·
[8] https://www.jetpunk.com/user-quizzes/1714819/click-oceanic-islands-on-the-map-hard ·
[9] https://worldle.teuteuf.fr/faq · [10] https://sites.google.com/view/globlegame ·
[13] https://en.wikipedia.org/wiki/GeoGuessr · [16] https://blog.duolingo.com/spaced-repetition-for-learning ·
[17] https://www.dgp.toronto.edu/papers/tgrossman_CHI2005.pdf ·
[19] https://support.google.com/accessibility/android/answer/7101858 ·
[21] https://www.jetpunk.com/message-board/t/map-quiz-zoom · [22] https://www.doi.org/10.3758/BF03194092 ·
[23] https://wesleyan.edu/ofcd/resources/OFCD%20Resource%20Docs/Learning%20from%20Errors.pdf ·
[24] https://www.gwern.net/docs/www/uweb.cas.usf.edu/f1052ecdd92f0ecc3f57bdd890a4a6558483ec45.pdf ·
[25] https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf ·
[26] https://hechingerreport.org/proof-points-do-math-drills-help-children-learn/

Seterra's own help pages returned 404; its rows come from third-party descriptions.
TODO(verify): how Seterra handles microstates and zoom today (play one Europe and one
Caribbean quiz on a phone).
