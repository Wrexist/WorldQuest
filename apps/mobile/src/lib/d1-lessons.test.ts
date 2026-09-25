import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { D1PreparedLesson } from '@worldquest/api/d1-learning'

const store = new Map<string, string>()
let online = true
const prepare = vi.fn()
const submit = vi.fn()

vi.mock('./supabase.js', () => ({ currentUser: async () => ({ userId: 'owner-1' }) }))
vi.mock('./connectivity.js', () => ({ isOnline: () => online }))
vi.mock('./query.js', () => ({ invalidateProgress: vi.fn() }))
vi.mock('./backendConfig.js', () => ({ backendConfig: () => ({ kind: 'd1', url: 'https://api.example' }) }))
vi.mock('./d1-auth.js', () => ({ createD1AccountClient: () => ({}) }))
vi.mock('./storage.js', () => ({
  captureStorage: () => ({ id: 'scope-1', userId: 'owner-1', isCurrent: () => true,
    get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v), remove: (k: string) => void store.delete(k) }),
  isRecord: (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v),
  readJson: (k: string) => { const raw = store.get(k); return raw === undefined ? null : JSON.parse(raw) as unknown },
}))
vi.mock('@worldquest/api/d1-learning', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createD1LearningClient: () => ({ prepare, submit, state: async () => ({ memories: [] }) }),
}))

const { takeLesson, toSubmission, submitLesson, receiptSoon, prefetchFocused } = await import('./d1-lessons.js')

const question = (id: string) => ({ item: { id, factId: `fact-${id}`, entityId: 'SE', templateId: 't', difficulty: 1, screenReaderSafe: true },
  promptKey: 'q', promptParams: {}, modality: 'text' as const, isNew: true, timeLimitMs: null,
  options: [{ id: 'a', label: 'A', isCorrect: true }, { id: 'b', label: 'B', isCorrect: false }] })
const issued = (lessonId: string, request: D1PreparedLesson['request']): D1PreparedLesson =>
  ({ lessonId, issuedAt: 1, request, questions: ['i0', 'i1', 'i2', 'i3', 'i4'].map(question) })
const answer = (itemId: string) => ({ itemId, factId: `fact-${itemId}`, templateId: 't', chosenOptionId: 'a', wasCorrect: true, elapsedMs: 4000.4, answeredAt: 2 })

beforeEach(() => {
  store.clear()
  online = true
  // Offline means the request fails, as it does on a device; the flag alone decides nothing.
  prepare.mockReset().mockImplementation(async (request: D1PreparedLesson['request']) => {
    if (!online) throw new TypeError('Failed to fetch')
    return issued(request.lessonId, request)
  })
  submit.mockReset()
})

describe('toSubmission', () => {
  it('maps answers onto the issued slots as a prefix', () => {
    const lesson = issued('l1', { lessonId: 'l1', locale: 'en', count: 5, screenReader: false })
    expect(toSubmission(lesson, [answer('i0'), answer('i1')])).toEqual({ lessonId: 'l1',
      answers: [{ slot: 0, chosenOptionId: 'a', elapsedMs: 4000 }, { slot: 1, chosenOptionId: 'a', elapsedMs: 4000 }] })
  })

  it('refuses answers that are not the issued prefix', () => {
    const lesson = issued('l1', { lessonId: 'l1', locale: 'en', count: 5, screenReader: false })
    expect(() => toSubmission(lesson, [answer('i1')])).toThrow('prefix')
    expect(() => toSubmission(lesson, [answer('elsewhere')])).toThrow('prefix')
  })
})

describe('takeLesson', () => {
  it('prepares a fresh lesson online and asks the server for the focus', async () => {
    const result = await takeLesson({ count: 30, locale: 'sv', screenReader: false, focus: { entities: ['SE'] } })
    expect(result.kind).toBe('ready')
    expect(prepare.mock.calls[0]![0]).toMatchObject({ locale: 'sv', count: 20, focus: { entities: ['SE'] } })
  })

  it('offline, plays a saved lesson for an implied focus but not for a chosen country', async () => {
    await takeLesson({ count: 10, locale: 'en', screenReader: false })
    online = false
    // The quest's facts, or onboarding's start region: the app's suggestion.
    expect(await takeLesson({ count: 10, locale: 'en', screenReader: false, focus: { factIds: ['geo.SE.capital'] } }))
      .toMatchObject({ kind: 'ready' })
    expect(await takeLesson({ count: 10, locale: 'en', screenReader: false, focus: { entities: ['SE', 'NO'], difficulty: { min: 1, max: 3 } } }))
      .toMatchObject({ kind: 'ready' })
    // A country the learner picked is a promise about content; a saved lesson is not it.
    expect(await takeLesson({ count: 10, locale: 'en', screenReader: false, focus: { entities: ['SE'] }, explicitFocus: true }))
      .toEqual({ kind: 'offline' })
  })

  it('says offline, rather than failing, when nothing was pre-fetched', async () => {
    online = false
    expect(await takeLesson({ count: 10, locale: 'en', screenReader: false })).toEqual({ kind: 'offline' })
    // It asked, and the failed request is what said offline.
  })
})

describe('a course step, kept ready', () => {
  const STEP = { entities: ['SE', 'NO', 'US', 'JP', 'BR', 'KE'], attributes: ['flag'] }
  const request = { count: 10, locale: 'en' as const, screenReader: false, focus: STEP }

  it('starts offline from the ticket saved for exactly that step', async () => {
    await prefetchFocused(request)
    online = false
    const result = await takeLesson({ ...request, explicitFocus: true })
    expect(result.kind).toBe('ready')
    // The step itself, not some other saved lesson: the learner pressed THIS step.
    if (result.kind === 'ready') expect(result.lesson.request.focus).toEqual({ attributes: ['flag'], entities: STEP.entities })
  })

  it('still refuses to swap in a different lesson for a chosen step', async () => {
    await takeLesson({ count: 10, locale: 'en', screenReader: false })
    await prefetchFocused(request)
    online = false
    expect(await takeLesson({ ...request, focus: { entities: ['CA'], attributes: ['flag'] }, explicitFocus: true }))
      .toEqual({ kind: 'offline' })
  })

  it('spends the saved ticket online too, rather than issuing another', async () => {
    await prefetchFocused(request)
    expect(prepare).toHaveBeenCalledTimes(1)
    const result = await takeLesson({ ...request, explicitFocus: true })
    expect(result.kind).toBe('ready')
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('keeps one ticket per step, not a pile', async () => {
    await prefetchFocused(request)
    await prefetchFocused(request)
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('does not hand a picture lesson to a screen-reader user', async () => {
    await prefetchFocused(request)
    online = false
    expect(await takeLesson({ ...request, screenReader: true, explicitFocus: true })).toEqual({ kind: 'offline' })
  })

  it('asks nothing while offline, and never throws', async () => {
    online = false
    await expect(prefetchFocused(request)).resolves.toBeUndefined()
    expect(prepare).not.toHaveBeenCalled()
  })
})

describe('submitLesson', () => {
  it('queues the answers durably without waiting for the network', async () => {
    online = false
    const lesson = issued('l2', { lessonId: 'l2', locale: 'en', count: 5, screenReader: false })
    await submitLesson(lesson, [answer('i0')])
    expect(submit).not.toHaveBeenCalled()
    expect(JSON.parse(store.get('d1.lessons.v1')!)).toMatchObject({ entries: [{ lessonId: 'l2' }] })
  })
})

describe('receiptSoon', () => {
  const receipt = (lessonId: string) => ({ lessonId, revision: 1, xpAwarded: 10, coinsAwarded: 5, xpTotal: 10, coinBalance: 5, correct: 1, reviews: 1,
    day: '2026-10-02', finished: true, streak: { current: 1, longest: 1, extended: true, freezeUsed: false, reset: false, milestoneXp: 0, milestoneCoins: 0 } })

  it('returns what the server decided when the answer is quick', async () => {
    const lesson = issued('l3', { lessonId: 'l3', locale: 'en', count: 5, screenReader: false })
    submit.mockImplementation(async (input: { lessonId: string }) => receipt(input.lessonId))
    await submitLesson(lesson, [answer('i0')])
    expect(await receiptSoon('l3', 2000)).toMatchObject({ lessonId: 'l3', finished: true, streak: { extended: true } })
  })

  it('gives up in time and leaves the decision to the device', async () => {
    const lesson = issued('l4', { lessonId: 'l4', locale: 'en', count: 5, screenReader: false })
    submit.mockImplementation(() => new Promise(() => {}))
    await submitLesson(lesson, [answer('i0')])
    const started = Date.now()
    expect(await receiptSoon('l4', 50)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
