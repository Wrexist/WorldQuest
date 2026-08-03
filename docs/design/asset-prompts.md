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
| **UI icons** (tab bar, chevrons, close) | Generated icons drift in weight and optical size, and none of them mirror correctly for RTL. | **Lucide** (ISC) or **Phosphor** (MIT). |
| **Fonts** | — | **Inter** and **Baloo 2**, both OFL, from Google Fonts. |
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
> and reading the first as the second cost months. Two other rows here name a source
> rather than a brief — geometry and icons. Neither is blocked on anybody's decision
> either.

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

---

# P0 — blocks v1.0 launch

## 1. App icon

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

## 2. Splash screen

`apps/mobile/assets/splash.png` · 2048×2048 · centred logo, safe to crop to any ratio

```
[STYLE BLOCK]

A deep night-sky field with a soft blue-to-navy vertical gradient, scattered small
stars of varying brightness, and a faint aurora-like glow rising from the lower
third. Completely empty in the centre 40% of the frame — that space is reserved for
the logo, which is composited by the app. Atmospheric, calm, spacious.

[NEGATIVE BLOCK], central subject, mascot, globe, foreground objects
```

## 3. Atlas — the mascot

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

> **Atlas is never sad, never disappointed, never scolding.** If a pose reads as
> guilt-tripping, regenerate it — that tone is on the product's permanent no-list.

## 4. Empty and error states

`docs/design/assets/states/*.png` · 1024×1024

| File | Prompt body |
|---|---|
| `states/empty-caught-up.png` | `A small rounded telescope on a tripod pointing up at a calm starfield, one bright gold star centred in its view. Peaceful, accomplished, restful. Centred.` |
| `states/empty-no-friends.png` | `Two small rounded signal beacons on a dark landscape, one lit gold and one unlit, with a faint dotted arc between them suggesting a connection about to form. Hopeful, not lonely. Centred.` |
| `states/error-generic.png` | `A small rounded compass lying on dark ground, its needle spinning, with a faint warm glow underneath. Calm and recoverable, not alarming. Centred.` |
| `states/offline.png` | `A small rounded paper aeroplane hovering above a dark landscape with a soft dotted trail behind it, moving steadily. Self-sufficient, still going. Centred.` |

---

# P1 — v1.0 polish

## 5. Continent cards

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

## 6. Avatar set

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

## 7. Reward and progression art

`packages/content/assets/rewards/*.png` · 512×512

| File | Prompt body |
|---|---|
| `rewards/trophy.png` | `An ornate rounded gold trophy with a five-pointed star on its cup, sitting on a short plinth, lit warmly from the upper left with a soft gold glow beneath. Celebratory and substantial.` |
| `rewards/coin.png` | `A single thick gold coin seen at a slight three-quarter angle, with a simple embossed compass rose on its face and a warm bevelled rim. Chunky and tactile.` |
| `rewards/gem.png` | `A faceted violet gem with soft internal light, cut in a rounded brilliant shape, floating with a gentle glow beneath it. Precious, not sharp.` |
| `rewards/streak-flame.png` | `A stylised rounded flame in warm orange and gold with a soft cyan core, curling gently upward. Lively and warm, never threatening.` |
| `rewards/heart.png` | `A rounded glossy red heart with a soft highlight, slightly three-dimensional, gently glowing. Friendly, not clinical.` |
| `rewards/streak-freeze.png` | `A rounded flame encased in translucent pale-blue ice with soft frost crystals at its base. Preserved, protected, calm.` |

## 8. League tier badges

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

# P2 — v1.5

## 9. Achievement medals

`packages/content/assets/achievements/*.png` · 512×512 · 5 tiers × ~13 categories

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

## 10. Landmark illustrations

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

## 11. Pets and cosmetics

`packages/content/assets/cosmetics/*.png` · 512×512

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
7. Run `pnpm content:validate` — CI rejects an asset with no recorded licence.

## Priority

| Wave | Assets | Blocks |
|---|---|---|
| **P0** | App icon, splash, Atlas ×7, states ×4 | v1.0 launch |
| **P1** | Continents ×7, avatars ×12, rewards ×6, leagues ×7 | v1.0 polish |
| **P2** | Achievements ×18, landmarks ×300, cosmetics ×8 | v1.5 |

**P0 is 13 assets.** That is a realistic first commission.
