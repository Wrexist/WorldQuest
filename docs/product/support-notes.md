# Support notes

What changed, in the words a support reply is written in. One entry per release, newest
first. The release DoD asks that "support knows what changed" — this is the artefact that
discharges it, and the test of a good entry is that somebody can paste an answer from it
without opening the app.

Two rules:

1. **Lead with the question the user will actually ask**, not with the change. Nobody
   writes in to say "the information architecture moved"; they write in to say "where did
   my settings go".
2. **Never promise a fix date.** "We know, and it's being looked at" is honest; a month is
   a promise the release train breaks.

---

## 0.2.0

### "Where did More go?" / "I can't find Settings"

**The most likely question in this release.** The fifth tab at the bottom used to be
**More** and is now **Shop**. Settings moved to the **gear icon in the top-right corner of
the Profile tab**.

> Settings has moved — tap **Profile** at the bottom, then the gear in the top right.
> Everything that was in More is still there: sound, reminders, language, your account and
> the legal pages.

Nothing was removed. If somebody says a specific setting is gone, that is a bug worth
escalating — the screen itself did not change, only the way in.

### "There's a shop now — do I have to pay?"

No. The shop spends **coins**, which are earned by learning and cannot be bought with
money. Worth being clear about, because a shop appearing in a children's app is exactly
the thing a parent writes in about.

> The shop only takes coins you earn from lessons. There's no way to buy coins, and
> nothing in the shop makes the learning easier — that part is the same for everyone.

### "Atlas looks different" / "the pictures changed"

Every illustration in the app was being cropped by a few pixels on one edge — worst on
Atlas's hat, which came out with a flat slice across the top. That was a bug in how the
app measured pictures, and it is fixed. The artwork itself did not change.

### "My quest gives me an extra screen now"

Two new screens exist around the daily quest — a page before it saying what today is
worth, and a celebration when you finish it. **Both are behind feature flags and are off
by default**, so most users will not see them yet. If a user reports one, they are in the
rollout, and that is expected rather than a fault.

### Swedish

Two strings on the onboarding screens were wrong Swedish and are fixed. If a Swedish user
reports odd wording elsewhere, please capture the exact screen and the exact string — the
rest of the app has not had a native-speaker pass, so more of these are likely.

### Accounts, reminders, and the review prompt

Three things that were promised by the UI and did nothing now work. Each has one
operational precondition worth knowing before a ticket arrives.

**Accounts — the email template must send a CODE, not a link.** The app asks for a
six-digit code on screen. Supabase's default templates send `{{ .ConfirmationURL }}`, a
magic link, and against those templates every account attempt fails in the same way: the
user gets an email with a link and no number, and the app sits waiting for six digits
they do not have.

The fix is a dashboard setting, not a release. In **Authentication → Email Templates**,
the **Magic Link** and **Change Email Address** templates must include `{{ .Token }}`.
If several users at once report "I never got a code" and the email itself contained a
link, this is the cause — escalate rather than troubleshooting individually.

Two other account facts:

- **Signing in on a phone that already has progress leaves that progress behind.** The
  app warns before it happens and offers "Save this progress instead", but a user who
  taps through it has stranded an anonymous account that cannot be recovered. There is
  no undo, and support cannot merge two accounts. Say so plainly and kindly.
- **Child accounts have no account section at all.** That is deliberate — we must not
  collect an email address from an under-13 — and it is not a bug to fix for them. Their
  progress lives on the phone. If a parent asks, the answer is that a parent-consent
  flow is planned and does not exist yet.

**The daily reminder is a LOCAL notification.** It needs no server, works with the radio
off, and fires once a day at an hour the user picks between 08:00 and 20:00 (18:00 on a
child account — quiet hours have no exceptions). If a user says the toggle is on and
nothing arrives, the usual cause is OS-level permission: Settings shows "Notifications
are off for WorldQuest in your phone's settings" with a link when that is the case, so
ask them what that row says.

Only the daily reminder ships. Streak-at-risk, comeback and the rest need a push service
that does not exist yet — if a user reports any other notification, escalate.

**The review prompt does not appear in TestFlight.** iOS reports the in-app review sheet
as unavailable under TestFlight, so the prompt correctly never fires there. It also fires
at most once per app version, never before three separate days of use, and never for a
child account. "I was never asked to rate it" is almost always one of those four rules
working.

### Not in this release, if asked

- **Leagues / leaderboards.** Not shipped. There is no date. If a user has seen a
  leaderboard, that is a bug worth escalating immediately.
- **Friends.** The Friends card that used to be on the home screen has been removed
  because the feature does not exist yet. That was the right fix for a card that promised
  something the app could not do.

### Escalate immediately, do not troubleshoot

- Anyone reporting a **leaderboard, another user's name, or any other person's activity**.
  None of that ships in 0.2.0, and seeing it would be a serious defect.
- Any report that **coins or XP went down**, or that a purchase took coins without giving
  the item. The server is the record; capture the account and the time.
- Any report from a **child account** that mentions social features of any kind.
