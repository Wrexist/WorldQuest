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
import { announceFocusFinished, FOCUS_FINISHED_KEY, MEMORY_KEY, NODE_FINISHED_KEY } from './d1-memory.js'
import { queueUnlocks, type PendingUnlock } from '../features/achievements/pending.js'
import { currentUser } from './supabase.js'
import { markAwardDelivered, peekAwards } from './awards.js'
import { clearLessonRecovery, hasLessonRecovery } from './lesson-recovery.js'

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
  /**
   * The course step this lesson is for, when it is one. Sent with the ticket so the Worker
   * counts the lesson for that step, and matched with the focus when a saved ticket is
   * taken: the first week's mix and its check ask about the same countries, and a lesson
   * issued for one must not be played, or counted, as the other.
   */
  readonly node?: string | undefined
  /** How hard a way of asking to prefer (`difficultyRamp`). Presentation only; not part of the focus. */
  readonly maxModifier?: number | undefined
  /** Where unseen facts start (`difficultyRamp`). An ordering, like the modifier; not part of the focus. */
  readonly introduceFrom?: number | undefined
  /** The level check: ten questions across the five levels. Ignores focus, count and the ramp. */
  readonly placement?: true | undefined
  /** A map drill: every question answered by tapping the place on a map. */
  readonly input?: 'tap' | undefined
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

/** The same focus, in the wire shape — the comparison `take` already makes on a resumed preparation. */
const sameFocus = (a: D1Focus | undefined, b: D1Focus | undefined): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A saved ticket issued for exactly this lesson: the same focus and the same course step (or none). */
const sameLesson = (t: D1PreparedLesson, focus: D1Focus | undefined, node: string | undefined): boolean =>
  sameFocus(t.request.focus, focus) && t.request.node === node

/**
 * Whether a saved ticket can be played by this learner in this language.
 *
 * A lesson issued for a screen reader (every question describable) suits anyone; one
 * issued without may show a flag or a map a VoiceOver user cannot answer.
 */
const fitsRequest = (request: Pick<LessonRequest, 'locale' | 'screenReader' | 'placement' | 'input'>) => (t: D1PreparedLesson) =>
  t.request.locale === request.locale && (t.request.screenReader || !request.screenReader)
  // A level check has a fixed cross-level composition. A saved ordinary lesson
  // cannot stand in for it, nor may an abandoned check become ordinary practice.
  && (t.request.placement === true) === (request.placement === true)
  // A map drill is a different game, not a different topic: never one for the other.
  && (t.request.input === 'tap') === (request.input === 'tap')

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
 * otherwise a fresh one. Focused (a country, a region, the quest, a step on the course
 * path): a ticket saved for EXACTLY that focus if there is one — the course path keeps
 * one ready for its current step (`prefetchFocused`) so the step starts offline —
 * otherwise a fresh one, since the server has to choose which of those facts are due.
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
  // topic the learner chose is not, so that still needs a connection — or a ticket
  // saved for that very focus, which is the same lesson and so no substitution at all.
  const flexible = !request.explicitFocus
  const fits = fitsRequest(request)
  const interrupted = (await queue.inspect()).tickets.find(t => fits(t)
    && sameLesson(t, wanted, request.node) && hasLessonRecovery(t.lessonId))
  if (interrupted) return { kind: 'ready', lesson: interrupted }
  if (focused) {
    // Online or not: the ticket was issued for this focus after the last receipt, so
    // playing it is playing what was asked for. It also retires a ticket a learner took
    // and left before answering anything, which would otherwise hold one of the
    // server's twenty slots for good.
    const exact = (await queue.inspect()).tickets.find((t) => fits(t) && sameLesson(t, wanted, request.node))
    if (exact) return { kind: 'ready', lesson: exact }
  }
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
    if (resumed && fits(resumed) && sameLesson(resumed, wanted, request.node)) {
      return { kind: 'ready', lesson: resumed }
    }
    const lesson = await queue.prepare({
      lessonId: lessonId(),
      locale: request.locale,
      count: clampCount(request.count),
      screenReader: request.screenReader,
      ...(wanted ? { focus: wanted } : {}),
      ...(request.node !== undefined ? { node: request.node } : {}),
      ...(request.maxModifier !== undefined ? { maxModifier: request.maxModifier } : {}),
      ...(request.introduceFrom !== undefined ? { introduceFrom: request.introduceFrom } : {}),
      ...(request.placement === true ? { placement: true as const } : {}),
      ...(request.input === 'tap' ? { input: 'tap' as const } : {}),
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
      await queue.prepare({ lessonId: lessonId(), locale: request.locale, count: clampCount(request.count), screenReader: request.screenReader,
        ...(request.maxModifier !== undefined ? { maxModifier: request.maxModifier } : {}),
        ...(request.introduceFrom !== undefined ? { introduceFrom: request.introduceFrom } : {}) })
    }
  } catch {
    // Next time. Nothing the learner did is at stake here.
  }
}

/**
 * Keep ONE lesson ready for exactly this focus — the course path's current step.
 *
 * The step is the learner's own next task, so it is an explicit focus and `take` will
 * not trade it for some other saved lesson offline (that would be the app quietly
 * playing a different lesson from the one on the button). Without this, Home's one
 * primary action could not start on a plane on a D1 build, which is the thing
 * `PROJECT.md §5.5` says an offline lesson start must do. One ticket, not three: the
 * step changes every couple of lessons, and `take` spends this one when the step starts.
 *
 * Quiet like `prefetchLessons`: a failure only means the next start needs a network.
 */
export function prefetchFocused(request: LessonRequest & { readonly focus: LessonFocus }): Promise<void> {
  return serially(() => prefetchFor(request))
}

async function prefetchFor(request: LessonRequest & { readonly focus: LessonFocus }): Promise<void> {
  if (!isOnline()) return
  try {
    const { queue } = await open()
    await queue.prepare()
    const wanted = wireFocus(request.focus)
    const fits = fitsRequest(request)
    const { tickets } = await queue.inspect()
    if (tickets.some((t) => fits(t) && sameLesson(t, wanted, request.node))) return
    await queue.prepare({
      lessonId: lessonId(),
      locale: request.locale,
      count: clampCount(request.count),
      screenReader: request.screenReader,
      focus: wanted,
      ...(request.node !== undefined ? { node: request.node } : {}),
    })
  } catch {
    // Next time. The step still starts online, and offline it says so plainly.
  }
}

/**
 * The answers, as the Worker's slots: each answer's position in the ticket it was ISSUED in.
 *
 * Sent in the order they were given. The lesson adapts as it goes, so slot 5 may be answered
 * third; what the Worker needs is which question each answer was to and in what order the
 * learner met them. An answer to a question the ticket never held, or one answered twice, is a
 * bug in the caller and is refused rather than sent.
 */
export function toSubmission(lesson: D1PreparedLesson, answers: readonly AnsweredItem[]) {
  const seen = new Set<number>()
  const slots = answers.map((answer) => {
    const slot = lesson.questions.findIndex((q) => q.item.id === answer.itemId)
    if (slot < 0 || seen.has(slot)) throw new Error('Answers are not answers to the issued lesson')
    seen.add(slot)
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
  const scope = captureStorage()
  if (answers.length === 0) { clearLessonRecovery(lesson.lessonId, scope); return }
  const { queue } = await open()
  if (!scope.isCurrent()) throw new AccountChangedError()
  await queue.enqueue(toSubmission(lesson, answers))
  clearLessonRecovery(lesson.lessonId, scope)
  void flushLessons()
}

let flushing: Promise<readonly D1Receipt[]> | null = null

/** Send whatever is queued for the current account. Safe to call at any time. */
export function flushLessons(): Promise<readonly D1Receipt[]> {
  if (flushing) return flushing
  flushing = (async () => {
    if (!isOnline()) return []
    try {
      const { queue, isCurrent } = await open()
      const before = (await queue.inspect()).receipts.length
      await queue.flush()
      const { receipts } = await queue.inspect()
      if (!isCurrent()) throw new AccountChangedError()
      const fresh = receipts.slice(before)
      // Retire predictions before fetching totals that already include these lessons.
      // Include persisted receipts, so an earlier launch's accepted prediction heals too.
      const pending = new Set(peekAwards().filter(a => a.deliveredAt === null).map(a => a.lessonId))
      const delivered = receipts.filter(r => pending.has(r.lessonId))
      for (const receipt of delivered) markAwardDelivered(receipt.lessonId, Date.now())
      if (fresh.length > 0 || delivered.length > 0) {
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

/**
 * Replace the cache with the server's current memory, and its count of finished lessons
 * per chosen focus (what a course path follows). Quiet on failure, like prefetch; says
 * whether it got an answer.
 */
export async function refreshMemory(): Promise<boolean> {
  if (!isOnline()) return false
  try {
    const { client, store } = await open()
    const state = await client.state()
    if (!store.isCurrent()) return false
    store.set(MEMORY_KEY, JSON.stringify(state.memories))
    store.set(FOCUS_FINISHED_KEY, JSON.stringify(state.finishedByFocus))
    store.set(NODE_FINISHED_KEY, JSON.stringify(state.finishedByNode))
    foldDays(store, state.finishedByDay)
    announceFocusFinished()
    return true
  } catch {
    // The previous snapshot stays; the server still decides every grade.
    return false
  }
}

/**
 * The account's finished lessons per day, folded into this device's day log, keeping the
 * higher count per day: the log is what the streak calendar, Profile's week and the
 * daily goal read, and a phone just signed into starts with an empty one. Written by key
 * (`features/profile/useWeekActivity.ts` owns it), like the onboarding record in
 * `d1-age.ts`: a `lib` module importing a feature is a cycle.
 */
const ACTIVITY_KEY = 'activity.byDay.v1'
function foldDays(store: ReturnType<typeof captureStorage>, days: readonly { day: string; finished: number }[]): void {
  if (days.length === 0) return
  let log: Record<string, number> = {}
  try {
    const parsed: unknown = JSON.parse(store.get(ACTIVITY_KEY) ?? '{}')
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) log = { ...(parsed as Record<string, number>) }
  } catch {
    // A log that does not parse is rebuilt from the server's days.
  }
  let changed = false
  for (const { day, finished } of days) {
    if (typeof log[day] !== 'number' || log[day] < finished) {
      log[day] = finished
      changed = true
    }
  }
  if (changed) store.set(ACTIVITY_KEY, JSON.stringify(log))
}

/** The storage scope whose server state has been fetched this launch. */
let refreshedScope: string | null = null

/**
 * The server's state once per account per launch, for what a lesson flush alone never
 * refreshes: a phone that has just signed into an account with history but has played
 * nothing itself yet. Its path, and the memory its first lesson grades against, would
 * otherwise start from nothing until that first lesson synced (`pnpm e2e:d1`).
 */
export async function refreshMemoryOnce(): Promise<void> {
  const scope = captureStorage().id
  if (refreshedScope === scope) return
  if (await refreshMemory()) refreshedScope = scope
}
