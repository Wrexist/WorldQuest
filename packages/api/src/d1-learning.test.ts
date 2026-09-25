import { describe, expect, it, vi } from 'vitest'
import { createD1LessonQueue, type D1Submission, type D1Receipt, type D1PrepareInput, type D1PreparedLesson } from './d1-learning.js'
const input: D1Submission = { lessonId: 'offline-1', answers: Array.from({ length: 5 }, (_, slot) => ({ slot, chosenOptionId: 'a', elapsedMs: 9000 })) }
const result: D1Receipt = { lessonId: input.lessonId, revision: 1, xpAwarded: 80, coinsAwarded: 10, xpTotal: 80, coinBalance: 10, correct: 5, reviews: 5 }
function harness() {
  const values = new Map<string, string>()
  let current = true
  const storage = { getItem: async (key: string) => values.get(key) ?? null,
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }), removeItem: async (key: string) => { values.delete(key) } }
  const submit = vi.fn(async (item: D1Submission) => ({ ...result, lessonId: item.lessonId }))
  const prepare = vi.fn(async (request: D1PrepareInput): Promise<D1PreparedLesson> => ({ lessonId: request.lessonId, request, issuedAt: 1,
    questions: input.answers.map(answer => ({ item: { id: 'item-' + answer.slot, factId: 'fact-' + answer.slot, entityId: 'entity', templateId: 'template', difficulty: 1, screenReaderSafe: true },
      promptKey: 'question', promptParams: {}, modality: 'text', isNew: true, timeLimitMs: null,
      options: [{ id: 'a', label: 'A', isCorrect: true }, { id: 'b', label: 'B', isCorrect: false }] })) }))
  const create = () => createD1LessonQueue({ key: 'd1.owner.queue', owner: 'owner', isCurrent: () => current, storage, submit, prepare })
  return { values, storage, submit, prepare, create, switchAccount: () => { current = false } }
}
describe('D1 durable offline submissions', () => {
  it('acknowledges offline completion only after persistence and survives restart', async () => {
    const h = harness(), queue = h.create()
    h.storage.setItem.mockRejectedValueOnce(new Error('disk full'))
    await expect(queue.enqueue(input)).rejects.toThrow('disk full')
    expect(h.values.size).toBe(0)
    await queue.enqueue(input)
    expect(h.submit).not.toHaveBeenCalled()
    expect((await h.create().inspect()).entries).toEqual([input])
  })
  it('retries the identical ID and answers after a lost response', async () => {
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    h.submit.mockRejectedValueOnce(new Error('lost response'))
    await expect(queue.flush()).rejects.toThrow('lost response')
    await h.create().flush()
    expect(h.submit.mock.calls.map(call => call[0])).toEqual([input, input])
    expect((await queue.inspect()).entries).toHaveLength(0)
    expect((await queue.inspect()).receipts).toEqual([result])
  })
  it('retains the submission when persisting the server acknowledgment fails', async () => {
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    h.storage.setItem.mockRejectedValueOnce(new Error('disk full'))
    await expect(queue.flush()).rejects.toThrow('disk full')
    expect((await queue.inspect()).entries).toEqual([input])
    await h.create().flush()
    expect(h.submit).toHaveBeenCalledTimes(2)
  })
  it('rejects altered duplicates and malformed stored work without deleting evidence', async () => {
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    await expect(queue.enqueue({ ...input, answers: input.answers.map(a => ({ ...a, elapsedMs: 8000 })) })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    h.values.set('d1.owner.queue', '{corrupted')
    await expect(queue.inspect()).rejects.toThrow('QUEUE_INVALID')
    expect(h.values.get('d1.owner.queue')).toBe('{corrupted')
  })
  it('keeps the server day and streak on a receipt, and refuses half of one', async () => {
    const streak = { current: 7, longest: 7, extended: true, freezeUsed: false, reset: false, milestoneXp: 50, milestoneCoins: 25 }
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    const quest = { completedSlots: ['perform'], complete: false, done: 1, total: 5, xp: 10, coins: 0 }
    h.submit.mockResolvedValueOnce({ ...result, day: '2026-10-02', streak, quest })
    await queue.flush()
    expect((await queue.inspect()).receipts).toEqual([{ ...result, day: '2026-10-02', streak, quest }])
    const other = harness(), broken = other.create(); await broken.enqueue(input)
    other.submit.mockResolvedValueOnce({ ...result, day: '2026-10-02' })
    await expect(broken.flush()).rejects.toThrow('INVALID_RESPONSE')
    expect((await broken.inspect()).entries).toEqual([input])
  })
  it('keeps old work after an account switch during a request', async () => {
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    h.submit.mockImplementationOnce(async () => { h.switchAccount(); return result })
    await expect(queue.flush()).rejects.toThrow('Account changed')
    const saved: unknown = JSON.parse(h.values.get('d1.owner.queue')!)
    expect(saved).toMatchObject({ entries: [input], receipts: [] })
    await expect(queue.flush()).rejects.toThrow('Account changed')
    expect(h.submit).toHaveBeenCalledOnce()
  })
  it('serializes duplicate flushes while accepting a new offline lesson during the request', async () => {
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    let finish!: (value: D1Receipt) => void
    h.submit.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const first = queue.flush(), duplicate = queue.flush()
    expect(first).toBe(duplicate)
    await vi.waitFor(() => expect(h.submit).toHaveBeenCalledOnce())
    await queue.enqueue({ ...input, lessonId: 'offline-2' })
    finish(result); await first
    expect(h.submit).toHaveBeenCalledTimes(2)
    expect((await queue.inspect()).receipts.map(r => r.lessonId)).toEqual(['offline-1', 'offline-2'])
  })
  it('refuses another owner opening a queue and rejects a mismatched receipt', async () => {
    const h = harness(), queue = h.create(); await queue.enqueue(input)
    const other = createD1LessonQueue({ key: 'd1.owner.queue', owner: 'different', storage: h.storage, isCurrent: () => true, submit: h.submit, prepare: h.prepare })
    await expect(other.inspect()).rejects.toThrow('QUEUE_INVALID')
    h.submit.mockResolvedValueOnce({ ...result, lessonId: 'wrong' })
    await expect(queue.flush()).rejects.toThrow('INVALID_RESPONSE')
    expect((await queue.inspect()).entries).toEqual([input])
  })
  it('recovers a prepared lesson after a lost response and starts it offline after restart', async () => {
    const h = harness(), queue = h.create()
    const request: D1PrepareInput = { lessonId: input.lessonId, locale: 'sv', count: 5, screenReader: true }
    h.prepare.mockRejectedValueOnce(new Error('lost response'))
    await expect(queue.prepare(request)).rejects.toThrow('lost response')
    expect((await h.create().inspect()).preparing).toEqual(request)
    await h.create().prepare()
    expect(h.prepare.mock.calls.map(call => call[0])).toEqual([request, request])
    const offline = await h.create().inspect()
    expect(offline.tickets).toHaveLength(1)
    expect(offline.preparing).toBeNull()
    await expect(queue.prepare({ ...request, locale: 'en' })).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    await queue.enqueue(input)
    expect((await queue.inspect()).tickets).toHaveLength(0)
    expect((await queue.inspect()).entries).toEqual([input])
  })
})
