# Design system

The full spec. [`../../PROJECT.md §8`](../../PROJECT.md#8-design-system) has the
summary; this is the reference you build components from.

**Source of truth:** `packages/design/tokens.json`, which generates `tokens.ts`.
Structure and hue come from [`assets/mockup-v1.png`](assets/mockup-v1.png); the
**interaction language** — a bright face sitting on a solid darker edge that sinks when
pressed, one heavy rounded typeface everywhere, saturated accents that each mean exactly
one thing — is modelled on Duolingo, which is the bar this product is measured against.

Two things about that are worth stating plainly, because they are the questions anyone
reading this will have:

- **We do not use Duolingo's typeface.** Feather Bold is proprietary. Nunito is the
  closest openly-licensed match and is what ships.
- **We do not use Duolingo's exact accent values on text-bearing surfaces.** Their green
  is `#58CC02`, which is 2.09:1 against white — it works on their white canvas, where a
  green button reads as one bright object, and it does not work on our dark one. Every
  accent that carries a label is darkened until white clears 3.15:1. The bright original
  survives one step up the ramp and is used where nothing sits on top of it: progress
  fills, glows, the sheen inside a bar. §1.4 has the derivation.

**The rule:** components consume **semantic** tokens (`color.action.primary`), never
raw palette tokens (`blue.500`). Raw tokens exist only inside `tokens.json`. This is
what makes a light theme, a high-contrast theme, and a seasonal theme possible without
touching a single component.

---

## 1. Colour

### 1.1 Palette (raw)

Every accent is a ramp. `*400` is the vivid step used where **nothing sits on top of
it**; `*500` is the face that carries a white label; `*600` is the edge underneath it.

| Token | Hex | Role |
|---|---|---|
| `space.900` | `#050C1A` | page base, splash, gradient end |
| `space.800` | `#0B1730` | app background |
| `space.700` | `#152A4A` | gradient top |
| `surface.1` | `#15274A` | card |
| `surface.2` | `#1C3360` | elevated card, sheet |
| `surface.3` | `#25437A` | pressed, progress track |
| `border.subtle` | `#24406E` | card ring |
| `border.strong` | `#5E6E88` | option ring, pressable card edge — **neutral slate, never blue** |
| `blue.400` | `#1CB0F6` | non-text accent |
| `blue.500` | `#199AD8` | secondary face |
| `blue.600` | `#126F9C` | secondary edge |
| `green.300` | `#8BE85C` | progress sheen |
| `green.400` | `#58CC02` | progress fill, correct |
| `green.500` | `#47A502` | primary face |
| `green.600` | `#337701` | primary edge |
| `gold.400` | `#FFC800` | XP, coins, trophies |
| `gold.500` | `#E0A800` | |
| `gold.600` | `#A87E00` | edge |
| `flame.500` | `#FF9600` | streak flame |
| `red.500` | `#FF5454` | hearts |
| `red.600` | `#C93B3B` | destructive face |
| `red.700` | `#9E2A2A` | destructive edge |
| `text.1` | `#FFFFFF` | primary text |
| `text.2` | `#A9BEDC` | secondary text |
| `text.3` | `#7B93B8` | tertiary — large text only |

`border.strong` is a **neutral slate on purpose**. It has to clear 3:1 against the
canvas to work as a visible edge, and the first version that did was a saturated blue —
which made every idle answer option look selected, because blue is the selection colour.
Luminance is the requirement; hue is free, and the free choice has to be the one that
means nothing.

**Continent identity** — used only in Explore and on continent chips:
Europe `#4C7BF3` · Asia `#F59E3C` · Africa `#F2C230` · North America `#3FBF8F` ·
South America `#E0663D` · Oceania `#39C0D6` · Antarctica `#A7C7E7`

### 1.2 Semantic tokens (what components use)

```
color.bg.canvas            space.800
color.bg.canvasGradient    [space.700 → space.900]  (135°)
color.bg.surface           surface.1
color.bg.surfaceRaised     surface.2
color.bg.surfacePressed    surface.3
color.border.subtle        border.subtle @ 40%
color.border.focus         blue.400

color.action.primary       green.500     ← "Continue", the one green button
color.action.primaryText   #FFFFFF
color.action.secondary     blue.500      ← "Start Quest", navigation
color.action.tertiary      transparent + border.subtle
color.action.destructive   red.700
color.action.disabled      surface.3 · text on text.3

color.feedback.correct     green.500
color.feedback.wrong       #3A2130      (muted, NOT red — see §7)
color.feedback.neutral     surface.2

color.reward.xp            gold.500
color.reward.coin          gold.400
color.reward.gem           #A855F7
color.status.streak        flame.500
color.status.hearts        red.500
color.status.premium       gold.500

color.text.primary         text.1
color.text.secondary       text.2
color.text.tertiary        text.3
color.text.onAccent        #FFFFFF
```

### 1.3 Colour rules

1. **Semantic only in components.** A raw token in a component is a CI failure.
2. **Contrast ≥ 4.5:1** for body text, ≥ 3:1 for ≥ 24 px text and UI boundaries.
   Verified pairs: `text.1` on `surface.1` = 15.8:1 ✅ · `text.2` on `surface.1` ≈ 7.4:1 ✅ ·
   `text.3` on `surface.1` ≈ 3.9:1 — **tertiary text is for ≥ 18 px only.**
   White on `green.500` ≈ 3.3:1 — **legal for ≥ 18 px bold button labels only**;
   never for 13 px caption text on green.
3. **Never encode meaning in hue alone.** Correct = green **+ a tick + a rising
   sound + a success haptic**. About 8 % of men are red/green colour-blind, and a
   meaningful share of our audience is 10-year-old boys.
4. **One primary green per screen.** If two greens compete, one is wrong.
5. **Gold means "you earned this" or "this costs money"** — never decoration.

---

## 2. Spacing — the 8-point grid

`0 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64`

```
space.0  0    space.3  12    space.6  32    space.9  64
space.1  4    space.4  16    space.7  40
space.2  8    space.5  24    space.8  48
```

Screen gutter `16` · card padding `16` · card gap `12` · section gap `24` ·
icon↔label `4` (the only place 4 is allowed) · above a primary CTA `24` ·
safe-area bottom + `16`.

**No other values exist.** `padding: 15` is a bug.

## 3. Radius

| Token | px | Use |
|---|---|---|
| `radius.sm` | 8 | chips, badges, small tiles |
| `radius.md` | 12 | buttons, inputs, answer options |
| `radius.lg` | 16 | cards, list rows |
| `radius.xl` | 20 | hero cards, bottom sheets |
| `radius.2xl` | 28 | modals, celebration cards |
| `radius.full` | 999 | pills, avatars, progress bars |

Nesting rule: an inner radius = outer − padding, floored at `sm`.

## 4. Elevation

On a dark canvas, elevation is **surface lightness + glow**, not a black shadow.

| Level | Surface | Border | Shadow |
|---|---|---|---|
| 0 flat | `surface.1` | none | none |
| 1 card | `surface.1` | none | `0 2 8 rgba(0,0,0,.35)` |
| 2 raised | `surface.2` | none | `0 6 16 rgba(0,0,0,.45)` |
| 3 sheet/modal | `surface.2` | 2px `border.strong` | `0 12 32 rgba(0,0,0,.55)` |
| accent CTA | `green.500` | none | `0 0 24 rgba(88,204,2,.35)` |

**Every level carries a real 2px border, not just level 3.** On a dark canvas a shadow
is nearly invisible — dark on dark — so a card whose only edge is a shadow has, in
practice, no edge, and a column of them melts into one field. The border draws the
card; the shadow lifts it.

Android: pair every shadow with `elevation` — iOS shadows do not render on Android.

## 4a. Depth — the thing that makes a control pressable

A solid control is two rectangles: a dark **edge** and, sitting on it and offset
upwards, a bright **face**. At rest you see the face plus a few pixels of edge along the
bottom. On press the face slides down by exactly the edge's thickness and lands flush,
so the object looks compressed rather than moved.

| Token | px | Applies to |
|---|---|---|
| `depth.button` | 4 | `Button`, pressable `Card` |
| `depth.card` | 3 | `AnswerOption` |
| `depth.chip` | 2 | small pills |
| `depth.press` | 4 | how far the face travels — equals `button` |

Implemented once, in `packages/design/src/primitives/press3d.tsx`. Two rules:

1. **Only `translateY` is animated.** Height and margin cannot use the native driver,
   so animating them puts the press on the JS thread — which stutters during exactly
   the moments the app is busiest.
2. **The socket owns the layout height.** Nothing below a button moves when it is
   pressed.

Under reduced motion the face still moves; it just arrives instantly, because
`useTiming` collapses the duration to zero. The movement is the feedback that a press
registered, not decoration.

`Card` is the exception and does it with a fat `borderBottomWidth` instead of a socket.
That is deliberate: the comment in `Card.tsx` records what happened the last time that
component grew a second box, and a static bottom edge buys most of the affordance for
none of the risk.

## 5. Typography

**One typeface, every weight heavy.** Nunito, 400–900. Numerals tabular everywhere a
number changes (scores, timers, XP, `172 / 195`).

This used to be Inter for body and Baloo 2 for headings, and the two were fighting:
Inter is a neutral grotesque built for dashboards, Baloo 2 is a round display face, so
every screen read as a serious app wearing a playful hat. Setting an entire interface in
a single rounded face and almost never below semibold is most of why Duolingo reads as
friendly rather than corporate — it is one decision, and it does more work than any
other single value in this file.

| Token | Size/LH | Weight | LS | Use |
|---|---|---|---|---|
| `display` | 34/42 | 900 | −0.6 | Onboarding headline |
| `h1` | 28/36 | 800 | −0.4 | Screen title |
| `h2` | 22/30 | 800 | −0.2 | Section header, question |
| `h3` | 18/24 | 800 | 0 | Card title |
| `body` | 16/24 | 600 | 0 | Default |
| `bodyStrong` | 16/24 | 800 | 0 | Answer options, list rows, stat chips |
| `button` | 17/22 | 800 | +0.6 | Button labels (UPPERCASE) |
| `caption` | 13/18 | 700 | 0 | Metadata, progress counts |
| `overline` | 12/16 | 800 | +1 | Section labels, tab labels (UPPERCASE) |
| `numeric` | 20/26 | 800 | 0 | XP, timers, scores (tabular) |

`body` is 600, not 400. On a dark canvas a 400-weight face at 16 px is thin enough to
shimmer, and this is a product a ten-year-old reads on a bus.

**Rules** — one font family, ever. Never below 13 px. Line length ≤ 60 characters. All
sizes scale with the OS setting to **200 %** without clipping (use
`allowFontScaling`, and test at 200 % as part of the DoD). Never centre more than two
lines of body text.

## 6. Iconography

24 px grid · 2 px stroke · rounded caps and joins · single-colour (currentColor) ·
filled variant for active tab states only. Sizes: 16 (inline), 20 (list), 24
(default), 32 (feature), 48 (empty state).

Every icon that carries meaning has a text label or an `accessibilityLabel`. An icon
alone is never a control unless it is universally understood (back, close, settings).

## 7. Motion

| Token | ms | Curve | Use |
|---|---|---|---|
| `motion.press` | 60 | `easeOut` | A button face travelling `depth.press` |
| `motion.instant` | 100 | `easeOut` | Small state flips |
| `motion.quick` | 180 | `easeOut` | Chips, toggles, tab switch |
| `motion.base` | 260 | `easeInOut` | Screen transitions, sheets |
| `motion.expressive` | 420 | `spring(damping 0.7, stiffness 180)` | Card entrance, mascot, celebration card |
| `motion.celebrate` | 900 | Lottie | Correct answer, level up, unlock |

**Principles**
- Things **scale and spring**; they do not fade in place. Fade is for disappearing.
- Entrance is staggered by 40 ms per item, max 6 items, then all at once.
- Celebration never blocks input — `Continue` is tappable from frame one.
- **Wrong answers get no punishing motion**: no shake, no red flash, no buzzer. A
  gentle settle, the correct answer revealed, a soft haptic. See
  [`voice-and-tone.md`](voice-and-tone.md).

**Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled`): springs → 150 ms fade ·
Lottie → static final frame · parallax and the auto-rotating globe → off ·
staggering → off. This is checked in the DoD, not assumed.

## 8. Haptics

| Event | iOS | Android |
|---|---|---|
| Button press | `impactLight` | `EFFECT_TICK` |
| Correct answer | `notificationSuccess` | `EFFECT_DOUBLE_CLICK` |
| Wrong answer | `impactMedium` (**not** `notificationError`) | `EFFECT_TICK` |
| Level up / unlock | `notificationSuccess` + custom pattern | pattern |
| Streak milestone | custom pattern | pattern |
| Destructive confirm | `impactHeavy` | `EFFECT_HEAVY_CLICK` |

Respects the Settings toggle and the OS setting. Never fires more than once per 300 ms.

## 9. Sound

Short (< 600 ms), musical, in one key (C major) so overlaps don't clash. Correct ·
wrong (neutral, not a buzzer) · unlock · level-up · streak · tap. Off by default on
first launch; a one-time prompt offers to enable. Never plays when the device is
silenced.

## 10. Layout

| | |
|---|---|
| Base | 375 × 812 (design target) |
| Min supported | 320 pt wide (iPhone SE 1) |
| Breakpoints | `sm` < 400 · `md` 400–599 · `lg` ≥ 600 (tablet: 2-column Explore) |
| Grid | 4 columns phone, 8 tablet, 16 pt gutters |
| Touch target | **≥ 44 × 44 pt, always** — extend the hit slop, not the visual |
| Primary action | bottom third, above the safe area + 16 |
| Nothing critical | within 44 pt of the top edge |

## 11. Component inventory

Each ships with: every state, a Storybook story, an a11y strategy, RTL support, and a
snapshot test.

**Primitives** (`packages/design/src/primitives/`)
`Button` · `IconButton` · `Card` · `Sheet` · `Modal` · `ProgressBar` · `Chip` ·
`Badge` · `Avatar` · `Divider` · `Skeleton` · `Text` · `Stack` · `Spacer`

**Product components** (`apps/mobile/src/components/`)
`AnswerOption` · `QuestionPrompt` · `LessonProgressHeader` · `HeartBar` · `XpChip` ·
`CoinChip` · `StreakFlame` · `FlagTile` · `CountryTile` · `LandmarkTile` ·
`ContinentCard` · `CollectionProgress` · `AchievementRow` · `LeagueRow` · `StatTile` ·
`ActivityChart` · `QuestRow` · `MascotBubble` · `CelebrationOverlay` · `TabBar`

**State components**
`EmptyState` · `ErrorState` · `OfflineBanner` · `LoadingSkeleton` · `UpdateRequired`

### Button spec

| Variant | Face | Edge | Label | Use |
|---|---|---|---|---|
| primary | `action.primary` | `action.primaryEdge` | white | The one main action |
| secondary | `action.secondary` | `action.secondaryEdge` | white | Navigation, start |
| tertiary | `bg.surface` + 2px ring | `action.tertiaryEdge` | `text.1` | Low-emphasis |
| destructive | `action.destructive` | `action.destructiveEdge` | white | Log out, delete |
| ghost | transparent | *none* | `text.2` | Inline, in-card |

Face heights `sm 36` · `md 48` · `lg 54`; the socket adds `depth.button` on top, so the
tap target is 4 pt taller than the face and full-width CTAs are `lg`.

Labels use the `button` step: **uppercase**, 17/22, weight 800, +0.6 tracking. Uppercase
is a real trade — it is marginally harder to read than sentence case — and it is taken
knowingly, because a button label is a target you hit rather than a sentence you read,
and the uniform block shape is a large part of what makes the control look like a
physical key. The screen-reader announcement is unaffected: `textTransform` changes
rendering, not the accessible name.

**States** — default · pressed (face sinks `depth.press`, edge disappears) · disabled
(`action.disabled` face, `action.disabledEdge` edge, `text.3` label, no press) · loading
(spinner replaces the label, **width does not change**).

`ghost` is the only variant with no edge, and that is the point: it is for the actions
we must offer without inviting — "skip", "not now", "log out".

## 12. Theming

Every colour goes through the semantic layer, so these cost configuration, not code:

- **Dark** (default, shipped)
- **High contrast** — a11y setting; raises all pairs to ≥ 7:1
- **Light** — v2.0, requested by teachers on projectors
- **Seasonal** — live-ops can ship a token override (e.g. a warmer canvas for a
  World Cup event) as remote config. This is why the semantic layer exists.

## 13. Design ↔ code parity

`tokens.json` is generated from the Figma variable collection where one exists, and is
otherwise hand-maintained here. A design change lands as a token PR *first*, then
components pick it up. **Components never fork a token value locally** — if you need a
value that doesn't exist, add the token.

CI checks: no hex literals outside `tokens.json` · no numeric spacing outside the
scale · no font size outside the type scale.
