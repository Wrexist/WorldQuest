# Immediate lesson answers

Screen 5, Lesson runner; entered from Home, Explore or onboarding and left through the existing pause/finish path. This serves Priya's quick practice and Alex's clear feedback. Activating an option is the primary action while presenting; Continue is the primary action after grading.

Multiple-choice options now dispatch the existing atomic ANSWER event. The first tap immediately grades, displays the correct/incorrect state and invokes the existing verdict cues. The answered phase rejects later taps until Continue, which still advances explicitly. Typed input retains Check/keyboard submission; matching boards retain their own behavior. No scoring, scheduling, reward, content or server protocol was changed.

The enlarged-text review found that a long verdict could put Continue below the viewport. The feedback panel now has bounded height and scrollable explanation content with Continue outside the scroller, so the action stays visible. Normal-size feedback retains the mascot and explanation together.

Validation: full local `pnpm verify` passed (1,244 mobile tests), the immediate-answer browser journey passed 109/109 steps, and final focused lesson/motion/atlas tests passed 35/35. Typecheck, accessibility lint and scrollable checks passed after the feedback changes. Four final exported-app cases cover 320/390 widths at default and 200% CSS text: no Check, immediate feedback, locked choices and reachable Continue. The accompanying screenshots were visually reviewed. CSS scaling does not establish native Dynamic Type, VoiceOver or physical-device behavior. Native smoke automation was updated but has not been rerun for this change.

Build 20 predates this change. No new TestFlight upload is claimed here.
