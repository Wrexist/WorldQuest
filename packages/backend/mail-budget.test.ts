import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { withMailBudget } from './src/mail-budget'

let mf: Miniflare, db: D1Database
let now: number
const message = { email: 'learner@example.invalid', code: '12345678', locale: 'en' as const, purpose: 'link' as const }
beforeEach(async () => {
  now = Date.UTC(2026, 9, 2, 10)
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response(null) } }',
    compatibilityDate: '2026-09-13', d1Databases: ['DB'] }))
  db = await mf.getD1Database('DB') as unknown as D1Database
  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '')
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)))
  }
})
afterEach(async () => { await mf.dispose() })

async function exhaust(bucket: string, count: number, expires: number) {
  await db.prepare('INSERT INTO auth_budgets(bucket,count,expires_at) VALUES(?,?,?)')
    .bind(`mail-global:${bucket}`, count, expires).run()
}

describe('persistent mail send limits', () => {
  it('caps concurrent senders sharing the same database before contacting the provider', async () => {
    const send = vi.fn(async () => {})
    const outcomes = await Promise.allSettled(Array.from({ length: 40 }, () =>
      withMailBudget(db, { send }, () => now).send(message)))
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(30)
    expect(send).toHaveBeenCalledTimes(30)
  })

  it.each([['day', 90], ['month', 2700]] as const)('blocks exhausted %s capacity across Worker instances', async (bucket, limit) => {
    await exhaust(bucket, limit, now + 86_400_000)
    const send = vi.fn(async () => {})
    await expect(withMailBudget(db, { send }, () => now).send(message)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps uncertain provider failures charged to the budget', async () => {
    const send = vi.fn(async () => { throw new Error('Provider timeout') })
    await expect(withMailBudget(db, { send }, () => now).send(message)).rejects.toThrow('Provider timeout')
    const counts = await db.prepare("SELECT count FROM auth_budgets WHERE bucket LIKE 'mail-global:%'").all<{ count: number }>()
    expect(counts.results.map(r => r.count)).toEqual([1, 1, 1])
  })

  it('resets expired caps at UTC month/day/hour boundaries, including December', async () => {
    now = Date.UTC(2027, 0, 1)
    for (const [bucket, count] of [['month', 2700], ['day', 90], ['hour', 30]] as const) await exhaust(bucket, count, now)
    const send = vi.fn(async () => {})
    await withMailBudget(db, { send }, () => now).send(message)
    expect(send).toHaveBeenCalledOnce()
    expect(await db.prepare("SELECT count,expires_at FROM auth_budgets WHERE bucket='mail-global:month'").first())
      .toEqual({ count: 1, expires_at: Date.UTC(2027, 1, 1) })
    expect(await db.prepare("SELECT expires_at FROM auth_budgets WHERE bucket='mail-global:day'").first())
      .toEqual({ expires_at: now + 86_400_000 })
  })

  it('fails closed when the persistent budget is unavailable', async () => {
    await db.prepare('DROP TABLE auth_budgets').run()
    const send = vi.fn(async () => {})
    await expect(withMailBudget(db, { send }, () => now).send(message)).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})
