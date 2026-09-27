# PR 21 integration and gem album polish

Updated `feat/playful-world-redesign` from ea0cb34 to deca2be (PR #21), preserving
all in-progress redesign assets and features. A named Git stash retains the
pre-integration working tree as a recovery copy. No commit or push was performed.

## Combined behavior

The new chosen portrait and streak chip work with the daylight theme and original
Atlas artwork. Coins remain the spendable currency. Gems remain device-local,
account-scoped cosmetic badges. Their collection now offers pages of seven,
newest first, with localized full dates; earlier earned gems are reachable.
Opening a pending chest from the collection returns there after Continue.

Preserved the merged PR's expanded continent path, D1 account protections, synced
course progress and restored activity history. Restored activity is published
before notifying readers, and mounted week/month charts now refresh on that signal.
Local completed lessons, midnight and account changes also refresh the charts.

Resolved overlapping header, Home, Profile, activity and Swedish-copy changes.
Removed the duplicate calm Atlas that an automatic merge introduced on summaries.
The empty profile now scrolls at small sizes. The header wraps at enlarged text
sizes and stat chips cannot shrink their numbers; on narrow native screens its
wordmark gives way to the portrait, streak and wallet.

## Evidence

Final combined validation is green: `pnpm verify`, 109/109 app-browser steps,
43/43 D1 journey steps, both native budget gates, and the screenshot sweep
(114 flow-state captures plus final targeted Home/Profile/Streak captures).
The header fix passes the final 200% Home and Explore checks. The unchanged
ReportSheet test also passes in the full verification rerun.

- Both D1 native builds compile at 4.39 MiB against the unchanged 4.6 MiB gate.
  This is the merged PR's backend-specific bundle improvement, retained by the
  redesign. It resolves the earlier native size failure.
- D1 browser journey: 43/43 steps passed, including second-phone course/calendar
  restoration, concurrent submissions, account deletion and the child grown-up gate.
- The chest browser review verifies collection-to-chest navigation and return,
  one saved gem, no duplicate on reload, animation, reduced motion and 320-point
  large-text layout. See `report.json` and the recording in this directory.
- Initial regression testing found an enlarged-text header collision, now fixed.
  A ReportSheet test timed out under concurrent browser load; its isolated retry
  passed unchanged, along with the new album and activity tests.

Native-device performance and VoiceOver/TalkBack remain unverified. Browser and
bundle checks do not claim a device pass or any measured retention improvement.
