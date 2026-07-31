# Quests & live operations

> "Most apps underestimate this. Plan recurring content from the beginning."

Correct. Live-ops is not a growth-team afterthought — it is the difference between an
app people finish and an app people live with. Every mechanic below is designed so
that **running an event costs a config row, not a release.**

---

## 1. Daily Quest (mockup #4)

Five challenges, 10 XP each, +50 XP for completing all five. Resets at the user's
local midnight, evaluated server-side.

**Generation** — not random. A daily quest is composed from a weighted template pool
against the user's actual state:

| Slot | Type | Source |
|---|---|---|
| 1 | Locate | "Tap the country" — from due items |
| 2 | Recognise | "Guess the flag" — from due items |
| 3 | Recall | "Capital match" — from due items |
| 4 | Discover | "Landmark" — from **new** content, so the quest teaches something |
| 5 | Perform | Speed round / perfect lesson / streak-keeper |

**Rules**
- Always completable in **≤ 10 minutes**. A quest that can't be finished in one sitting
  is a chore.
- Always achievable with the content the user already has offline.
- Difficulty adapts: slot 5 scales with the user's recent accuracy.
- Never requires social features, payment, or a specific device capability.
- Partial progress persists; the quest can be resumed all day.
- **A missed daily quest is never mentioned again.** No make-up guilt, no "you missed
  3 quests this week".

## 2. Daily Challenge (mockup #3)

One shared, global, timed challenge — same content for every user that day, with a
countdown to the next one.

**This is our Worldle moment.** Everyone gets the same challenge, so a **spoiler-free
shareable result grid** works:

```
WorldQuest #412  ▰▰▰▰▱  4/5
🟩🟩🟨🟩⬛
worldquest.app
```

Cheapest viral loop we will ever build. Prioritised for **v1.5**, and the reason the
Daily Challenge is deliberately identical for all users.

## 3. Weekly quests *(v1.5)*

Three per week, larger goals: "Master 10 new countries" · "Complete 5 perfect lessons" ·
"Explore all of South America". Rewards: coins + a weekly badge. Progress is visible
all week; expiry is quiet.

## 4. The content calendar

Recurring content, planned a year ahead. Each cadence has a different job.

| Cadence | Job | Example |
|---|---|---|
| **Daily** | The habit | Daily Quest, Daily Challenge |
| **Weekly** | The medium arc | Weekly quests, league reset (Monday 00:00 UTC) |
| **Monthly** | Novelty | Themed collection: "Island Nations", "Flags of the Sea" |
| **Seasonal** | The big arc | 8-week season with a themed track |
| **Yearly** | Ritual | Anniversary event, year-in-review |

### The annual calendar

Twelve months of pre-planned events. Each is a config row + a content pack + copy.

| Month | Event | Hook | Content |
|---|---|---|---|
| January | New Year, New World | Set a yearly country goal | Goal-setting + a personal track |
| February | Carnival | Brazil, Venice, Trinidad | Culture collection |
| March | Water World | World Water Day (22nd) | Rivers, lakes, seas |
| April | **Earth Day** (22nd) | Physical geography | Mountains, biomes, climate |
| May | Islands | Small states, archipelagos | Island Nations collection |
| June | Summer Travel | "Where are you going?" | Destination-themed lessons |
| July | Peaks | Mountains and altitudes | Highest points collection |
| August | Ancient World | UNESCO, ruins | Landmark collection |
| September | Back to School | Classroom push (Sarah) | Curriculum-aligned tracks |
| October | **UN Day** (24th) | Flags, membership, diplomacy | All-flags challenge |
| November | Festivals of Light | Diwali, Bonfire, Loy Krathong | Culture collection |
| December | Winter Journey | Advent-style 24-day calendar | Daily reveal, one country a day |

**Opportunistic events** (planned but scheduled reactively): Olympic Games, FIFA World
Cup, Eurovision, major eclipses. These need a **content pack ready 4 weeks ahead** —
the whole point of planning the calendar now.

## 5. Event architecture

An event is a **row plus a pack**, never a release:

```json
{
  "id": "evt.2027.earth-day",
  "slug": "earth-day-2027",
  "startsAt": "2027-04-18T00:00:00Z",
  "endsAt":   "2027-04-26T23:59:59Z",
  "config": {
    "banner": { "key": "events:earthDay.banner", "art": "events/earth-day/hero.webp" },
    "theme": { "canvas": "#04210F", "accent": "#3FBF8F" },
    "contentPacks": ["geography.biomes.v1"],
    "quests": ["quest.event.biome-explorer", "quest.event.mountain-master"],
    "collection": "coll.earth-day-2027",
    "rewards": { "cosmetic": "avatar.earth-hat", "coins": 500 },
    "leaderboard": { "enabled": true, "scope": "global" }
  }
}
```

The client fetches active events, renders the banner on Home, applies the theme
override (possible because every colour goes through the semantic token layer — see
[`../design/design-system.md §12`](../design/design-system.md#12-theming)), and loads
the content packs.

**Requirements**
1. **No app release required.** If an event needs a build, the architecture failed.
2. **Graceful degradation** — an old client that doesn't understand a config key
   ignores it and shows the event without that feature. Never crash on an unknown key.
3. **Timezone-aware** — events start at local midnight where that matters, UTC where
   fairness matters (global leaderboards).
4. **Event content is not required for progression.** Missing an event costs cosmetics,
   never mastery or completion. Sarah's class in September must not fall behind
   because they skipped Carnival.
5. **Everything is previewable** — `?previewEvent=<slug>` in a debug build, so QA and
   marketing can see it before it's live.

## 6. Live-ops calendar hygiene

| Rule | Why |
|---|---|
| Max **one** major event at a time | Overlapping events dilute both |
| ≥ 1 week gap between major events | Constant events stop being events |
| Every event has a **kill switch** | Server-side disable without a release |
| Every event is A/B-able | Config-driven means variant-driven |
| Post-event retro within 7 days | Participation, retention lift, complaints |
| Event content becomes permanent after 12 months | Nothing is lost forever |

That last rule matters: FOMO-driven permanent exclusivity is a dark pattern. Our
exclusivity is **temporal, not permanent** — you get the badge *dated 2027*, and
someone in 2028 can still learn the content.

## 7. What live-ops must never do

- Create urgency whose only function is anxiety ("2 HOURS LEFT!!")
- Sell power. Event rewards are cosmetic.
- Require daily attendance to complete. Every event is finishable with **3 of 8 days**
  of play — a family holiday must not cost you the event.
- Randomise paid rewards. On the permanent no-list.
- Push more than the notification budget allows: **1 event notification per event**,
  inside the 2/day cap ([`notifications.md`](notifications.md)).
- Target children with spending prompts. Ever.

## 8. Operating cadence

| Rhythm | Activity |
|---|---|
| Weekly | League reset (Mon 00:00 UTC), weekly quests roll, health check |
| Monthly | Themed collection ships, economy health review, calendar review for T+2 months |
| Quarterly | Season starts, competitor re-verification, persona validation |
| Annually | Calendar planning for the next 12 months, content roadmap |

**Rule: the next two months of live-ops are always fully built and QA'd.** Live-ops
built the week it ships is live-ops that breaks on a Saturday.
