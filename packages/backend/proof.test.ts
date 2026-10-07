import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { BALANCE, review, type MemoryState, type Rating } from '@worldquest/engines'
import { hashToken } from './src/auth'
import { submitLesson } from './src/lessons'
import { spend } from './src/economy'
import { learningContent } from './src/learning-content'
import type { Receipt } from './src/contracts'
import type { Question } from '@worldquest/engines'
import { createD1AuthClient, type AuthFetch } from '../api/src/d1-auth'
import { createD1LearningClient, createD1LessonQueue } from '../api/src/d1-learning'
import { createD1AccountRepository } from '../api/src/d1-repository'
import { smokeHostedGuest } from '../../scripts/smoke-hosted-guest'

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
    compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'true',
      EMAIL_AUTH_ENABLED: 'false', AUTH_SECRET: 'synthetic-only-auth-secret-for-guest-beta-tests' } }))
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
  it('runs the hosted guest smoke against real content and deletes only its own temporary guest', async () => {
    const existing = await guest()
    const paths: string[] = []
    const result = await smokeHostedGuest('https://guest-smoke.invalid', async (url, init) => {
      paths.push(new URL(url).pathname)
      expect(init.redirect).toBe('error')
      return mf.dispatchFetch(url, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body ? { body: String(init.body) } : {}) })
    })
    expect(result).toEqual({ questions: 5, deleted: true })
    expect(paths).toEqual(['/health', '/v1/auth/guest', '/v1/account/audience', '/v1/lessons/prepare', '/v1/account/delete'])
    expect((await db.prepare('SELECT id FROM accounts').all()).results).toEqual([{ id: existing.userId }])
    for (const table of ['tickets', 'ledger', 'receipts', 'email_challenges']) {
      expect((await db.prepare(`SELECT count(*) AS count FROM ${table}`).first())?.count).toBe(0)
    }
  })

  it('rejects malformed issued questions in the hosted smoke and still deletes its guest', async () => {
    await expect(smokeHostedGuest('https://guest-smoke.invalid', async (url, init) => {
      const response = await mf.dispatchFetch(url, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body ? { body: String(init.body) } : {}) })
      if (!url.endsWith('/v1/lessons/prepare')) return response
      const value = await response.json() as { questions: Question[] }
      value.questions[0] = { ...value.questions[0]!, options: [] }
      return { ok: true, status: 200, json: async () => value }
    })).rejects.toThrow('Guest smoke failed during issued beginner lesson validation.')
    expect((await db.prepare('SELECT count(*) AS count FROM accounts').first())?.count).toBe(0)
    expect((await db.prepare('SELECT count(*) AS count FROM tickets').first())?.count).toBe(0)
  })

  it('reports an unconfirmed guest cleanup without exposing its credential or upstream error', async () => {
    await expect(smokeHostedGuest('https://guest-smoke.invalid', async (url, init) => {
      if (url.endsWith('/v1/account/delete')) throw new Error(`upstream failure ${new Headers(init.headers).get('Authorization')}`)
      return mf.dispatchFetch(url, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body ? { body: String(init.body) } : {}) })
    })).rejects.toThrow('Temporary guest cleanup failed after issued beginner lesson validation; deletion was not confirmed.')
    expect((await db.prepare('SELECT count(*) AS count FROM accounts').first())?.count).toBe(1)
  })

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
  it('grades answers by the slot they were issued in, in the order they were given', async () => {
    // A lesson adapts as it goes, so the answers are not a prefix of the ticket: slot 4 can be
    // answered first. Each is still graded against ITS slot's key.
    const a = await guest()
    const input = { lessonId: 'adaptive', locale: 'en', count: 5, screenReader: false }
    const prepared = await (await call('/v1/lessons/prepare', a.token, input)).json() as { questions: Question[] }
    const right = prepared.questions.map(q => q.options.find(o => o.isCorrect)!.id)
    const wrong = (q: Question) => q.options.find(o => !o.isCorrect)?.id ?? null
    // Backwards, with slot 2 answered wrongly: exactly four right.
    const backwards = [4, 3, 2, 1, 0].map(slot => ({ slot, chosenOptionId: slot === 2 ? wrong(prepared.questions[2]!) : right[slot]!, elapsedMs: 9000 }))
    // An option from another slot's key is not an answer to this one.
    // (Chosen so that it really is absent from slot 0's options: wrong answers are neighbours, so
    // another question's right answer is sometimes one of them.)
    const foreign = right.findIndex((id, k) => k > 0 && !prepared.questions[0]!.options.some(o => o.id === id))
    if (foreign > 0) {
      const crossed = [{ slot: 0, chosenOptionId: right[foreign]!, elapsedMs: 9000 }]
      expect((await call('/v1/lessons/submit', a.token, { lessonId: 'adaptive', answers: crossed })).status).toBe(400)
    }
    // A slot the ticket does not have.
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'adaptive', answers: [{ slot: 5, chosenOptionId: right[0]!, elapsedMs: 9000 }] })).status).toBe(400)
    const result = await call('/v1/lessons/submit', a.token, { lessonId: 'adaptive', answers: backwards })
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ correct: 4, reviews: 5 })
  })
  it('issues a level check: ten questions, easy to hard, one per country', async () => {
    const a = await guest()
    const response = await call('/v1/lessons/prepare', a.token, { lessonId: 'placement-1', locale: 'en', count: 10, screenReader: false, placement: true })
    expect(response.status).toBe(200)
    const lesson = await response.json() as { questions: Question[]; request: { placement?: boolean } }
    expect(lesson.request.placement).toBe(true)
    expect(lesson.questions).toHaveLength(10)
    const d = lesson.questions.map(q => q.item.difficulty)
    expect([...d].sort((x, y) => x - y)).toEqual(d)
    expect(new Set(lesson.questions.map(q => q.item.entityId)).size).toBe(10)
    // It is a lesson like any other once issued: answered, graded, rewarded by the Worker.
    const answers = lesson.questions.map((q, slot) => ({ slot, chosenOptionId: q.options.find(o => o.isCorrect)!.id, elapsedMs: 9000 }))
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'placement-1', answers })).status).toBe(200)
    // The flag is a literal `true`: anything else is a request the Worker does not understand.
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'placement-2', locale: 'en', count: 10, placement: false })).status).toBe(400)
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
    // Identity, counts and timestamps exactly; FSRS's floating-point outputs to 9 digits.
    // The server's copy of each state is stored between lessons and the replay's is not, so
    // six reviews in, the two agree to ~1e-14 and not always to the last bit — which failed
    // the TestFlight gate on a run where CI on the same commit passed (2026-10-07). A
    // difference that size is no difference in a schedule measured in days.
    const expected = [...rebuilt.values()].sort((a, b) => a.factId.localeCompare(b.factId))
    expect(snapshot.memories).toEqual(expected.map(memory => ({ ...memory,
      stability: expect.closeTo(memory.stability, 9), difficulty: expect.closeTo(memory.difficulty, 9),
      dueAt: expect.closeTo(memory.dueAt, 3) })))
    expect(await (await call('/v1/learning/history', b.token)).json()).toMatchObject({ events: [], throughRevision: 0 })
    expect(await (await call('/v1/learning/state', b.token)).json()).toMatchObject({ memories: [] })
    expect((await call('/v1/learning/history?through=99999', a.token)).status).toBe(400)
    expect((await call('/v1/learning/history?slot=999', a.token)).status).toBe(400)
  })
  it('pages more than 1000 facts coherently, scopes every page, and restarts after a concurrent revision', async () => {
    const vault = new Map<string, string>()
    const storage = { getItem: async (key: string) => vault.get(key) ?? null,
      setItem: async (key: string, value: string) => { vault.set(key, value) }, removeItem: async (key: string) => { vault.delete(key) } }
    let owner = '', changeBetweenPages = false
    const pageSizes: number[] = []
    const transport: AuthFetch = async (url, init) => {
      if (changeBetweenPages && url.includes('after=')) {
        changeBetweenPages = false
        await db.prepare('UPDATE accounts SET revision=revision+1 WHERE id=?').bind(owner).run()
      }
      const response = await mf.dispatchFetch(url, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body ? { body: String(init.body) } : {}) })
      const value = await response.json() as { memories?: unknown[] }
      if (value.memories) pageSizes.push(value.memories.length)
      return { status: response.status, ok: response.ok, json: async () => value }
    }
    const auth = createD1AuthClient({ baseURL: 'http://localhost', storage, clearCredentials: async () => { vault.clear() }, fetch: transport })
    const account = await auth.startGuest()
    owner = account.userId
    const ids = [...learningContent.facts.keys()].sort().slice(0, 1005)
    const memories = ids.map(factId => ({ factId, stability: 20, difficulty: 5, reps: 3, lapses: 0,
      lastReviewAt: 1000, dueAt: 100000, suspended: false }))
    await db.prepare(`INSERT INTO memories(account_id,fact_id,state,revision)
      SELECT ?,json_extract(value,'$.factId'),value,0 FROM json_each(?)`).bind(owner, JSON.stringify(memories)).run()
    const first = await (await call('/v1/learning/state?paged=1', account.token)).json() as { memories: MemoryState[]; next: { after: string; revision: number } }
    expect(first.memories).toHaveLength(250)
    const cursor = `?paged=1&after=${first.next.after}&revision=${first.next.revision}`
    const other = await guest()
    expect(await (await call('/v1/learning/state' + cursor, other.token)).json()).toMatchObject({ memories: [], next: null })
    expect((await call('/v1/learning/state?after=foreign', account.token)).status).toBe(400)
    expect((await call('/v1/learning/state?paged=1&limit=999999', account.token)).status).toBe(400)
    // The old response contract fails explicitly instead of returning a partial snapshot.
    expect((await call('/v1/learning/state', account.token)).status).toBe(409)
    const client = createD1LearningClient({ auth, owner, isCurrent: () => true, fetch: transport })
    changeBetweenPages = true
    const complete = await client.state()
    expect(complete.revision).toBe(1)
    expect(complete.memories).toEqual(memories)
    expect(pageSizes).toEqual([250, 250, 250, 250, 250, 5])
    expect((await call('/v1/learning/state' + cursor, account.token)).status).toBe(409)
    expect(await (await call('/v1/learning/state?paged=1', other.token)).json()).toMatchObject({ memories: [], next: null })
  })
  it('fails closed when the application API is disabled', async () => {
    await mf.setOptions(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-09-13', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { API_ENABLED: 'false' } }))
    expect((await call('/health')).status).toBe(200)
    // The app's connectivity probe asks with HEAD; a 401 here read as "offline" forever.
    expect((await mf.dispatchFetch('http://localhost/health', { method: 'HEAD' })).status).toBe(200)
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
    // The ORDER the answers were given in is part of what was submitted: the hearts replay walks
    // them that way. The same answers in another order are a different submission, not a retry.
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'one', answers: [...answers].reverse() })).status).toBe(answers.length > 1 ? 409 : 200)
  })
  it('preserves concurrent different lessons and pays the daily bonus once', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['one', 'two'])
    const receipts = await Promise.all(['one', 'two'].map(async lessonId => {
      const response = await call('/v1/lessons/submit', a.token, { lessonId, answers })
      expect(response.status).toBe(200)
      return await response.json() as Receipt
    }))
    // Lesson XP differs by exactly the first-lesson bonus, and the quest's fifth task
    // (finish a lesson) is paid to exactly one of the two concurrent lessons.
    const lessonXp = receipts.map(r => r.xpAwarded - r.quest.xp - r.achievements.xp)
    expect(Math.abs(lessonXp[0]! - lessonXp[1]!)).toBe(BALANCE.xp.firstLessonOfDay)
    expect(receipts.map(r => r.quest.xp).sort()).toEqual([0, BALANCE.xp.dailyQuestTask])
    const snapshot = await state(a.userId)
    expect(snapshot.account?.revision).toBe(2)
    expect(snapshot.account?.lessons_today).toBe(2)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    expect(snapshot.account?.coins).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
    expect(snapshot.reviews).toHaveLength(10)
    expect(snapshot.memories.every(row => (JSON.parse(String(row.state)) as { reps: number }).reps === 2)).toBe(true)
    expect((await db.prepare('SELECT * FROM transaction_guards').all()).results).toHaveLength(0)
  })
  it('counts local days across a DST change and a time-zone move without a second daily bonus', async () => {
    const a = await guest()
    const tokenHash = await hashToken(a.token)
    // The clock below runs a month ahead; keep the session valid for it.
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(Date.parse('2027-01-01T00:00:00Z'), tokenHash).run()
    // Fresh facts per lesson, so every lesson earns the same base XP and the only
    // difference between receipts is the first-lesson-of-day bonus.
    const lessons = ['d1', 'd2', 'd3', 'd4', 'd5']
    await db.batch(lessons.map(id => db.prepare('INSERT INTO tickets (account_id, lesson_id, slots) VALUES (?, ?, ?)')
      .bind(a.userId, id, JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ itemId: `${id}-item-${i}`,
        factId: `${id}-fact-${i}`, templateId: 'flag-mcq', options: ['a', 'b'], correctOptionId: 'a' }))))))
    const answers = Array.from({ length: 5 }, (_, slot) => ({ slot, chosenOptionId: 'a', elapsedMs: 9000 }))
    expect((await call('/v1/account/time-zone', a.token, { timeZone: 'Mars/Olympus' })).status).toBe(400)
    expect((await call('/v1/account/time-zone', a.token, { timeZone: 'Europe/Stockholm' })).status).toBe(200)
    const at = (iso: string) => () => Date.parse(iso)
    const submit = (lessonId: string, iso: string) => submitLesson(db, a.userId, tokenHash, { lessonId, answers }, at(iso))
    // 23:30 CEST on the 24th, then 00:30 on the 25th: two local days, two bonuses.
    const r1 = await submit('d1', '2026-10-24T21:30:00Z')
    const r2 = await submit('d2', '2026-10-24T22:30:00Z')
    // 23:30 CET on the 25th, the 25-hour day the clocks went back: still the 25th.
    const r3 = await submit('d3', '2026-10-25T22:30:00Z')
    // Flying to Los Angeles, where it is 16:00 on the 25th: no day to reopen.
    expect((await call('/v1/account/time-zone', a.token, { timeZone: 'America/Los_Angeles' })).status).toBe(200)
    const r4 = await submit('d4', '2026-10-25T23:00:00Z')
    // 00:30 on the 26th in Los Angeles: a genuinely new day.
    const r5 = await submit('d5', '2026-10-26T07:30:00Z')
    expect([r1, r2, r3, r4, r5].map(r => r.day)).toEqual(['2026-10-24', '2026-10-25', '2026-10-25', '2026-10-25', '2026-10-26'])
    expect([r1, r2, r3, r4, r5].map(r => r.streak.current)).toEqual([1, 2, 2, 2, 3])
    expect([r1, r2, r3, r4, r5].map(r => r.streak.extended)).toEqual([true, true, false, false, true])
    const bonus = BALANCE.xp.firstLessonOfDay
    // Lesson XP only: each new local day also pays its own quest's fifth task.
    const [x1, x2, x3, x4, x5] = [r1, r2, r3, r4, r5].map(r => r.xpAwarded - r.quest.xp - r.achievements.xp)
    expect(x1).toBe(x2)
    expect(x2! - x3!).toBe(bonus)
    expect(x2! - x4!).toBe(bonus)
    expect(x5).toBe(x1)
    expect([r1, r2, r3, r4, r5].map(r => r.quest.xp)).toEqual([10, 10, 0, 0, 10].map(n => n && BALANCE.xp.dailyQuestTask))
    const snapshot = await state(a.userId)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    const account = await (await call('/v1/account', a.token)).json() as { timeZone: string; streak: { current: number; lastActiveDate: string } }
    expect(account.timeZone).toBe('America/Los_Angeles')
    expect(account.streak).toMatchObject({ current: 3, lastActiveDate: '2026-10-26' })
  })
  it('pays a streak milestone once, inside the lesson ledger row', async () => {
    const a = await guest()
    const tokenHash = await hashToken(a.token)
    await db.prepare(`UPDATE accounts SET streak_current = 6, streak_longest = 6, streak_last_day = '2026-10-01', day = '2026-10-01' WHERE id = ?`).bind(a.userId).run()
    await seed(a.userId, ['m1', 'm2'])
    const answers = Array.from({ length: 5 }, (_, slot) => ({ slot, chosenOptionId: 'a', elapsedMs: 9000 }))
    const r1 = await submitLesson(db, a.userId, tokenHash, { lessonId: 'm1', answers }, () => Date.parse('2026-10-02T12:00:00Z'))
    const r2 = await submitLesson(db, a.userId, tokenHash, { lessonId: 'm2', answers }, () => Date.parse('2026-10-02T13:00:00Z'))
    expect(r1.streak).toMatchObject({ current: 7, extended: true, milestoneXp: BALANCE.xp.streakMilestones[7] })
    expect(r2.streak).toMatchObject({ current: 7, extended: false, milestoneXp: 0, milestoneCoins: 0 })
    const snapshot = await state(a.userId)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    expect(snapshot.account?.coins).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
  })
  it('composes one server quest per day, counts each fact once and pays the bonus once', async () => {
    const a = await guest()
    type Task = { slot: string; target: number; factIds: string[]; progress: number; complete: boolean; goal?: string }
    type Today = { day: string; quest: { tasks: Task[]; complete: boolean } }
    const today = async () => await (await call('/v1/quest/today', a.token)).json() as Today
    const first = await today()
    expect(first.quest.tasks.map(t => t.slot)).toEqual(['locate', 'recognise', 'recall', 'discover', 'perform'])
    expect(await today()).toEqual(first)
    const review = [...new Set(first.quest.tasks.filter(t => ['locate', 'recognise', 'recall'].includes(t.slot)).flatMap(t => t.factIds))]
    const discover = first.quest.tasks.find(t => t.slot === 'discover')!.factIds
    const ticket = async (lessonId: string, facts: string[]) => {
      await db.prepare('INSERT INTO tickets (account_id, lesson_id, slots) VALUES (?, ?, ?)').bind(a.userId, lessonId,
        JSON.stringify(facts.map((factId, i) => ({ itemId: `${lessonId}-${i}`, factId, templateId: 'flag-mcq', options: ['a', 'b'], correctOptionId: 'a' })))).run()
      return facts.map((_, slot) => ({ slot, chosenOptionId: 'a', elapsedMs: 9000 }))
    }
    // Any 13 new facts: two count for discovery, eleven fill practice tasks.
    const one = await ticket('q1', [...review, discover[0]!])
    const r1 = await (await call('/v1/lessons/submit', a.token, { lessonId: 'q1', answers: one })).json() as Receipt
    expect(r1.quest.completedSlots.sort()).toEqual(['discover', 'locate', 'perform', 'recognise'])
    expect(r1.quest).toMatchObject({ complete: false, done: 4, xp: 4 * BALANCE.xp.dailyQuestTask, coins: 0 })
    // Repeated facts count once; the fourteenth distinct fact finishes the last practice task.
    const two = await ticket('q2', [...review, discover[1]!])
    const r2 = await (await call('/v1/lessons/submit', a.token, { lessonId: 'q2', answers: two })).json() as Receipt
    expect(r2.quest).toMatchObject({ completedSlots: ['recall'], complete: true, done: 5,
      xp: BALANCE.xp.dailyQuestTask + BALANCE.xp.dailyQuest, coins: BALANCE.coins.dailyQuest })
    // A replay returns the stored receipt; a new lesson on a finished quest pays nothing more.
    expect(await (await call('/v1/lessons/submit', a.token, { lessonId: 'q2', answers: two })).json()).toEqual(r2)
    const three = await ticket('q3', [...review, discover[0]!])
    const r3 = await (await call('/v1/lessons/submit', a.token, { lessonId: 'q3', answers: three })).json() as Receipt
    expect(r3.quest).toMatchObject({ completedSlots: [], complete: true, xp: 0, coins: 0 })
    const after = await today()
    expect(after.quest.complete).toBe(true)
    expect(after.quest.tasks.every(t => t.factIds.length === 0)).toBe(true)
    const snapshot = await state(a.userId)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    expect(snapshot.account?.coins).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
    // Another account cannot read this quest; its own is composed for it.
    const b = await guest()
    const other = await (await call('/v1/quest/today', b.token)).json() as Today
    expect(other.quest.tasks.every(t => t.progress === 0)).toBe(true)
  })
  it('supports real guest learning while email identity changes stay disabled', async () => {
    const a = await guest()
    expect((await call('/v1/account/audience', a.token, { birthYear: new Date().getUTCFullYear() - 30 })).status).toBe(200)
    for (const [route, input] of [
      ['request', { email: 'beta@example.invalid', purpose: 'link', locale: 'en' }],
      ['resend', { challengeId: 'b'.repeat(64) }],
      ['verify', { challengeId: 'b'.repeat(64), code: '12345678' }],
    ] as const) {
      const response = await call(`/v1/auth/email/${route}`, a.token, input)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: 'EMAIL_NOT_READY' })
    }
    for (const table of ['email_challenges', 'auth_verification', 'auth_budgets']) {
      expect((await db.prepare(`SELECT count(*) AS count FROM ${table}`).first())?.count).toBe(0)
    }
    const response = await call('/v1/lessons/prepare', a.token, { lessonId: 'guest-beta', locale: 'sv', count: 5, maxModifier: 0 })
    expect(response.status).toBe(200)
    const lesson = await response.json() as { questions: Question[] }
    const answers = lesson.questions.map((q, slot) => ({ slot, chosenOptionId: q.options.find(o => o.isCorrect)!.id, elapsedMs: 9000 }))
    const first = await call('/v1/lessons/submit', a.token, { lessonId: 'guest-beta', answers })
    expect(first.status).toBe(200)
    const receipt = await first.json()
    expect(await (await call('/v1/lessons/submit', a.token, { lessonId: 'guest-beta', answers })).json()).toEqual(receipt)
    expect((await state(a.userId)).ledger).toHaveLength(1)
    // Holding email must not prevent a guest from deleting their data.
    expect((await call('/v1/account/delete', a.token, {})).status).toBe(200)
  })

  it('keeps existing linked sessions renewable while new email authentication is held', async () => {
    const a = await guest()
    await db.prepare('INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0)')
      .bind('linked-beta', 'beta', 'linked@example.invalid').run()
    await db.prepare('INSERT INTO identities (subject_id, account_id, linked_at) VALUES (?, ?, 0)').bind('linked-beta', a.userId).run()
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE account_id = ?').bind(Date.now() + 86_400_000, a.userId).run()
    const renewal = await call('/v1/auth/renew', a.token, { replacement: 'e'.repeat(64) })
    expect(renewal.status).toBe(200)
    const next = await renewal.json() as Guest
    expect(next.userId).toBe(a.userId)
    expect((await call('/v1/account', next.token)).status).toBe(200)
  })
  it('credits ordinary course lessons once when two submissions race on the same facts', async () => {
    const a = await guest()
    const prepare = async (lessonId: string) => {
      const response = await call('/v1/lessons/prepare', a.token, { lessonId, locale: 'en', count: 6,
        node: 'node.first-week.flags', focus: { entities: ['SE', 'NO', 'US', 'JP', 'BR', 'KE'], attributes: ['flag'] } })
      expect(response.status).toBe(200)
      return await response.json() as { questions: Question[] }
    }
    const first = await prepare('path-quest-one'), second = await prepare('path-quest-two')
    const submit = (lessonId: string, prepared: { questions: Question[] }) => call('/v1/lessons/submit', a.token, {
      lessonId, answers: prepared.questions.map((q, slot) => ({ slot,
        chosenOptionId: q.options.find(o => o.isCorrect)!.id, elapsedMs: 9000 })),
    })
    const responses = await Promise.all([submit('path-quest-one', first), submit('path-quest-two', second)])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    const row = await db.prepare('SELECT credited FROM quest_days WHERE account_id = ?').bind(a.userId).first<{ credited: string }>()
    const credited = JSON.parse(row!.credited) as string[]
    expect(credited).toHaveLength(6)
    expect(new Set(credited.map(key => key.slice(key.indexOf(':') + 1))).size).toBe(6)
    const today = await (await call('/v1/quest/today', a.token)).json() as { quest: { tasks: { slot: string; progress: number }[] } }
    expect(today.quest.tasks.find(t => t.slot === 'discover')?.progress).toBe(2)
    expect(today.quest.tasks.filter(t => t.slot !== 'perform').reduce((sum, t) => sum + t.progress, 0)).toBe(6)
    const snapshot = await state(a.userId)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    expect(snapshot.account?.coins).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
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
    expect(statementCount).toBe(13)
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

describe('D1 coin spending (real workerd and SQLite)', () => {
  // Coins granted the way the ledger invariant requires: a ledger row and the balance together.
  async function grant(owner: string, coins: number) {
    await db.batch([
      db.prepare("INSERT INTO ledger (account_id, lesson_id, xp, coins) VALUES (?, 'test-grant', 0, ?)").bind(owner, coins),
      db.prepare('UPDATE accounts SET coins = coins + ? WHERE id = ?').bind(coins, owner),
    ])
  }
  async function invariant(owner: string) {
    const s = await state(owner)
    expect(s.account?.coins).toBe(s.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
    expect(s.account?.xp).toBe(s.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
  }
  const post = async (path: string, token: string, body: unknown) => {
    const r = await call(path, token, body)
    return { status: r.status, body: await r.json() as Record<string, unknown> }
  }

  it('sells a freeze once per request id, refuses without writing, and stops at the cap', async () => {
    const a = await guest()
    expect((await post('/v1/shop/freeze', a.token, { requestId: 'freeze-0001' })).body).toEqual({ status: 'no_streak' })
    const answers = await seed(a.userId, ['first'])
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'first', answers })).status).toBe(200)
    const poor = await post('/v1/shop/freeze', a.token, { requestId: 'freeze-0001' })
    expect(poor.body).toEqual({ status: 'insufficient_funds' })
    await grant(a.userId, 2000)
    const before = (await state(a.userId)).account!.coins as number
    const bought = await post('/v1/shop/freeze', a.token, { requestId: 'freeze-0001' })
    expect(bought.body).toEqual({ status: 'purchased', freezesHeld: 1, coins: before - BALANCE.prices.streakFreeze })
    expect((await post('/v1/shop/freeze', a.token, { requestId: 'freeze-0001' })).body).toEqual(bought.body)
    expect((await post('/v1/lessons/continue', a.token, { requestId: 'freeze-0001' })).status).toBe(409)
    expect((await post('/v1/shop/freeze', a.token, { requestId: 'freeze-0002' })).body).toMatchObject({ status: 'purchased', freezesHeld: 2 })
    expect((await post('/v1/shop/freeze', a.token, { requestId: 'freeze-0003' })).body).toEqual({ status: 'at_cap', freezesHeld: 2 })
    expect((await state(a.userId)).account?.coins).toBe(before - 2 * BALANCE.prices.streakFreeze)
    await invariant(a.userId)
  })

  it('keeps both a freeze bought during a lesson submission and the lesson (S06)', async () => {
    const a = await guest()
    const answers = await seed(a.userId, ['warm', 'racing'])
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'warm', answers })).status).toBe(200)
    await grant(a.userId, 1000)
    const [lesson, freeze] = await Promise.all([
      post('/v1/lessons/submit', a.token, { lessonId: 'racing', answers }),
      post('/v1/shop/freeze', a.token, { requestId: 'freeze-race' }),
    ])
    expect(lesson.status).toBe(200)
    expect(freeze.body).toMatchObject({ status: 'purchased', freezesHeld: 1 })
    const s = await state(a.userId)
    expect(s.receipts).toHaveLength(2)
    expect(s.ledger.some(row => row.lesson_id === 'spend:freeze-race')).toBe(true)
    expect((await db.prepare('SELECT freezes_held FROM accounts WHERE id = ?').bind(a.userId).first())?.freezes_held).toBe(1)
    await invariant(a.userId)
  })

  it('charges a continue once per offer and says so on a replay', async () => {
    const a = await guest()
    expect((await post('/v1/lessons/continue', a.token, { requestId: 'offer-0001' })).body).toEqual({ status: 'insufficient_funds' })
    await grant(a.userId, 600)
    expect((await post('/v1/lessons/continue', a.token, { requestId: 'offer-0001' })).body)
      .toEqual({ status: 'purchased', spent: BALANCE.prices.continueLesson, coins: 600 - BALANCE.prices.continueLesson })
    expect((await post('/v1/lessons/continue', a.token, { requestId: 'offer-0001' })).body)
      .toEqual({ status: 'already_paid', coins: 600 - BALANCE.prices.continueLesson })
    expect((await post('/v1/lessons/continue', a.token, { requestId: 'offer-0002' })).body).toMatchObject({ status: 'purchased' })
    expect((await post('/v1/lessons/continue', a.token, { requestId: 'offer-0003' })).body).toEqual({ status: 'insufficient_funds' })
    await invariant(a.userId)
  })

  it('sells only catalogue titles at the balance-table price, once each', async () => {
    const a = await guest(), b = await guest()
    await grant(a.userId, 2500)
    expect((await post('/v1/shop/item', a.token, { requestId: 'item-00001', itemId: 'title.not-real' })).body).toEqual({ status: 'not_for_sale' })
    expect((await post('/v1/shop/item', a.token, { requestId: 'item-00002' })).status).toBe(400)
    expect((await post('/v1/shop/item', a.token, { requestId: 'item-00003', itemId: 'title.flag-fanatic' })).body)
      .toEqual({ status: 'purchased', coins: 2500 - BALANCE.prices.titleUnlock })
    expect((await post('/v1/shop/item', a.token, { requestId: 'item-00004', itemId: 'title.flag-fanatic' })).body).toEqual({ status: 'owned' })
    const progress = await (await call('/v1/progress', a.token)).json() as { inventory: string[]; coins: number }
    expect(progress).toMatchObject({ inventory: ['title.flag-fanatic'], coins: 2500 - BALANCE.prices.titleUnlock })
    expect(await (await call('/v1/progress', b.token)).json()).toMatchObject({ inventory: [], coins: 0 })
    await invariant(a.userId)
  })

  it('shows a lapsed streak as zero and repairs it within the window, then enforces the cooldown', async () => {
    const a = await guest()
    const tokenHash = await hashToken(a.token)
    const now = Date.now()
    const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10)
    // Ten days, last active two days ago, no freeze: yesterday broke it.
    await db.prepare('UPDATE accounts SET streak_current = 10, streak_longest = 10, streak_last_day = ?, day = ? WHERE id = ?')
      .bind(day(-2), day(-2), a.userId).run()
    const lapsed = await (await call('/v1/progress', a.token)).json() as { streak: number; brokenOn: string }
    // `restoreTo` is what Home's "bring back your 10-day streak" names, and it must be
    // the length the repair below actually restores.
    expect(lapsed).toMatchObject({ streak: 0, brokenOn: day(-1), restoreTo: 10 })
    expect((await post('/v1/streak/repair', a.token, { requestId: 'repair-0001' })).body).toEqual({ status: 'insufficient_funds' })
    await grant(a.userId, 1500)
    expect((await post('/v1/streak/repair', a.token, { requestId: 'repair-0001' })).body)
      .toMatchObject({ status: 'repaired', current: 10, spent: BALANCE.prices.streakRepair })
    expect(await (await call('/v1/progress', a.token)).json()).toMatchObject({ streak: 10, brokenOn: null, restoreTo: null })
    expect((await post('/v1/streak/repair', a.token, { requestId: 'repair-0002' })).body).toEqual({ status: 'not_broken' })
    // Broken again later: the cooldown answers with a number of days, not a bare no.
    await db.prepare('UPDATE accounts SET streak_last_day = ? WHERE id = ?').bind(day(3), a.userId).run()
    const later = () => now + 5 * 86_400_000
    expect(await spend(db, a.userId, tokenHash, 'repair', { requestId: 'repair-0003' }, later)).toMatchObject({ status: 'cooldown' })
    await invariant(a.userId)
  })
})

describe('the app account repository against the real Worker', () => {
  it('reads progress, spends, keeps owner isolation and refuses the legacy lesson path', async () => {
    const vault = new Map<string, string>()
    const storage = { getItem: async (key: string) => vault.get(key) ?? null,
      setItem: async (key: string, value: string) => { vault.set(key, value) }, removeItem: async (key: string) => { vault.delete(key) } }
    const transport: AuthFetch = async (url, init) => {
      const r = await mf.dispatchFetch(url, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body ? { body: String(init.body) } : {}) })
      const value: unknown = await r.json()
      return { status: r.status, ok: r.ok, json: async () => value }
    }
    const auth = createD1AuthClient({ baseURL: 'http://localhost', storage, clearCredentials: async () => { vault.clear() }, fetch: transport })
    const a = await auth.startGuest()
    let current = true
    let n = 0
    const repo = createD1AccountRepository({ auth, owner: a.userId, isCurrent: () => current, fetch: transport,
      randomBytes: () => new Uint8Array(12).map(() => ++n % 256) })
    expect(await repo.fetchProgress()).toMatchObject({ xpTotal: 0, coins: 0, streak: 0, hearts: BALANCE.hearts.max, brokenOn: null,
      restoreTo: null })
    await db.batch([
      db.prepare("INSERT INTO ledger (account_id, lesson_id, xp, coins) VALUES (?, 'test-grant', 0, 1200)").bind(a.userId),
      db.prepare('UPDATE accounts SET coins = 1200 WHERE id = ?').bind(a.userId),
    ])
    expect(await repo.buyStreakFreeze()).toEqual({ status: 'no_streak' })
    expect(await repo.buyLessonContinue('offer-abcdef01')).toMatchObject({ status: 'purchased' })
    expect(await repo.buyLessonContinue('offer-abcdef01')).toMatchObject({ status: 'already_paid' })
    expect(await repo.purchaseItem('title.flag-fanatic')).toEqual({ status: 'insufficient_funds' })
    await repo.setTimeZone('Europe/Stockholm')
    expect(await repo.fetchTimeZone()).toBe('Europe/Stockholm')
    await expect(repo.setTimeZone('Nowhere/Nothing')).rejects.toThrow('INVALID_TIME_ZONE')
    await expect(repo.submitLesson({ lessonId: 'x', kind: 'lesson', startedAt: 0, answers: [] })).rejects.toThrow('USE_D1_LESSON_QUEUE')
    expect(await repo.fetchSubscription()).toMatchObject({ status: 'none', tier: 'free' })
    // The quest the device shows is the one the server composed and will pay.
    const today = await repo.fetchTodayQuest()
    expect(today.quest.tasks.map(t => t.slot)).toEqual(['locate', 'recognise', 'recall', 'discover', 'perform'])
    expect(today.quest.date).toBe(today.day)
    expect(await repo.fetchTodayQuest()).toEqual(today)
    // "Report a problem" reaches the triage table with a reason and nothing else.
    await repo.reportFact('geo.SE.capital', 'wrong')
    expect(await db.prepare('SELECT fact_id, reason FROM reports WHERE account_id = ?').bind(a.userId).first())
      .toEqual({ fact_id: 'geo.SE.capital', reason: 'wrong' })
    current = false
    await expect(repo.fetchProgress()).rejects.toThrow('Account changed')
  })
})

describe('lessons that end before the last question (real workerd and SQLite)', () => {
  const answersFor = (count: number, choice: 'a' | 'b') =>
    Array.from({ length: count }, (_, slot) => ({ slot, chosenOptionId: choice, elapsedMs: 9000 }))

  it('grades an early exit without counting it as the day\'s lesson', async () => {
    const a = await guest()
    await seed(a.userId, ['short', 'full'], 10)
    const short = await call('/v1/lessons/submit', a.token, { lessonId: 'short', answers: answersFor(3, 'a') })
    expect(short.status).toBe(200)
    const r1 = await short.json() as Receipt
    expect(r1).toMatchObject({ finished: false, reviews: 3, correct: 3, streak: { current: 0, extended: false } })
    expect(r1.quest.completedSlots).not.toContain('perform')
    const full = await (await call('/v1/lessons/submit', a.token, { lessonId: 'full', answers: answersFor(10, 'a') })).json() as Receipt
    expect(full).toMatchObject({ finished: true, streak: { current: 1, extended: true } })
    expect(full.quest.completedSlots).toContain('perform')
    // The early exit did not use up the day's first-lesson bonus.
    expect((await db.prepare('SELECT lessons_today FROM accounts WHERE id = ?').bind(a.userId).first())?.lessons_today).toBe(1)
    const snapshot = await state(a.userId)
    expect(snapshot.reviews).toHaveLength(13)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
  })

  it('treats running out of hearts as a finished lesson, decided by the server\'s own replay', async () => {
    const a = await guest()
    // New facts never cost a heart, so the facts are learnt first; the second lesson
    // then misses five of them, which empties the hearts in the grader's replay.
    await seed(a.userId, ['learn', 'hearts', 'quit'], 10)
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'learn', answers: answersFor(10, 'a') })).status).toBe(200)
    const r = await (await call('/v1/lessons/submit', a.token, { lessonId: 'hearts', answers: answersFor(5, 'b') })).json() as Receipt
    expect(r).toMatchObject({ finished: true, correct: 0, reviews: 5 })
    // Four misses leave a heart: that lesson was ended, not finished.
    const q = await (await call('/v1/lessons/submit', a.token, { lessonId: 'quit', answers: answersFor(4, 'b') })).json() as Receipt
    expect(q).toMatchObject({ finished: false, reviews: 4 })
    expect((await db.prepare('SELECT lessons_today FROM accounts WHERE id = ?').bind(a.userId).first())?.lessons_today).toBe(2)
  })

  it('refuses more answers than were issued and answers to a slot the ticket does not have', async () => {
    const a = await guest()
    await seed(a.userId, ['bounded'], 5)
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'bounded', answers: answersFor(6, 'a') })).status).toBe(400)
    // A lesson adapts as it goes and may be left part-way, so a skipped slot is not an error —
    // but there is no slot 5 on a ticket of five.
    const beyond = [{ slot: 0, chosenOptionId: 'a', elapsedMs: 9000 }, { slot: 5, chosenOptionId: 'a', elapsedMs: 9000 }]
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'bounded', answers: beyond })).status).toBe(400)
    expect((await state(a.userId)).receipts).toHaveLength(0)
  })

  it('issues a lesson focused on one country, and says so when a focus is too narrow', async () => {
    const a = await guest()
    const focused = await call('/v1/lessons/prepare', a.token, { lessonId: 'sweden', locale: 'en', count: 5, focus: { entities: ['SE'] } })
    expect(focused.status).toBe(200)
    const lesson = await focused.json() as { questions: Question[]; request: { focus: unknown } }
    expect(lesson.questions.length).toBeGreaterThanOrEqual(5)
    expect(lesson.questions.every(q => q.item.entityId === 'SE')).toBe(true)
    expect(lesson.request.focus).toEqual({ entities: ['SE'] })
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'nowhere', locale: 'en', count: 5, focus: { entities: [] } })).status).toBe(409)
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'bad', locale: 'en', count: 5, focus: { entities: ['sweden'] } })).status).toBe(400)
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'bad2', locale: 'en', count: 5, focus: { planet: 'Mars' } })).status).toBe(400)
  })

  it('keeps a beginner on the plain way of asking, and bounds that preference', async () => {
    const a = await guest()
    const entities = ['SE', 'NO', 'DK', 'FI', 'DE', 'FR']
    const plain = await call('/v1/lessons/prepare', a.token, { lessonId: 'plain', locale: 'en', count: entities.length,
      maxModifier: 0, focus: { entities, attributes: ['capital'] } })
    expect(plain.status).toBe(200)
    const lesson = await plain.json() as { questions: Question[]; request: { maxModifier?: number } }
    expect(lesson.request.maxModifier).toBe(0)
    expect(lesson.questions).toHaveLength(entities.length)
    expect(new Set(lesson.questions.map(q => q.item.factId))).toEqual(new Set(entities.map(id => `geo.${id}.capital`)))
    for (const question of lesson.questions) {
      const template = learningContent.templates.get(question.item.templateId)
      expect(template, question.item.id).toBeDefined()
      expect(template?.difficultyModifier ?? 0, question.item.id).toBeLessThanOrEqual(0)
    }
    // The preference orders presentations per fact, not the random lesson's harder-question share.
    // Calling codes have no modifier-0 form: preserving all six proves this is not a filter.
    const fallback = await call('/v1/lessons/prepare', a.token, { lessonId: 'fallback', locale: 'en', count: entities.length,
      maxModifier: 0, focus: { entities, attributes: ['calling-code'] } })
    expect(fallback.status).toBe(200)
    const harder = await fallback.json() as { questions: Question[]; request: { maxModifier?: number } }
    expect(harder.request.maxModifier).toBe(0)
    expect(harder.questions).toHaveLength(entities.length)
    expect(new Set(harder.questions.map(q => q.item.factId))).toEqual(new Set(entities.map(id => `geo.${id}.calling-code`)))
    for (const question of harder.questions) {
      expect(learningContent.templates.get(question.item.templateId)?.difficultyModifier, question.item.id).toBeGreaterThan(0)
    }
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'hard', locale: 'en', count: 5, maxModifier: 3 })).status).toBe(400)
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'half', locale: 'en', count: 5, maxModifier: 0.5 })).status).toBe(400)
  })

  it("lets a guest's age band go down to protected, never up, and never on a linked account", async () => {
    const year = new Date().getUTCFullYear()
    const audience = async (token: string, birthYear: number) =>
      call('/v1/account/audience', token, { birthYear })
    const band = async (id: string) =>
      (await db.prepare('SELECT audience FROM accounts WHERE id = ?').bind(id).first<{ audience: string }>())?.audience
    // A parent's year, then the child's: the child's answer wins.
    const tablet = await guest()
    expect((await audience(tablet.token, year - 40)).status).toBe(200)
    expect((await audience(tablet.token, year - 9)).status).toBe(200)
    expect(await band(tablet.userId)).toBe('protected')
    // A protected account never promotes itself.
    expect((await audience(tablet.token, year - 40)).status).toBe(409)
    expect(await band(tablet.userId)).toBe('protected')
    // A linked account belongs to the adult who proved the mailbox; it is not moved.
    const adult = await guest()
    expect((await audience(adult.token, year - 40)).status).toBe(200)
    await db.prepare('INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0)')
      .bind('subject-adult', 'adult', 'adult@example.invalid').run()
    await db.prepare('INSERT INTO identities (subject_id, account_id, linked_at) VALUES (?, ?, 0)').bind('subject-adult', adult.userId).run()
    expect((await audience(adult.token, year - 9)).status).toBe(409)
    expect(await band(adult.userId)).toBe('eligible')
  })

  it('counts finished lessons per chosen focus, which is how a course path follows the account', async () => {
    const a = await guest()
    const prepare = async (lessonId: string, focus?: Record<string, unknown>, node?: string) =>
      (await (await call('/v1/lessons/prepare', a.token, { lessonId, locale: 'en', count: 5, ...(focus ? { focus } : {}), ...(node ? { node } : {}) })).json()) as { questions: Question[] }
    const answer = (questions: Question[], upTo = questions.length) =>
      questions.slice(0, upTo).map((q, slot) => ({ slot, chosenOptionId: q.options[0]!.id, elapsedMs: 9000 }))
    const sweden = { entities: ['SE'] }
    const whole = await prepare('se-whole', sweden)
    const left = await prepare('se-left', sweden)
    const plain = await prepare('plain')
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'se-whole', answers: answer(whole.questions) })).status).toBe(200)
    // Left after two questions: graded, but not finished, so it moves no step.
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'se-left', answers: answer(left.questions, 2) })).status).toBe(200)
    // Finished, but nobody chose its focus: the app's own lesson, not a step.
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'plain', answers: answer(plain.questions) })).status).toBe(200)
    // A course step's lesson names the step, and is counted for it as well as its focus.
    const step = await prepare('se-step', sweden, 'node.first-week.flags')
    expect((await call('/v1/lessons/submit', a.token, { lessonId: 'se-step', answers: answer(step.questions) })).status).toBe(200)
    // Only a step id in the course's own shape.
    expect((await call('/v1/lessons/prepare', a.token, { lessonId: 'bad-node', locale: 'en', count: 5, node: 'drop table' })).status).toBe(400)
    const snapshot = await (await call('/v1/learning/state', a.token)).json() as { finishedByFocus: unknown; finishedByDay: unknown; finishedByNode: unknown }
    expect(snapshot.finishedByFocus).toEqual([{ focus: sweden, finished: 2 }])
    expect(snapshot.finishedByNode).toEqual([{ node: 'node.first-week.flags', finished: 1 }])
    // And per day, for the streak calendar: the three finished lessons, not the early exit.
    const day = (await db.prepare(`SELECT json_extract(result,'$.day') AS day FROM receipts WHERE account_id = ? LIMIT 1`)
      .bind(a.userId).first<{ day: string }>())?.day
    expect(snapshot.finishedByDay).toEqual([{ day, finished: 3 }])
    // Owner-bound like everything else in the snapshot.
    const b = await guest()
    expect(await (await call('/v1/learning/state', b.token)).json()).toMatchObject({ finishedByFocus: [], finishedByNode: [] })
  })

  it('treats exact facts as steering: those first, the rest of the lesson as usual', async () => {
    const a = await guest()
    const quest = await (await call('/v1/quest/today', a.token)).json() as { quest: { tasks: { slot: string; factIds: string[] }[] } }
    const two = quest.quest.tasks.find(t => t.slot === 'discover')!.factIds.slice(0, 2)
    const r = await call('/v1/lessons/prepare', a.token, { lessonId: 'steered', locale: 'en', count: 6, focus: { factIds: two } })
    expect(r.status).toBe(200)
    const lesson = await r.json() as { questions: Question[] }
    expect(lesson.questions).toHaveLength(6)
    expect(new Set(lesson.questions.map(q => q.item.factId)).size).toBe(6)
    expect(lesson.questions.slice(0, two.length).map(q => q.item.factId).sort()).toEqual([...two].sort())
  })
})

describe('achievements the server decides and pays (real workerd and SQLite)', () => {
  const answersFor = (count: number, choice: 'a' | 'b') =>
    Array.from({ length: count }, (_, slot) => ({ slot, chosenOptionId: choice, elapsedMs: 9000 }))

  it('unlocks a perfect lesson once, pays its tier in the lesson row, and ignores a perfect quit', async () => {
    const a = await guest()
    await seed(a.userId, ['quit', 'perfect', 'again'], 10)
    // Three right answers and a quit is not a flawless lesson.
    const quit = await (await call('/v1/lessons/submit', a.token, { lessonId: 'quit', answers: answersFor(3, 'a') })).json() as Receipt
    expect(quit.achievements).toEqual({ unlocked: [], xp: 0, coins: 0 })
    const perfect = await (await call('/v1/lessons/submit', a.token, { lessonId: 'perfect', answers: answersFor(10, 'a') })).json() as Receipt
    expect(perfect.achievements.unlocked).toContainEqual({ achievementId: 'ach.session.perfect', tier: 'bronze' })
    expect(perfect.achievements.xp).toBeGreaterThanOrEqual(BALANCE.xp.achievementByTier.bronze)
    expect(perfect.achievements.coins).toBeGreaterThanOrEqual(BALANCE.coins.achievementByTier.bronze)
    // A replay is the stored receipt; another perfect lesson does not re-cross bronze.
    expect(await (await call('/v1/lessons/submit', a.token, { lessonId: 'perfect', answers: answersFor(10, 'a') })).json()).toEqual(perfect)
    const again = await (await call('/v1/lessons/submit', a.token, { lessonId: 'again', answers: answersFor(10, 'a') })).json() as Receipt
    expect(again.achievements.unlocked.map(u => u.achievementId)).not.toContain('ach.session.perfect')
    const stored = JSON.parse(String((await db.prepare('SELECT achievements FROM accounts WHERE id = ?').bind(a.userId).first())?.achievements)) as
      Record<string, { tier: string | null; value: number }>
    expect(stored['ach.session.perfect']).toMatchObject({ tier: 'bronze', value: 2 })
    const snapshot = await state(a.userId)
    expect(snapshot.account?.xp).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.xp), 0))
    expect(snapshot.account?.coins).toBe(snapshot.ledger.reduce((sum, row) => sum + Number(row.coins), 0))
  })
})

describe('fact reports (real workerd and SQLite)', () => {
  it('files a reason about a shipped fact once, bounded per day, never free text, erased with the account', async () => {
    const a = await guest(), b = await guest()
    const report = { reportId: 'report-0001', factId: 'geo.SE.capital', reason: 'wrong' }
    expect((await call('/v1/reports', a.token, report)).status).toBe(202)
    expect((await call('/v1/reports', a.token, report)).status).toBe(202)
    expect((await db.prepare('SELECT count(*) AS n FROM reports').first())?.n).toBe(1)
    expect((await call('/v1/reports', a.token, { ...report, reportId: 'report-0002', note: 'my name is…' })).status).toBe(400)
    expect((await call('/v1/reports', a.token, { ...report, reportId: 'report-0003', reason: 'boring' })).status).toBe(400)
    expect((await call('/v1/reports', a.token, { ...report, reportId: 'report-0004', factId: 'geo.XX.nothing' })).status).toBe(400)
    for (let i = 0; i < 29; i++) {
      expect((await call('/v1/reports', a.token, { ...report, reportId: `bulk-${String(i).padStart(4, '0')}` })).status).toBe(202)
    }
    expect((await call('/v1/reports', a.token, { ...report, reportId: 'report-0005' })).status).toBe(429)
    // Another learner's budget is their own.
    expect((await call('/v1/reports', b.token, { ...report, reportId: 'report-0001' })).status).toBe(202)
    expect((await call('/v1/account/delete', a.token, {})).status).toBe(200)
    expect((await db.prepare('SELECT count(*) AS n FROM reports WHERE account_id = ?').bind(a.userId).first())?.n).toBe(0)
    expect((await db.prepare('SELECT count(*) AS n FROM reports WHERE account_id = ?').bind(b.userId).first())?.n).toBe(1)
  })
})
