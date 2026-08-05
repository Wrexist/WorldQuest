# Achievements

Target: **~300 eventually**, ~68 at v1.5 (matching the mockup's `32 / 68`).

An achievement system that grows to 300 hand-coded checks becomes unmaintainable
around #40. So achievements are **data**: a rule evaluated against an event stream by
a generic engine. Adding one is a JSON entry and a translation, not a code change.

---

## 1. Categories

| Category | ~Count | Theme | Example |
|---|---|---|---|
| **Exploration** | 40 | Places visited, globe used | See all 7 continents |
| **Countries** | 60 | Country mastery | Master all 54 African countries |
| **Flags** | 40 | Flag recognition | Identify 100 flags without a mistake |
| **Capitals** | 30 | Capital mastery | Master 100 capitals |
| **Landmarks** | 30 | Landmark knowledge | Find 50 UNESCO sites |
| **Perfect** | 25 | Flawless performance | 10 perfect lessons in a row |
| **Consistency** | 30 | Streaks, habit | 365-day streak |
| **Collections** | 20 | Collection completion | Complete any 5 collections |
| **Events** | 20 | Seasonal, live-ops | Complete the World Cup event |
| **Social** | 20 | Friends, leagues | Reach Diamond league |
| **Premium** | 10 | Premium-only cosmetic goals | Own 20 cosmetics |
| **Hidden** | 15 | Discovered, not listed | Learn a country on its national day |
| **Legendary** | 10 | The very long tail | 195/195 + prestige 3 |

## 2. Tiers

Most achievements are tiered, which multiplies content without multiplying design:

| Tier | Colour | XP | Coins |
|---|---|---|---|
| Bronze | `#CD7F32` | 25 | 10 |
| Silver | `#C0C0C0` | 50 | 25 |
| Gold | `#F5A61E` | 100 | 50 |
| Platinum | `#E5E4E2` | 250 | 100 |
| Legendary | `#A855F7` | 500 | 200 |

`ach.flags.collector` at Bronze/Silver/Gold/Platinum = 5 / 20 / 40 / 65 flags.
One definition, four unlocks, four celebrations.

Those are the numbers in the pack. They used to read 10 / 50 / 100 / 195 here and in the
pack alike, against a content set holding 65 flags — so two of the four tiers could never
be reached by anybody, with a progress bar creeping towards them for ever. §9 of the
content validator now counts the ceiling from the packs and fails in both directions, so
a threshold above what exists is caught, and so is a top tier left behind by a pack that
grew. The example above is a real definition, not an illustration; if it disagrees with
`packs/achievements/core.v1.json`, the pack is right and this line is stale.

## 3. Definition format

```json
{
  "id": "ach.flags.collector",
  "category": "flags",
  "hidden": false,
  "icon": "flag-collection",
  "name": { "key": "achievements:flags.collector.name" },
  "description": { "key": "achievements:flags.collector.desc" },
  "rule": {
    "type": "counter",
    "event": "fact_mastered",
    "where": { "attribute": "flag" },
    "distinctBy": "entityId"
  },
  "ceiling": { "of": "facts", "attribute": "flag" },
  "tiers": [
    { "tier": "bronze",    "threshold": 5  },
    { "tier": "silver",    "threshold": 20 },
    { "tier": "gold",      "threshold": 40 },
    { "tier": "platinum",  "threshold": 65 }
  ],
  "showProgress": true,
  "minVersion": "1.5.0"
}
```

### `ceiling` — an achievement must be achievable

**Declare the ceiling on anything bounded by content, and `pnpm content:validate` will
do the arithmetic.** `of` is `facts` (optionally narrowed by `attribute`), `entities` or
`regions`, counted across the shipped packs and excluding anything not quizzable.

This exists because seven of the first twelve achievements had tiers nobody could reach.
`ach.flags.collector` asked for 100 and then 195 flags against a pack of 65;
`ach.countries.complete` wanted 195 of 65 countries; `ach.explorer.continents` wanted a
seventh region. With `showProgress: true` the screen drew a bar creeping towards a number
that did not exist, for ever — which in a product whose rules forbid dark patterns and
shame copy is precisely the mechanic being forbidden.

The check runs in **both directions**, and the second is the half that keeps working:

- a threshold **above** the ceiling is unreachable — the original bug;
- a **top tier below** the ceiling means the pack grew and the achievement did not, so
  "collect them all" quietly became "collect two thirds of them".

Omit `ceiling` when the achievement is genuinely unbounded — lessons completed, days of
streak, level reached. It is skipped rather than guessed at.

> The first run of this check found one more thing than it was written for: Switzerland's
> capital is `quizzable: false` (Bern is not the constitutional capital), so the real
> number of askable capitals is 63, not the 64 the pack file suggests. That is the
> argument for counting rather than writing the number down.

## 4. The rule engine

Six rule types cover essentially everything. Resist adding a seventh — a special case
is one achievement's convenience and every future achievement's tax.

| Type | Evaluates | Example |
|---|---|---|
| `counter` | Count of matching events, optionally distinct | 100 flags mastered |
| `streak` | Consecutive occurrences | 30-day streak |
| `threshold` | A stat crossing a value | Reach level 50 |
| `set-completion` | All members of a set | All 54 African countries |
| `session` | A condition within one lesson | Perfect lesson under 60 s |
| `composite` | AND/OR over other rules | 195 countries **AND** prestige ≥ 1 |

```ts
// packages/engines/src/achievements/
export type Rule =
  | { type: 'counter'; event: EventName; where?: Filter; distinctBy?: string }
  | { type: 'streak'; metric: 'daily_lesson' | 'perfect_lesson'; }
  | { type: 'threshold'; stat: StatName }
  | { type: 'set-completion'; set: SetRef }
  | { type: 'session'; conditions: SessionCondition[] }
  | { type: 'composite'; op: 'and' | 'or'; rules: Rule[] }

export function evaluate(
  def: AchievementDef,
  state: AchievementProgress,
  event: DomainEvent,
): { progress: number; unlocked: Tier | null }
```

**Pure and incremental.** It takes the stored progress plus one new event and returns
the new progress — it never rescans history. That's what makes 300 achievements cheap
to evaluate on every answer.

## 5. Where it runs

**Server-side, in the same edge function that grades a lesson.** Achievements award XP
and coins, so a client that could unlock them could mint currency.

```
lesson submitted → grade → write review_log + user_facts + ledgers
                        → emit domain events
                        → evaluate achievements over those events
                        → return unlocks to the client for celebration
```

Client-side evaluation exists too, but **only** to render an optimistic celebration.
The server's list is authoritative; a client-only unlock is discarded silently.

## 6. Backfill

New achievements ship constantly, and a user with a 200-day streak must not see a
"7-day streak" achievement appear as *locked*.

- **Replayable rules** (`counter`, `threshold`, `set-completion`) are backfilled from
  `review_log` and the ledgers by a migration job.
- **Non-replayable rules** (`session`, some `streak`) apply from their release date and
  are marked `"backfill": false` in the definition.
- Backfilled unlocks are granted **silently, in bulk**, with a single "You unlocked 12
  achievements" summary. Twelve consecutive celebration animations is a bug, not a
  reward.

## 7. Presentation

**Achievements screen** (mockup #14): `Your Progress 32 / 68` · recent medals ·
grouped list with progress bars.

Rules:
- Locked achievements **show their criteria and current progress** — visible goals are
  the whole motivational point.
- `hidden: true` achievements show as `???` until unlocked, then reveal fully. Keep
  these rare (15 of 300) and delightful, never required for completion.
- Tiered achievements show one row with the *next* tier's target, not four rows.
- Sort: in-progress (closest first) → locked → unlocked. Never sort so that a user's
  first view is a wall of locks.

**Unlock moment:** full-screen celebration (`motion.celebrate`, 900 ms), medal, name,
reward, haptic, sound. Dismissible from frame one. If several unlock at once, queue
them with a maximum of **2** celebrations, then a summary card.

## 8. Design rules

| Rule | Why |
|---|---|
| Every achievement is reachable by a free, solo user | Sarah's classroom and Ingrid must not be locked out |
| No achievement requires spending money | Premium achievements are *for* cosmetics you may also earn |
| No achievement rewards unhealthy behaviour | No "play at 3 am", no "10 hours in a week" |
| Criteria are visible (except `hidden`) | Arbitrary goals feel unfair |
| Names are evocative, not mechanical | "Continental Drift", not "Master 54 countries" |
| IDs are permanent | They ship in save data and dashboards |
| Every achievement is localised | Including the flavour text |
| ≥ 1 achievement is < 1 day away, always | The system must never look dormant |

## 9. Starter set (v1.5, ~68)

**Exploration (8)** First Steps (1 lesson) · Continental Drift (all 7 continents) ·
Globetrotter (100 countries viewed) · Deep Diver (10 country pages) · Wanderer (visit
Explore 7 days running) · Cartographer (use the globe 50×) · Armchair Traveller (1
country per continent mastered) · Off the Map (find a microstate)

**Countries (10)** Europe/Asia/Africa/N. America/S. America/Oceania complete ·
50/100/195 mastered · One From Each

**Flags (8)** Collector ×4 tiers · Flawless Flags (50 in a row) · Lookalikes (all 10
commonly-confused pairs) · Tricolour Expert · Starry Eyed

**Capitals (6)** Capital Gains ×4 tiers · Reverse Engineer (100 reverse) · Capital
Sprint (20 in 60 s)

**Perfect (8)** Flawless (1) · Untouchable (5 in a row) · Immaculate (10) · Perfect
Week · No Hearts Lost (7 days) · Speed Demon · Precision · Comeback (perfect after a
failed lesson)

**Consistency (10)** 3/7/30/100/365-day streaks · Early Bird · Night Owl · Weekend
Warrior · Comeback Kid (return after 14 days) · Reliable (4 weeks at WLD 5+)

**Collections (6)** · **Social (6, v2.0)** · **Hidden (4)** · **Legendary (2)**

Full definitions live in `packages/content/packs/achievements/`. Add one with
`/wq-add-achievement`.
