---
name: worldquest-supabase
description: Write WorldQuest database migrations, RLS policies, or Supabase edge functions. Use for any schema change, new table, RLS policy, or server-side logic. Enforces forward-only migrations, default-deny RLS, and server-authoritative rewards.
---

# Working with the database

Schema: [`docs/engineering/data-model.md`](../../docs/engineering/data-model.md).

**The Supabase MCP server is available — use it to inspect the real schema rather than
guessing. Never run destructive SQL against a remote project.**

## Migrations

```
supabase/migrations/<utc-timestamp>_<verb>_<subject>.sql
```

**Forward-only. Never edit a landed migration** — someone's database has already run it.

| Change | How |
|---|---|
| Add a column | Nullable first → backfill → set NOT NULL in a later migration |
| Rename a column | add new → dual-write → backfill → migrate readers → drop old. **Four migrations.** |
| Add an index | `CREATE INDEX CONCURRENTLY` on a live table |
| Drop anything | Only after a release where nothing reads it |

Write the down-step in a comment even though we don't auto-run it — it forces you to
think about reversibility.

After any schema change: `pnpm db:types` and commit the regenerated types, so CI
catches drift.

## RLS — default deny, always

```sql
alter table <t> enable row level security;
```

Then add the narrowest policy that works.

**Tables with NO client write policy — and that absence is the security control:**
`xp_ledger` · `coin_ledger` · `user_facts` · `review_log` · `league_members` ·
`entitlements`. All writes go through edge functions running as the service role.
There is no client code path to abuse.

**Every policy needs a test.** `supabase/tests/rls.test.sql` asserts, per table, that
user A cannot read or write user B's rows. RLS bugs are silent and total.

## Edge functions

Everything that produces a reward lives here.

```ts
// supabase/functions/submit-lesson/index.ts
1. Verify JWT, load the profile and role
2. Validate input with Zod
3. Check idempotency (lessons.id is a client UUID and a primary key)
4. Re-derive ratings and re-grade with the SAME engine module the client used
5. Write review_log, user_facts, ledgers — in one transaction
6. Emit domain events → achievements, quests, streak
7. Return the authoritative result
```

**Never trust a client-supplied XP, coin, mastery, or streak value.** The client
submits *answers*; the server computes *rewards*.

## Rules

1. `timestamptz`, always UTC. Local-day logic uses the stored IANA timezone.
2. Ledgers, not mutable balances. A wallet is a rebuildable cache.
3. `review_log` is append-only — it is the source of truth for all learning state.
4. Idempotency keys on every mutation; replay must be harmless.
5. Rate-limit every function (see security-privacy.md for the table).
6. No PII, no tokens, and no answer content in logs.
7. Child-account rules are enforced in RLS, not only in the UI.

## Local development

```bash
pnpm db:start     # local Supabase
pnpm db:reset     # re-apply all migrations + seed
pnpm db:types     # regenerate TypeScript types
pnpm db:test      # RLS + function integration tests
```

Always test locally before touching a remote project.
