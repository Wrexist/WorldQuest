/**
 * Lessons on the D1 Worker: issued by the server, answered here, graded there.
 *
 * The Worker grades only lessons it issued (tickets), so on a D1 build the lesson
 * screen does not compose its own questions. It takes a ticket — prepared online, or
 * one of a few pre-fetched so a lesson still starts on a plane — plays it, and queues
 * the answers. The queue (`createD1LessonQueue`) is persisted before anything is
 * acknowledged and replays after a lost response without paying twice.
 *
 * Everything here is scoped to the account the storage layer says is current, and a
 * handle opened for one owner refuses to act once the scope has moved.
 *
 * The server's memory is cached per account (L01): the lesson screen grades
 * optimistically against it, and the next lesson's due reviews are the server's.
 */

import { AccountChangedError } from '@worldquest/api'
import { D1AuthError } from '@worldquest/api/d1-auth'
import {
  createD1LearningClient,
  createD1LessonQueue,
  type D1Focus,
  type D1PreparedLesson,
  type D1Receipt,
} from '@worldquest/api/d1-learning'
import type { AnsweredItem, LessonFocus } from '@worldquest/engines'
import { backendConfig } from './backendConfig.js'
import { isOnline } from './connectivity.js'
import { invalidateProgress } from './query.js'
import { captureStorage } from './storage.js'
import { MEMORY_KEY } from './d1-memory.js'
import { queueUnlocks, type PendingUnlock } from '../features/achievements/pending.js'
import { currentUser } from './supabase.js'

const QUEUE_KEY = 'd1.lessons.v1'
/** Unfocused lessons kept ready for offline starts. Well inside the server's 20. */
const READY = 3

/** An idempotency key for a lesson. Opaque; it only has to be unique per account. */
const lessonId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

type Handles = {
  readonly owner: string
  readonly isCurrent: () => boolean
  readonly queue: ReturnType<typeof createD1LessonQueue>
  readonly client: ReturnType<typeof createD1LearningClient>
  readonly store: ReturnType<typeof captureStorage>
}

let cached: { readonly id: string; readonly handles: Handles } | null = null

async function open(): Promise<Handles> {
  const { userId } = await currentUser()
  const store = captureStorage()
  if (store.userId !== userId || !store.isCurrent()) throw new AccountChangedError()
  if (cached && cached.id === store.id && cached.handles.isCurrent()) return cached.handles
  // Loaded lazily, like the account client: native crypto must not reach legacy builds.
  const { createD1AccountClient } = await import('./d1-auth.js')
  const auth = createD1AccountClient(backendConfig().url)
  const client = createD1LearningClient({ auth, owner: userId, isCurrent: store.isCurrent, fetch: (url, init) => fetch(url, init) })
  const queue = createD1LessonQueue({
    key: QUEUE_KEY,
    owner: userId,
    isCurrent: store.isCurrent,
    storage: {
      getItem: async (key) => store.get(key),
      setItem: async (key, value) => store.set(key, value),
      removeItem: async (key) => store.remove(key),
    },
    submit: client.submit,
    prepare: client.prepare,
  })
  const handles = { owner: userId, isCurrent: store.isCurrent, queue, client, store }
  cached = { id: store.id, handles }
  return handles
}

export type LessonRequest = {
  readonly count: number
  readonly locale: 'en' | 'sv'
  readonly screenReader: boolean
  readonly focus?: LessonFocus | undefined
  /**
   * The focus is the learner's own choice (a country, a region, a topic, a difficulty
   * they picked), not one the app implied from onboarding or the daily quest. Only an
   * implied focus may be traded for a saved lesson when offline.
   */
  readonly explicitFocus?: boolean | undefined
}

/** The engines' focus, in the wire shape (mutable arrays, absent fields absent). */
function wireFocus(focus: LessonFocus): D1Focus {
  const d = focus.difficulty
  return {
    ...(focus.factIds ? { factIds: [...focus.factIds] } : {}),
    ...(focus.attributes ? { attributes: [...focus.attributes] } : {}),
    ...(focus.entities ? { entities: [...focus.entities] } : {}),
    ...(d ? { difficulty: { ...(d.min === undefined ? {} : { min: d.min }), ...(d.max === undefined ? {} : { max: d.max }) } } : {}),
  }
}

const clampCount = (count: number): number => Math.max(5, Math.min(20, Math.round(count)))

/**
 * One preparation at a time. The queue holds a single persisted "preparing" slot, and a
 * lesson start racing a background prefetch would otherwise meet it busy.
 */
let preparing: Promise<unknown> = Promise.resolve()
function serially<T>(work: () => Promise<T>): Promise<T> {
  const next = preparing.then(work, work)
  preparing = next.catch(() => {})
  return next
}

export type TakeResult =
  | { readonly kind: 'ready'; readonly lesson: D1PreparedLesson }
  /** Offline with nothing pre-fetched: the one lesson this device cannot start. */
  | { readonly kind: 'offline' }
  /** The focus asked for fewer than five questions' worth of facts. */
  | { readonly kind: 'too-narrow' }

/**
 * A lesson to play now.
 *
 * Unfocused: a pre-fetched ticket in this language and presentation if there is one,
 * otherwise a fresh one. Focused (a country, a region, the quest): always fresh, since
 * the server has to choose which of those facts are due.
 */
export function takeLesson(request: LessonRequest): Promise<TakeResult> {
  return serially(() => take(request))
}

async function take(request: LessonRequest): Promise<TakeResult> {
  const { queue } = await open()
  const focused = request.focus !== undefined && Object.keys(request.focus).length > 0
  const wanted = focused ? wireFocus(request.focus!) : undefined
  // A focus the app implied (onboarding's start region and level, the daily quest's
  // facts) is a preference: offline, a saved lesson is the right answer. A place or
  // topic the learner chose is not, so that still needs a connection.
  const flexible = !request.explicitFocus
  // A lesson issued for a screen reader (every question describable) suits anyone; one
  // issued without may show a flag or a map a VoiceOver user cannot answer.
  const fits = (t: D1PreparedLesson) => t.request.locale === request.locale && (t.request.screenReader || !request.screenReader)
  /**
   * A saved lesson for this request: an unfocused one first, and for an implied focus
   * any other left over (a lesson prepared for a focus and then not played, which would
   * otherwise hold one of the server's twenty ticket slots for good).
   */
  const saved = async (anyFocus: boolean) => {
    const { tickets } = await queue.inspect()
    return tickets.find((t) => fits(t) && t.request.focus === undefined)
      ?? (anyFocus ? tickets.find(fits) : undefined)
  }
  if (!focused) {
    const ready = await saved(false)
    if (ready) return { kind: 'ready', lesson: ready }
  }
  const offline = async (): Promise<TakeResult> => {
    const fallback = flexible ? await saved(true) : undefined
    return fallback ? { kind: 'ready', lesson: fallback } : { kind: 'offline' }
  }
  // Known to be offline, with a saved lesson that will do: no request, so nothing is left
  // pending for a later launch to finish.
  if (!isOnline() && flexible) {
    const fallback = await saved(true)
    if (fallback) return { kind: 'ready', lesson: fallback }
  }
  // Otherwise asked, not assumed: the request itself is the connectivity test. A probe
  // is an estimate that can be stale for a moment, and a wrong "offline" would refuse a
  // lesson the network could have served.
  try {
    // A preparation an earlier launch left pending is finished first (the queue holds
    // one), and used if it is the lesson being asked for now.
    const resumed = await queue.prepare()
    if (resumed && fits(resumed) && JSON.stringify(resumed.request.focus) === JSON.stringify(wanted)) {
      return { kind: 'ready', lesson: resumed }
    }
    const lesson = await queue.prepare({
      lessonId: lessonId(),
      locale: request.locale,
      count: clampCount(request.count),
      screenReader: request.screenReader,
      ...(wanted ? { focus: wanted } : {}),
    })
    if (!lesson) return offline()
    return { kind: 'ready', lesson }
  } catch (error) {
    if (error instanceof D1AuthError && error.code === 'FOCUS_TOO_NARROW') return { kind: 'too-narrow' }
    // Anything the server did not answer (no route, a timeout) is being offline; an
    // answer it did give (a D1AuthError) or an account change is not.
    if (!(error instanceof D1AuthError) && !(error instanceof AccountChangedError)) return offline()
    throw error
  }
}

/**
 * Keep a few unfocused lessons ready for offline starts. Quiet by design: this runs
 * behind the learner's back, and a failure only means the next start needs a network.
 */
export function prefetchLessons(request: Omit<LessonRequest, 'focus'>): Promise<void> {
  return serially(() => prefetch(request))
}

async function prefetch(request: Omit<LessonRequest, 'focus'>): Promise<void> {
  if (!isOnline()) return
  try {
    const { queue } = await open()
    // Resume a preparation a previous launch started, before asking for another.
    await queue.prepare()
    for (let i = 0; i < READY; i++) {
      const { tickets } = await queue.inspect()
      const matching = tickets.filter((t) => t.request.locale === request.locale
        && t.request.screenReader === request.screenReader && t.request.focus === undefined)
      if (matching.length >= READY) return
      await queue.prepare({ lessonId: lessonId(), locale: request.locale, count: clampCount(request.count), screenReader: request.screenReader })
    }
  } catch {
    // Next time. Nothing the learner did is at stake here.
  }
}

/**
 * The answers, as the Worker's slots: each answer's position in the ticket.
 *
 * The lesson machine answers in order, so this is a prefix — the only shape the Worker
 * accepts. Anything else is a bug in the caller and is refused rather than sent.
 */
export function toSubmission(lesson: D1PreparedLesson, answers: readonly AnsweredItem[]) {
  const slots = answers.map((answer, i) => {
    const slot = lesson.questions.findIndex((q) => q.item.id === answer.itemId)
    if (slot !== i) throw new Error('Answers are not a prefix of the issued lesson')
    return { slot, chosenOptionId: answer.chosenOptionId, elapsedMs: Math.max(0, Math.min(60_000, Math.round(answer.elapsedMs))) }
  })
  return { lessonId: lesson.lessonId, answers: slots }
}

/**
 * Queue a played lesson, then try to send it.
 *
 * Resolves once the answers are durably queued, never on the network: the lesson has
 * already ended for the learner, and the summary must not wait for a server. The
 * receipt, when it arrives, refreshes progress and the cached memory.
 */
export async function submitLesson(lesson: D1PreparedLesson, answers: readonly AnsweredItem[]): Promise<void> {
  if (answers.length === 0) return
  const { queue } = await open()
  await queue.enqueue(toSubmission(lesson, answers))
  void flushLessons()
}

let flushing: Promise<readonly D1Receipt[]> | null = null

/** Send whatever is queued for the current account. Safe to call at any time. */
export function flushLessons(): Promise<readonly D1Receipt[]> {
  if (flushing) return flushing
  flushing = (async () => {
    if (!isOnline()) return []
    try {
      const { queue } = await open()
      const before = (await queue.inspect()).receipts.length
      await queue.flush()
      const { receipts } = await queue.inspect()
      const fresh = receipts.slice(before)
      if (fresh.length > 0) {
        // The server's badges get their cards: the next lesson end reads this queue,
        // and the one just finished reads it after waiting for its receipt.
        queueUnlocks(fresh.flatMap((r) => r.achievements?.unlocked ?? [])
          .map((u) => ({ achievementId: u.achievementId, tier: u.tier as PendingUnlock['tier'] })))
        invalidateProgress()
        await refreshMemory()
      }
      return fresh
    } catch {
      return []
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/**
 * The receipt for a just-finished lesson, waiting at most `ms` for it.
 *
 * The celebrations after a lesson should say what the server decided (did this finish
 * the quest, did it extend the streak), and online the answer is normally back before
 * the learner has read the summary. Offline or slow, this returns null in time and the
 * caller falls back to the device's own reading, as before.
 */
export async function receiptSoon(id: string, ms: number): Promise<D1Receipt | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  const answer = (async () => {
    await flushLessons()
    return receiptFor(id)
  })().catch(() => null)
  return Promise.race([answer, timeout])
}

/** The receipt for a lesson, if the server has answered for it on this device. */
export async function receiptFor(id: string): Promise<D1Receipt | null> {
  const { queue } = await open()
  return (await queue.inspect()).receipts.find((r) => r.lessonId === id) ?? null
}

// ── memory (L01) — read by `d1-memory.ts`, written here ─────────────────────

/** Replace the cache with the server's current memory. Quiet on failure, like prefetch. */
export async function refreshMemory(): Promise<void> {
  if (!isOnline()) return
  try {
    const { client, store } = await open()
    const state = await client.state()
    if (!store.isCurrent()) return
    store.set(MEMORY_KEY, JSON.stringify(state.memories))
  } catch {
    // The previous snapshot stays; the server still decides every grade.
  }
}
