# Lesson error recovery — rendered review, 2026-10-03

**Verdict:** passed the focused browser checks. No clipping, missing character,
unreachable recovery action, or ongoing retry loop was observed in these cases.

The real D1 Expo export was served on local port 4246. Both scenarios completed
onboarding through `walkOnboarding`, tapped the taster's Start learning action, and
reached the real `/lesson?taster=1` route. No account or onboarding state was seeded.
The export was `entry-f104490c078a893cba08f5cf3b6a8a5f.js` (3,073,771 bytes).

Every API request was intercepted before network dispatch, including the baked-in
`http://localhost:4174` origin. No Worker, production service, or another harness's
local Worker received these requests. Health checks returned success so a failed
transport exercised the generic error branch rather than an offline screen.

Run again from the repo root:

```sh
node scripts/review-lesson-errors.cjs node_modules/.cache/wq-web-d1
```

## Captures inspected

Eight cases, each with a top screenshot and a recovery-actions screenshot (16 PNGs):

| API failure | English, normal text/light | Swedish, 200% glyphs/dark/reduced motion |
|---|---|---|
| Guest creation returns 503 `API_NOT_READY` | 320×568 and 390×844 | 320×568 and 390×844 |
| Guest creation aborts with a transport failure | 320×568 and 390×844 | 320×568 and 390×844 |

The Swedish mode was selected using Settings after onboarding; the lesson was then
reopened through its real deep link. Screenshots are saved at device scale 2.

At the 320-point floor the full Atlas cutout, thoughtful pose, clouds, clay card,
heading, body and recovery control are coherent and unobscured. Enlarged Swedish
copy makes the card taller than the screen; scrolling exposes the complete controls
without horizontal movement or truncated copy. The generic error clearly presents
Try again as the primary action and Back as the secondary action.

Representative screenshots:

- [Unavailable, English 320](unavailable-320-en-normal.png)
- [Unavailable, Swedish 320](unavailable-320-sv-dark-glyph2-reduced.png)
- [Unavailable, Swedish 320 — reachable Back](unavailable-320-sv-dark-glyph2-reduced-actions.png)
- [Transport failure, English 320](transport-320-en-normal.png)
- [Transport failure, Swedish 320 — reachable Retry and Back](transport-320-sv-dark-glyph2-reduced-actions.png)
- [Transport failure, Swedish 390](transport-390-sv-dark-glyph2-reduced.png)

## Measured behavior

[report.json](report.json) contains all cases and action bounds.

- All eight cases decoded the 512×512 thoughtful Atlas artwork and showed no sprite
  film; every card had the expected clay gradients.
- No sideways page scroll or text outside the viewport in any case.
- All recovery controls measured at least 44×44 CSS points and were fully reachable
  after scrolling when needed.
- Unavailable presents Back without Retry; Back returned to `/` in both languages.
- Transport failure presents Retry and Back. Each explicit Retry issued one new
  guest request, returned to the error state, and left Back usable. Back returned to
  `/` in both languages.
- The shared query client's bounded recovery attempts were allowed to settle for
  8.5 seconds, then request counts stayed unchanged for a further 3 seconds in all
  four interaction checks. This is a quiescence check, not a claim of zero automatic
  requests: totals include onboarding, account/progress queries and route changes.
- Zero page errors and zero attempted external resources outside the intercepted
  API origin and local static app.

This check used Chromium and React Native Web. The 200% pass enlarges rendered glyphs;
native Dynamic Type layout branches, VoiceOver, native scrolling and iPhone frame
times were not tested. No part of this was seen on a phone.
