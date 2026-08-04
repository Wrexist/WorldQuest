# Connected services

What is live, what is not, and what each one needs. Update this in the same PR as
any change to a connection.

---

## ✅ Supabase — live

| | |
|---|---|
| Project | `worldquest-dev` |
| Ref | `tjdjogidudjobxipibqb` |
| Region | `eu-north-1` (Stockholm) — EU residency per the privacy docs, lowest latency for the founder |
| Plan | Free ($0/month) |
| URL | `https://tjdjogidudjobxipibqb.supabase.co` |

**Applied:** 5 migrations · 10 tables · 11 RLS policies · 1 edge function.

**Verified against the live database, not assumed:**

- Security advisors: **0 findings**
- Every table has RLS enabled
- **Zero** client write policies on `xp_ledger`, `coin_ledger`, `user_facts`,
  `review_log`, `entitlements` — the absence *is* the control
- No unconditionally-permissive (`using (true)`) policy anywhere
- Signup provisions profile + wallet + streak via trigger
- `is_child` derived from the age gate and **immutable** afterwards
- Role escalation blocked by the same guard
- A replayed `lessonId` is rejected (idempotency holds)
- A negative `xp_ledger` entry is rejected (XP never decreases)
- Deleting an auth user cascades to every table (GDPR erasure)
- A first correct answer writes `due_at` **3.17 days out**, matching FSRS exactly

**Not verifiable from the build sandbox:** the HTTP round trip. The agent proxy
denies CONNECT to the project host, so `submit-lesson` was deployed and its
persistence path proven via SQL, but nobody has yet called it over the wire from a
device. That is the first thing to do on a real machine:

```bash
pnpm db:types          # regenerate packages/api/src/database.types.ts
pnpm dev               # then complete a lesson and watch user_facts.due_at move
```

### Edge functions

Both vendor their engine modules via `supabase/functions/build.ts` rather than
importing across the workspace, which a deployed Deno function cannot do.
`build.test.ts` asserts each bundle is self-contained and that what it vendors is
byte-identical to the package the client imports — so client and server cannot
drift, which is the entire point of both endpoints.

| Function | `verify_jwt` | Vendors |
|---|---|---|
| `submit-lesson` | `true` — a user submitting their own lesson | `gradeLesson`, `fsrs`, `balance` |
| `store-notifications` | **`false`** — Apple is not a user and holds no JWT | `applyStoreNotification` |

`store-notifications` must be deployed with `--no-verify-jwt`. That is not a relaxed
check: the store's own signature is what authenticates it, and it is a considerably
stronger claim than a JWT — a pinned certificate chain, a per-payload ECDSA signature,
and an audience check that the request is about *our* bundle. See
[`../systems/monetization.md`](../systems/monetization.md).

```bash
supabase functions deploy store-notifications --no-verify-jwt
```

#### Secrets it needs

Set with `supabase secrets set`, never in `.env`, never prefixed `EXPO_PUBLIC_`.

| Name | What it is | Why it is not in the repo |
|---|---|---|
| `APPLE_ROOT_FINGERPRINT` | SHA-256 of Apple's root CA, `AA:BB:…` | A fact about Apple's CA. Guessing one either rejects every real notification or accepts a chain it should not — so it is marked missing rather than invented, per the repo's no-invented-facts rule. |
| `APPLE_BUNDLE_ID` | Our bundle identifier | The check that separates "Apple sent this" from "Apple sent this *about us*". Worthless with a guessed value. |
| `STORE_ENVIRONMENT` | `production` or `sandbox` | Defaults to `production`. A sandbox receipt reaching a production endpoint is normal and must grant nothing. |

The function **refuses to serve** without the first two, returning 500 rather than
skipping the checks they configure. A verifier short one check says yes more often
than it should.

---

## ⛔ Needs authorisation — cannot be connected from here

These MCP connectors require an interactive OAuth flow, which a headless session
cannot complete. Authorise them in **claude.ai → connector settings**, or via
`claude mcp` / `/mcp` in an interactive session.

| Service | For | Blocked on |
|---|---|---|
| **Sentry** | Crash and performance monitoring | OAuth |
| **Vercel** | Web surface, SEO country pages (v2.0) | OAuth |
| **Canva** | Marketing assets | OAuth |

---

## ⬜ Not started

| Service | For | Note |
|---|---|---|
| **PostHog** | Product analytics, feature flags | Create an **EU-region** project. The child-account no-op is already implemented and tested in `packages/analytics`. |
| **RevenueCat** | Subscriptions (v2.0) | Not needed until Premium |
| **EAS** | Builds and OTA updates | Needs an Expo account |

---

## Key handling

- Only the **publishable** key reaches the client bundle. It is safe there
  *because* every table has RLS — that is the whole bargain.
- `createWorldQuestClient` refuses to start if a service-role key is passed to it.
  Cheap check, enormous consequence.
- Edge functions receive `SUPABASE_SERVICE_ROLE_KEY` from the platform. It must
  never appear in `.env`, in the repo, or in anything prefixed `EXPO_PUBLIC_`.
