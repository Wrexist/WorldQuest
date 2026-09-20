import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { BALANCE, generateDailyQuest, review, seededRng, type DailyQuest, type MemoryState, type Rating } from '@worldquest/engines'
import { hashToken } from './src/auth'
import { submitLesson } from './src/lessons'
import { learningContent } from './src/learning-content'
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
    // this fail on the Linux runner while passing on Windows for the same commit â€”
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
    // A budget, not a coincidence: 8 reads (account, receipt, ticket, memory, pinned quest,
    // today's claims, today's reviews, today's receipts) plus 7 writes (guard, lesson
    // ledger, reviews, memories, account, receipt, guard delete). Two more writes appear
    // once a quest actually pays a slot — max 6 claims in one statement plus the quest
    // ledger — so the ceiling this protects is 17 against Free's 50 per query.
    expect(statementCount).toBe(15)
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

  describe('daily quest pinning', () => {
    const today = (): string => new Date().toISOString().slice(0, 10)
    // Composed exactly as the device composes it: the real index, an empty memory (so
    // every fact is unseen), and the engine's own generator. A hand-built quest here
    // would test my reading of the shape rather than the shape both sides share.
    const compose = (owner: string, seed = 1): DailyQuest => generateDailyQuest({
      userId: owner, date: today(), index: learningContent, memory: new Map(),
      now: Date.now(), rng: seededRng(seed), recentAccuracy: 0.8,
    })
    const swap = (quest: DailyQuest, at: number, change: Record<string, unknown>): DailyQuest => ({
      ...quest, tasks: quest.tasks.map((task, i) => (i === at ? { ...task, ...change } : task)),
    })
    const realFact = (): string => [...learningContent.facts.keys()][0]!

    it('pins the composed quest and hands the same five back afterwards', async () => {
      const a = await guest()
      const quest = compose(a.userId)
      const first = await call('/v1/quests/pin', a.token, quest)
      expect(first.status).toBe(200)
      expect(await first.json()).toEqual(quest)
      // A retry, a reroll and a second device all get the pinned quest, not a fresh set
      // to farm â€” the same five tasks the first device saw.
      const again = await call('/v1/quests/pin', a.token, quest)
      expect(again.status).toBe(200)
      expect(await again.json()).toEqual(quest)
    })

    it('rejects an eight-slot quest and leaves the day unpinned', async () => {
      const a = await guest()
      const quest = compose(a.userId)
      const eight = { ...quest, tasks: [...quest.tasks, quest.tasks[0]!] }
      expect((await call('/v1/quests/pin', a.token, eight)).status).toBe(400)
      // Refusing must not burn the day: the real quest still pins.
      expect((await call('/v1/quests/pin', a.token, quest)).status).toBe(200)
    })

    it('rejects a cheaper target than the slot canonically has', async () => {
      const a = await guest()
      const quest = compose(a.userId)
      const at = quest.tasks.findIndex(task => task.slot === 'recognise')
      expect(quest.tasks[at]!.factIds.length).toBeGreaterThan(1)
      expect((await call('/v1/quests/pin', a.token, swap(quest, at, { target: 1 }))).status).toBe(400)
    })

    it('rejects a fact that is not content', async () => {
      const a = await guest()
      const quest = compose(a.userId)
      const at = quest.tasks.findIndex(task => task.slot === 'locate')
      expect((await call('/v1/quests/pin', a.token, swap(quest, at, { factIds: ['not.a.fact'], target: 1 }))).status).toBe(400)
    })

    it('rejects a review slot naming a fact the learner knows and is not due', async () => {
      const a = await guest()
      const factId = realFact()
      const quest = compose(a.userId)
      const at = quest.tasks.findIndex(task => task.slot === 'locate')
      // Known and not due until tomorrow: the device could not have drawn this fact for a
      // review slot, so a quest naming it is inventing work that does not exist.
      await db.prepare('INSERT INTO memories (account_id, fact_id, state, revision) VALUES (?,?,?,?)')
        .bind(a.userId, factId, JSON.stringify({ factId, stability: 10, difficulty: 5, reps: 3, lapses: 0,
          lastReviewAt: Date.now(), dueAt: Date.now() + 86_400_000, suspended: false }), 0).run()
      expect((await call('/v1/quests/pin', a.token, swap(quest, at, { factIds: [factId], target: 1 }))).status).toBe(400)
    })

    it('accepts the same fact once it is due', async () => {
      const a = await guest()
      const factId = realFact()
      const quest = compose(a.userId)
      const at = quest.tasks.findIndex(task => task.slot === 'locate')
      await db.prepare('INSERT INTO memories (account_id, fact_id, state, revision) VALUES (?,?,?,?)')
        .bind(a.userId, factId, JSON.stringify({ factId, stability: 10, difficulty: 5, reps: 3, lapses: 0,
          lastReviewAt: Date.now(), dueAt: Date.now() - 1000, suspended: false }), 0).run()
      expect((await call('/v1/quests/pin', a.token, swap(quest, at, { factIds: [factId], target: 1 }))).status).toBe(200)
    })

    it('does not pin a quest for another account', async () => {
      const a = await guest(), b = await guest()
      expect((await call('/v1/quests/pin', b.token, compose(a.userId))).status).toBe(400)
    })

    it('pays the quest from the server own evidence, and only once', async () => {
      const a = await guest()
      const quest = generateDailyQuest({ userId: a.userId, date: today(), index: learningContent,
        memory: new Map(), now: Date.now(), rng: seededRng(2), recentAccuracy: 0.8 })
      expect((await call('/v1/quests/pin', a.token, quest)).status).toBe(200)

      // A ticket whose questions are exactly the facts the first review slot asked for,
      // plus one more to reach the minimum lesson size. The client does not get to name
      // the facts in a real lesson either â€” the ticket does.
      const task = quest.tasks.find(t => t.slot === 'locate')!
      const extra = [...learningContent.facts.keys()].find(id => !task.factIds.includes(id))!
      const facts = [...task.factIds, extra]
      const slots = facts.map((factId, i) => ({ itemId: `q-${i}`, factId, templateId: 'flag-mcq',
        options: ['a', 'b'], correctOptionId: 'a' }))
      await db.prepare('INSERT INTO tickets (account_id, lesson_id, slots) VALUES (?, ?, ?)')
        .bind(a.userId, 'quest-lesson', JSON.stringify(slots)).run()
      const answers = facts.map((_, i) => ({ slot: i, chosenOptionId: 'a', elapsedMs: 5000 }))
      const token = await hashToken(a.token)

      const first = await submitLesson(db, a.userId, token, { lessonId: 'quest-lesson', answers })
      expect(first.questSlots).toContain('locate')
      expect(first.questXpAwarded).toBe(BALANCE.xp.dailyQuestTask * first.questSlots.length)
      const ledger = await db.prepare("SELECT lesson_id FROM ledger WHERE account_id = ? AND lesson_id LIKE 'quest:%'")
        .bind(a.userId).all()
      expect(ledger.results).toHaveLength(first.questSlots.length)

      // The retry a lost response produces: the receipt is returned as written, so the
      // slot count and the XP are the ones already paid rather than a second payment.
      const again = await submitLesson(db, a.userId, token, { lessonId: 'quest-lesson', answers })
      expect(again.questXpAwarded).toBe(first.questXpAwarded)
      const claims = await db.prepare('SELECT COUNT(*) AS n FROM quest_claims WHERE account_id = ?')
        .bind(a.userId).first<{ n: number }>()
      expect(Number(claims?.n)).toBe(first.questSlots.length)
    })

  describe('streak freeze purchase', () => {
    const price = BALANCE.prices.streakFreeze
    const fund = (owner: string, coins: number) =>
      db.prepare('UPDATE accounts SET coins = ? WHERE id = ?').bind(coins, owner).run()
    const buy = (token: string, purchaseId: string) => call('/v1/shop/freeze', token, { purchaseId })
    const wallet = async (owner: string) => ({
      account: await db.prepare('SELECT coins, revision FROM accounts WHERE id = ?').bind(owner).first<{ coins: number; revision: number }>(),
      inventory: await db.prepare('SELECT count FROM inventory WHERE account_id = ?').bind(owner).first<{ count: number }>(),
      receipts: await db.prepare('SELECT purchase_id FROM inventory_receipts WHERE account_id = ?').bind(owner).all(),
    })

    it('sells one freeze at the balance table price', async () => {
      const a = await guest()
      await fund(a.userId, 1000)
      const response = await buy(a.token, 'p1')
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ itemId: 'utility.streak_freeze', count: 1, spent: price, coinBalance: 1000 - price })
      expect(await wallet(a.userId)).toMatchObject({ account: { coins: 1000 - price }, inventory: { count: 1 } })
    })

    it('charges a retried purchase once', async () => {
      const a = await guest()
      await fund(a.userId, 1000)
      await buy(a.token, 'p1')
      // The retry a lost response produces: same purchase id, same answer, no second debit.
      const again = await buy(a.token, 'p1')
      expect(again.status).toBe(200)
      expect(await again.json()).toMatchObject({ count: 1, spent: 0, coinBalance: 1000 - price })
      expect(await wallet(a.userId)).toMatchObject({ account: { coins: 1000 - price }, inventory: { count: 1 } })
    })

    it('charges once when two retries arrive together', async () => {
      const a = await guest()
      await fund(a.userId, 1000)
      const [one, two] = await Promise.all([buy(a.token, 'p1'), buy(a.token, 'p1')])
      expect([one.status, two.status]).toEqual([200, 200])
      const spent = (await Promise.all([one.json(), two.json()]))
        .reduce<number>((sum, body) => sum + Number((body as { spent: number }).spent), 0)
      expect(spent).toBe(price)
      expect(await wallet(a.userId)).toMatchObject({ account: { coins: 1000 - price }, inventory: { count: 1 } })
    })

    it('buys two freezes with two purchases', async () => {
      const a = await guest()
      await fund(a.userId, 1000)
      await buy(a.token, 'p1')
      await buy(a.token, 'p2')
      expect(await wallet(a.userId)).toMatchObject({ account: { coins: 1000 - price * 2 }, inventory: { count: 2 } })
    })

    it('refuses a purchase the balance cannot cover, and changes nothing', async () => {
      const a = await guest()
      await fund(a.userId, price - 1)
      const response = await buy(a.token, 'p1')
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ error: 'CANNOT_AFFORD' })
      const after = await wallet(a.userId)
      expect(after.account?.coins).toBe(price - 1)
      expect(after.inventory).toBeNull()
      expect(after.receipts.results).toHaveLength(0)
    })

    it('does not let a caller name the price', async () => {
      const a = await guest()
      await fund(a.userId, 1000)
      const response = await call('/v1/shop/freeze', a.token, { purchaseId: 'p1', price: 1 })
      expect(response.status).toBe(400)
      expect((await wallet(a.userId)).account?.coins).toBe(1000)
    })
  })
  })
})
