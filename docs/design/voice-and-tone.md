# Voice & tone

WorldQuest sounds like **an enthusiastic expedition guide who assumes you're capable.**

Not a teacher. Not a coach. Not a slot machine. A guide who has been everywhere,
thinks the world is genuinely amazing, and is glad you came along.

---

## The four rules

1. **Second person, present tense, active.** "You found Japan." Not "Japan has been
   found."
2. **Short.** Buttons ≤ 3 words. Headlines ≤ 8. Body ≤ 2 sentences. If it needs a
   third sentence, it needs a different design.
3. **Never shame.** Not for a wrong answer, not for a broken streak, not for being
   away. Ever. This is a hard rule, not a preference.
4. **Every message ends with a way forward.** No dead ends, no bare apologies.

---

## Tone by moment

| Moment | Tone | Example |
|---|---|---|
| Welcome | Warm, inviting | "Explore. Learn. Conquer." |
| Correct | Genuine, brief | "Perfect! You found Japan 🎉" |
| **Wrong** | **Neutral, informative** | "You picked Thailand. **Japan** is the island chain to the northeast." |
| Lesson done | Satisfied, closing | "Nice work. That's Europe a little smaller." |
| Streak alive | Quietly proud | "12 days. The world is getting familiar." |
| **Streak lost** | **Matter-of-fact, forward** | "Streak reset. Today's a good day to start a new one." |
| Away 7+ days | Glad, never guilty | "The world missed you. Want to pick up where you left off?" |
| Level up | Celebratory | "Level 38. You're a Navigator now." |
| Error | Honest, human | "That didn't load. Let's try again." |
| Offline | Reassuring | "You're offline — lessons still work. We'll sync later." |
| Empty | Encouraging | "No achievements yet. Your first is one lesson away." |
| Paywall | Respectful, no urgency | "Premium adds unlimited hearts and deep stats. The learning stays free." |

---

## Wrong answers — the most important copy in the app

The wrong-answer moment happens more than any other. Get it wrong and users feel
stupid; feel stupid twice and they leave.

**The formula:** *name what they chose · name the right answer · give one memorable
hook · move on.*

```text
✅  You picked Thailand. Japan is the island chain to the northeast —
    look for the four big islands off the Asian coast.

❌  Wrong! Try again!
❌  Oops! That's not right 😔
❌  Incorrect. The correct answer was Japan.
❌  Nice try, but no!
```

**Say whose statement it is.** The first sentence was "That's Thailand." for most of
the project, and it only ever worked because the example is a country name. The app
asks about languages, currencies and flags too, and over a map of Papua New Guinea
the same pattern rendered:

```text
❌  Det är koreanska.
    Svaret är engelska.
```

Two sentences that contradict each other, because the first one reads as a claim about
the country on screen rather than about the tap. "You picked" costs two words and
cannot be misread in any of the six attributes. It is still not shame: naming a choice
is not judging it, which is exactly what separates it from "Incorrect."

No exclamation mark. No sad emoji. No "but". No "unfortunately". The user is not
being corrected by a teacher — they're being told something interesting by a friend.

**Visual pairing:** muted `feedback.wrong` background (not red), no shake, no buzzer,
`impactMedium` haptic. See [`design-system.md §7`](design-system.md#7-motion).

---

## Words we use and don't

| Use | Avoid | Why |
|---|---|---|
| explore, discover, journey, adventure | study, revise, homework, drill | We're not school |
| you found / you know / you've mastered | you failed / you missed / you lost | Frame around gain |
| let's, ready, next | you must, you should, you need to | Invitation over instruction |
| streak, day, together | don't lose, hurry, last chance | No manufactured urgency |
| Premium | Pro, Plus, Unlimited | One name, everywhere |
| Coins / XP | points, credits, gems (gems = paid only) | Precise economy language |

**Banned outright:** "Oops!" · "Uh oh!" · "Don't break your streak!" · "You're falling
behind" · "Only X hours left!" · any sentence whose emotional job is anxiety.

---

## Notifications

Full policy and frequency budget:
[`../systems/notifications.md`](../systems/notifications.md).

```
✅  Europe is waiting. 5 minutes?
✅  Japan is almost mastered — one lesson to go.
✅  Your streak is at 12. Nice run.
✅  Alex just passed you. Fancy a rematch?

❌  Don't lose your 12-day streak!!
❌  😢 We haven't seen you in 3 days
❌  Your friends are ahead of you
❌  LAST CHANCE to keep your streak
```

Every notification must pass: **"Would I be glad to receive this?"** If it works only
by making someone anxious, it doesn't ship.

---

## Localisation

- **No string concatenation.** `"You found " + name` breaks in every language with
  cases. Use ICU: `t('lesson:correct', { country })`.
- **Never build a sentence from fragments.** Whole sentences are the unit of
  translation.
- **Plurals via ICU**, not `if (n === 1)`. Swedish, German and Polish have rules
  English doesn't.
- **Leave 40 % expansion room.** German and Finnish are long; a button that fits
  "Continue" may not fit "Fortsätta".
- **Never put a country name inside a translated idiom.**
- Translator notes go in the i18n file, not in the code. Every key needs context —
  "Continue" as a verb button is a different word than "Continue" as a heading.

See [`../engineering/localization.md`](../engineering/localization.md).

---

## Atlas — the mascot

Atlas is a small robot explorer in a safari hat. He is **curious, encouraging, and
never disappointed in you.**

**Atlas appears at:** first launch · the taster lesson · a return after 7+ days ·
level-up · a major milestone · empty and error states.

**Atlas does not appear:** on every screen · during a lesson (he'd be a distraction) ·
in notifications about failure · in a paywall.

**Atlas never says:** "I'm sad", "you disappointed me", "where have you been?" His
emotional range is *excited* → *interested* → *encouraging*. He has no guilt setting,
because guilt is not something we do to users.
