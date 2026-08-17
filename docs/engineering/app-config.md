# `apps/mobile/app.json` — why the fields are what they are

The prose below lived in the file it describes, as an `expo.$comment` array. It had to
move, for the same reason the `eas.json` notes moved to
[`eas-build-profiles.md`](eas-build-profiles.md) and recorded in
`scripts/check-eas-config.ts`: **Expo validates the app config against a closed schema and
rejects every key it does not know.**

    ✖ Check Expo config (app.json/app.config.js) schema
    Error validating fields in apps/mobile/app.json:
     should NOT have additional property '$comment'.

That is `expo doctor`, which EAS runs during `eas build`. Unlike the `eas.json` failure it
is **not** fatal today — the build carries on past it and fails later or not at all — which
is exactly what let it sit red for a while. A permanently red check is a check nobody reads,
and the one time it does matter it will be ignored too.

JSON has no comments, so there are only three places this could go: `expo.extra` (which is
real config, shipped to the device through `Constants.expoConfig` — 4 KB of prose against a
bundle budget with 0.09 MB of headroom, so no), an `app.config.js` (which buys real comments
at the cost of `scripts/check-eas-config.ts` no longer being able to read the config as
plain JSON in under a second), or here. Here is the same answer this repo already reached
for `eas.json`, and `pnpm check:eas` now fails on any `$`-prefixed key in `app.json` so the
prose cannot quietly move back.

---

`owner` is the Expo account that owns the EAS project — not cosmetic. Without it
and without an extra.eas.projectId, `eas build --non-interactive` cannot tell which
account should own a project for the slug `worldquest` and refuses to guess:
"EAS project not configured", which is where the 2026-08-09 TestFlight run died,
on a 10x-billed macOS runner. The value is read from that run's own output
("Accounts you have permissions to create projects in: isacm") rather than assumed.
Both are now pinned — see the 2026-08-09 note further down for why they are
hardcoded rather than resolved by `eas init` on each run. scripts/check-eas-config.ts
fails `pnpm verify` if either one goes missing again.

backgroundColor is colors.bg.canvas from packages/design/tokens.json. It is
duplicated here because the native splash and window background are set before
any JavaScript runs, so they cannot read a token. If the canvas colour changes,
change it here too — packages/design/src/tokens.test.ts asserts they match.

`icon`, `splash`, `adaptiveIcon.foregroundImage` and `web.favicon` are here now.
They were the last thing blocking a store build, and they were blocked on artwork
rather than on time — asset-prompts.md files a brand mark under the same rule as a
flag, never generate one, so the gap could only be closed by delivered art. It was.

All four are DERIVED by `pnpm build:art` from the masters in docs/design/assets,
never edited by hand. The store rules are why: an icon must be square and must
carry no alpha, and the delivered master is 1536x1024 with an alpha channel — both
of which App Store Connect rejects at upload rather than at review. The adaptive
icon is inset to the middle 66% because Android launchers mask it to a circle, a
squircle or a rounded square and crop the rest, and its backdrop is the same
backgroundColor above so the seam cannot show whichever shape a launcher picks.

Everything else a store asks for is text, and none of it was here. The iOS
privacy manifest has been required since 2024 and its absence fails App Store
Connect at upload, which is the worst moment to discover a declaration nobody
wrote. Ours is unusually easy to fill in truthfully: NSPrivacyTracking is false
because this app has no third-party analytics at all, the collected-data list is
empty, and the one required-reason API is UserDefaults for storing the user's own
preferences (CA92.1). A kids' app that declares nothing and a kids' app that
declares nothing collected look identical to a reviewer and are not.

`permissions: []` and blocking RECORD_AUDIO are the same argument on Android:
Expo's defaults are a superset of what this app uses, and an unexplained
microphone permission on a product for ten-year-olds is a Play review
conversation nobody wants to have.

orientation stays `portrait`, deliberately, and `supportsTablet` stays true. Every
layout in this app has been built and measured at 320/390/768 in portrait; turning
landscape on would ship an orientation nothing has ever rendered. The honest
position is tablet-in-portrait, and definition-of-done-status.md now says that
rather than claiming tablet support in general.

2026-08-09: `owner` and `extra.eas.projectId` are what make a build possible at all.
Without them `eas build` stops before it compiles anything:

  EAS project not configured. To configure it non-interactively, choose the
  account that should own the project and run: eas init --account <name>

which is exactly what the first TestFlight run hit. They are deliberately hardcoded
rather than left to `eas init`: init WRITES these two values into this file, and a
CI runner's working tree is thrown away at the end of the job, so an init-based
setup would re-resolve the project on every run and could silently bind a build to
the wrong project. Pinned here, the mapping is reviewable in a diff and identical
on every machine. The projectId is the EAS project @isacm/worldquest; `owner` must
stay `isacm` because that is the account EXPO_TOKEN has rights to.
