# Accessibility

Built in from commit one, because retrofitting it is a rewrite. Every line here is in
the [Definition of Done](../engineering/definition-of-done.md) — not a separate
"a11y pass" that gets cut when we're late.

**Target: WCAG 2.2 AA**, plus the platform conventions (iOS Accessibility, Android
Accessibility Suite).

Two of our eight personas depend on this directly (Ingrid, Emma), and a meaningful
share of the rest use at least one accessibility setting without thinking of it as
one — larger text is the most-used accessibility feature on both platforms by an order
of magnitude.

---


## ARIA props, not `accessibility*`

Use `role`, `aria-label`, `aria-checked`, `aria-disabled`, `aria-selected` on React
Native elements — **not** `accessibilityRole` and `accessibilityState`.

React Native 0.71+ accepts both and maps ARIA to the native accessibility API, so
nothing is lost on a device. But `react-native-web` **silently drops
`accessibilityState`**: no `aria-checked`, no `aria-disabled`, nothing in the tree. On
the web build every switch, every disabled control and every selected option announced
no state at all — and no test could have caught it, because the attribute was simply
absent.

ARIA props survive both targets and are assertable, which is what makes the component
suite able to test accessibility rather than just layout.

Two details worth knowing:
- The role is `heading`, not `header`. `header` is React Native's spelling and is not
  a valid ARIA role.
- A radio takes `aria-checked`, not `aria-selected`. `aria-selected` is for options
  and tabs; on a radio it announces nothing useful.

Our own components keep `accessibilityLabel` as their prop name — that is our API, and
it reads better than a hyphenated key. They map it to `aria-label` internally.

## 1. Vision

### Colour blindness (~8 % of men — a large slice of our core audience)
- **Never signal with hue alone.** Correct = green **+ tick icon + rising sound +
  success haptic**. Wrong = muted surface **+ the correct answer shown** + neutral haptic.
- Continent identity colours are always paired with a name and a shape.
- Progress bars carry a numeric label (`172 / 195`), never just a filled bar.
- Verify every screen through deuteranopia, protanopia, and tritanopia simulation
  before it ships.

### Low vision
- Contrast ≥ 4.5:1 body, ≥ 3:1 for ≥ 24 px text and UI boundaries. Verified pairs are
  listed in [`design-system.md §1.3`](design-system.md#13-colour-rules).
- **Dynamic Type / font scale to 200 %** with no clipping and no truncated CTAs.
  Layouts wrap and grow; they never scroll horizontally.
- A **High Contrast** theme (all pairs ≥ 7:1) as a Settings toggle.
- Never convey information in an image alone — every flag, map and landmark has a text
  label available.

### Blindness (VoiceOver / TalkBack)
- Every interactive element: `accessibilityLabel`, `accessibilityRole`,
  `accessibilityState`, and `accessibilityHint` where the action isn't obvious.
- **Focus order follows visual order.** Verified per screen, not assumed.
- Modals and sheets trap focus and return it to the trigger on dismiss.
- Live regions announce: item counter changes, correct/wrong results, XP awarded,
  timer warnings.
- Decorative elements (confetti, background stars, Atlas when he's ornamental) are
  `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`.
- **The map question needs a non-visual path.** "Tap Japan on the map" is unusable
  with a screen reader. Solution: map questions expose an equivalent list of
  candidate countries as accessible buttons, and the engine treats both as the same
  item. This is a *content-engine* requirement, not a UI patch — see
  [`../systems/content-pipeline.md`](../systems/content-pipeline.md).

---

## 2. Motor

- **Touch targets ≥ 44 × 44 pt**, always. Increase hit slop, not the visual size.
- ≥ 8 pt between adjacent targets.
- **No action requires a gesture with no button equivalent.** Swipe-to-dismiss always
  has a visible close button. Pinch-zoom on the globe always has +/− buttons.
- **No timed input in the core loop.** Speed Round is opt-in, clearly labelled, and
  excluded in Relaxed Mode. Never required for a daily quest, an achievement path, or
  a streak.
- Full keyboard/switch-control support on tablet and web: visible focus ring
  (`color.border.focus`), logical tab order, Enter/Space activate, Escape dismisses.
- Nothing requires two simultaneous touches.

---

## 3. Hearing

- **No information conveyed by sound alone.** Every audio cue has a visual and haptic
  twin.
- Sound is off by default; a one-time prompt offers it.
- Any spoken/narrated content (v3.0 Atlas explanations) ships with captions and a
  transcript.

---

## 4. Cognitive & neurological

- **Reduced motion** (`isReduceMotionEnabled`): springs → 150 ms fades, Lottie →
  static end frame, parallax and globe auto-rotation off, stagger off. Some users get
  genuinely nauseated by our celebration animations — this is a real accessibility
  need, not a preference.
- **No flashing above 3 Hz.** Confetti and celebration particles are checked against
  the photosensitive-epilepsy threshold.
- **Relaxed Mode** (v1.5): no timers, no hearts, no leagues, no streak pressure,
  larger default type, calmer motion. Serves Ingrid, Emma, anyone with an anxiety
  disorder, and every classroom.
- Plain language: short sentences, common words, one idea per screen.
- **Consistency is an accessibility feature.** The green button is always in the same
  place and always means "continue".
- No unexpected context changes. Nothing auto-advances without the user acting, except
  clearly-labelled speed rounds.
- Errors are recoverable. Destructive actions confirm and, where possible, undo.

---

## 5. Implementation

### React Native primitives

```tsx
<Pressable
  accessible
  accessibilityRole="button"
  accessibilityLabel={t('lesson:answer.label', { country: option.name })}
  accessibilityState={{ selected: isSelected, disabled: isLocked }}
  accessibilityHint={t('lesson:answer.hint')}
  hitSlop={12}
  onPress={handlePress}
/>
```

**Rules**
- Labels come from i18n keys — an `accessibilityLabel` is user-facing copy and follows
  every rule in [`voice-and-tone.md`](voice-and-tone.md).
- Never label a control with its icon name ("chevron"). Label it with its action ("Back").
- Announce state changes with `AccessibilityInfo.announceForAccessibility` for results
  and XP, sparingly.
- `accessibilityLiveRegion="polite"` on the item counter and progress bar.
- Group related content with `accessible={true}` on the container so a card reads as
  one element, not seven.

### The primitives carry it

`packages/design` primitives require the a11y props at the type level where it
matters — a `Button` without a label should be a type error, not a review comment.
Design the API so the accessible path is the easy path.

---

## 6. Testing

| Layer | How | When |
|---|---|---|
| Automated lint | `eslint-plugin-react-native-a11y` | Every commit (CI) |
| Contrast | Token-pair checker over `tokens.json` | Every commit (CI) |
| Component | RNTL a11y queries (`getByRole`, `getByLabelText`) | Every component test |
| Screen | Manual VoiceOver + TalkBack pass | Every screen, before merge |
| Scale | Screenshot tests at 100 % and 200 % text | CI |
| Colour blindness | Simulator screenshots, 3 types | Per release |
| Real users | Testing session with disabled users | Before v1.0 and per major release |

**The manual pass is not optional and cannot be automated away.** Automated tools catch
roughly a third of real accessibility problems. Put on the headphones, turn off the
screen, and try to complete a lesson.

---

## 7. Per-screen checklist

Copy into every screen ticket:

- [ ] All targets ≥ 44 pt with ≥ 8 pt separation
- [ ] Contrast verified for every text/background pair
- [ ] Every control has a label, role, and state
- [ ] Focus order matches visual order (verified with a screen reader)
- [ ] Works at 200 % text with no clipping or horizontal scroll
- [ ] Reduced motion path verified
- [ ] No information conveyed by colour, sound, or motion alone
- [ ] Screen reader can complete the primary task **end to end**
- [ ] RTL layout mirrors correctly (globe, flags and maps do **not** mirror)
- [ ] No flashing > 3 Hz
- [ ] Works with the OS "reduce transparency" and "bold text" settings

---

## 8. Known hard problems

Written down so they get solved rather than forgotten.

| Problem | Approach |
|---|---|
| **Map tap questions with a screen reader** | Equivalent accessible list of candidates; same item, same FSRS state |
| **Flag recognition for blind users** | Flags become descriptive questions ("Which country's flag is a red circle on white?") — a template variant, generated from the same fact |
| **The 3D globe** | Full accessible fallback = the continent grid (screen 9); the globe is never the only path |
| **Speed rounds** | Opt-in; excluded from all required progression; off in Relaxed Mode |
| **Streak anxiety** | Streak freeze, streak repair, and a full "hide streaks" setting |
| **Colour-coded continents** | Always paired with name + silhouette shape |

## 9. Statement of intent

We will publish an accessibility statement in-app and on the website before v1.0,
with a real contact address for reports and a committed response time. A user who
cannot use WorldQuest is a bug report, and we treat it at the same priority as a crash.
