import { AccountChangedError } from './ports.js'
import { D1AuthError, type AuthFetch, type createD1AuthClient, type ProtectedStorage } from './d1-auth.js'
import { parseD1Memory, parseD1Question } from './d1-learning-contracts.js'

export type D1Submission = { lessonId: string; answers: readonly { slot: number; chosenOptionId: string | null; elapsedMs: number }[] }
export type D1StreakReceipt = { current: number; longest: number; extended: boolean; freezeUsed: boolean; reset: boolean; milestoneXp: number; milestoneCoins: number }
/** `day`/`streak` arrive from migration 0007 on; receipts queued before it carry neither. */
export type D1QuestReceipt = { completedSlots: string[]; complete: boolean; done: number; total: number; xp: number; coins: number }
export type D1Receipt = { lessonId: string; revision: number; xpAwarded: number; coinsAwarded: number; xpTotal: number; coinBalance: number; correct: number; reviews: number
  day?: string; finished?: boolean; streak?: D1StreakReceipt; quest?: D1QuestReceipt }
export type D1StreakState = { current: number; longest: number; lastActiveDate: string | null; freezesHeld: number }
/** The engines' `LessonFocus`, as the Worker bounds it. Each field only removes facts. */
export type D1Focus = { factIds?: string[]; attributes?: string[]; entities?: string[]; difficulty?: { min?: number; max?: number } }
export type D1PrepareInput = { lessonId: string; locale: 'en' | 'sv'; count: number; screenReader: boolean; focus?: D1Focus }
export type D1PreparedLesson = { lessonId: string; issuedAt: number; questions: ReturnType<typeof parseD1Question>[]; request: D1PrepareInput }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
function submission(value: unknown): D1Submission {
  if (!object(value) || typeof value.lessonId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.lessonId)
    // One answer upward: a lesson that ended early still sends what was answered.
    || !Array.isArray(value.answers) || value.answers.length < 1 || value.answers.length > 20) throw new D1AuthError('INVALID_SUBMISSION')
  const answers = value.answers.map((a: unknown) => {
    if (!object(a) || !integer(a.slot) || a.slot > 19 || !(a.chosenOptionId === null || (typeof a.chosenOptionId === 'string' && a.chosenOptionId.length <= 160))
      || typeof a.elapsedMs !== 'number' || !Number.isFinite(a.elapsedMs) || a.elapsedMs < 0 || a.elapsedMs > 60000) throw new D1AuthError('INVALID_SUBMISSION')
    return { slot: a.slot, chosenOptionId: a.chosenOptionId, elapsedMs: a.elapsedMs }
  }).sort((a, b) => a.slot - b.slot)
  if (new Set(answers.map(a => a.slot)).size !== answers.length) throw new D1AuthError('INVALID_SUBMISSION')
  return { lessonId: value.lessonId, answers }
}
const isoDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
function streakReceipt(value: unknown): D1StreakReceipt {
  if (!object(value) || !integer(value.current) || !integer(value.longest) || typeof value.extended !== 'boolean' || typeof value.freezeUsed !== 'boolean'
    || typeof value.reset !== 'boolean' || !integer(value.milestoneXp) || !integer(value.milestoneCoins)) throw new D1AuthError('INVALID_RESPONSE')
  return { current: value.current, longest: value.longest, extended: value.extended, freezeUsed: value.freezeUsed, reset: value.reset,
    milestoneXp: value.milestoneXp, milestoneCoins: value.milestoneCoins }
}
function streakState(value: unknown): D1StreakState {
  if (!object(value) || !integer(value.current) || !integer(value.longest) || !(value.lastActiveDate === null || isoDay(value.lastActiveDate))
    || !integer(value.freezesHeld)) throw new D1AuthError('INVALID_RESPONSE')
  return { current: value.current, longest: value.longest, lastActiveDate: value.lastActiveDate, freezesHeld: value.freezesHeld }
}
const SLOTS = ['locate', 'recognise', 'recall', 'discover', 'perform']
function questReceipt(value: unknown): D1QuestReceipt {
  if (!object(value) || !Array.isArray(value.completedSlots) || value.completedSlots.length > 5
    || !value.completedSlots.every((s: unknown) => typeof s === 'string' && SLOTS.includes(s)) || typeof value.complete !== 'boolean'
    || !integer(value.done) || !integer(value.total) || value.done > value.total || !integer(value.xp) || !integer(value.coins)) throw new D1AuthError('INVALID_RESPONSE')
  return { completedSlots: value.completedSlots as string[], complete: value.complete, done: value.done, total: value.total, xp: value.xp, coins: value.coins }
}
function receipt(value: unknown): D1Receipt {
  if (!object(value) || typeof value.lessonId !== 'string' || !integer(value.revision) || !integer(value.xpAwarded)
    || !integer(value.coinsAwarded) || !integer(value.xpTotal) || !integer(value.coinBalance) || !integer(value.correct) || !integer(value.reviews)) throw new D1AuthError('INVALID_RESPONSE')
  if ((value.day !== undefined && !isoDay(value.day)) || (value.day === undefined) !== (value.streak === undefined)) throw new D1AuthError('INVALID_RESPONSE')
  return { lessonId: value.lessonId, revision: value.revision, xpAwarded: value.xpAwarded, coinsAwarded: value.coinsAwarded,
    xpTotal: value.xpTotal, coinBalance: value.coinBalance, correct: value.correct, reviews: value.reviews,
    ...(isoDay(value.day) ? { day: value.day, streak: streakReceipt(value.streak) } : {}),
    ...(typeof value.finished === 'boolean' ? { finished: value.finished } : {}),
    ...(value.quest === undefined ? {} : { quest: questReceipt(value.quest) }) }
}
const strings = (v: unknown, pattern: RegExp, max: number): string[] => {
  if (!Array.isArray(v) || v.length > max || !v.every((s: unknown) => typeof s === 'string' && pattern.test(s))) throw new D1AuthError('INVALID_LESSON_REQUEST')
  return v as string[]
}
const band = (v: unknown): number | undefined => {
  if (v === undefined) return undefined
  if (!integer(v) || v < 1 || v > 5) throw new D1AuthError('INVALID_LESSON_REQUEST')
  return v
}
/**
 * Canonical key order, the same as the Worker's schema: the echoed request is compared
 * as JSON, so an equivalent focus written in another order must still match.
 */
function focus(value: unknown): D1Focus | undefined {
  if (value === undefined) return undefined
  if (!object(value) || Object.keys(value).some(k => !['factIds', 'attributes', 'entities', 'difficulty'].includes(k))) throw new D1AuthError('INVALID_LESSON_REQUEST')
  const out: D1Focus = {}
  if (value.factIds !== undefined) out.factIds = strings(value.factIds, /^[a-zA-Z0-9._-]{1,120}$/, 60)
  if (value.attributes !== undefined) out.attributes = strings(value.attributes, /^[a-z-]{1,40}$/, 12)
  if (value.entities !== undefined) out.entities = strings(value.entities, /^[A-Z]{2}$/, 300)
  if (value.difficulty !== undefined) {
    const d = value.difficulty
    if (!object(d) || Object.keys(d).some(k => k !== 'min' && k !== 'max')) throw new D1AuthError('INVALID_LESSON_REQUEST')
    const min = band(d.min), max = band(d.max)
    out.difficulty = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
  }
  return out
}
function prepareInput(value: unknown): D1PrepareInput {
  if (!object(value) || typeof value.lessonId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.lessonId)
    || (value.locale !== 'en' && value.locale !== 'sv') || !integer(value.count) || value.count < 5 || value.count > 20
    || typeof value.screenReader !== 'boolean') throw new D1AuthError('INVALID_LESSON_REQUEST')
  const f = focus(value.focus)
  return { lessonId: value.lessonId, locale: value.locale, count: value.count, screenReader: value.screenReader,
    ...(f === undefined ? {} : { focus: f }) }
}
function prepared(value: unknown): D1PreparedLesson {
  if (!object(value) || typeof value.lessonId !== 'string' || !integer(value.issuedAt) || !Array.isArray(value.questions)
    || value.questions.length < 5 || value.questions.length > 20) throw new D1AuthError('INVALID_RESPONSE')
  const questions = value.questions.map(parseD1Question)
  if (new Set(questions.map(q => q.item.factId)).size !== questions.length) throw new D1AuthError('INVALID_RESPONSE')
  const request = prepareInput(value.request)
  if (request.lessonId !== value.lessonId) throw new D1AuthError('INVALID_RESPONSE')
  return { lessonId: value.lessonId, issuedAt: value.issuedAt, questions, request }
}

/** One owner for the lifetime of the handle; renewal may change its token, never its owner. */
export function createD1LearningClient(options: {
  auth: ReturnType<typeof createD1AuthClient>; owner: string; isCurrent: () => boolean; fetch: AuthFetch
}) {
  const transport = options.fetch
  const assertCurrent = () => { if (!options.isCurrent()) throw new AccountChangedError() }
  async function request(path: string, body?: unknown): Promise<unknown> {
      assertCurrent()
      const session = await options.auth.ensureSession()
      assertCurrent()
      if (session.userId !== options.owner) throw new AccountChangedError()
      const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000)
      try {
        const response = await transport(options.auth.endpoint + path, { method: body === undefined ? 'GET' : 'POST', signal: abort.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
        const value = await response.json()
        assertCurrent()
        if (!response.ok) throw new D1AuthError(object(value) && typeof value.error === 'string' ? value.error : 'SERVICE_UNAVAILABLE', response.status)
        return value
      } finally { clearTimeout(timeout) }
  }
  return {
    owner: options.owner,
    prepare: async (input: D1PrepareInput) => {
      const value = prepared(await request('/v1/lessons/prepare', prepareInput(input)))
      if (JSON.stringify(value.request) !== JSON.stringify(prepareInput(input))) throw new D1AuthError('INVALID_RESPONSE')
      return value
    },
    state: async () => {
      const value = await request('/v1/learning/state')
      if (!object(value) || !integer(value.revision) || !integer(value.xp) || !integer(value.coins) || !Array.isArray(value.memories)
        || value.memories.length > 1000) throw new D1AuthError('INVALID_RESPONSE')
      return { revision: value.revision, xp: value.xp, coins: value.coins, memories: value.memories.map(parseD1Memory),
        ...(value.streak === undefined ? {} : { streak: streakState(value.streak) }), timeZone: typeof value.timeZone === 'string' ? value.timeZone : 'UTC' }
    },
    submit: async (input: D1Submission): Promise<D1Receipt> => {
        const parsed = submission(input), result = receipt(await request('/v1/lessons/submit', parsed))
        if (result.lessonId !== parsed.lessonId) throw new D1AuthError('INVALID_RESPONSE')
        return result
    },
  }
}

type QueueState = { version: 1; owner: string; entries: D1Submission[]; receipts: D1Receipt[]; tickets: D1PreparedLesson[]; preparing: D1PrepareInput | null }
/** Persisted answers and their acknowledgment share a single atomic storage value. */
export function createD1LessonQueue(options: {
  key: string; owner: string; storage: ProtectedStorage; isCurrent: () => boolean
  submit: (input: D1Submission) => Promise<D1Receipt>
  prepare: (input: D1PrepareInput) => Promise<D1PreparedLesson>
}) {
  let chain: Promise<void> = Promise.resolve(), flushing: Promise<void> | null = null, preparing = false
  const check = () => { if (!options.isCurrent()) throw new AccountChangedError() }
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work)
    chain = next.then(() => {}, () => {})
    return next
  }
  async function load(): Promise<QueueState> {
    check()
    const raw = await options.storage.getItem(options.key)
    check()
    if (raw === null) return { version: 1, owner: options.owner, entries: [], receipts: [], tickets: [], preparing: null }
    try {
      const value: unknown = JSON.parse(raw)
      if (!object(value) || value.version !== 1 || value.owner !== options.owner || !Array.isArray(value.entries) || !Array.isArray(value.receipts)
        || value.entries.length > 200 || value.receipts.length > 100) throw new Error('Invalid queue')
      const entries = value.entries.map(submission), receipts = value.receipts.map(receipt)
      if (new Set(entries.map(e => e.lessonId)).size !== entries.length) throw new Error('Duplicate queue IDs')
      if (value.tickets !== undefined && (!Array.isArray(value.tickets) || value.tickets.length > 20)) throw new Error('Invalid ticket cache')
      const tickets = (value.tickets ?? []).map(prepared)
      if (new Set(tickets.map(t => t.lessonId)).size !== tickets.length) throw new Error('Duplicate tickets')
      return { version: 1, owner: options.owner, entries, receipts, tickets,
        preparing: value.preparing === undefined || value.preparing === null ? null : prepareInput(value.preparing) }
    } catch { throw new D1AuthError('QUEUE_INVALID') }
  }
  async function save(value: QueueState) {
    check(); await options.storage.setItem(options.key, JSON.stringify(value)); check()
  }
  return {
    inspect: () => serial(load),
    prepare: async (input?: D1PrepareInput): Promise<D1PreparedLesson | null> => {
      if (preparing) throw new D1AuthError('AUTH_BUSY')
      preparing = true
      try {
        const next = await serial(async () => {
          const state = await load(), wanted = input === undefined ? state.preparing : prepareInput(input)
          if (!wanted) return null
          if (state.preparing && JSON.stringify(state.preparing) !== JSON.stringify(wanted)) throw new D1AuthError('PREPARATION_PENDING')
          const cached = state.tickets.find(t => t.lessonId === wanted.lessonId)
          if (cached && JSON.stringify(cached.request) !== JSON.stringify(wanted)) throw new D1AuthError('IDEMPOTENCY_CONFLICT')
          if (cached) return { cached, wanted }
          if (state.entries.some(e => e.lessonId === wanted.lessonId) || state.receipts.some(r => r.lessonId === wanted.lessonId)) throw new D1AuthError('LESSON_ALREADY_SYNCED')
          if (state.tickets.length >= 20) throw new D1AuthError('TICKET_LIMIT')
          await save({ ...state, preparing: wanted })
          return { cached: null, wanted }
        })
        if (!next) return null
        if (next.cached) return next.cached
        const ticket = prepared(await options.prepare(next.wanted))
        if (JSON.stringify(ticket.request) !== JSON.stringify(next.wanted)) throw new D1AuthError('INVALID_RESPONSE')
        await serial(async () => {
          const state = await load()
          if (state.preparing?.lessonId !== ticket.lessonId) throw new D1AuthError('QUEUE_CHANGED')
          await save({ ...state, preparing: null, tickets: [...state.tickets, ticket] })
        })
        return ticket
      } finally { preparing = false }
    },
    enqueue: (input: D1Submission) => serial(async () => {
      const item = submission(input), state = await load()
      const prior = state.entries.find(e => e.lessonId === item.lessonId)
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(item)) throw new D1AuthError('IDEMPOTENCY_CONFLICT')
        return
      }
      if (state.receipts.some(r => r.lessonId === item.lessonId)) throw new D1AuthError('LESSON_ALREADY_SYNCED')
      if (state.entries.length >= 200) throw new D1AuthError('QUEUE_FULL')
      await save({ ...state, entries: [...state.entries, item], tickets: state.tickets.filter(ticket => ticket.lessonId !== item.lessonId) })
    }),
    flush: (): Promise<void> => {
      if (flushing) return flushing
      const work = async () => {
        // Bound a wake-up; the host schedules another when work remains.
        for (let count = 0; count < 20; count++) {
          const state = await serial(load), item = state.entries[0]
          if (!item) return
          check()
          const result = receipt(await options.submit(item))
          if (result.lessonId !== item.lessonId) throw new D1AuthError('INVALID_RESPONSE')
          check()
          await serial(async () => {
            const current = await load()
            const pending = current.entries.find(e => e.lessonId === item.lessonId)
            if (!pending || JSON.stringify(pending) !== JSON.stringify(item)) throw new D1AuthError('QUEUE_CHANGED')
            await save({ ...current, entries: current.entries.filter(e => e.lessonId !== item.lessonId),
              receipts: [...current.receipts.filter(r => r.lessonId !== result.lessonId), result].slice(-100) })
          })
        }
      }
      flushing = work().finally(() => { flushing = null })
      return flushing
    },
  }
}
