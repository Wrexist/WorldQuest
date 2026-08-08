# Release notes

Written in the product's voice, for the people who use it — not a changelog. The rule from
`docs/design/voice-and-tone.md` applies here too: clear, warm, no filler, and never a
sentence that would make a ten-year-old feel behind.

Store listings have a character limit and a reader who is deciding whether to tap
"Update". Lead with what is different for them. Nobody has ever wanted to read "bumped
dependencies".

---

## 1.0.0 — *draft, pending the device pass*

**Not final.** This version has never run on a phone
(`docs/plan/device-pass.md`), so the notes below describe what is built rather than what
has been confirmed to work in someone's hand. Do not paste this into App Store Connect
until that pass is done — the first line of a release note should not be something we are
still hoping is true.

### What players get

> **The whole world, five minutes at a time.**
>
> Learn every country's flag, capital and landmarks in short daily sessions that fit in a
> bus ride. Build a streak, collect flags, and find out how much of the map you actually
> know.
>
> - **Five-minute lessons.** Pick a continent or let us choose what you are closest to
>   remembering.
> - **A collection worth filling.** 65 countries to find, with the flags to prove it.
> - **Your progress is yours.** Learn offline on the metro; everything syncs when you are
>   back.
> - **No pressure.** Miss a day and your streak can be repaired. Nothing here is designed
>   to make you feel bad about a day off.
> - **Made for kids too.** Under-13 accounts have no social features and no third-party
>   tracking. That is a promise, not a setting.

### Notes for whoever publishes this

- The last bullet is a claim a reviewer can check, and it is true (`lib/analytics.ts`
  treats an unknown age as a child). Do not soften it into marketing language, and do not
  extend it — "no tracking" without the "third-party" qualifier would be false, because
  the app does record its own analytics for adults.
- "65 countries" comes from the shipped content pack. If the pack changes, this number
  changes; it is a fact, not copy, and a wrong fact in a learning app is the worst bug
  available.
- No feature is named that a user cannot reach. Leagues and friends exist in the design
  system and not in the app — mentioning them here would be the store-listing version of
  a dead button.

### What is deliberately not mentioned

Premium. The paywall exists and works, and a first release's notes are not the place to
lead with a subscription — the store listing's own pricing section says it, and saying it
twice reads as a sales pitch rather than a description.

---

## Template for later releases

Three lines, in this order, and drop any that has nothing true to say:

1. **What is new** — a thing they can do that they could not do before.
2. **What is better** — a thing that annoyed them and no longer does. Name the annoyance,
   not the fix. "The lesson no longer hides the fourth answer on small phones" beats
   "layout improvements".
3. **What we fixed** — only bugs a user would have noticed. A user has never noticed a
   refactor.

Never: version numbers of dependencies, internal names, "various bug fixes and
performance improvements", or an exclamation mark we would not say out loud.
