# ADR 0012: Account-bound ports and an isolated Convex proof

Date: 13 September 2026. Status: accepted for interface extraction and local proof;
production backend/auth selection remains conditional on evidence.

WorldQuest will launch worldwide in English and Swedish for geography beginners,
initially aged 16–24, while preserving protections for younger learners. The owner
has excluded Supabase as the destination. Existing code and data remain a migration
source; replacing a URL would leave its transaction and account-isolation defects.

## Decision

Expose backend-neutral contracts and account-bound repositories in `packages/api`.
Keep domain engines free of all provider SDKs, enforced by
`pnpm check:backend-boundaries`. The source adapter captures one identity's token
when opening a handle. The mobile boundary also checks the storage generation
before starting a request and before accepting its result.

Persist application data in separate backend/account namespaces. New local guest
work may transfer only to the anonymous identity created for that guest. Signing
into an existing account must not adopt it. Logout detaches pending work; it does
not erase it or attach it to the next learner. Legacy ownerless records remain
quarantined until ownership can be reconciled. These records are not proof of a
successful migration.

Build an isolated Convex proof using synthetic accounts before changing the mobile
deployment. Reuse the current pure grading and scheduling engines. Prove indexed
ownership, receipt replay and conflict handling with an actual local backend as well
as unit tests. Convex documents [local development without an account](https://docs.convex.dev/cli/local-deployments),
which permits a proof without opening a paid cloud deployment.

Convex's [React Native integration](https://docs.convex.dev/quickstart/react-native)
is a starting point, not native authentication acceptance. Guest linking, login,
logout, refresh, deletion and two-device recovery must pass B02. Evaluate auth/email
costs alongside the [backend price table](https://www.convex.dev/pricing). The
[existing cost model](../audits/2026-09-13/07-backend-convex.md) remains illustrative;
no measured cost ceiling is established.

## Consequences and acceptance

- The source adapter can run during the proof, without leaking its SDK types into
  domain contracts. Additional candidate contracts must pass before cutover.
- Account scoping is a data-format change. Old records are preserved, not silently
  interpreted as belonging to whoever signs in next. B17 owns reconciliation.
- The existing hosted `worldquest-dev` project reports inactive. Table/migration
  inspection timed out. The owner confirmed only development/test data, so a
  live-user migration is not required; no source data was deleted.
- Native build and runtime results are recorded separately from browser exports.
  A local Convex unit test is not a native auth, load, restore or migration test.
- Convex is not enabled for real users until transaction, child-policy, migration,
  restore and quota gates pass. Workers/D1 remains the fallback if the proof fails.
