# Header and circular platforms

Implements the user's request for less empty space, symmetric circles and a more
graphic top bar. See `../../platform-header-polish.md` for the implementation choices.

Inspected Home at 320 and 390 pixels. The platform face is circular; the ring
surrounds the complete raised platform symmetrically. Upcoming rows are shorter,
and the action panel is more compact. The top bar has a colorful globe and larger
raised coin/streak counters. The pending streak state and real balances are preserved.

Validation: mobile TypeScript and accessibility lint passed; 71 tests passed across
CoursePath, HomeScreen, QuestScreen and ShopScreen. Twenty browser checks passed,
including five tabs at 320/390/768, enlarged text, actual lesson launch and measured
ring symmetry. `browser-report.json` records the shape and center deltas.

Screenshots use reduced motion. Native-device performance and VoiceOver/TalkBack
remain unverified; the full repository suite was not run. No part of this was seen
on a phone.
