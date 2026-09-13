/** Uses local admin impersonation for synthetic transaction tests, never auth acceptance. */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { ConvexHttpClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { api, internal } from '../convex/_generated/api'

const config = JSON.parse(readFileSync('.convex/local/default/config.json', 'utf8')) as {
  ports: { cloud: number }; adminKey: string
}
assert(Number.isInteger(config.ports.cloud) && config.ports.cloud > 0 && config.ports.cloud <= 65535)
const url = `http://127.0.0.1:${config.ports.cloud}`
function internalCall<F extends FunctionReference<'mutation', 'internal'>>(
  c: ConvexHttpClient, ref: F, args: FunctionArgs<F>,
): Promise<FunctionReturnType<F>> {
  // The loopback admin credential permits internal calls. Preserve argument/return types.
  return c.mutation(ref as unknown as FunctionReference<'mutation', 'public', FunctionArgs<F>, FunctionReturnType<F>>, args)
}
const client = (subject?: string) => {
  const c = new ConvexHttpClient(url, { logger: false })
  // Convex exposes this testing/admin capability at runtime but excludes it from its public declarations.
  const admin = c as ConvexHttpClient & { setAdminAuth(key: string, identity?: { subject: string; issuer: string; tokenIdentifier: string }): void }
  admin.setAdminAuth(config.adminKey, subject ? { subject, issuer: 'https://proof.invalid', tokenIdentifier: `https://proof.invalid|${subject}` } : undefined)
  return c
}
const run = randomUUID()
const admin = client()
const a1 = client(`${run}-A`)
const a2 = client(`${run}-A`)
const b = client(`${run}-B`)
const answers = await internalCall(admin, internal.fixtures.seed, {
  owner: `https://proof.invalid|${run}-A`, lessonIds: ['duplicate', 'parallel-one', 'parallel-two', 'rollback', 'forged'],
})
const before = await a1.query(api.proof.snapshot)
const anonymous = new ConvexHttpClient(url, { logger: false })
await assert.rejects(anonymous.mutation(api.proof.submit, { lessonId: 'duplicate', answers }), /AUTH_REQUIRED/)
await assert.rejects(b.mutation(api.proof.submit, { lessonId: 'duplicate', answers }), /INVALID_TICKET/)
assert.deepEqual(await a1.query(api.proof.snapshot), before)
const [first, duplicate] = await Promise.all([
  a1.mutation(api.proof.submit, { lessonId: 'duplicate', answers }),
  a2.mutation(api.proof.submit, { lessonId: 'duplicate', answers }),
])
assert.deepEqual(first, duplicate)
assert.equal((await a1.query(api.proof.snapshot)).ledger.length, 1)
await Promise.all([
  a1.mutation(api.proof.submit, { lessonId: 'parallel-one', answers }),
  a2.mutation(api.proof.submit, { lessonId: 'parallel-two', answers }),
])
const concurrent = await a1.query(api.proof.snapshot)
assert.equal(concurrent.account?.revision, 3)
assert.equal(concurrent.ledger.length, 3)
assert.equal(concurrent.reviews.length, 15)
assert(concurrent.memories.every(m => m.state.reps === 3))
assert.equal(concurrent.account?.xp, concurrent.ledger.reduce((sum, row) => sum + row.xp, 0))
assert.equal(concurrent.account?.coins, concurrent.ledger.reduce((sum, row) => sum + row.coins, 0))
await assert.rejects(internalCall(a1, internal.fixtures.failAfterWrite, { lessonId: 'rollback', answers }), /INJECTED_WRITE_FAILURE/)
assert.deepEqual(await a1.query(api.proof.snapshot), concurrent)
await assert.rejects(a1.mutation(api.proof.submit, {
  lessonId: 'forged', answers: Array.from({ length: 8 }, () => answers[0]!),
}), /INVALID_SUBMISSION/)
await assert.rejects(a1.mutation(api.proof.submit, {
  lessonId: 'duplicate', answers: answers.map(a => ({ ...a, elapsedMs: 9000 })),
}), /IDEMPOTENCY_CONFLICT/)
assert.deepEqual(await a1.query(api.proof.snapshot), concurrent)
await a1.mutation(api.proof.submit, { lessonId: 'rollback', answers })
const final = await a1.query(api.proof.snapshot)
assert.equal(final.ledger.length, 4)
assert.equal(final.reviews.length, 20)
assert(final.memories.every(m => m.state.reps === 4))
assert.equal((await b.query(api.proof.snapshot)).ledger.length, 0)
console.log(JSON.stringify({
  backend: 'real local Convex', auth: 'synthetic admin impersonation',
  checks: ['unauthenticated rejection', 'cross-account isolation', 'concurrent receipt deduplication',
    'two-session different-lesson conflict retry', 'wallet/ledger reconciliation', 'review preservation',
    'failure-after-write rollback', 'eight-duplicate-slot rejection', 'changed-payload rejection', 'safe retry'],
  committedLessons: final.ledger.length, reviews: final.reviews.length, facts: final.memories.length,
}, null, 2))
