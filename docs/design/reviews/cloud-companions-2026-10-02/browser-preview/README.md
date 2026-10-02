# Cloud companion preview

Historical preview from `node_modules/.cache/wq-clouds-preview`, before the final
cloud aspect-ratio adjustment. `review-liquid-clay.cjs --clouds-only` completed 31
cases and 53 screenshots, with no JavaScript errors.

Home, Quests, Profile and Shop were captured at 320, 390 and 768px in light mode
and Swedish/dark/enlarged text/reduced motion. A real UI lesson produced populated
Profile at all three sizes in both modes; account progress was not seeded.

All clouds decoded and remained decorative with pointer events disabled. Ten
foreground Atlas interactions verified laughing film in normal motion, laughing
still under reduced motion, restoration of the original pose, and unchanged route,
progress and currency. Cloud drift advanced normally and stayed still under reduced
motion. Existing quest CTA, chest, navigation and unaffordable-purchase checks passed.

The default 390px Home, Quest, Shop and Profile screenshots, plus earned Profile at
320/390, were opened and reviewed: the larger companion is clear, the primary
actions remain reachable and the identity/level content is readable.

Two limits/findings are preserved:

- Tall native text layouts stretched the original cloud treatment; the later
  aspect-ratio change supersedes this preview's cloud geometry.
- Browser-only glyph doubling on earned Profile320 records text outside the
  viewport for “Utforskare” and “Bemästrade fakta”. This artificial text pass does
  not activate the native `fontScale` stacking branches. Native fontScale fixtures
  are separate evidence; this report does not call those browser pixels clean.

There was no horizontal document overflow or undersized measured button/tab target.
No part of this was seen on a phone.
