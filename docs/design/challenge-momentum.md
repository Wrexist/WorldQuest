# Challenge rewards and continuation

The active platform card shows a gold XP badge sourced from `BALANCE.xp.correctAnswer`, explicitly described as the base reward per new correct answer. This is not a promised lesson total: the grading engine still applies repeat-answer rules, bonuses and the daily soft cap. No economy values or payout logic changed.

The active action now reads “Start challenge” or “Continue challenge” according to the node's saved finished-lesson count, with a brighter primary button. The objective remains its accessibility hint. Unit progress segments reflect completed, current and future nodes; the existing textual count supplies the accessible equivalent. The badge has a bounded entrance animation and respects Reduce Motion.

Completed summaries retain the real earned-XP count-up and now offer “Continue adventure” with a short invitation. Early exits retain their neutral Continue action. The existing reward/achievement sequence still runs; there is no automatic lesson start or skipped reward screen. English and Swedish copy ship together.

Validation: 40 course-path and lesson-summary tests, mobile TypeScript, locale completeness and static accessibility checks passed. Locale checking reports two existing warnings in profile and streak copy. Browser captures are stored in `reviews/challenge-momentum-2026-09-27/`.
