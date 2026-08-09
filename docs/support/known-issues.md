# Support — what to tell users

The release Definition of Done asks that "support docs are updated; support knows what
changed". There is no support function yet, so this is the first version of the thing they
will need on day one: the questions users will actually ask, and the honest answer to each.

Written for whoever is answering messages, not for engineers. Where the honest answer is
"we do not know yet", it says so — a support reply that guesses is worse than one that
promises to find out.

**Voice:** same rules as the app (`docs/design/voice-and-tone.md`). Never make a user feel
behind, never blame them for a bug, and never say "unfortunately".

---

## Answers to the things people will ask

### "I lost my progress / my XP did not go up"

**Almost certainly not lost.** A finished lesson is queued on the device and replayed when
the connection returns — it survives the app being killed. Settings has a section that
says what is still waiting to reach the server, with a "Try sending again" button.

Ask them to: open **More → Settings**, look for a "Waiting to sync" section, and tap
**Try sending again** if it is there.

If XP still does not move after that, it is worth escalating — the server is authoritative
for XP, so a stuck number after a successful sync is a real bug and not a display glitch.

### "My streak broke and it was not my fault"

A broken streak can be repaired for coins, for a limited window, and the app offers this
on the streak screen. It states how many hours are left in whole hours and never counts
down, on purpose — we do not put a ticking clock on a purchase.

If the window has passed, it has passed. Do not restore streaks manually as a goodwill
gesture: the streak is server-computed, and hand-editing it is the kind of thing that
turns into a support precedent.

### "I bought something and did not get it"

Two different situations, and they need different answers:

- **A cosmetic bought with coins.** Coins are earned, never bought with money. Buying is
  **paused while offline** rather than queued — the shop says so on screen ("You're
  offline, so buying is paused. Everything you own still works."). So an item that did not
  arrive is not waiting in a queue: ask them to try again on a connection. If it still
  fails with a connection, escalate — a spend that took coins without delivering is a
  ledger problem, not a sync one.
- **A Premium subscription.** Real money. Check **More → Settings → Premium** and have
  them tap **Restore purchases**, which both stores require and which fixes most of these
  (new phone, reinstall, different account). If the card was declined, Settings shows a
  "fix your payment" row — that is a store problem and only the store's own payment
  settings can resolve it.

### "Can my child use this?"

Yes, and under-13 accounts are deliberately different rather than just smaller:

- No social features.
- No third-party analytics — this is enforced in code, and an *unknown* age is treated as a
  child rather than as an adult.
- No premium section at all, because commerce for that audience sits behind a parental
  gate.

The age question is a birth year, never "are you over 13?". If a parent asks why we ask:
a yes/no gate teaches a ten-year-old that lying gets them in, which is useless as
compliance and a bad first thing to teach a child.

### "A fact in the app is wrong"

**Take this seriously and escalate it every time.** A wrong fact in a learning app is the
worst bug it can have. Get the exact country and the exact fact. Every fact in a content
pack carries a source and a verification date, so this is checkable rather than arguable.

Do not defend a fact you have not checked.

### "Why does it need my location / my contacts / the microphone?"

It does not. The app declares no permissions at all, and the microphone is explicitly
blocked on Android. If something is prompting for a permission, that is a bug worth
escalating immediately.

---

## Known issues at first release

Honest list, from `docs/plan/definition-of-done-status.md`. Update this as the device pass
closes things.

| Issue | What to say |
|---|---|
| **No layout has been confirmed on a physical device — phone or tablet.** Tablet support was switched on and has never been seen rendered on hardware at all. | "We have not finished testing on physical devices yet, and that is a real gap rather than a brush-off." Escalate with the device model, OS version and a screenshot; these are the most useful bug reports we can get right now. Do **not** tell a user it works properly on phones — every layout claim so far comes from a browser-based harness, and nothing here has established that. Treat early visual reports as credible rather than as user error. |
| **No crash reporting yet in the first build.** | Nothing to say to users, but it means *their report is the only signal we have*. Get the phone model and OS version every time. |
| **Purchases and streak repair need a connection.** They are deliberately disabled offline rather than queued, because taking coins for something we cannot deliver is worse. | "That one needs a connection — everything else works offline." The app already says this on the button. |

---

## When to escalate rather than answer

- Any claim that a **fact is wrong**.
- Any **money** problem that "Restore purchases" does not fix.
- XP or coins that stay wrong **after** a successful sync — that means the server and the
  client disagree, which is the most serious class of bug this product has.
- Anything involving a **child account** behaving differently from the promises above.
- Any **permission prompt** at all.
