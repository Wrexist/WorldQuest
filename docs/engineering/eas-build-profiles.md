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
any kind** — `scripts/check-eas-json.ts` enforces it in `pnpm verify` so the next
person cannot rediscover this on a 10x-billed macOS runner.

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
