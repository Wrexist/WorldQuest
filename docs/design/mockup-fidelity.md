# Mockup fidelity

How close the built app is to [`assets/mockup-v1.png`](assets/mockup-v1.png), what
still separates them, and which differences are **deliberate**.

Regenerate the comparison with `pnpm screenshot`.

![Home: mockup left, built right](assets/screens/compare-home.png)

---

## The three categories

Every difference between the mockup and the app falls into one of these. The
distinction matters, because only the first is a to-do list.

### 1. Buildable now — closed

Structure, hierarchy, colour and layout. All of it comes from tokens, so it was a
day's work once the components existed:

- Avatar with its ring, and the inbox button
- Two-tier greeting (light salutation, bold role) with the streak stacked right
- Quest card with the art bleeding to the card edge
- **Amber** quest progress — the mockup uses gold here, not the green used for
  completion elsewhere, and it means something different (a reward track), so it is
  a `reward` tone on `ProgressBar` rather than a colour override
- Daily Challenge card with countdown in tabular numerals
- Friends / League tile pair
- Five-tab bar with the active tab's filled chip

### 2. Needs assets — blocked on a decision, not on code

The mockup's imagery is generated art. Matching it needs real assets:

| Asset | Mockup shows | Status |
|---|---|---|
| Map thumbnails | Rendered Europe with a pin | `ArtSlot` placeholder at the right size |
| Trophy | 3D gold trophy | `ArtSlot` placeholder |
| Avatar | Illustrated character | Initials in a ringed circle |
| Atlas the mascot | Robot explorer | Not built |
| Card gradients | Blue→dark, purple→dark | Flat surfaces; needs `expo-linear-gradient` |
| Inter + Baloo 2 | The real faces | Both OFL — download and bundle |

Prompts for every one of these are in [`asset-prompts.md`](asset-prompts.md).

`ArtSlot` exists so this is a one-line swap per slot rather than a redesign. The
fonts and gradients are hours of work; the illustration set is the decision already
flagged in the Phase 0 checklist (commission vs licence), and it is the single
biggest remaining visual gap.

### 3. Deliberate deviations — we are not copying these

The mockup is concept art, not a specification. Copying it exactly would ship
things our own Definition of Done forbids.

| Mockup | What we do | Why |
|---|---|---|
| Garbled text inside the progress bar | A clean `7 / 10` | It is an image-generation artifact, not a design |
| `Top 15%` and similar at ~9 px | Minimum 13 px, per the type scale | Below 13 px fails the design system and is unreadable at arm's length |
| Low-contrast grey secondary text | `text.secondary` at ≥ 4.5:1 | WCAG AA is in the DoD and is not waivable |
| Six blocks packed to the screen edge | Same six, scrolling, with breathing room | The mockup's density cannot survive 200 % text, which the DoD requires |
| `12,850 / 15,000 XP` on Profile | The real curve (`50·n^1.9`) | The mockup's numbers do not correspond to any coherent progression; see xp-economy.md |
| No wrong-answer screen | A designed one | Users see it as often as the celebration. Leaving it undesigned is how apps end up making people feel stupid. |

---

## Honest status

**Structure and colour: matched.** Put the two side by side and the layout, the
hierarchy, the palette and the tab bar read the same.

**Texture: not yet.** Gradients and illustration are what make the mockup feel
premium, and both are outstanding. Expect the built app to look flatter than the
concept art until those land — that is the normal gap between a render and a
shipped screen, not a defect.

**The one thing that cannot be fixed by iterating on code** is the artwork
decision. Everything else on this page is scheduled work.
