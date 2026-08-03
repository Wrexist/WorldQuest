# Feature backlog — what to build next, ranked

Ten candidates for "more to do, and more to look forward to", ranked by **value to the
daily loop ÷ cost and risk**, and checked against what is actually in the repo today
rather than against what sounds good.

This is a proposal, not a decision. [`roadmap.md`](roadmap.md) still owns the order;
where a row here disagrees with it, the disagreement is stated.

---

## The constraint everything else is measured against

**The app currently holds 193 quizzable facts.**

| | Today | v1.0 target |
|---|---|---|
| Countries | 65 | 195 |
| Fact types per country | 3 (capital, flag, currency) | 4+ |
| Quizzable facts | 193 | ~600 |
| Generated items | 449 | ~2,400 |

A user doing one lesson a day meets roughly ten items per session. Even with FSRS
holding new material back so reviews interleave, **new facts run out in about three to
four weeks.** After that the app is pure review — which is exactly right for retention
of what you already met, and is not something anyone opens an app to do.

Every feature below is a multiplier on content. None of them fixes running out of it.
That is why #1 is #1, and why shipping #3 to #10 without it would be decorating a room
nobody stays in.

---

## The ranking

| # | Feature | Value | Cost | Ships as | Roadmap says |
|---|---|---|---|---|---|
| 1 | **The rest of the world, and more facts per country** | ●●●●● | ●●○○○ | Content | v1.0 |
| 2 | **Map questions — "where is Chad?"** | ●●●●● | ●●●○○ | Content + engine | v1.0 (4 question types) |
| 3 | **The shop — somewhere for coins to go** | ●●●●○ | ●●○○○ | Feature | v1.5 |
| 4 | **Collections that complete** | ●●●●○ | ●●○○○ | Feature | v1.5 |
| 5 | **Weekly quests and a season arc** | ●●●○○ | ●●○○○ | Config | v1.5 / v2.0 |
| 6 | **Landmarks, illustrated** | ●●●●○ | ●●●●○ | Content + art | v1.5 |
| 7 | **The daily challenge, shareable** | ●●●○○ | ●●○○○ | Feature | v1.5 |
| 8 | **Async friend challenges (no social graph)** | ●●●○○ | ●●●○○ | Feature | v1.5 |
| 9 | **Custom study lists + Relaxed Mode** | ●●○○○ | ●●○○○ | Feature | v1.5 / v3.0 |
| 10 | **Leagues and seasons** | ●●●●○ | ●●●●● | Feature + safety | v2.0 |

---

## 1. The rest of the world, and more facts per country

65 → 195 countries, and 3 → 5+ fact types (add population band, language, neighbours,
largest city). ~600 facts, ~2,400 items — a year of daily material instead of a month.

**Pros**
- It is the only item on this list that fixes the actual problem. Everything else adds
  reasons to return to a room that runs out of things to look at.
- It is **authoring, not engineering**. Phase 1's exit criterion 4 was "adding a country
  means editing one JSON file" and that has been exercised 65 times. This is the payoff.
- It compounds: every new fact type multiplies across every template, and every new
  country multiplies across every fact type.
- Zero architectural risk, zero new dependencies, no new screens.

**Cons**
- It is slow, unglamorous, and nobody demos it. 400+ facts each need a source and a
  `verifiedAt`, and **a wrong fact is this repo's one unshippable bug**.
- Some fact types are traps. Population is `fast` volatility and may never be a quiz
  answer; official languages need a human decision for multi-language countries rather
  than a default. Both are already flagged as deliberately deferred.
- Needs a second author for the fact-check pass. That is a person, not a sprint.

**Verdict: do this first and continuously.** It is the parallel track the roadmap
already describes, and it has fallen behind the code.

---

## 2. Map questions — "where is Chad?"

Show the region, four countries highlighted in turn or four names against a pin; the
user picks. The `map` modality already exists in the schema and **no template uses it**.

**Pros**
- It is *the* geography question. An app that never asks you to find somewhere on a map
  is a vocabulary app about place names.
- **The blocker is gone.** Map questions were deferred on "map geometry licensing";
  the Natural Earth pipeline now ships 130 outlines, and `pnpm build:maps` regenerates
  them when the country list changes.
- It tests something the other templates cannot: spatial memory rather than word
  association. That is a genuinely different fact, so it multiplies items rather than
  rewording them.
- Groundwork is done — `PRESENTABLE` already gates modality, and the locator map
  component, framing and licensing all exist.

**Cons**
- Needs a `location` fact per country to hang memory on, since memory is tracked per
  fact. That is a content decision (what *is* the fact — the region? the neighbours?)
  and it should not be improvised.
- **The accessibility path is mandatory and not optional.** `accessibility.md` already
  specifies it: a map question must have a screen-reader-equivalent sibling template
  that the engine treats as the same item, exactly like `tpl.flag-describe.mc4`. Ship
  both or ship neither.
- A tap-the-country interaction needs hit-testing, which the raster pipeline
  deliberately does not provide. The first version should be four-option multiple
  choice over a highlighted map — no new native dependency.

**Verdict: highest-value engineering item.** It was blocked, it isn't any more, and the
docs have not caught up.

---

## 3. The shop — somewhere for coins to go

**Pros**
- Coins are currently **noise**, and the Product Bible says so in principle 10: *"If it
  can be earned, it must be spendable."* The only spend in the app is an out-of-hearts
  revive, which most users never see.
- The economy is **already fully specified**. `BALANCE.prices` names `avatarItem`,
  `pet`, `mapSkin`, `theme`, `titleUnlock` and `celebration`, tuned so a meaningful
  cosmetic is 4–7 days of saving. Nothing needs designing from scratch — a screen needs
  building against numbers that already exist.
- It converts every other feature's rewards into progress toward something chosen. That
  is the "grind towards" the brief asks for, and it costs no new content.
- `mapSkin` and `theme` are nearly free now: both map layers are alpha masks tinted from
  design tokens, so a theme recolours the maps with everything else.

**Cons**
- Cosmetics need art, and avatars are one of the three genuinely illustration-bound
  rows. Titles, themes and map skins do not — start there.
- A shop invites a store. **Coins must never be purchasable**: this is a children's app,
  and the moment coins have a price the economy is a monetisation surface with a
  regulator attached.
- Risks making the loop feel transactional if the first items are gameplay advantages
  rather than expression. Sell hats, not hearts.

**Verdict: the cheapest large win.** Prices exist, rewards exist, only the sink is
missing.

---

## 4. Collections that complete

Flags of Africa. Capitals of Asia. Island nations. Each a set with visible progress and
a real reward on completion.

**Pros**
- Completion is the single most reliable long-arc motivator in this genre, and it is
  intrinsically honest here: a completed collection means you actually know those
  facts, unlike a login streak.
- `collectionComplete: 150` coins is already in the balance table, and collection
  screens already exist — this is largely surfacing and rewarding what is built.
- Generates goals **without generating content**: the same 193 facts can be sliced into
  a dozen collections that each feel like a separate objective.
- Pairs perfectly with #1 — every new country lands in several collections at once.

**Cons**
- Slicing the same content into more goals is dangerously close to busywork if the
  slices are arbitrary. "Countries starting with M" is a checklist; "the Nordics" is a
  region you can picture.
- Completion rewards must not be the only path to a cosmetic, or a user who dislikes
  collecting is locked out of expression.

---

## 5. Weekly quests and a season arc

**Pros**
- The app has a daily arc and nothing longer. A week-long goal is what gets someone
  through a bad Tuesday.
- Ships as **config, not code** — `docs/systems/quests-and-liveops.md` already specifies
  this and `generateDailyQuest` proves the shape.
- Seasons give a reason to look forward: something ends, something new starts.

**Cons**
- Time-boxed content is a FOMO machine if handled badly, and this app has hard rules
  against pressure. A season that punishes a missed week is a season that loses the
  week after.
- Needs a content calendar, which is an ongoing operational commitment rather than a
  shipped feature.

---

## 6. Landmarks, illustrated

**Pros**
- The highest-delight content type available. Faces on the world: Machu Picchu, the
  Pyramids, Uluru.
- Opens whole new question types (which country is this in? which is older?) rather
  than restating known facts.
- **The photo-licensing blocker has a documented escape hatch** the roadmap itself
  names: *"replace with illustrated landmarks, which is also more on-brand."*

**Cons**
- Illustration is a real cost — ~300 landmarks is a commissioning programme, not a
  script. This is one of the three rows that genuinely needs an artist.
- Never generate a "photo" of a real place. It will be subtly wrong, and a wrong
  landmark is the same P1 as a wrong capital.
- Long lead time. Start the commission during #1, ship after it.

---

## 7. The daily challenge, shareable

One puzzle a day, same for everyone, with a spoiler-free result grid.

**Pros**
- `dailyChallenge: 15` coins is already in the balance table.
- The cheapest growth mechanic in existence — Wordle proved a result grid outperforms
  any referral programme.
- A fixed daily appointment is a strong habit anchor, and it is the same for everyone,
  so it gives people something to talk about.

**Cons**
- Sharing on a children's app needs care: the grid must carry no identity, no score
  comparison against named people, and no link that leads anywhere social.
- One puzzle a day is one more content slot to fill, forever.
- Only pays off at scale. With few users there is nobody to share with.

---

## 8. Async friend challenges (no social graph)

Send a seeded 5-question run by link; both play the same items; compare afterwards.

**Pros**
- Delivers most of the competitive pull of leagues at a fraction of the cost and
  **without the moderation prerequisite** — no profiles, no feed, no usernames to
  report, nothing to moderate.
- The engines are already deterministic per seed, which is precisely what this needs;
  that determinism is tested and was built for this.
- Serves Alex and Kenji, the two personas with the least to do today.

**Cons**
- A link is still a social surface. Needs thought about what a link reveals and how
  long it lives.
- Weaker than real leagues for the competitive persona — it is a smaller version of
  something they will eventually want anyway.

---

## 9. Custom study lists + Relaxed Mode

**Pros**
- Agency: "I have a trip to Japan" or "I keep missing the Balkans" is the most
  motivated a learner ever is, and the app cannot serve it today.
- Relaxed Mode serves Ingrid and Emma directly and is already specified in the
  accessibility contract — no timers, no hearts, no streak pressure.
- Both are engine-shaped work with no new content.

**Cons**
- Study lists let a user route around FSRS, which is the thing that makes the app work.
  Needs care that a custom list feeds the same scheduler rather than bypassing it.
- Neither is a *growth* feature. They deepen the experience for people already here.

---

## 10. Leagues and seasons

**Pros**
- The strongest retention mechanic in the category, by a distance. Duolingo's leagues
  are most of why their streak numbers look the way they do.
- The economy already anticipates them (`leaguePodium` payouts are in the balance
  table) and the screen is in the mockup.

**Cons**
- **The heaviest item on this list, and the most dangerous.** A kids' app with a
  competitive social surface needs moderation, reporting and blocking shipping *with*
  it, not after — the roadmap calls this a prerequisite that cannot be skipped.
- Needs a server-side ranking service, weekly cohorting, and anti-cheat beyond the
  current 400 ms credibility floor.
- Leagues reward *volume*, and this app rewards *learning*. Tuned carelessly they teach
  people to farm easy items — which is exactly what the repeat-mastered XP penalty
  exists to prevent. That tension has to be designed out, not discovered.
- Needs a population before it means anything. A league of four is not a league.

**Verdict: right feature, wrong time.** v2.0, as the roadmap says.

---

## Recommended order

1. **#1 content** — continuously, starting now; it gates everything.
2. **#3 the shop** — a week of work against prices that already exist, and it makes
   every reward in the app mean something.
3. **#2 map questions** — the biggest gameplay addition, now unblocked.
4. **#4 collections** — cheap goals on top of the content from #1.
5. **#5 weekly quests** — the longer arc, once there is enough to do in a week.

Then #7, #8, #6 as the v1.5 depth pass, and #10 when there is a population and a
moderation plan.

**What I would not do first:** anything on this list that adds a reason to return
before there is more to return *to*. With 193 facts, a shop full of hats is a very
well-decorated three weeks.
