# Atlas and expedition scene review

This replaces the previous restored raster mascot with an original articulated 3D explorer. The screenshot gallery is `index.html`; `atlas-in-app.webm` records real app playback, and `motion-report.json` records the browser checks.

## What changed

- New rounded amber-and-cream Atlas with a dark visor, blinking illuminated eyes, a smile, scarf, backpack, gloves, and boots.
- Five distinct 3D performances: welcome, celebration, thinking, rest, and encouragement. Named joints and animation clips are retained in the editable GLB.
- Native-driver frame playback, a poster during texture decoding, bounded performances, focus/background handling, small portrait stills, and live reduced-motion support.
- A matching original island scene on Home, Explore, and the empty profile. The current unit now sits directly on the canvas rather than inside another large card.
- A tighter greeting and lesson callout, connected path steps, globe-grid continent plates, and a profile scene that scales down on short phones.
- The remaining empty-collection illustration now uses the new chest.

The coin balance, collectible streak gems, server rewards, and lesson progression remain unchanged by this pass.

## Review and verification

- Inspected character drafts, widened the wave/celebration silhouettes so hands clear the head, corrected the island's floor placement, and replaced the mid-blink reduced-motion greeting pose.
- Browser motion checks pass: multiple rendered poses, settlement, app and OS reduced motion, live preference changes, and navigation without uncaught errors.
- 109/109 end-to-end checks pass, including lessons, collections, rewards, accessibility state, and 200% text.
- Targeted character, artwork, course path, Home, Explore, and Profile component tests pass.
- Full mobile regression: 103 test files, 930 tests pass. Coverage gates pass (76.09% statements, 72.98% branches, 72.37% functions, 78.53% lines).
- Mobile TypeScript, accessibility lint, scrolling checks, and escape-hatch checks pass.
- Inspected layouts at 320, 390, and 768 px; the short-phone profile CTA is fully visible after the responsive adjustment.
- Both native platforms build at 4.40 MiB JavaScript, below the existing 4.6 MiB budget. Shipped assets total about 15.15 MiB, including the new character atlases.
- GLB round-trip validation passes: 54 meshes, 6 materials, no external textures, five clips with 36 transform tracks each, a working shoulder track, and approximately 0.291 m character height.

These are browser and build checks. Real-device frame rate, image-cache memory, haptics, and VoiceOver/TalkBack task completion remain device checks; this review does not claim those were performed.
