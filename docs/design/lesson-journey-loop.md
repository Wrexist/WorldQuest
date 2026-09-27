# Lesson → reward → next challenge

## Shipped behavior

- Check and Continue use the turquoise discovery button treatment.
- Correct-answer XP and coins use bounded scale-in reward badges, with the exact grading preview amounts and single accessible reward labels. Amounts do not count up from a misleading interim value on this short-lived sheet.
- The current explorer artwork reacts to correct answers. Positive copy no longer mistakenly puts an entire flag description into a country-name sentence.
- Completed lesson summaries animate the explorer and earned-XP card; the existing real XP count-up remains. Perfect lessons keep the additional confetti. Early exits retain the resting character and stationary reward card.
- Once a finished course lesson is credited, the existing streak, quest, achievement and optional-offer chain leads to `/journey-ready`. Declining a post-lesson paywall preserves that destination.
- The reveal reads the actual saved course standing. A partially finished step offers its next required lesson; a completed step offers the next unlocked node; a finished course offers review. The learner can return Home without starting again.
- Choosing an account-creation flow still leaves the reward chain intentionally, as it did before this change. Non-course lessons and uncredited/early-ended course lessons do not manufacture course advancement.

No economy values, reward grants, question answers or purchase rules changed. The new images are existing rendered artwork animated as UI layers, not newly rigged character performances.

## Verification

77 focused tests cover the runner, summary, reward-chain order, progress persistence and new reveal screen. After the final artwork/copy changes, all 48 runner and summary tests passed again. Mobile TypeScript, locale completeness and static accessibility checks passed.

`scripts/review-lesson-journey.cjs` drives actual browser answers from the shipped geography pack, with one intentional mistake and realistic answer timing. It completes two lessons, walks the reward screens, verifies the partial-step and next-node transitions, and checks the 320px reduced-motion reveal and return to Home. Screenshots, the report and a motion recording are in `reviews/lesson-journey-2026-09-27/`. This is web evidence; physical iOS/Android testing remains outstanding.
