# Header counters · 3 October 2026

The shared tab header now uses a gold coin capsule and an ice clay streak capsule,
with bold tabular numbers. Streak keeps its existing action and pending-day wording;
coins remain a labelled balance. Avatar and settings actions are unchanged.

These are clipped Playwright screenshots of the **actual Expo web export**, with
isolated cached progress fixtures. They demonstrate layout, not production balances
or native Dynamic Type/shadow rendering. Both headers are 78 CSS pixels high.

| Normal zero values · 390 px, English, light | Larger values · 320 px, Swedish, dark |
| --- | --- |
| ![Zero streak and coin counters](zero-390-light.png) | ![365-day streak and 12,850 coins, displayed as 12,9 tn](high-320-dark-sv.png) |

Numbers use the existing locale-aware `Intl` compact formatter. The visible `12,9 tn`
retains the exact accessible label `12 850 mynt`; the streak label still announces
all 365 days and whether today's lesson is pending. The brand yields space before
the counters need to wrap. At larger native font scales, counters receive their own
full-width row, with no font-size cap or ellipsis. A localized unit may wrap inside
its capsule at extreme sizes.

Verification:

- 81 focused TopBar, Home, Profile and Shop tests passed. After the final unit-wrapping
  correction, all 11 TopBar tests passed again. Coverage includes 999/1,000,
  999,950 rounding to a million, billions, the maximum safe integer, live English-to-
  Swedish switching, exact accessible values, zero/pending/completed streaks and actions.
- Mobile TypeScript and accessibility lint passed.
- Actual exported Home at 390 px/zero/light and 320 px/365 days/12,850 coins/Swedish/dark
  kept both capsules on one row. Profile at 320 px with 999,950 coins retained settings.
- At 320 px, Swedish/dark and 200% CSS text, 12,850 days and 9,007,199,254,740,991 coins
  wrapped inside their capsules. Measured text stayed within each capsule; header
  controls remained at least 44 × 44 px. This is an extreme layout fixture, not a
  plausible streak or wallet, and CSS text scaling is not native Dynamic Type evidence.

Source: `apps/mobile/src/components/TopBar.tsx` and `TopBar.test.tsx`. No reward,
balance, persistence or navigation policy changed.
