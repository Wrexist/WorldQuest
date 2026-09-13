import { convexTest } from 'convex-test'
import { describe, it, expect } from 'vitest'
import schema from './convex/schema'
import { api, internal } from './convex/_generated/api'

const modules = import.meta.glob('./convex/**/*.ts')
async function setup() {
  const t = convexTest(schema, modules)
  const identity = { subject: 'A', issuer: 'https://proof.invalid', tokenIdentifier: 'https://proof.invalid|A' }
  const a = t.withIdentity(identity)
  const b = t.withIdentity({ subject: 'B', issuer: 'https://proof.invalid' })
  const answers = await t.mutation(internal.fixtures.seed, { owner: identity.tokenIdentifier, lessonIds: ['one', 'two'] })
  return { t, a, b, answers }
}
describe('Convex transaction prototype', () => {
  it('requires identity and never lets another account use a ticket', async () => {
    const { t, a, b, answers } = await setup()
    await expect(t.mutation(api.proof.submit, { lessonId: 'one', answers })).rejects.toThrow('AUTH_REQUIRED')
    await expect(b.mutation(api.proof.submit, { lessonId: 'one', answers })).rejects.toThrow('INVALID_TICKET')
    expect((await a.query(api.proof.snapshot)).ledger).toHaveLength(0)
    expect((await b.query(api.proof.snapshot)).account).toBeNull()
  })
  it('returns the original receipt on replay and rejects changed payloads', async () => {
    const { a, answers } = await setup()
    const result = await a.mutation(api.proof.submit, { lessonId: 'one', answers })
    expect(await a.mutation(api.proof.submit, { lessonId: 'one', answers: [...answers].reverse() })).toEqual(result)
    await expect(a.mutation(api.proof.submit, { lessonId: 'one', answers: answers.map(a => ({ ...a, elapsedMs: 9000 })) }))
      .rejects.toThrow('IDEMPOTENCY_CONFLICT')
    const snapshot = await a.query(api.proof.snapshot)
    expect(snapshot.ledger).toHaveLength(1)
    expect(snapshot.reviews).toHaveLength(5)
    expect(snapshot.memories.every(m => m.state.reps === 1)).toBe(true)
  })
  it('rejects duplicated, invented and oversized slots without a payout', async () => {
    const { a, answers } = await setup()
    for (const malformed of [Array.from({ length: 8 }, () => answers[0]!),
      answers.map(a => ({ ...a, chosenOptionId: 'invented' })), Array(21).fill(answers[0])]) {
      await expect(a.mutation(api.proof.submit, { lessonId: 'one', answers: malformed })).rejects.toThrow()
    }
    expect((await a.query(api.proof.snapshot)).ledger).toHaveLength(0)
  })
  it('rolls back a failure after the first write and retries safely', async () => {
    const { a, answers } = await setup()
    const before = await a.query(api.proof.snapshot)
    await expect(a.mutation(internal.fixtures.failAfterWrite, { lessonId: 'one', answers })).rejects.toThrow('INJECTED_WRITE_FAILURE')
    expect(await a.query(api.proof.snapshot)).toEqual(before)
    await a.mutation(api.proof.submit, { lessonId: 'one', answers })
    expect((await a.query(api.proof.snapshot)).ledger).toHaveLength(1)
  })
  it('preserves both sequential reviews and reconciles wallet to its ledger', async () => {
    const { a, answers } = await setup()
    await a.mutation(api.proof.submit, { lessonId: 'one', answers })
    await a.mutation(api.proof.submit, { lessonId: 'two', answers })
    const s = await a.query(api.proof.snapshot)
    expect(s.account?.revision).toBe(2)
    expect(s.account?.xp).toBe(s.ledger.reduce((sum, row) => sum + row.xp, 0))
    expect(s.account?.coins).toBe(s.ledger.reduce((sum, row) => sum + row.coins, 0))
    expect(s.memories.every(m => m.state.reps === 2)).toBe(true)
    expect(s.reviews).toHaveLength(10)
  })
})
