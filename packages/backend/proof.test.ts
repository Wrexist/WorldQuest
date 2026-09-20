import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { BALANCE, review, type MemoryState, type Rating } from '@worldquest/engines'
import { hashToken } from './src/auth'
import { submitLesson } from './src/lessons'
import type { Receipt } from './src/contracts'
import type { Question } from '@worldquest/engines'
import { createD1AuthClient, type AuthFetch } from '../api/src/d1-auth'
import { createD1LearningClient, createD1LessonQueue } from '../api/src/d1-learning'

type Guest = { userId: string; token: string; expiresAt: number }
let script: string
let mf: Miniflare
let db: D1Database
beforeAll(async () => {
  const result = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] })
  script = result.outputFiles[0]!.text
})
beforeEach(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-09-13',
    compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'true' } }))
  db = await mf.getD1Database('DB') as unknown as D1Database
  // Statements contain no triggers or semicolons within literals. Run the real migration.
  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '')
    await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)))
  }
})
afterEach(async () => { await mf.dispose() })
async function call(path: string, token?: string, body?: unknown) {
  return mf.dispatchFetch(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
async function guest(): Promise<Guest> {
  const response = await call('/v1/auth/guest', undefined, {})
  expect(response.status).toBe(201)
  return await response.json() as Guest
}
async function seed(owner: string, ids: string[], count = 5) {
  // Only tests insert tickets. No public fixture/admin endpoint exists in the bundle.
  const slots = Array.from({ length: count }, (_, i) => ({ itemId: `item-${i}`, factId: `fact-${i}`,
    templateId: 'flag-mcq', options: ['a', 'b'], correctOptionId: 'a' }))
  await db.batch(ids.map(id => db.prepare('INSERT INTO tickets (account_id, lesson_id, slots) VALUES (?, ?, ?)')
    .bind(owner, id, JSON.stringify(slots))))
  return slots.map((_, i) => ({ slot: i, chosenOptionId: 'a', elapsedMs: 9000 }))
}
async function state(owner: string) {
  return {
    account: await db.prepare('SELECT revision, xp, coins, lessons_today FROM accounts WHERE id = ?').bind(owner).first(),
    ledger: (await db.prepare('SELECT * FROM ledger WHERE account_id = ? ORDER BY lesson_id').bind(owner).all()).results,
    reviews: (await db.prepare('SELECT * FROM reviews WHERE account_id = ? ORDER BY lesson_id, slot').bind(owner).all()).results,
    memories: (await db.prepare('SELECT * FROM memories WHERE account_id = ? ORDER BY fact_id').bind(owner).all()).results,
    receipts: (await db.prepare('SELECT * FROM receipts WHERE account_id = ? ORDER BY lesson_id').bind(owner).all()).results,
  }
}
describe('D1 Worker acceptance slice (real workerd and SQLite)', () => {
  it('issues immutable content-backed lessons and refuses client answers or changed retry preferences', async () => {
    const a = await guest()
    const input = { lessonId: 'issued', locale: 'sv', count: 5, screenReader: true }
    const pair = await Promise.all([call('/v1/lessons/prepare', a.token, input), call('/v1/lessons/prepare', a.token, input)])
    const [one, two] = await Promise.all(pair.map(async r => { expect(r.status).toBe(200); return r.json() }))
    expect(one).toEqual(two)
    const prepared = one as { questions: Question[] }
    expect(prepared.questions).toHaveLength(5)
    expect(prepared.questions.every(q => q.item.screenReaderSafe)).toBe(true)
    expect(new Set(prepared.questions.map(q => q.item.factId)).size).toBe(5)
    expect((await call('/v1/lessons/prepare', a.token, { ...input, count: 10 })).status).toBe(409)
    expect((await call('/v1/lessons/prepare', a.token, { ...input, slots: [] })).status).toBe(400)
    const b = await guest()
    const answers = prepared.questions.map((q, slot) => ({ slot, chosenOptionId: q.options.find(o => o.isCorrect)!.id, elapsedMs: 9000 }))
    expect((await call('/v1/lessons/submit', b.token, { lessonId: 'issued', answers })).status).toBe(400)
    const result = await call('/v1/lessons/submit', a.token, { lessonId: 'issued', answers })
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ correct: 5, reviews: 5 })
  })
  it('bounds outstanding offline tickets and frees capacity after an acknowledged lesson', async () => {
    const a = await guest()
    let first: { questions: Question[] } | undefined
    for (let i = 0; i < 20; i++) {
      const r = await call('/v1/lessons/prepare', a.token, { lessonId: `prefetch-${i}`, locale: 'en', count: 5 })
      expect(r.status).toBe(200)
      const value = await r.json() as { questions: Question[] }
      if (i === 0) first = value
    }
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'too-many', locale: 'en' })).status).toBe(429)
    const answers = first!.questions.map((q, slot) => ({ slot, chosenOptionId: q.options.find(o => o.isCorrect)!.id, elapsedMs: 9000 }))
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'prefetch-0', answers })).status).toBe(200)
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'after-sync', locale: 'en' })).status).toBe(200)
  })
  it('replays the durable mobile queue after a lost D1 reward response without paying twice', async () => {
    const vault = new Map<string, string>(), local = new Map<string, string>()
    const storage = (values: Map<string, string>) => ({ getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value) }, removeItem: async (key: string) => { values.delete(key) } })
    let loseResponse = true, current = true
    const transport: AuthFetch = async (url, init) => {
      const r = await mf.dispatchFetch(url, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body ? { body: String(init.body) } : {}) })
      const value: unknown = await r.json()
      if (url.endsWith('/submit') && loseResponse && r.ok) { loseResponse = false; throw new Error('Synthetic lost response') }
      return { status: r.status, ok: r.ok, json: async () => value }
    }
    const auth = createD1AuthClient({ baseURL: 'http://localhost', storage: storage(vault), clearCredentials: async () => { vault.clear() }, fetch: transport })
    const a = await auth.startGuest()
    const client = createD1LearningClient({ auth, owner: a.userId, isCurrent: () => current, fetch: transport })
    const prepared = await client.prepare({ lessonId: 'offline', locale: 'en', count: 5, screenReader: false })
    const answers = prepared.questions.map((q, slot) => ({ slot, chosenOptionId: q.options.find(o => o.isCorrect)!.id, elapsedMs: 9000 }))
    const queue = () => createD1LessonQueue({ key: a.userId + '.queue', owner: a.userId, storage: storage(local), isCurrent: () => current, submit: client.submit, prepare: client.prepare })
    await queue().enqueue({ lessonId: 'offline', answers })
    await expect(queue().flush()).rejects.toThrow('Synthetic lost response')
    const paid = await state(a.userId)
    await queue().flush()
    expect(await state(a.userId)).toEqual(paid)
    expect((await queue().inspect()).entries).toHaveLength(0)
    expect(paid.ledger).toHaveLength(1)
    expect((await client.state()).memories).toHaveLength(5)
    current = false
    await expect(client.submit({ lessonId: 'offline', answers })).rejects.toThrow('Account changed')
  })
  it('rebuilds mastery from bounded history pages and isolates another account', async () => {
    const a = await guest(), b = await guest()
    const ids = Array.from({ length: 6 }, (_, i) => `history-${i}`)
    const answers = await seed(a.userId, ids, 20)
    for (const lessonId of ids) expect((await call('/v1/lessons/submit', a.token, { lessonId, answers })).status).toBe(200)
    type Page = { throughRevision: number; events: { revision: number; slot: number; factId: string; rating: Rating; reviewedAt: number }[]; next: { revision: number; slot: number } | null }
    const page = await (await call('/v1/learning/history', a.token)).json() as Page
    expect(page.events).toHaveLength(100)
    expect(page.next).not.toBeNull()
    const rest = await (await call(`/v1/learning/history?revision=${page.next!.revision}&slot=${page.next!.slot}&through=${page.throughRevision}`, a.token)).json() as Page
    expect(rest.events).toHaveLength(20)
    expect(rest.next).toBeNull()
    const rebuilt = new Map<string, MemoryState>()
    for (const event of [...page.events, ...rest.events]) {
      const updated = review({ factId: event.factId, state: rebuilt.get(event.factId) ?? null, rating: event.rating, now: event.reviewedAt })
      rebuilt.set(event.factId, updated)
    }
    const snapshot = await (await call('/v1/learning/state', a.token)).json() as { revision: number; memories: MemoryState[] }
    expect(snapshot.revision).toBe(6)
    const ordered = [...rebuilt.values()].sort((a, b) => a.factId.localeCompare(b.factId))
    // The replayed history must reconstruct the same state the Worker stored. The
    // integers, ids and ordering are exact. The three derived floats are not:
    // FSRS computes them through Math.exp/Math.pow, and workerd's engine and Node's
    // need not round those identically in the last ULPs. Comparing them exactly made
    // this fail on the Linux runner while passing on Windows for the same commit —
    // `stability: 3.173002106635083` against `3.1730021066350997`. A tolerance keeps
    // the invariant (a wrong replay drifts by far more than an ULP) without claiming
    // bit equality between two engines.
    const exact = (m: MemoryState) => ({ factId: m.factId, reps: m.reps, lapses: m.lapses, suspended: m.suspended, lastReviewAt: m.lastReviewAt })
    expect(snapshot.memories.map(exact)).toEqual(ordered.map(exact))
    for (const [index, memory] of snapshot.memories.entries()) {
      const want = ordered[index]!
      const drift = Math.max(...(['stability', 'difficulty', 'dueAt'] as const)
        .map(field => Math.abs(memory[field] - want[field]) / Math.max(1, Math.abs(want[field]))))
      expect(drift, `${memory.factId} drifted by ${drift}`).toBeLessThan(1e-12)
    }
    expect(await (await call('/v1/learning/history', b.token)).json()).toMatchObject({ events: [], throughRevision: 0 })
    expect(await (await call('/v1/learning/state', b.token)).json()).toMatchObject({ memories: [] })
    expect((await call('/v1/learning/history?through=99999', a.token)).status).toBe(400)
    expect((await call('/v1/learning/history?slot=999', a.token)).status).toBe(400)
  })
  it('fails closed when the application API is disabled', async () => {
    await mf.setOptions(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-09-13', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'false' } }))
    expect((await call('/health')).status).toBe(200)
    expect((await call('/v1/auth/guest', undefined, {})).status).toBe(503)
  })
  it('creates restricted guests, stores only token hashes and rejects identity injection', async () => {
    const a = await guest()
    expect((await call('/v1/account', a.token)).status).toBe(200)
    expect(await (await call('/v1/account', a.token)).json()).toMatchObject({ userId: a.userId, audience: 'unknown' })
    const rows = (await db.prepare('SELECT * FROM sessions').all()).results
    expect(JSON.stringify(rows)).not.toContain(a.token)
    expect(rows[0]?.token_hash).toBe(await hashToken(a.token))
    expect((await call('/v1/auth/guest', undefined, { audience: 'eligible', userId: a.userId })).status).toBe(400)
    expect((await call('/v1/account')).status).toBe(401)
    expect((await call('/v1/account', '0'.repeat(64))).status).toBe(401)
  })
  it('rejects another account using a ticket or reading a receipt', async () => {
    const a = await guest(); const b = await guest()
    const answers = await seed(a.userId, ['one'])
    expect((await call('/v1/lessons/submit', b.token, { lessonId: 'one', answers })).status).toBe(400)
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers, owner: b.userId })).status).toBe(400)
    expect((await state(a.userId)).ledger).toHaveLength(0)
    expect((await state(b.userId)).ledger).toHaveLength(0)
  })
  it('deduplicates concurrent submissions and rejects changed payloads', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['one'])
    // Consume each workerd response immediately, before waiting for other requests.
    // Avoid retaining live Response streams across concurrent request completion.
    const receipts = await Promise.all(Array.from({ length: 4 }, async () => {
      const response = await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers })
      expect(response.status).toBe(200)
      return response.json()
    }))
    for (const receipt of receipts) expect(receipt).toEqual(receipts[0])
    expect((await state(a.userId)).ledger).toHaveLength(1)
    const changed = answers.map(a => ({ ...a, elapsedMs: 5000 }))
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers: changed })).status).toBe(409)
    expect(await (await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers: [...answers].reverse() })).json()).toEqual(receipts[0])
  })
  it('preserves concurrent different lessons and pays the daily bonus once', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['one', 'two'])
    const receipts = await Promise.all(['one', 'two'].map(async lessonId => {
      const response = await call('/v1/lessons/submit', a.token, { lessonId, answers })
      expect(response.status).toBe(200)
      return await response.json() as Receipt
    }))
    expect(Math.abs(receipts[0]!.xpAwarded - receipts[1]!.xpAwarded)).toBe(BALANCE.xp.firstLessonOfDay)
    const snapshot = await state(a.userId)
    expect(snapshot.account?.revision).toBe(2)
    expect(snapshot.account?.lessons_today).toBe(2)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    expect(snapshot.account?.coins).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
    expect(snapshot.reviews).toHaveLength(10)
    expect(snapshot.memories.every(row => (JSON.parse(String(row.state)) as { reps: number }).reps === 2)).toBe(true)
    expect((await db.prepare('SELECT * FROM transaction_guards').all()).results).toHaveLength(0)
  })
  it('rolls back every write after an injected database failure and retries safely', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['one'])
    const before = await state(a.userId)
    await db.prepare(`CREATE TRIGGER fail_review BEFORE INSERT ON reviews BEGIN SELECT RAISE(ABORT, 'injected_failure'); END`).run()
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers })).status).toBe(503)
    expect(await state(a.userId)).toEqual(before)
    expect((await db.prepare('SELECT * FROM transaction_guards').all()).results).toHaveLength(0)
    await db.prepare('DROP TRIGGER fail_review').run()
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers })).status).toBe(200)
    expect((await state(a.userId)).reviews).toHaveLength(5)
  })
  it('rejects forged, duplicated, oversized and malformed answers without paying', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['one'])
    for (const invalid of [Array.from({ length: 8 }, () => answers[0]), Array.from({ length: 21 }, () => answers[0]),
      answers.map(a => ({ ...a, chosenOptionId: 'invented' })), answers.map(a => ({ ...a, elapsedMs: -1 })),
      answers.map(a => ({ ...a, wasCorrect: true }))]) {
      expect((await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers: invalid })).status).toBe(400)
    }
    expect((await call('/v1/lessons/submit', a.token, { huge: 'x'.repeat(20_000) })).status).toBe(413)
    expect((await state(a.userId)).ledger).toHaveLength(0)
  })
  it('revokes logout immediately and rejects expired sessions', async () => {
    const a = await guest(); const b = await guest()
    expect((await call('/v1/auth/logout', a.token, {})).status).toBe(200)
    expect((await call('/v1/account', a.token)).status).toBe(401)
    expect((await call('/v1/account', b.token)).status).toBe(200)
    await db.prepare('UPDATE sessions SET expires_at = 0 WHERE account_id = ?').bind(b.userId).run()
    expect((await call('/v1/account', b.token)).status).toBe(401)
  })
  it('fits a maximum-size lesson into a bounded number of real D1 statements', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['maximum'], 20)
    let statementCount = 0
    const observed = new Proxy(db, { get(target, key) {
      if (key === 'batch') return (statements: D1PreparedStatement[]) => {
        statementCount += statements.length
        return target.batch(statements)
      }
      const value = Reflect.get(target, key, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const result = await submitLesson(observed, a.userId, await hashToken(a.token), { lessonId: 'maximum', answers })
    expect(result.reviews).toBe(20)
    expect((await state(a.userId)).reviews).toHaveLength(20)
    expect(statementCount).toBe(11)
  })
  it('rejects a session revoked between the grading read and transaction commit', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['revoked'])
    let interrupted = false
    const observed = new Proxy(db, { get(target, key) {
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        const result = await target.batch(statements)
        if (!interrupted) {
          interrupted = true
          await target.prepare('DELETE FROM sessions WHERE account_id = ?').bind(a.userId).run()
        }
        return result
      }
      const value = Reflect.get(target, key, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    } })
    await expect(submitLesson(observed, a.userId, await hashToken(a.token), { lessonId: 'revoked', answers }))
      .rejects.toThrow('SESSION_EXPIRED')
    expect((await state(a.userId)).ledger).toHaveLength(0)
    expect((await state(a.userId)).account?.revision).toBe(0)
  })
})
