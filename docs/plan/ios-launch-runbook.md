# iOS launch runbook: the owner's steps

Written 25 September 2026 for `claude/ios-launch-readiness-cc9070`. Everything a
repository change can do is done or listed in the [launch audit](ios-launch-audit-2026-09-25.md).
These steps need your accounts, money or devices. Do them in order; each says how long
it takes and how to know it worked.

## 1. Signing (15 min)

```bash
cd apps/mobile
npx eas credentials
```

Choose iOS → production → create the distribution certificate and App Store profile.
Then check: `EXPO_TOKEN=… pnpm check:ios-creds` and read its output (it passes on
missing inputs, so the words matter, not the exit code).

## 2. Domain and pages (30 min + DNS wait)

Buy `learnworldquest.com` (quoted $10.46/year in Cloudflare). Publish four pages:
privacy policy, terms, support, licences. Then set, in the EAS **production**
environment (no code change):

```bash
eas env:create --environment production --name EXPO_PUBLIC_PRIVACY_URL --value https://… --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_TERMS_URL --value https://… --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL --value https://… --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_LICENCES_URL --value https://… --visibility plaintext
```

Worked when: Settings › Privacy shows tappable Privacy policy and Terms rows.

## 3. Email (20 min + DNS wait)

Create a Resend account, verify the domain (SPF/DKIM/DMARC records), turn off open and
click tracking. Details: [account email setup](../engineering/account-email-setup.md).

```bash
cd packages/backend
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_SECRET        # 32+ random characters
```

Set `MAIL_FROM` under `vars` in `wrangler.jsonc`, e.g.
`"WorldQuest <accounts@learnworldquest.com>"`.

## 4. Production Worker and database (20 min)

```bash
cd packages/backend
npx wrangler d1 create worldquest-production     # EU jurisdiction, like development
```

Put the new database id in a production `wrangler.jsonc` (or an `env.production`
block), then:

```bash
npx wrangler d1 migrations apply DB --remote     # applies 0001–0011
pnpm --filter @worldquest/backend run deploy
```

Give the Worker a route on your domain (e.g. `api.learnworldquest.com`). Keep
`API_ENABLED` `"false"` until step 6 passes, then set it to `"true"` and deploy again.
Worked when: `curl https://api.learnworldquest.com/health` answers
`{"service":"worldquest","backend":"cloudflare-d1",…}`.

## 5. Point the app at it (5 min)

```bash
eas env:create --environment production --name EXPO_PUBLIC_BACKEND --value d1 --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_D1_URL --value https://api.learnworldquest.com --visibility plaintext
```

## 6. Build and try it (45 min)

Run the **iOS TestFlight** workflow in GitHub Actions (build numbers are unique per
run). Install from TestFlight on one iPhone and do, in order: onboard, finish a lesson,
check the streak screen, lock the phone offline and finish a second lesson, reconnect,
link your email (a real code should arrive). Then, on a second iPhone (or after
deleting and reinstalling the app), tap **I already have an account**, sign in with the
same email and check your XP and streak are there. Last, delete the account from
Settings › Privacy. Report anything odd; every step here has passed on the web build
against a local Worker (`pnpm e2e:d1`), not yet on a phone.

## 7. App Store Connect (60 min)

Age rating questionnaire; decide Kids Category (the app has an under-13 age gate);
App Privacy answers matching the manifest (email, user ID, product interaction, other
data: birth year; all linked, none tracking); EU trader status; agreements, tax and
banking. Review notes: "Guest mode needs no login. Linking an email is optional and
sends an eight-digit code." Add a support email.

## Decisions only you can make

1. **iPad:** `supportsTablet` is `true` but nothing has been checked on an iPad. Set it
   to `false` for 1.0, or test on an iPad and supply 13" screenshots.
2. **Selling:** v1.0 sells nothing (the paywall is hidden). Keep it free, or create the
   subscription products so purchases can be built (A01).
