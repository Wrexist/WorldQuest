# Paywall motion refinement - 2026-10-02

Reference: https://x.com/BreejeAnadkat/status/2105606842076508463/video/1

Owner requested the missing green free-trial animation and mascot movement.

- The measured, rounded green rail fills from the first marker through the second and third over 9.3 seconds. Icon ink and the reading highlight follow the fill. It is a guided explanation, not a countdown.
- Atlas now cycles welcome, resting, wink, resting performances with a 180 ms pause; the existing 36-frame / 18 fps rendered character assets are reused. A gentle bob and tilt sit around the acting. Other screens retain their original playback cadence.
- Clouds drift. No-charge and savings badges have a moving sheen. Selecting a plan springs the card and emits a small star glint.
- Reduced motion shows a still mascot, completed rail, and no decorative loops. Ambient motion pauses on background / screen blur. Timeline geometry follows measured row positions so enlarged text can wrap.

Evidence: paywall-motion.mp4 is a 14-second sampled browser recording at 390 x 844, encoded at 30 fps; it is visual evidence, not a performance benchmark. Screenshots cover light, dark with reduced motion, and Swedish at 320 x 568 with 200% text. No horizontal document overflow in the latter. Preview uses sample store products.

Validation: mobile TypeScript passes; 49 focused paywall/mascot tests pass, including gesture progression, cancelled playback, and timer cleanup. Accessibility lint, escape-hatch checks, and scrollability checks pass. Plan selection updates renewal text in the browser. Reduced-motion DOM has a still image, no sprite film, and a completed rail.

Limits: iOS/Android device performance has not been measured. Staged entrances retain spring/fade/scale rather than the donor's native blur. Billing integration remains unchanged.
