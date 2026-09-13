# Isolated Convex transaction proof

This workspace is a synthetic prototype. The mobile app does not connect to it.
It reuses WorldQuest's content and pure grader inside one Convex mutation.

From the repository root, install with `pnpm install`. In `packages/backend`, run
`pnpm exec convex dev` in anonymous/local mode, then `pnpm proof` in another shell.
For a noninteractive agent, `CONVEX_AGENT_MODE=anonymous` selects the local workflow.
The harness reads only this workspace's local configuration, builds a loopback URL,
and creates fresh synthetic owners. It never reads a cloud deployment key.

`pnpm test` exercises the mock backend; `pnpm proof` exercises the actual running
local backend with two independent HTTP clients. They are different evidence.
The local proof uses admin impersonation, **not a working end-user login flow**.
Generated Convex bindings are committed so ordinary checks need no local service.

Proven slice: identity-derived ownership, canonical server-held answer slots,
replay receipts, changed-payload rejection, transactional grading, append-only
reviews/reward ledger, per-fact memory, conflicting writes and rollback.

Still missing: production auth and guest linking, ticket issuance and offline
manifests, late-review replay, user timezone policy, retention/child policy beyond
an unknown default, quests, achievements, streaks, purchases, bounded history
queries, rate limits, export/restore, erasure and mobile integration. The snapshot
query and fixture seeder are diagnostic tools. Do not deploy this as the app backend.

No paid deployment is created. Local timings do not establish hosted performance
or cost. See [ADR 0012](../../docs/adr/0012-backend-ports-and-convex-proof.md) and the
[Phase 2 work log](../../docs/plan/phase-2-verification.md) for acceptance gates.
