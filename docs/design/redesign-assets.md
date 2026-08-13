# Redesign — every asset the mockups need

The ten redesign screens, read against what the repo already ships. Three columns:
**have** (in `apps/mobile/assets`, wired, rendering), **derive** (exists as a pipeline —
run a script, no commission), **commission** (nothing in the repo can produce it).

Nothing here is a guess about what an illustrator "could" do. `docs/design/asset-prompts.md`
is the brief for anything in the commission column, and its own rule stands: **flags, maps,
borders and coastlines are never generated** — they come from `pnpm build:flags` and
`pnpm build:maps`, out of flag-icons (MIT) and Natural Earth (public domain).

---

## 1. Icons — `pnpm build:icons`, from Lucide (ISC)

All present. The redesign needed fourteen that were not in the set; they were added to
`scripts/build-icons.cjs` and rasterised, so the set is now 40.

| Already had | Added for the redesign |
|---|---|
| home · explore · quests · profile · more · back · forward · chevron · close · check · streak · xp · coins · gem · heart · trophy · globe · map · pin · flag · star · lock · medal · bell · offline · failure · shop | **capital** (landmark) · **currency** (banknote) · **language** (languages) · **callingCode** (phone) · **continent** (earth) · **settings** · **edit** (pencil) · **clock** · **moon** · **sunrise** · **sparkle** · **book** · **repeat** |

`callingCode` is the one that was a live bug rather than a redesign: 67 facts across all
65 country pages were printing the raw pack key `calling-code` as their label.

**Cost: none.** Committed PNGs, 40 icons, 167 KB total.

---

## 2. Illustrations — `pnpm build:art`, from the masters in `docs/design/assets`

### Have, and now used by the redesign

| Asset | Where the mockup puts it |
|---|---|
| `atlas/waving-back` | beside the Home greeting |
| `atlas/thinking` | the quest card, the Quests header, the quest cover page |
| `atlas/explorer` | the Shop's wallet card, the Explore header |
| `atlas/celebrate` | onboarding's answer beat |
| `achievements/tier-{bronze,silver,gold,platinum,legendary}` + 13 category glyphs | Profile's "Recent badges" row |
| `continents/*` skies + `continents-silhouette/*` landmasses | the Explore grid's tiles |
| `rewards/globe` | the "Your world" cards |
| `levels/*` (6 of 10) | the rank insignia on Profile and in the Shop |

### Commission — the three the mockups draw and the repo cannot produce

| # | Asset | Screen | Why it cannot be derived |
|---|---|---|---|
| A1 | **`quiz/chest`** — an open treasure chest spilling gems and coins, gold rim light, on transparency | Daily Quiz cover (mockup 3) | No chest master exists and `asset-prompts.md` briefs no treasure. Currently drawn with `atlas/thinking`, which is honest but is not the reference. |
| A2 | **`quiz/trophy`** — a gold cup on a laurel plinth with a ribbon band, the band left EMPTY | Daily Quiz complete (mockup 8) | Same. The mockup letters "100%" onto the ribbon; **the number must be live text over the art, never baked in** — a baked "100%" is a picture that lies to anyone who scored 80. |
| A3 | **`home/landscape`** — a wide, low mountain-and-valley band at dawn, 3:1, subject-free in the centre third | Home greeting (mockup 2) | No landscape master. It has to be readable UNDER text at 4.5:1, so it is a brief with a contrast constraint, not a picture. Currently absent — Atlas stands beside the greeting instead. |

Delivery spec for all three, same as every existing master: 1536×1024 PNG with alpha,
subject centred with margin, ≤120 KB after `pnpm build:art` compresses it to WebP.

### Deliberately NOT commissioned

- **Hexagonal badge frames** (mockup 10) and the **hex avatar ring**. The repo already
  ships five painted tier frames and thirteen glyphs, composited by `AchievementMedal`.
  Re-cutting eighteen assets into hexagons is a shape change worth ~0 to a user and
  eighteen files to maintain. Profile draws the round medallions it already has.
- **Six shop item icons** (mockup 4). A shop title is a *word you wear*, not an object —
  illustrating "Night Owl" makes it look like an item you own. They use Lucide glyphs on a
  tinted disc, which is why `moon`, `sunrise`, `capital` and `map` were added above.
- **Flat vector continent maps** (mockup 1). The tiles already composite a real Natural
  Earth silhouette over a painted sky. A hand-drawn continent is an invented coastline,
  which `asset-prompts.md` puts on the permanent no-list.

---

## 3. Sound — `scripts/make-sounds.py`

Nothing new. The redesign adds no moment that is not already scored.

---

## 4. What is missing that is NOT art

Worth listing here because two of the mockup's elements read as assets and are actually
data:

| Element | Status |
|---|---|
| Gem balance in the header (mockup 1, 2, 4, 9, 10) | The chip is built and wired. `Progress` carries no gems and the column has been 0 for every user this product has created — gems are purchase-only by design (`xp-economy.md` §4). It renders the moment a balance exists. |
| "+10 💎" as a quest reward (mockup 2, 3, 8, 9) | **Not implemented, deliberately.** A free daily quiz that mints premium currency is a change to the monetisation model, not a chip. The cards show `BALANCE.xp.dailyQuest` and `BALANCE.coins.dailyQuest`, which are what the server actually awards. |
| "Rank Silver II" (mockup 2) | Leagues are v2.0 (`docs/systems/social-and-leagues.md`). The tile shows the earned **title** instead — same shape of reward, same ladder, real today. |
| "Claim Rewards" button (mockup 8) | Not built. The server awards the bonus when the fifth task completes; a button that claims an award you already have is the dead-shell pattern this repo has removed twice. |
| Antarctica content | 65 countries, 6 continents. Explore offers seven and onboarding lets you start in the empty one. Content commission, not art. |
