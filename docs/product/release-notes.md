# Release notes

## Unreleased — accounts, reminders, and the review prompt

Three capabilities the UI has been promising and the app did not have.

**Your progress can be saved.** Add an email in Settings or from Profile's "Save your
progress" card and everything comes with you to a new phone. Until now every install was
anonymous with no way back: uninstall, change phone, or clear storage and a hundred-day
streak was gone. Sign-in is a six-digit code rather than a magic link, so the whole flow
stays on one screen.

Signing in on a phone that already has unsaved progress leaves that progress behind. The
app warns before it happens, names the streak at stake, and offers to save it instead.

Child accounts have no account section, deliberately: we do not collect an email address
from an under-13. Their progress stays on the phone, and Settings says so.

**The daily reminder works.** The toggle has defaulted to ON since the first week and
scheduled nothing. It now fires once a day at an hour you pick between 08:00 and 20:00 —
18:00 on a child account — and never during quiet hours. The permission is asked after
your third finished lesson, on the screen a lesson ends on, never at launch, and at most
twice ever.

**The app asks for a review, once.** After a finished daily quest, on the third separate
day of use at the earliest, at most once per version and never twice in 122 days. Never
for a child account, and never after a wrong answer.

**Fixed:** a brand-new user could not reach Settings at all — the gear lives on Profile,
and Profile's empty state did not draw it.

Written in the product voice, for the people who use the app — not changelog-speak.
`docs/design/voice-and-tone.md` applies here exactly as it does in the app: second person,
present tense, no exclamation marks, never a promise with a month attached.

The rule this file exists to keep: **a release note describes what a user can now do.**
"Refactored the quest module" is not a release note. If a change has no sentence in it that
a ten-year-old could read, it does not get a line.

---

## 0.2.0 — the app got a shop, and finishing your day feels like it

**A shop you can find.** Titles used to be a row buried on your profile. The shop is now a
tab of its own, with your coin balance at the top of it, so the coins you earn have
somewhere obvious to go. Settings moved to the gear on your profile — where your phone
already keeps that sort of thing.

**Your day, in one card.** Home opens with your streak, your rank and how much of today's
quest is left. The quest card says what finishing it is worth and how long the day has to
run.

**Finishing your quest is now a moment.** Land the fifth task and you get a proper
end-of-day screen instead of a button quietly changing its label.

**A better look at where you are.** Your profile leads with your explorer and the title you
are wearing, then your level, then the three numbers that actually say how you are doing —
facts learned, countries, and your streak. Badges you have earned sit underneath.

**Every country page reads properly.** Each fact has its own mark now, so you can find the
capital without reading the whole list. One label was showing a piece of internal code
where a name belonged; it says "Calling code".

**Two Swedish lines that were not Swedish.** "Vi provar en" and "Börja lära" have been
fixed. Sorry — they were word-for-word translations that do not work as sentences.

### For the record, not for the store listing

- Every illustration in the app was losing a few pixels off one edge, and Atlas's hat took
  the worst of it — a flat slice across the top of it on every screen he appears on. The
  cause was in the build, so all 68 illustrations are drawn whole now.
- Onboarding's first slide was letterboxed inside its own band at every width; it is
  properly full-bleed, and its sentence no longer runs off the bottom on a small phone.
- Leagues are **not** in this release. The rules and the database schema have landed and
  nothing is reachable — see `docs/systems/social-and-leagues.md` for why the client half
  waits for a tested backend.

---

## How to write the next one

1. One heading per thing a user would notice. Not one per commit.
2. Lead with the verb: what can they do now?
3. Bugs get a line only when the user saw the bug. "Fixed a crash in the sync queue" is
   noise to someone who never crashed; "Your lessons finished offline now show up when you
   reconnect" is a release note.
4. Never apologise twice, and never explain the architecture.
5. Anything with no user-visible face goes under **For the record**, or nowhere.
