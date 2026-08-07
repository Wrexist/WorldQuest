# Asset prompts

Every visual asset WorldQuest needs, as a copy-paste prompt.

Works with Midjourney, DALL·E, Higgsfield, Ideogram, Firefly. **Always prepend the
[Style Block](#the-style-block)** — it is the only thing keeping a hundred separately
generated assets looking like one product.

---

## ⛔ Never generate these

Read this before opening an image tool. Generating anything on this list ships a
factual error or a legal problem.

| Asset | Why not | Get it from |
|---|---|---|
| **Flags** ✅ **done** | A generated flag has the wrong number of stars, the wrong proportions, the wrong shade. In a learning app that is a **wrong fact** — our worst class of bug. | **`flag-icons` 7.5.0, MIT.** `pnpm build:flags` rasterises all 65 to `apps/mobile/assets/flags/`; the licence is recorded per entity in the countries pack. |
| **Country / continent geometry** ✅ **done** | Generated maps have invented coastlines and wrong borders. That is both a wrong fact and a political problem. | **Natural Earth** (public domain), via `world-atlas` 2.0.2 (ISC). `pnpm build:maps` projects and rasterises 6 region + 65 country layers; licence recorded per entity in `assets.map`. |
| **UI icons** (tab bar, chevrons, close) ✅ **done** | Generated icons drift in weight and optical size, and none of them mirror correctly for RTL. | **Lucide 1.28.0, ISC.** `pnpm build:icons` rasterises 26 to `apps/mobile/assets/icons/` as white-on-transparent alpha masks, recoloured at runtime with `tintColor`. |
| **Fonts** | — | **Nunito**, OFL, from Google Fonts, via `@expo-google-fonts/nunito`. Five weights, one family. It was Inter for body and Baloo 2 for headings; see `apps/mobile/src/lib/fonts.ts` for why that pairing was dropped. |
| **Real landmark photography** | Licensing. Wikimedia is mixed-licence and much of it is non-commercial. | Commission illustration (recommended), or licence a stock set. Never generate a "photo" of a real place — it will be subtly wrong and read as fake. |

Everything below this line is safe to generate.

> **A note on how the first of these got unblocked**, because the same mistake is
> probably still sitting on another row.
>
> Flags spent the whole project in the same mental bucket as the mascot — "needs an
> illustrator" — and were reported as blocked on an art decision. This table said
> otherwise from the day it was written: the "get it from" column names a package, not
> a brief. The row is not on this list because flags are *hard to draw*. It is here
> because they must not be drawn, and something already drawn them correctly.
>
> "Do not generate this" and "we cannot have this yet" point in opposite directions,
> and reading the first as the second cost months.
>
> **It then happened three more times.** Geometry was filed as blocked while this table
> named Natural Earth. Icons were filed as blocked while this row named Lucide, and the
> tab bar shipped `⌂ ◎ ◈ ☺ ⋯` as literal text characters in the meantime — a different
> typeface on every device, four of them colour emoji that ignore every colour token we
> own, and `☺` announcing itself to a screen reader as "white smiling face" in the
> middle of a tab label. Four rows, four filing errors, and the fix each time was to
> re-read this table rather than to commission anything.
>
> Every row above with a named package is a build script waiting to be written. The
> ones that genuinely need an illustrator are the **avatars** and the **trophy** — and
> photography, which needs a licence rather than a drawing.
>
> **The mascot came off that list, and how it came off is the fifth instance of the
> same mistake.** Atlas was delivered and placed on thirteen screens, and
> `mockup-fidelity.md` went on saying "Not built" for the whole of that work, because
> the commits that placed the art never came back to read the row. `CLAUDE.md` requires
> a change that invalidates a doc to update it in the same PR; this is what that rule is
> for. A "not built" that is false is worse than the blocked-on-an-illustrator entries
> above it, because those at least described the world on the day they were written.

---

## The Style Block

Prepend this to **every** prompt. Do not paraphrase it — consistency comes from it
being byte-identical each time.

```
STYLE: WorldQuest house style — friendly 3D-rendered illustration, soft matte
surfaces with gentle subsurface glow, lit as if by warm firelight against a deep
night sky. Rounded chunky forms, no sharp edges, generous silhouette. Palette
anchored to deep navy #001227 and #052342 with accents in signal green #22A73A,
sky blue #1E86E8, warm gold #F5A61E, ember orange #FF6A14. Soft rim light from
upper left, gentle ambient occlusion, no harsh speculars. Cinematic but warm.
Reads clearly at 96px. Subject centred with generous padding, transparent
background, no baked-in drop shadow.
```

And this negative prompt on every generation:

```
NEGATIVE: text, letters, numbers, watermark, signature, UI chrome, photorealism,
harsh shadows, busy background, lens flare, baked drop shadow, brand logos,
national flags, real maps, gore, weapons, sharp edges, cluttered detail
```

> **Why "no text" matters.** Every image model garbles text. The v1 mockup's progress
> bar contains generated gibberish for exactly this reason. All type is rendered by
> the app, never by the image.

---

## Delivery spec

Applies to every asset unless stated otherwise.

| | |
|---|---|
| Format | PNG with alpha, plus SVG where the asset is flat/geometric |
| Density | `@1x`, `@2x`, `@3x` (Expo picks automatically) |
| Colour | sRGB |
| Naming | `kebab-case`, matching the path in each section |
| Safe area | 8 % padding on all sides — art must never touch the edge |
| Budget | ≤ 120 KB per `@3x` asset after compression |
| Licence | Record it. CI rejects an asset with no `license` field. |

## Five rules that apply to every asset on this page

These are the ones that get skipped, and each of them has a screen behind it.

1. **The silhouette must carry the meaning, not the colour.** Around 8 % of men are
   red/green colour-blind and a large share of the core audience is ten-year-old boys.
   A bronze and a gold medal that differ only in hue are the same medal to them. Test
   every set by desaturating it: if two members become indistinguishable, the shapes
   are wrong. Same rule as `accessibility.md` §4.
2. **Everything lands on a near-black canvas** (`#001227`). A dark asset with a dark
   edge disappears into it. Every asset needs either a light-side rim or a soft glow
   beneath it — that is why the Style Block specifies both, and why "no baked drop
   shadow" is not the same instruction as "no separation".
3. **Anything animated needs a static end frame shipped beside it.** Reduced motion is
   a Definition of Done box, and the implementation is "show the last frame", so the
   last frame is an asset somebody has to deliver. An animation with no still is a
   blank rectangle for every user who turned motion off.
4. **Nothing mirrors for RTL except by explicit decision.** Arabic and Hebrew layouts
   flip the interface; they do not flip a photograph, a flag, or a map. A paper
   aeroplane pointing "forward" is directional and should mirror. A landmark is not.
   Say which, per asset, when you hand it over.
5. **Check it at 96 px before you accept it.** Most generated art collapses into mush
   at real size. This is the step everyone skips and the one that decides whether the
   asset was worth generating.

---

# P0 — blocks v1.0 launch

## 1. Logo and wordmark

**The gap that mattered most, and it was hiding in plain sight** — the splash prompt
below has always said "that space is reserved for the logo, which is composited by the
app", and no section ever specified the logo. The app had no wordmark, no mark, and no
icon lockup anywhere in it. Every other item on this page is a screen; this one is the
reason the product did not yet *look like itself*.

> ## 📦 Delivered — and what came with it
>
> **The mark, the app icon, the splash, seven Atlas frames, three onboarding slides,
> seven state illustrations and three celebration layers are in.** They live at the
> paths named in each section below, and `pnpm build:art` derives what the app ships
> from them. `icon`, `splash`, `adaptiveIcon` and `favicon` are wired in `app.json`,
> which is what unblocked a store build.
>
> Four things about the delivery are worth writing down rather than quietly fixing,
> because each one is a rule on this page that the art does not meet:
>
> 1. **Sizes.** Every illustration arrived 1536×1024 — a 3:2 landscape frame, against
>    the 1024×1024 this page specifies and the square slots that render them. The build
>    centre-crops, which is safe *because* the style block asked for a centred subject
>    with generous padding and the art does that. It would not be safe for art composed
>    to the edges.
> 2. **Transparency.** The delivery spec says transparent background. Most of these
>    carry a baked one — a warm brown vignette on the Atlas frames, a grey-green on the
>    icon. `<Art>` therefore clips to a rounded frame, so a baked background reads as a
>    deliberate illustration panel rather than a rectangle that missed its cutout. It
>    is a containment, not a fix.
> 3. **The icon could not be used as delivered.** `app/icon.png` is 1536×1024 **with an
>    alpha channel**. App Store Connect rejects both, at upload rather than at review.
>    The build squares it and flattens it onto the canvas colour.
> 4. **Palette — and one thing that fixed itself.** `brand/mark.png` is on-palette:
>    deep navy, sky blue, warm gold. The icon MASTER is a grey-green vignette that is
>    not, and leans photoreal where the style block asks for rounded chunky forms.
>
>    The shipped icon is on-palette anyway, and not by intention: that vignette is in
>    the alpha channel, so flattening it onto `colors.bg.canvas` — which the store rules
>    forced, since an icon may not carry transparency — replaced the grey-green with
>    #0B1730. Worth knowing before anyone "fixes" the master, because the two look
>    different and the derived one is the better of them. The rendering style still does
>    not match the mark, which is what the adaptive icon and favicon are cut from.
>
> **Still missing:** the wordmark and lockup (1b, 1c), the mono silhouette below, the
> Android notification icon — which needs that silhouette and cannot be derived from a
> colour illustration — and everything under P1 and below.

### 1a. The mark

`docs/design/assets/brand/mark.png` · 1024×1024 · plus SVG

```
[STYLE BLOCK]

A single emblem combining a rounded globe and a location pin: the pin sits at the
upper right of the globe and its point meets the surface, so the two shapes read as
one object rather than two stacked ones. The globe's surface carries two or three
abstract simplified landmass shapes — not any recognisable real continent. Rendered
in deep teal and navy with a warm gold pin and a soft gold glow where the pin meets
the globe. Bold, symmetrical, instantly readable as a silhouette at 32px.

[NEGATIVE BLOCK], text, letters, recognisable continents, real geography, country
borders, multiple pins
```

> **Deliver a flat single-colour silhouette version too** (`brand/mark-mono.png`,
> white on transparent). Android's notification icon, the web favicon at 16 px and any
> future press kit all need the mark with every gradient removed, and flattening a
> rendered 3D mark after the fact never works — the shape has to survive on its own.

### 1b. The wordmark

**Do not generate this.** Image models garble letterforms, which is the whole reason
for the "no text" rule in the negative block. A wordmark with a subtly malformed `Q`
is a brand you cannot use and cannot fix.

Set it instead, in **Nunito Black (900)** — the face this app ships and licences (OFL),
at the weight the `display` type step already uses — as `WorldQuest`, one word, capital W
and capital Q. Then:

- Convert to outlines and deliver as SVG.
- `brand/wordmark-light.svg` — near-white `#F2F6FF`, for the dark canvas.
- `brand/wordmark-gold.svg` — the warm gold `#F5A61E`, for the splash and store art.
- Optical spacing pass by hand. The default kerning between `d` and `Q` is loose.

> **This said Baloo 2 ExtraBold until the fonts changed underneath it.** The app dropped
> the Inter + Baloo 2 pairing for a single Nunito family, and this section went on naming
> a typeface the product no longer ships — which would have produced a logo in the wrong
> face and nobody would have noticed until it was on a store page.

**The app is not blocked on this.** `SplashScreen` sets the wordmark as live text in the
`display` step, which is the same face at the same weight, and live text is the better
answer inside the app: it scales with the type settings, it localises, and it is not an
asset anyone has to keep in sync. The file is for the places live text cannot go — the
store listing, press, and anywhere the mark appears outside a React Native tree.

**The raster form is built: `pnpm build:store`.** `docs/design/assets/store/wordmark-light.png`
and `wordmark-gold.png`, set from the app's own TTF — `@expo-google-fonts` ships it, so
the letterforms in the logo are byte-for-byte the letterforms on the splash screen — and
trimmed to their own ink, because a wordmark with baked padding cannot be aligned and the
§1c ratio below is measured from cap height.

**Still outstanding: the outlined SVG.** Converting type to outlines needs a font-parsing
library this repo does not have and should not gain in order to set one logo, and the
optical kerning pass above is a hand job by definition. The raster is at 4× any size it is
placed at, which covers the feature graphic and press; the SVG is for print and for
anywhere it has to scale without limit.

### 1c. The lockup

`docs/design/assets/brand/lockup-vertical.svg` and `brand/lockup-horizontal.svg`

Mark above wordmark (splash, store icon) and mark beside wordmark (headers, press).
Fix the ratio once, here, so it is never re-eyeballed: **mark height = 2.4× cap height
of the wordmark**, gap between them = 0.5× cap height. Written down because a lockup
re-measured per use is a lockup that drifts.

## 2. App icon, and its three platform variants

One drawing, four exports. The variants are not optional polish — two of them are
store submission requirements and one of them is the difference between a notification
that shows your mark and one that shows a white blob.

### 2a. iOS / store icon

`apps/mobile/assets/icon.png` · 1024×1024 · **no transparency** (stores reject it)

```
[STYLE BLOCK]

A stylised globe seen from space at night, tilted slightly, with one softly glowing
gold location pin planted on it. The globe's landmasses are simplified abstract
shapes in deep teal and navy — not any recognisable real continent. A faint warm
atmospheric rim light traces the upper-left edge. Deep navy background with a subtle
radial glow behind the globe. Centred, symmetrical, bold silhouette that stays
legible at 48px.

[NEGATIVE BLOCK], recognisable continents, real geography, country borders
```

> "Not any recognisable real continent" is deliberate: an icon showing a real,
> subtly-wrong world map is the same wrong-fact problem as a generated flag.

### 2b. Android adaptive icon

`apps/mobile/assets/adaptive-icon.png` · 1024×1024 · **foreground layer, transparent**

Android composites a foreground over a background and then masks the pair to whatever
shape the launcher wants — circle, squircle, teardrop. A single flat icon handed to
that system gets its corners cut off.

Deliver the **mark alone, no background plate**, occupying the **centre 66 %** of the
frame. The outer third will be cropped on some launchers and must contain nothing.
The background is a solid colour, not art: `#001227`, set in `app.json`.

### 2c. Android notification icon

`apps/mobile/assets/notification-icon.png` · 96×96 · **flat white on transparent**

Android renders this as an alpha mask: every colour is discarded and every non-
transparent pixel becomes white. A full-colour icon supplied here appears as a solid
white blob, which is one of the most common shipping bugs in the category.

Use `brand/mark-mono.png` from §1a, scaled. Nothing else, no gradient, no interior
detail below 1/8 of the frame.

### 2d. Web favicon

`apps/mobile/assets/favicon.png` · 48×48 · opaque

The mark on the navy plate, with interior detail removed until it survives 16 px.
Same reasoning as the notification icon: this is not a scaled-down app icon, it is a
different drawing of the same idea.

## 3. Splash screen

`apps/mobile/assets/splash.png` · 2048×2048 · centred logo, safe to crop to any ratio

```
[STYLE BLOCK]

A deep night-sky field with a soft blue-to-navy vertical gradient, scattered small
stars of varying brightness, and a faint aurora-like glow rising from the lower
third. Completely empty in the centre 40% of the frame — that space is reserved for
the logo, which is composited by the app. Atmospheric, calm, spacious.

[NEGATIVE BLOCK], central subject, mascot, globe, foreground objects
```

The logo composited into that empty centre is `brand/lockup-vertical.svg` from §1c.

## 4. Atlas — the mascot

A small robot explorer in a safari hat: curious, encouraging, **never disappointed in
you**. His emotional range is *excited → interested → encouraging*. He has no guilt
setting.

**Character sheet first.** Generate this once, then use it as a style/character
reference for every pose below — that is how you get one character instead of six.

`docs/design/assets/atlas/character-sheet.png` · 2048×1024

```
[STYLE BLOCK]

Character reference sheet for a small friendly robot explorer named Atlas. Rounded
cream-and-brass body with a single large glowing cyan visor for a face, stubby
articulated arms, no mouth. Wears a soft tan canvas safari hat with a dark band, and
a small leather satchel on a shoulder strap. Proportions: big head, small body,
roughly 1:1.5 head-to-body — appealing to a ten-year-old without being babyish.
Four views in a row on a plain background: front, three-quarter, side, back.
Consistent scale and lighting across all four.

[NEGATIVE BLOCK], mouth, teeth, human face, multiple characters, weapons
```

Then each pose, `1024×1024`, referencing the sheet:

| File | Prompt body (after the Style Block) |
|---|---|
| `atlas/welcome.png` | `Atlas standing on a small rounded globe, one arm raised in an open welcoming wave, visor bright cyan, hat tilted slightly back. Confident and inviting. Full body, centred.` |
| `atlas/celebrate.png` | `Atlas mid-jump with both arms up, visor glowing bright, small gold sparkles arcing around him. Pure delight, weightless. Full body, centred.` |
| `atlas/thinking.png` | `Atlas standing with one hand near his visor in a thoughtful gesture, head tilted, visor a calm dimmer cyan. Curious, not confused. Full body, centred.` |
| `atlas/encouraging.png` | `Atlas leaning forward slightly with one arm extended offering an open hand, visor warm and steady. Reassuring, patient, not pitying. Full body, centred.` |
| `atlas/waving-back.png` | `Atlas seen from a low angle waving with both arms, satchel swinging, as if greeting someone returning after a long time. Warm, glad, no sadness. Full body, centred.` |
| `atlas/broken-compass.png` | `Atlas looking at a small compass whose needle is spinning, head tilted, visor a neutral soft blue. Mildly puzzled, still cheerful. For error screens. Full body, centred.` |
| `atlas/resting.png` | `Atlas sitting on a small rounded rock with his hat over one knee, visor dimmed to a soft calm cyan, relaxed and unhurried. For the out-of-hearts screen — waiting, not punished. Full body, centred.` |

> **Atlas is never sad, never disappointed, never scolding.** If a pose reads as
> guilt-tripping, regenerate it — that tone is on the product's permanent no-list.
> `atlas/resting.png` is the one most likely to go wrong: the brief is a break, not a
> penalty, and a slumped posture turns "come back soon" into "you failed".

## 5. Onboarding scenes

`docs/design/assets/onboarding/*.png` · 1024×1024 · one per value slide

Mockup screen 2 is a full composition, not an Atlas pose on a plain field — he is
descending by parachute over the planet. The pose set above cannot produce it, which
is why onboarding currently has no art at all.

These are the first thing a new user ever sees, and the taster lesson runs
immediately after, so this is the whole first impression.

```
[STYLE BLOCK]

{SCENE}. Atlas rendered consistently with the character sheet — rounded cream-and-
brass body, glowing cyan visor, tan safari hat, leather satchel. Wide atmospheric
composition with generous negative space in the upper third for a headline the app
renders. Deep navy sky, warm rim light, soft particle glow.

[NEGATIVE BLOCK], text, headline, UI chrome, multiple characters
```

| File | `{SCENE}` |
|---|---|
| `onboarding/explore.png` | `Atlas descending gently by parachute towards a large curved planet below him, satchel swinging, visor bright with excitement. The planet's surface is abstract simplified landmasses, not real geography. A sense of arriving somewhere` |
| `onboarding/learn.png` | `Atlas sitting cross-legged with a softly glowing open book on his knees, small gold motes of light drifting upward from its pages. Absorbed and content` |
| `onboarding/conquer.png` | `Atlas standing on a summit with one foot on a small rock, planting a gold pennant, a wide starfield behind him. Triumphant but calm — an achievement, not a conquest` |

## 6. Empty, error and waiting states

`docs/design/assets/states/*.png` · 1024×1024

| File | Prompt body |
|---|---|
| `states/empty-caught-up.png` | `A small rounded telescope on a tripod pointing up at a calm starfield, one bright gold star centred in its view. Peaceful, accomplished, restful. Centred.` |
| `states/empty-no-friends.png` | `Two small rounded signal beacons on a dark landscape, one lit gold and one unlit, with a faint dotted arc between them suggesting a connection about to form. Hopeful, not lonely. Centred.` |
| `states/error-generic.png` | `A small rounded compass lying on dark ground, its needle spinning, with a faint warm glow underneath. Calm and recoverable, not alarming. Centred.` |
| `states/offline.png` | `A small rounded paper aeroplane hovering above a dark landscape with a soft dotted trail behind it, moving steadily. Self-sufficient, still going. Centred.` |
| `states/empty-profile.png` | `A rounded blank explorer's journal lying open on dark ground, its pages faintly luminous and completely empty, a gold pen resting in the gutter. Ready to be filled, not sad. Centred.` |
| `states/empty-collection.png` | `A rounded wooden display case with a few empty velvet-lined slots and one slot softly lit from within, waiting. Anticipation, not absence. Centred.` |
| `states/hearts-empty.png` | `A rounded glass hourglass with warm gold sand part-way through and a soft glow beneath it. Time passing, something replenishing on its own. Patient and calm — never a lock, a barrier, or a cross.` |

> The last one is the constraint that matters. Out of hearts is the single easiest
> place in this app to accidentally punish a child, and the visual language decides it
> before the copy gets a chance. An hourglass says *this comes back*. A padlock says
> *you are shut out*, and a padlock is on the permanent no-list.

## 7. The celebration moment

`docs/design/assets/celebration/*` — mockup screen 6, and **the most important frame in
the product**. It is the payoff for every question answered, it fires more often than
any other art in the app, and it does not exist.

| File | Spec | Prompt body |
|---|---|---|
| `celebration/burst.png` | 1024×1024 | `A radial burst of small rounded confetti pieces and soft gold motes frozen mid-explosion, radiating from an empty centre, in signal green, warm gold, sky blue and ember orange. The centre 30% is completely empty — content is composited there. Joyful, weightless, no single dominant direction.` |
| `celebration/sparkle-sheet.png` | 2048×512 | `A horizontal strip of eight small rounded sparkle and star shapes at increasing sizes, flat single-colour warm gold on transparent, evenly spaced with consistent optical weight. A sprite sheet, not a scene.` |
| `celebration/rays.png` | 1024×1024 | `A soft radial sunburst of pale warm light rays fanning from an empty centre, low contrast, fading to nothing at the edges. Atmospheric backing layer, not a subject.` |

**Deliver the still frame as well as any animation.** Reduced motion is a Definition of
Done box and the implementation shows the last frame — so `celebration/burst.png` at
its settled state *is* a deliverable, not a by-product. An animation with no still is a
blank space for every user who turned motion off, which is disproportionately the users
who most need the feedback.

Confetti must be `accessibilityElementsHidden` in code; it is decoration and a screen
reader announcing it is noise. That is a code note, but it belongs beside the asset.

### 7b. `celebration/burst-wide.png` — 1536×512 · **delivered**

**This one was found by trying to ship without it.** The correct-answer feedback card is
the most-seen "good thing happened" frame in the product — it fires ten to twenty times
per lesson, against the perfect-lesson summary's once-in-a-while — and it has no art.
The obvious fix was to reuse `celebration/burst.png` behind it, and that was attempted
three times and reverted three times:

- behind the XP card on the summary, where the burst is square and the card is
  full-width, so a burst wide enough to clear the card had to be twice its height. What
  rendered was a strip of confetti above it and a beige smear below;
- clipped **inside** the feedback card, where the only part of a radial burst that lands
  in a short wide panel is the deliberately empty centre — it rendered as nothing;
- drawn **behind** the feedback card and allowed to overflow, which put confetti on top
  of the answer options and a warm smudge under the card.

The lesson is in the geometry, not in the placement. `burst` and `rays` both radiate
from an empty centre and fade at the edges: they are built for a **square** region with
a subject composited into the middle, and they work beautifully there — the perfect
summary uses both behind a 140pt Atlas. A short wide panel is the one shape they cannot
serve, and no amount of sizing fixes it.

```
[STYLE BLOCK]

A wide horizontal spray of small rounded confetti pieces and soft gold motes, densest
along the upper edge and thinning downward, spread evenly across the full width with no
single centre of origin and no radial structure. Signal green, warm gold, sky blue and
ember orange. The lower third fades to nothing. Joyful, weightless, celebratory.

[NEGATIVE BLOCK], radial burst, explosion from a centre, empty middle, vignette,
subject, character, single focal point
```

**3:1, and no empty centre — both are the point.** It sits behind a full-width panel
roughly 110 pt tall, so it must read at that aspect and must have something to show in
its middle. Transparent background, like every other asset in this section: the delivered
`empty-profile`, `empty-no-friends` and `atlas/resting` came back with an opaque ground
baked in and `pnpm build:art` now has to feather their edges to hide the seam.

#### What actually arrived, and what that changed

The generator returned the usual 1536×1024 frame with the ribbon painted across the
middle of it — content 1536×237, so **6.5:1 inside a 3:2 file, 77 % of it empty**. Two
things follow, and both are now handled in code rather than by asking for a re-draw:

- `pnpm build:art` trims a master to its content when that content is at least 4:1
  (`BANNER_ASPECT`). Measured, not listed, like the edge feather beside it — a banner
  delivered already tight is a no-op, and nobody has to remember to edit an array. The
  shipped asset is 768×129.
- `<Art>` takes an optional `height`. Its box is square by default, which is right for
  a subject in a 3:2 frame and five-sixths empty for a ribbon.

**It is not drawn whole.** Row coverage runs 1 % at the top to 98 % at the middle, and
the solid core reads as a strip of gumballs when it is put in the gap above the feedback
card — which is the fourth failed attempt, after the three above. The lesson draws the
top 26 % only, clipped, tucked 8 pt behind the card: loose confetti above the card, the
dense core never rendered. So a future redraw should keep the **gradient from scatter to
core**, which is the part being used, and need not worry about the core being pretty.

---

# P1 — v1.0 polish

## 8. Continent cards

`packages/content/assets/continents/*.png` · 512×512 · one per continent

**Do not draw the landmass** — real geometry comes from Natural Earth and is
composited on top. These are the atmospheric backgrounds behind it.

```
[STYLE BLOCK]

An abstract atmospheric background suggesting {CONTINENT_MOOD}. Soft gradient wash,
gentle volumetric light, faint particle glow. No landmasses, no coastlines, no
borders — purely atmospheric texture. Dominant accent colour {ACCENT}.

[NEGATIVE BLOCK], landmass, coastline, map, country borders, continent shape
```

| Continent | `{CONTINENT_MOOD}` | `{ACCENT}` |
|---|---|---|
| Europe | cool northern light over calm water at dusk | `#4C7BF3` |
| Asia | warm haze over distant mountains at golden hour | `#F59E3C` |
| Africa | dry warm savanna air under a wide bright sky | `#F2C230` |
| North America | crisp clear air over open plains | `#3FBF8F` |
| South America | humid green light filtering through canopy | `#E0663D` |
| Oceania | bright turquoise shallow water and open sky | `#39C0D6` |
| Antarctica | pale blue ice light, very high key, almost white | `#A7C7E7` |

> **Generate Antarctica even though the app currently shows six continents.** It has no
> countries, so it holds no quizzable facts and the Explore grid omits it — but the
> moment any non-country content lands (ice, wildlife, research stations) it is the
> seventh card, and a set of six that later needs a seventh generated in a different
> session never matches.

### 8b. The silhouette layer — implied by a reference, not yet drawn

A reference restyled our Explore tiles as **one flat continent colour with a landmark
silhouette on the right**, at low opacity. It is worth understanding why that is a good
idea rather than just a different one: a flat field is a single known colour, so text on
it is legible by construction. Our tiles use photographic skies, and the contrast fight
that caused has now been had twice — 1.5:1 over Oceania on Explore, then 4.45:1 on the
region banner — and is the reason `ArtScrim` exists at all.

The skies are better-looking and they are already delivered. The silhouette is an
**additive** layer, not a replacement: it sits on the scrim, in the lower right, where
the tile's own text is not.

```
[STYLE BLOCK]

A single flat silhouette of {SUBJECT}, solid white on transparent, no gradient, no
outline, no detail inside the shape. Simple enough to read at 40px and to survive being
drawn at 12 % opacity. Composed to sit in the lower-right corner of a card.

[NEGATIVE BLOCK], photorealism, texture, gradient, colour, outline, background, ground
line, people, text
```

> **Pick the subject carefully, and this is a legal note rather than an aesthetic one.**
> The reference uses the Eiffel Tower, Christ the Redeemer and the Sydney Opera House.
> All three are encumbered: France restricts commercial images of the *illuminated*
> Eiffel Tower, Christ the Redeemer is under copyright held by the Archdiocese of Rio,
> and the Sydney Opera House is trademarked. Freedom of panorama differs by country and
> a silhouette is still a derivative of the structure.
>
> So `{SUBJECT}` should be **landform, not architecture** — which is also more honest for
> a geography app, where the continent is the subject and a single building is a city.

| Continent | `{SUBJECT}` |
|---|---|
| Europe | a range of alpine peaks with a fjord inlet |
| Asia | a stepped mountain ridge with terraced foothills |
| Africa | a flat-topped acacia beside rolling savanna |
| North America | a canyon rim with mesa buttes |
| South America | a high andean ridge above rainforest canopy |
| Oceania | a coral atoll ring with palms |
| Antarctica | a tabular iceberg and pressure ridges |

## 9. Avatar set

`packages/content/assets/avatars/*.png` · 512×512 · **12 to start**

Users pick one. **No uploads, ever** — that is a child-safety rule, not a scope cut.

```
[STYLE BLOCK]

A friendly explorer character portrait, head and shoulders, centred in frame, facing
slightly three-quarter. {DESCRIPTOR}. Warm confident expression, eyes visible and
friendly. Simple dark navy background with a soft radial glow behind the head.
Consistent framing and lighting across the set.

[NEGATIVE BLOCK], realistic human skin texture, celebrity likeness, revealing
clothing, ageing, distinguishing scars
```

Generate all twelve, varying `{DESCRIPTOR}` and keeping everything else identical:

```
1.  a young explorer with warm brown skin and short coiled black hair, wearing a tan field cap
2.  a young explorer with pale skin and shoulder-length red hair, wearing round goggles pushed up
3.  a young explorer with deep brown skin and long braided hair, wearing a green scarf
4.  a young explorer with olive skin and short dark curls, wearing a navy windbreaker collar
5.  a young explorer with light skin and straight blonde hair in a ponytail, wearing a gold pin
6.  a young explorer with brown skin and a black undercut, wearing a red bandana
7.  an older explorer with grey hair and weathered light skin, wearing a wide-brimmed hat
8.  an older explorer with dark skin and short white hair, wearing wire-rim glasses
9.  a young explorer with East Asian features and a straight black bob, wearing a teal collar
10. a young explorer with South Asian features and a thick dark plait, wearing a gold earring
11. a young explorer wearing a hijab in deep teal, warm brown skin, confident smile
12. a young explorer with freckles, sandy hair under a beanie, pale skin
```

> Cover a real range of skin tones, ages, hair textures and head coverings. Emma and
> Ingrid should both find themselves here.

## 10. Reward and progression art

`packages/content/assets/rewards/*.png` · 512×512

| File | Prompt body |
|---|---|
| `rewards/trophy.png` | `An ornate rounded gold trophy with a five-pointed star on its cup, sitting on a short plinth, lit warmly from the upper left with a soft gold glow beneath. Celebratory and substantial.` |
| `rewards/coin.png` | `A single thick gold coin seen at a slight three-quarter angle, with a simple embossed compass rose on its face and a warm bevelled rim. Chunky and tactile.` |
| `rewards/gem.png` | `A faceted violet gem with soft internal light, cut in a rounded brilliant shape, floating with a gentle glow beneath it. Precious, not sharp.` |
| `rewards/streak-flame.png` | `A stylised rounded flame in warm orange and gold with a soft cyan core, curling gently upward. Lively and warm, never threatening.` |
| `rewards/heart.png` | `A rounded glossy red heart with a soft highlight, slightly three-dimensional, gently glowing. Friendly, not clinical.` |
| `rewards/streak-freeze.png` | `A rounded flame encased in translucent pale-blue ice with soft frost crystals at its base. Preserved, protected, calm.` |
| `rewards/xp-orb.png` | `A small rounded orb of soft signal-green light with a brighter core and a faint trailing wisp, as if drifting upward. Energetic, weightless, not a gem.` |
| `progress/globe.png` **not yet drawn** | `A small rounded desk globe on a warm gold meridian arc and a short stand, tilted slightly, oceans in deep blue and land in soft green, lit warmly from the upper left with a gentle glow beneath. Friendly object, not a scientific model.` |

> `progress/globe` is implied by a reference that puts a globe on the "Your world" card —
> the one card in the app that reports how much of the world you know and currently
> carries only a progress bar. **Draw generic landmasses or none**: a globe showing real
> coastlines is the geometry rule in the never-generate table, and an invented coastline
> in a geography app is a wrong fact whether or not anyone is quizzed on it.

> `xp-orb` is new because XP is the most-awarded thing in the app and had no mark of
> its own, so every XP number renders as bare type while coins and gems have artwork.
> It must not read as a gem: XP and coins are deliberately different currencies
> (ADR 0011) and the art is the fastest way to teach that.

## 11. Achievement medals

`packages/content/assets/achievements/*.png` · 512×512 · 5 tier frames + ~13 glyphs

**Moved up from P2, and the review that moved it is worth recording.** The
achievements screen ships in v1.0 and currently renders as twelve identical grey rows —
title, description, empty bar, "Not yet", twelve times. It is the single clearest case
in the app of what the design skill calls the generated look: every row weighs exactly
the same, so nothing is worth looking at. The medals are not decoration on that screen;
they are the only thing that would make it a collection rather than a to-do list.

Generate the **five tier frames** once, then the **category glyphs** separately and
composite. That is 18 assets instead of 65, and adding a category later costs one
glyph rather than five medals.

Tier frame:

```
[STYLE BLOCK]

An empty circular medal frame with a bevelled {METAL} rim and a subtly textured
recessed centre, with a soft {GLOW} glow behind it. The centre is completely empty —
a glyph is composited into it later. Symmetrical, centred.

[NEGATIVE BLOCK], text, central symbol, ribbon
```

`{METAL}` / `{GLOW}`: bronze/amber · silver/pale blue · gold/warm gold ·
platinum/white · iridescent violet/aurora.

> **The five tiers must differ in shape, not only in metal.** Desaturate them: bronze,
> gold and platinum collapse into three near-identical grey discs, which is exactly the
> failure rule 1 at the top of this page describes. Vary the rim — plain, notched,
> scalloped, double-ringed, star-pointed — so the tier is legible without colour and at
> 32 px.

Category glyph (flat, single-colour, composited into the frame):

```
[STYLE BLOCK]

A single simple symbolic glyph representing {CATEGORY}, drawn as a solid rounded
silhouette in one flat colour on a transparent background. No detail smaller than
1/12 of the frame. Bold, instantly readable at 32px, centred.

[NEGATIVE BLOCK], text, gradient, outline, multiple objects
```

`{CATEGORY}`: a compass rose (exploration) · a globe (countries) · a pennant (flags) ·
a capital building (capitals) · a monument arch (landmarks) · a bullseye (perfect) ·
a calendar (consistency) · a stacked set of cards (collections) · a firework (events) ·
two linked rings (social) · a crown (premium) · a keyhole (hidden) · a laurel wreath
(legendary).

## 12. Level insignia

`docs/design/assets/levels/*.png` · 1536×1024 · **11 ranks — ten delivered, one missing**

The profile shows a level *and a title* — "Level 38 – Navigator" in the mockup — and
the title ladder had no art, so a rank that takes weeks to earn arrived as a word.

> **This section was wrong when the art was commissioned, and the art came back wrong
> because of it.** The table below used to list eight ranks including a "Pioneer" that
> is not in the ladder, and omitted Circumnavigator, Trailblazer, Globetrotter and
> Atlas. The delivery matched the table: a `levels/pioneer.png` nothing can reach, and
> no insignia for level 100. `pioneer` is in `NOT_SHIPPED` and the master is kept; it is
> a near-duplicate of `trailblazer` anyway. The warning at the foot of this section was
> already there, in those words, and was not followed — which is why the table now
> records what the ladder actually is and what was actually drawn.

```
[STYLE BLOCK]

A small rounded rank insignia: {INSIGNIA}, rendered as a compact emblem in {METAL}
with a soft glow beneath. Simple enough to read at 24px, distinct in silhouette from
the other ranks in the set.

[NEGATIVE BLOCK], text, numerals, shield, medal frame, laurel
```

The ladder is `docs/systems/progression.md` §1 and `packages/i18n/locales/en/titles.json`.
`{INSIGNIA}` below describes **what was delivered**, not what was originally asked for —
the two diverged on several ranks, and the set has to stay internally consistent, so a
redraw should match its neighbours rather than the first brief.

| Level | Rank | `{INSIGNIA}` | `{METAL}` | |
|---|---|---|---|---|
| 1 | Wanderer | a single simple footprint | weathered pewter | ✅ |
| 10 | Scout | a folded paper map with a marked X | warm bronze | ✅ |
| 20 | Navigator | a compass rose struck on a round medal | warm bronze | ✅ |
| 30 | Cartographer | a sextant | brushed silver | ✅ |
| 40 | Pathfinder | a map with a dotted trail across it | warm gold | ✅ |
| 50 | Voyager | a stylised pennant on a staff | warm gold | ✅ |
| 60 | Circumnavigator | a ringed planet | brushed silver | ✅ |
| 70 | Trailblazer | a mountain summit with a flag | polished gold | ✅ |
| 80 | Globetrotter | two footprints circling a small globe | polished gold | ✅ |
| 90 | Worldkeeper | a small globe held in an open hand | iridescent violet | ✅ |
| 100 | Atlas | **a figure bearing a globe on its shoulders** | iridescent violet with a warm gold rim | ❌ **missing** |

Level 100 is the top of a roughly three-year climb and the only rank named after the
mascot, so it is the one that most needs a picture and the one that has none. It renders
without art rather than with a borrowed one — `ProfileScreen.insigniaFor` returns null
for a rank with no file, deliberately, because a wrong insignia on the rarest rank in the
game is worse than no insignia.

> The names must match `packages/i18n/locales/en/titles.json` and the level ladder in
> `docs/systems/progression.md`. **Check them before generating** — a rank insignia for a
> title that does not exist is a wasted asset, and renaming a title is a migration rather
> than a rename because it ships in save data.

## 13. League tier badges

`packages/content/assets/leagues/*.png` · 512×512 · 7 tiers

```
[STYLE BLOCK]

A rounded heraldic shield badge with a bevelled metal rim in {METAL}, a five-pointed
star centred on its face, and a soft {GLOW} glow radiating behind it. Substantial,
collectible, symmetrical. Centred.

[NEGATIVE BLOCK], text, roman numerals, ribbons
```

| Tier | `{METAL}` | `{GLOW}` |
|---|---|---|
| Bronze | warm bronze | amber |
| Silver | brushed silver | pale blue |
| Gold | polished gold | warm gold |
| Sapphire | deep blue enamel and silver | sapphire blue |
| Ruby | deep red enamel and gold | crimson |
| Diamond | white gold and crystal | icy white |
| Legend | iridescent black metal | violet-to-cyan aurora |

> Roman numerals (I / II / III) are rendered by the app, not baked in — otherwise
> that is 21 assets instead of 7, and they cannot be localised.

---

# P0-ship — needed to submit, not to build

Neither store will accept a listing without these, and both are easy to discover on
submission day rather than before it.

## 14. Store listing art

**`pnpm build:store` builds the first three.** They are fixed sizes stated by the
platforms, composed from assets this repo already owns, so they are derived rather than
briefed — same rule as the flags, the maps and the icons. The safe area is *checked*, not
eyeballed: the script fails if the lockup runs into the outer 10 % Play crops.

| Asset | Spec | What it is | |
|---|---|---|---|
| Play feature graphic | **1024×500**, no alpha | Mandatory. Shown at the top of the Play listing. The lockup on the splash field, wordmark legible at thumbnail size, nothing in the outer 10 % (Play crops it in some placements). The strapline is the onboarding headline, not a new marketing line — a listing that promises something the first screen does not is the same lie as a screenshot of a screen the app does not have. | ✅ |
| Play icon | **512×512**, no alpha | The §2a icon, re-exported. | ✅ |
| iOS App Store icon | **1024×1024**, no alpha | The §2a icon. Apple flattens alpha to black, so never submit transparency. | ✅ |
| iPhone screenshots | **1320×2868** (6.9"), portrait PNG, no alpha | 6 shots, the list below. Apple scales every smaller iPhone size down from this one. | ✅ |
| iPad screenshots | **2064×2752** (13"), portrait PNG, no alpha | 6 shots. `supportsTablet` is `true`, which is what makes these mandatory rather than optional — turning that flag on quietly added a required asset. | ✅ |
| Play screenshots | `TODO(verify)` | Still unchecked, and the reason is recorded rather than the requirement guessed — see below. | ❌ |

> **The sizes are read, not remembered.** Source:
> [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/),
> verified 2026-08-07. Recorded the way a content pack records `source` and `verifiedAt`,
> because a store requirement goes stale exactly like a population figure — Apple changes
> the required device sizes most years, and a guessed pixel dimension is a rejected
> submission rather than a cosmetic mistake.
>
> **Play is still open, and deliberately.** Its requirements live on `support.google.com`
> and `play.google.com`, both blocked by this session's egress policy, so they could not
> be checked. The twelve files above are portrait PNG with no alpha, which is very likely
> acceptable on Play too — "very likely" is not "verified", and that difference is this
> whole section's point. Check the console, then add a `SIZES` row to
> `scripts/build-store-shots.cjs`; nothing else needs to change.

`pnpm build:store:shots` builds all twelve. It drives the **real app** rather than
reusing `design:shots`, for two reasons: a review shot is 390 CSS pixels wide and a store
screenshot is 1320 device pixels, so it captures at the device scale rather than
upscaling; and two of the six shots — a lesson mid-question, and the summary after one —
need clicks that no static render can reach.

The celebration shot is a genuinely perfect lesson, not a mocked one. The script plays
the lesson twice: the first pass reads each correct answer off the label the app already
exposes for screen readers (`lesson:answer.correct`), the second pass replays it and
scores 100 %. Every number in that frame was awarded by the real engine.

Screenshots are **composites, not raw captures**: a device frame, one short headline
per shot, and the real screen inside it. Use the real rendered screens from
`pnpm design:shots` rather than mockups — a listing that shows a screen the app does
not have is a refund request and, on the App Store, a rejection.

Shot list, in order, because the first two are the only ones most people see:

1. The lesson mid-question with the map — this is the product
2. The flags collection — this is the reason to come back
3. Home with a live streak
4. The country page with its sources
5. Quests
6. The celebration moment

---

# P2 — v1.5

## 15. Landmark illustrations

`packages/content/assets/landmarks/*.png` · 768×512 · ~300 eventually

**This is the expensive one and the open decision.** Illustration is recommended over
photography: cheaper in aggregate, legally clean, and it makes the app look like
itself rather than a stock library.

```
[STYLE BLOCK]

A stylised illustration of {LANDMARK}, seen from its most recognisable angle, at
{TIME_OF_DAY}. Simplified geometry with soft matte surfaces, gentle atmospheric
depth, and a warm rim light. Architecturally accurate in proportion and silhouette.
No people, no vehicles, no signage. Wide composition with the subject occupying the
central two-thirds.

[NEGATIVE BLOCK], people, crowds, vehicles, signage, national flags, modern clutter
```

> **Accuracy is a content requirement, not a style note.** A landmark with the wrong
> number of arches is a wrong fact. Every generated landmark needs a human check
> against a reference photo before it ships, and a `source` recorded in the pack —
> same standard as any other fact.
>
> **Places of worship and contested sites need the same care as a disputed border.**
> `content-pipeline.md` §5 governs them: neutral, sourced, never a right/wrong answer.
> Decide before generating, not after.

## 16. Pets

`packages/content/assets/cosmetics/pets/*.png` · 512×512

The main coin sink, and Emma's whole reason for being here.

```
[STYLE BLOCK]

A small friendly companion creature: {CREATURE}. Rounded, chunky, appealing
proportions with a large head and small body. Sitting or standing in a neutral idle
pose, facing three-quarter, looking slightly upward. Expressive eyes, no mouth
detail. Centred with generous padding.

[NEGATIVE BLOCK], realistic animal anatomy, fur detail, teeth, aggression, leash
```

`{CREATURE}`: a round arctic fox with oversized ears · a small emperor penguin chick ·
a stubby camel with a woven saddle blanket · a tiny elephant with rounded tusks ·
a fluffy red panda · a small snowy owl · a rounded sea turtle · a chunky llama.

## 17. The other three cosmetic categories

`BALANCE.prices` names six sellable categories and this page previously specified two
of them. The shop ships with **titles only** — one category, every item priced
identically — because the rest have no artwork. These are the missing briefs.

### 17a. Avatar items

`packages/content/assets/cosmetics/avatar-items/*.png` · 512×512

Worn *over* an avatar from §9, so they must register against all twelve heads.

```
[STYLE BLOCK]

A single wearable accessory shown alone on a transparent background, angled as if worn
by a head facing three-quarter left: {ITEM}. No head, no face, no mannequin — the
item only, positioned exactly as it would sit when worn.

[NEGATIVE BLOCK], head, face, person, mannequin, stand, text
```

`{ITEM}`: a explorer's pith helmet · a knitted winter hat with a pompom · aviator
goggles · a wide straw sun hat · a pair of round spectacles · a woven friendship band ·
a small gold laurel circlet · a snorkel mask pushed up.

> Register them against the avatar set before generating all eight. One item, one
> avatar, checked at real size — an accessory drawn at the wrong angle floats beside
> the head instead of sitting on it, and that is invisible in a 512 px preview.

### 17b. Map skins

`packages/content/assets/cosmetics/map-skins/*.png` · 512×512 · tileable

A **texture**, not a scene, composited under the Natural Earth geometry the same way
the continent cards are. The geometry never changes; only what fills it does.

```
[STYLE BLOCK]

A seamless tileable texture: {TEXTURE}. Even overall value with no focal point, no
directional lighting, and no recognisable objects — it will be masked into arbitrary
country shapes at arbitrary scales. Tiles cleanly on all four edges.

[NEGATIVE BLOCK], landmass, coastline, map, border, focal point, directional light,
text, horizon
```

`{TEXTURE}`: aged parchment with soft fibre grain · deep ocean blue with faint caustic
light · brushed brass with fine circular tooling · night sky with scattered small stars
· soft topographic contour lines in one hue · pale marble with restrained veining.

> "No focal point" is the whole brief. A texture with a bright spot puts that spot in
> the middle of one random country and nowhere else, and it reads as a rendering bug.

### 17c. Celebrations

`packages/content/assets/cosmetics/celebrations/*.png` · 1024×1024

Alternate burst art for §7 — the same slot, a different flavour, bought with coins.
Deliver each with the same empty centre 30 % and the same static-still rule.

`{BURST}`: gold coins and sparkles · autumn leaves in amber and ember · small
paper aeroplanes on arcing trails · snowflakes and pale blue motes · tiny flags on
short poles, **no national flags — plain coloured pennants only** · musical notes in
sky blue.

> **Themes are not on this list on purpose.** `BALANCE.prices.theme` exists and there
> is nothing to draw: a theme is design tokens. What blocks it is that `colors`
> resolves at module load inside 34 `StyleSheet.create` calls, so runtime theming is a
> re-architecture rather than an art commission. Filed here so nobody commissions a
> theme, and cross-referenced from `packages/engines/src/shop/index.ts`.

---

## Workflow

1. Generate the **character sheet** or **tier frame** first. Use it as a reference
   image for the rest of its family.
2. Generate 4 variants, pick one, upscale.
3. Remove the background; check the alpha edge at 100 %.
4. Export `@1x`/`@2x`/`@3x`; compress with `pngquant` or `squoosh`.
5. Drop into the path above and record the `license` field.
6. **Check it at 96 px.** Most generated art collapses into mush at real size — this
   is the step people skip, and it is the one that matters.
7. **Desaturate the set** and check nothing collapsed into its neighbour.
8. Run `pnpm content:validate` — CI rejects an asset with no recorded licence.

## Priority

| Wave | Assets | Count | Blocks |
|---|---|---|---|
| **P0** | Brand (mark, wordmark, 2 lockups), icon ×4, splash, Atlas sheet + ×7, onboarding ×3, states ×7, celebration ×3 | **31** | v1.0 launch |
| **P1** | Continents ×7, avatars ×12, rewards ×7, achievements ×18, levels ×8, leagues ×7 | **59** | v1.0 polish |
| **P0-ship** | Feature graphic, 2 store icons, screenshots ×6 per platform | **~15** | Store submission |
| **P2** | Landmarks ×300, pets ×8, avatar items ×8, map skins ×6, celebrations ×6 | **328** | v1.5 |

**P0 is 31 assets, and the first five of them are the brand.** Nothing else on this
page makes the product look like itself until the mark, the wordmark and the lockups
exist — every other asset is a screen, and screens can only carry an identity that has
already been decided.

If only one thing gets commissioned: **§1 and §4**. A logo and Atlas turn a competent
dark-mode app into WorldQuest, and everything after that is polish on something that
already has a face.
