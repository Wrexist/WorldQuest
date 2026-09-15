# Audit 3: experience, visual design and accessibility

**Verdict: coherent visual foundation; fix functional truth and small-screen hierarchy before another redesign.** The app was rendered through react-native-web in Chromium. No part of this was seen on a phone.

## What was inspected

The adapted repository harness captured 18 routes at 320×568, 390×844 and 768×1024 plus 102 flow/state captures. It reported no short touch targets, unnamed controls or sideways overflow in its standard route checks. All 27 curated and 35 generated contrast pairs passed. An English-locale E2E run reported 76/76 checks passing with one additional artwork check skipped; it includes simulated 200% text checks. The accessibility tree audit covered ten routes and 153 named controls. These are automated results, not manual certification.

Directly viewed: Home, lesson and Explore at 320; Home, lesson, country, account and unavailable-store paywall at 390; lesson summary at 320. The initial unadapted images were all Swedish onboarding, because the English-only walker silently missed onboarding; those images were rejected as evidence. The successful captures are linked below and retained in `screens/`. Tablet and all flow images were mechanically captured; not every image was manually reviewed.

## Observed findings

| Severity / ID | Observation | Why it matters / direction |
|---|---|---|
| High / U01 | Home's lesson action is below the first viewport at 320×568; at 390 it is visible after a substantial header and quest card | The key task costs a scroll on the smallest layout. Reduce first-screen competition or expose a compact start/resume action. This is a hierarchy finding, not a claim that the page cannot scroll. |
| High / U02 | Sweden's facts say “Learn it first” instead of showing the capital, flag/currency detail and location information | Browsing cannot teach the fact before quizzing it. Show study content with separate unlearned status, unless user research establishes a compelling reason for hiding it. |
| High / U03 | The paywall promotes unlimited hearts, offline packs, deep stats and exclusive cosmetics while the runtime shows store unavailable | Current promised value must be individually verified. Do not let a finished visual design mask unfinished purchases or features. |
| Medium / U04 | The account screen promises that every fact is available on another phone | This is stronger than the current memory hydration/account lifecycle implementation. Repair the behavior, then retain the reassuring copy. |
| Medium / U05 | Home foregrounds coins, rank and quests before geographic ability | A beginner should know what they are learning next and why. Keep rewards subordinate to that decision. |
| Medium / U06 | The lesson summary leads with XP; “facts stronger” is a model transition, not a delayed retention measurement | Explain what changed in human terms and avoid implying six enduring facts learned from six immediate correct answers. |
| Positive | Map questions are readable, answer controls have strong hierarchy, Atlas is consistent, typography is recognizable | Keep this system. A wholesale visual rewrite has low expected value relative to the open learning defects. |
| Positive | Paywall error says nothing was charged and allows dismissal/restoration | Preserve honest error states when real billing is connected. |

Evidence: [Home 320](screens/home@320.png), [Home 390](screens/home@390.png), [map lesson](screens/lesson@390.png), [country](screens/country-SE@390.png), [account](screens/account-mode-link@390.png), [paywall](screens/paywall-source-settings@390.png), [summary](screens/lesson-summary@320.png).

## Journey audit

**First launch.** The onboarding flow has welcome, language, value messaging, age, goal and personalization steps before a taster. It has care and visual identity, but the number of decisions should earn its cost. Measure user time-to-first-question and step abandonment, not the time a harness spends sleeping. Defer optional customization until after value. Keep the age decision early enough to enforce actual server policy.

**First lesson.** The controls are clear. A direct normal lesson rendered 20 questions in the inspected state, so validate “five minutes” across slow readers and assisted interaction. The small-screen lesson adapts successfully in the checked map state; do not infer every image/feedback/keyboard state also fits.

**Return visit.** Saved memory is the central missing piece. Without it, a polished return screen cannot recommend the correct review or show place-level knowledge. Resume an interrupted lesson, preserve its questions, and tell the learner which progress is safely stored and which is pending.

**Mistakes.** Keep the non-shaming tone. Add useful explanation and a choice to review the fact. Test heart exhaustion with genuinely learned facts after L01 is fixed; the current empty map can hide the normal paid/free branch by treating everything as new.

**Offline.** Bundled lessons are valuable. Distinguish “completed locally,” “waiting to sync,” and “needs attention.” A button named retry should actually schedule a retry and make progress visible. Do not promise immediate cross-device availability before acknowledgement.

**Accessibility.** The content system has text equivalents for visual facts, reduced-motion hooks and named controls. It still needs VoiceOver/TalkBack task completion, focus restoration after modals, screen-reader activation mid-lesson, keyboard focus, OS Dynamic Type, and small map/flag discernibility. The pseudo-locale report leaves some country names as plain ASCII; that is content-localization coverage to investigate, not proof of broken layout.

## Action list

| ID | Priority / owner / effort | Action and completion evidence |
|---|---|---|
| U01 | P1 / Design + Mobile / M | Make start/resume visible on smallest supported initial Home view, including larger text, without covering content. |
| U02 | P1 / Product + Mobile / M | Let country pages teach before testing; fact text, source access and mastery labels are distinct. |
| U03 | P0 / Product + Mobile / M | Audit every paywall benefit against a working feature; remove/defer unsupported benefits before selling. |
| U04 | P0 / Mobile / L | Verify account recovery on a second device before promising full continuity; include purchased cosmetics, preferences and memory. |
| U05 | P1 / Design / M | Reorder Home around today's learning, meaningful progress and optional rewards; five unprompted users can identify the next task. |
| U06 | P1 / Product + Learning / M | Make summary feedback accurate and actionable; distinguish session success from durable mastery. |
| U07 | P1 / Research + Mobile / M | Measure onboarding steps and test a shorter variant; keep mandatory privacy decisions while deferring optional choices. |
| U08 | P1 / Mobile / L | Persist active lesson state/seed/content version; kill/relaunch resumes or explains an explicit safe recovery outcome. |
| U09 | P1 / QA / L | Complete actual iPhone/iPad and Android task passes with evidence on build/OS; verify safe areas, gestures, keyboard and orientation policy. |
| U10 | P0 for blockers / QA / L | Complete core tasks blind with VoiceOver and TalkBack; verify focus, announcements, equivalent questions and no answer leakage. |
| U11 | P1 / QA + Mobile / M | Verify OS 200% text and supported accessibility sizes on devices; tabs, feedback sheets and paywall remain operable. |
| U12 | P1 / QA + Mobile / M | Verify Reduce Motion, sound toggle, silent switch, haptics and audio interruption on devices; no essential signal is sensory-only. |
| U13 | P1 / Design + QA / M | Check color-vision variants, OLED/bright-light legibility, map borders and similar flags at actual display size. |
| U14 | P1 / Mobile / M | Unify loading/empty/error/offline/pending states by actual behavior; preserve user work and provide effective actions. |
| U15 | P1 / Localization + QA / M | Review real English/Swedish copy with large text; add RTL test coverage before claiming RTL support or shipping RTL locales. |
| U16 | P2 / Design + Mobile / M | Offer calmer learning presentation and hide-streak control if validated; accessibility does not depend on payment. |
| U17 | P1 / QA / M | Test deep links from cold start, auth transitions and notifications; every modal/leaf route has a safe way out. |
| U18 | P2 / Design + Mobile / M | Evaluate a tablet information layout from actual tablet usage, rather than stretching the phone column. |

The design harness is evidence for dimensions and routes it actually measured. It is not evidence of native performance, Apple approval, screen-reader comprehension, or a completed learner journey across days. No part of this was seen on a phone.
