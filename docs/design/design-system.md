# Design system

The full spec. [`../../PROJECT.md §8`](../../PROJECT.md#8-design-system) has the
summary; this is the reference you build components from.

**Source of truth:** `packages/design/tokens.json`, which generates `tokens.ts`.
Colour values were **sampled from [`assets/mockup-v1.png`](assets/mockup-v1.png)**, so
the code and the mockup agree by construction.

**The rule:** components consume **semantic** tokens (`color.action.primary`), never
raw palette tokens (`blue.500`). Raw tokens exist only inside `tokens.json`. This is
what makes a light theme, a high-contrast theme, and a seasonal theme possible without
touching a single component.

---

## 1. Colour

### 1.1 Palette (raw)

| Token | Hex | Sampled from |
|---|---|---|
| `space.900` | `#00050F` | page base, splash |
| `space.800` | `#001227` | app background (most common colour in the mockup) |
| `space.700` | `#052342` | gradient top |
| `surface.1` | `#0A1F3C` | card |
| `surface.2` | `#102A4D` | elevated card, sheet |
| `surface.3` | `#16375C` | pressed |
| `border.subtle` | `#1B3A63` | hairline |
| `blue.400` | `#4C9BF0` | |
| `blue.500` | `#1E86E8` | Get Started, Start Quest, active tab |
| `blue.600` | `#1467C4` | pressed |
| `green.300` | `#73DD5A` | progress bar highlight |
| `green.400` | `#4FCB5C` | progress fill |
| `green.500` | `#22A73A` | Continue, correct answer |
| `green.600` | `#1B8D1F` | pressed |
| `gold.400` | `#FBC24A` | |
| `gold.500` | `#F5A61E` | XP, coins, trophies, premium |
| `gold.600` | `#E08A22` | |
| `flame.500` | `#FF6A14` | streak flame |
| `red.500` | `#E5252A` | hearts |
| `red.700` | `#B01216` | destructive (Log Out) |
| `text.1` | `#FFFFFF` | primary text |
| `text.2` | `#9FB3D1` | secondary text |
| `text.3` | `#6B82A6` | tertiary, disabled |

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
| 3 sheet/modal | `surface.2` | 1px `border.subtle` | `0 12 32 rgba(0,0,0,.55)` |
| accent CTA | `green.500` | none | `0 0 24 rgba(34,167,58,.35)` |

Android: pair every shadow with `elevation` — iOS shadows do not render on Android.

## 5. Typography

**Display/headings** Baloo 2 (rounded, warm, excellent numerals) ·
**UI/body** Inter · **numerals** tabular everywhere a number changes (scores, timers,
XP, `172 / 195`).

| Token | Size/LH | Weight | LS | Use |
|---|---|---|---|---|
| `display` | 34/40 | 700 | −0.5 | Onboarding headline |
| `h1` | 28/34 | 700 | −0.3 | Screen title |
| `h2` | 22/28 | 700 | −0.2 | Section header, question |
| `h3` | 18/24 | 600 | 0 | Card title |
| `body` | 16/24 | 400 | 0 | Default |
| `bodyStrong` | 16/24 | 600 | 0 | Answer options, list rows |
| `caption` | 13/18 | 500 | 0 | Metadata, progress counts |
| `overline` | 11/14 | 700 | +0.8 | Tab labels, badge text (UPPERCASE) |
| `numeric` | 20/24 | 700 | 0 | XP, timers, scores (tabular) |

**Rules** — max 2 fonts, ever. Never below 13 px. Line length ≤ 60 characters. All
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
| `motion.instant` | 100 | `easeOut` | Press (scale → 0.96) |
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

| Variant | Background | Text | Use |
|---|---|---|---|
| primary | `action.primary` (green) | white | The one main action |
| secondary | `action.secondary` (blue) | white | Navigation, start |
| tertiary | transparent + border | `text.1` | Low-emphasis |
| destructive | `action.destructive` | white | Log out, delete |
| ghost | transparent | `text.2` | Inline, in-card |

Sizes `sm 36` · `md 48` · `lg 56` (full-width CTAs are `lg`).
States: default · pressed (scale 0.96 + darken) · disabled (`surface.3`, `text.3`,
no shadow) · loading (spinner replaces the label, **width does not change**).

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
