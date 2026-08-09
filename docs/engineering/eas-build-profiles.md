# EAS build and submit profiles

The commentary that used to live inside `apps/mobile/eas.json`. It is here because
**`eas.json` cannot hold comments**: `eas-cli` validates the file against a closed
schema and rejects any key it does not recognise, including this repo's usual
`$comment` convention. The 2026-08-09 iOS TestFlight run failed on exactly that,
before a single line was compiled:

```
eas.json is not valid.
- "build.development.$comment" is not allowed
- "build.preview.$comment" is not allowed
- "build.preview-simulator.$comment" is not allowed
- "build.production.$comment" is not allowed
- "submit.production.$comment" is not allowed
- "$comment" is not allowed
```

`$comment:<key>` sibling keys work in `package.json` and in this repo's own content
packs because npm and our own validators ignore unknown keys. EAS does not. So the
rule for `apps/mobile/eas.json` is: **strict JSON, schema keys only, no comments of
any kind** — `scripts/check-eas-config.ts` enforces it in `pnpm verify` so the next
person cannot rediscover this on a 10x-billed macOS runner.

## The project link

Run #2, minutes later, got past the schema and died on the next config field:

```
EAS project not configured. To configure it non-interactively, choose the
account that should own the project and run:
  eas init --account <name> --non-interactive
Accounts you have permissions to create projects in: isacm
```

`eas build --non-interactive` has to know which EAS project it is building.
`apps/mobile/app.json` declared neither `expo.owner` nor `expo.extra.eas.projectId`,
and eas-cli will not pick an owning account on your behalf — reasonably, since
picking wrong creates a project in a stranger's account.

`apps/mobile/app.json` now pins both:

```json
"owner": "isacm",
"extra": { "eas": { "projectId": "faee125b-31bf-4724-be04-c94f4c096f9b" } }
```

The EAS project `@isacm/worldquest` was created on 2026-08-09; `owner` must stay
`isacm` because that is the account `EXPO_TOKEN` has rights to.

**Neither workflow runs `eas init`, on purpose.** `eas init` *writes* these two
values, and a CI runner's working tree is discarded at the end of the job — so an
init-based setup would re-resolve the project on every run and could bind a build to
a different project with nothing in the diff to show for it. Pinned, the mapping is
reviewable and identical on every machine.

`scripts/check-eas-config.ts` fails `pnpm verify` if `owner` and `projectId` both go
missing, so run #2's failure cannot come back.

## iOS signing — the prerequisite CI cannot satisfy

A `production` build is a **store** build, and a store build has to be signed with an
Apple **distribution certificate** and an **App Store provisioning profile**. Those
live on Apple's side and in EAS's credential store — not in this repo.

`eas build --non-interactive` will not create them. This is not a configuration gap
to be worked around; it is deliberate, and it is in eas-cli's own code
(`credentials/ios/actions/SetUpDistributionCertificate.js`, v21.7.0):

```js
async runNonInteractiveAsync(_ctx, currentCertificate) {
  Log.warn('Distribution Certificate is not validated for non-interactive builds.');
  if (!currentCertificate) {
    throw new MissingCredentialsNonInteractiveError();   // "Credentials are not set up."
  }
  return currentCertificate;
}
```

It reuses what exists or it throws. No flag changes this, and neither do the
`EXPO_ASC_*` environment variables — those supply an *existing* App Store Connect
key for submission, they do not authorise minting a signing certificate.

**The fix is one interactive session, once, from a machine with an Apple Developer
login:**

```bash
cd apps/mobile
eas credentials            # iOS → production → set up a distribution certificate
                           # and an App Store provisioning profile
```

EAS stores them against the project and every later CI build reuses them. It needs
the Apple ID that owns the Apple Developer Program membership for
`com.wrexist.worldquest`, which is why it cannot be done from CI or from an agent
session.

### The check that answers this before the bill

`scripts/check-ios-credentials.mjs` (`pnpm check:ios-creds`, and a step on the cheap
job of both workflows) asks EAS's GraphQL API the same question the build asks: does
this project hold an `APP_STORE` distribution certificate and provisioning profile
for `com.wrexist.worldquest`, and are they in date? It also catches the expiry that
would otherwise break a release a year from now, warning 30 days ahead.

It is **fail-open**. It exits non-zero only on a well-formed answer from EAS saying
the credentials are absent, expired, wrong-bundle, or non-store. No token, no
network, a GraphQL error, an unexpected shape — it warns and passes. It is not in
`pnpm verify`, because it needs the network and an `EXPO_TOKEN`.

Its field names come from eas-cli's own generated schema, but **the query has never
run against the live API from this repo** — no environment that has worked on
WorldQuest could reach `api.expo.dev`. That is precisely why it fails open: at worst
it is a no-op that prints a warning, never a blocked release. The eight decision
branches are exercised against a stub.

## Readiness, as of 2026-08-09

| Thing | State |
|---|---|
| `eas.json` schema | ✅ valid, guarded by `pnpm check:eas` |
| EAS project link (`owner` + `projectId`) | ✅ pinned to `@isacm/worldquest`, guarded |
| `EXPO_TOKEN` | ✅ present (run #2 authenticated) |
| `APP_STORE_CONNECT_*` secrets | ✅ present — run #2's build number came back as `1` from a live App Store Connect lookup |
| App Store Connect app record | ✅ `ascAppId 6799761965` |
| iOS bundle id | ✅ `com.wrexist.worldquest` — **must match** the ASC record, unverified from here |
| Privacy manifest, icons, splash | ✅ in `app.json` |
| iOS JS bundle | ✅ `pnpm bundle:native` compiles both platforms |
| **Apple signing credentials** | ❓ **unverified from here — the likely next failure. `pnpm check:ios-creds` with an `EXPO_TOKEN` answers it in a second, and both workflows now run it on their cheap job before spending a macOS runner or a build credit.** |
| A human has opened the build on a phone | ❌ [`device-pass.md`](../plan/device-pass.md) |

---

## Why these profiles exist

Build profiles, so the one thing this project still needs — a session with a real
phone — is a single command rather than an afternoon of setup.

`preview` is the one that matters: it produces an installable build (an `.apk` you
can sideload, an internal-distribution `.ipa`) without touching a store. That is the
profile that closes four Definition of Done boxes at once — runs on device,
performance on mid-tier Android, VoiceOver and TalkBack.

Treat the config as a first draft until a build has actually gone through — see
[`docs/plan/device-pass.md`](../plan/device-pass.md).

| Profile | What it is for |
|---|---|
| `development` | A dev client, for iterating with Metro attached to a real device. |
| `preview` | The device-pass build. Installable, no store, production JS. |
| `preview-simulator` | Same thing for an iOS Simulator, for whoever has a Mac. |
| `production` | Store builds. Do not run this until the device pass has been done — shipping an app nobody has opened on a phone is the specific thing the Definition of Done exists to prevent. |

`build.production.autoIncrement` only applies to EAS **cloud** builds. The local
workflow (`.github/workflows/eas-build-local-ios.yml`) mints `CFBundleVersion`
itself with `scripts/next-build-number.mjs` and stamps it into `app.json`, because
`eas build --local` never auto-increments.

## Submission

`submit.production.ios.ascAppId` is a real value (`6799761965`) — the app record
exists in App Store Connect. `eas submit` uses it to know which app to upload to,
and `scripts/next-build-number.mjs` reads it to ask Apple for the highest build
number already on record; without it that script silently falls back to epoch
seconds.

`ascApiKeyPath` / `ascApiKeyId` / `ascApiKeyIssuerId` are deliberately **not** in
the committed file. Both TestFlight workflows write them into `eas.json` at runtime
from GitHub secrets and delete the key afterwards, so no credential is ever
committed.

`appleTeamId` is still unset. EAS resolves it from the authenticated session, and it
is not a secret — fill it in if a build ever fails to work it out.

## The workflows that read this file

- [`.github/workflows/eas-testflight.yml`](../../.github/workflows/eas-testflight.yml) —
  EAS cloud build, consumes build credits.
- [`.github/workflows/eas-build-local-ios.yml`](../../.github/workflows/eas-build-local-ios.yml) —
  `eas build --local` on a GitHub macOS runner, zero build credits, submission split
  onto a separate ubuntu job.

Both need an `EXPO_TOKEN` and three `APP_STORE_CONNECT_*` GitHub secrets — see the
header of `eas-testflight.yml`.

TestFlight is itself a reasonable way to run the device-pass checklist on a real
iPhone without a store review, but the checklist still has to actually be walked on
the device once a build lands there — a TestFlight install nobody has opened is the
same unverified state `device-pass.md` warns about.
