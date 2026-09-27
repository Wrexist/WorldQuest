# Soft adventure / 3D Asset Studio review

The user rejected the restrained white/vector pass and specifically rejected its chest. This replacement uses brighter pastel surfaces, dark labels on lime and sky buttons, larger corners, restored golden Atlas poses, and original 3D rewards. The supplied 3D Asset Studio renders the chest motion and the matching heart/star/coin set. Geometry, scenes and build instructions are in `../../3d/README.md`.

## What changed

- Home: warm yellow daily-goal card, mint unit banner, restored golden explorer, brighter raised path node.
- Explore: lavender world card and a distinct pastel field for each continent. Existing geographic silhouettes remain authoritative.
- Quests and shop: peach/lavender/blue sections, rounded 3D reward icons, coin wallet unchanged.
- Streak reward: turquoise chest with a physical rear hinge and recessed interior, one rising purple collectible, lavender background and a clear receipt. The 40-frame reveal uses one lossless mobile atlas; reduced motion shows the settled pose.
- Tab scenes now have opaque backgrounds. The previous Home/Explore overlap is absent in the actual tab-navigation capture, not just fresh route reloads.
- Daily quests now exclude withheld and template-less facts. A backend test exposed a real case where the quest selected a fact the quiz could not ask, making the task unreachable. Both fresh and remembered unavailable facts have regression coverage.

## Evidence

`index.html` contains the five app captures and an interactive asset preview. `chest/chest-in-app.webm` records the actual app interaction. `chest/report.json` records multiple discrete frame transforms in normal motion and one constant final transform in reduced motion.

- Browser journey: 109/109 checks pass, including tab navigation, lessons, reward collection and large-text checks.
- Chest: one gem saved, cannot reopen after reload, returns to the collection, Continue visible at 320 px / 200% text, no horizontal overflow, no uncaught browser errors.
- Native compilation: iOS and Android both 4.40 MB, under the 4.6 MB budget; approximately 7.59 MB of separate assets. Native export workers are capped at two to avoid exhausting the shared Windows host.
- Typecheck and all post-test gates pass, including 42 curated and 57 generated contrast pairs, accessibility lint, content checks, escape-hatch checks and workflow checks.
- Quest generation regression: 25 tests pass. Backend integration after the filter fix: 32/32 pass.
- Standard parallel verification hit timing limits under host load. Engine timing tests passed serially. The backend compile hook was allowed 120 seconds for its successful rerun; assertion timeouts and assertions were unchanged.

Native device frame rate, haptics, VoiceOver and TalkBack have not been manually verified. These captures are from Expo web. No deployment, commit or push was performed.
