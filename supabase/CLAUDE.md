# `supabase/` — database and server logic

The Supabase MCP server is available — **inspect the real schema rather than
guessing**, and never run destructive SQL against a remote project.

## Structure

```
migrations/   forward-only, timestamped SQL
functions/    Deno edge functions — everything authoritative
tests/        RLS tests + function integration tests
seed/
```

## Rules that matter most

1. **Migrations are forward-only.** Never edit a landed file. Add a column nullable →
   backfill → set NOT NULL later. A rename is four migrations, not one.
2. **RLS default deny on every table**, with a test per table proving user A cannot
   reach user B's rows. RLS bugs are silent and total.
3. **No client write policy** on `xp_ledger`, `coin_ledger`, `user_facts`,
   `review_log`, `league_members`, `entitlements`. The absence *is* the control —
   there must be no code path to abuse.
4. **The server computes rewards.** The client submits answers; the edge function
   re-grades with the same `packages/engines` module and returns the truth.
5. **Idempotency everywhere.** `lessons.id` is a client UUID and a primary key, so a
   replayed submit is a no-op returning the original result. This is what makes
   offline queuing safe.
6. **Ledgers, not balances.** Wallets are rebuildable caches.
7. `timestamptz`, always UTC. Local-day logic uses the stored IANA timezone — and a
   local day can be 23 or 25 hours. Test DST.
8. No PII, tokens, or answer content in logs.

The hot path — "what should this user see next?" — must stay under **50 ms at p95**.
It is backed by a partial index on `user_facts (user_id, due_at)`. Protect it.

```bash
pnpm db:start · pnpm db:reset · pnpm db:types · pnpm db:test
```

`functions/submit-lesson/_content/answers.ts` is **generated**, not committed — it is the
fact → correct-entity key the server grades against, projected from the content packs by
`pnpm edge:build` (which `pnpm generate` runs on install). A committed copy could
disagree with the packs, and that disagreement marks a user wrong for a right answer.
`supabase start` reads the functions directory off disk, so it needs the file to exist.

Spec: [`../docs/engineering/data-model.md`](../docs/engineering/data-model.md)
