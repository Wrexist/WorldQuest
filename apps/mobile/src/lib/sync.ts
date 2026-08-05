/**
 * The sync adapter.
 *
 * Queue RULES live in `@worldquest/engines/sync` and are unit-tested. This file owns
 * only persistence and the network call, which is the part that genuinely needs a
 * device.
 */

import {
  type QueuedMutation,
  type SyncQueue,
  acknowledge,
  backoffMs,
  emptyQueue,
  enqueue,
  fail,
  nextBatch,
  retryParked,
} from '@worldquest/engines'
import type { AnsweredItem } from '@worldquest/engines'
import { submitLesson } from '@worldquest/api'
import { currentUser, isConfigured, supabase } from './supabase.js'
import { isOnline, onConnectivityChange } from './connectivity.js'
import { invalidateProgress } from './query.js'
import { readJson, writeJson } from './storage.js'

const QUEUE_KEY = 'sync.queue.v1'

/**
 * Restored from disk on first use.
 *
 * This is the whole reason the queue exists. A lesson finished in a tunnel has to
 * survive the app being killed on the walk home — an in-memory queue silently loses
 * the XP a user earned, and they never find out why their streak broke.
 */
let queue: SyncQueue = readJson<SyncQueue>(QUEUE_KEY) ?? emptyQueue()

function commit(next: SyncQueue): void {
  queue = next
  writeJson(QUEUE_KEY, queue)
  for (const listener of listeners) listener()
}

const listeners = new Set<() => void>()

/** Fires whenever the queue changes, so Settings can show what is waiting. */
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * When each failed mutation may next be tried, by id.
 *
 * In memory rather than on disk on purpose. A backoff exists to stop us hammering a
 * server that is struggling right now, and "right now" does not survive an app
 * restart — persisting it would make a user who reopened the app wait out a delay
 * aimed at a server that has probably recovered.
 *
 * `backoffMs` had no caller at all before this: `flush()` failed a mutation and the
 * very next flush retried it immediately, so a failing server got five attempts back
 * to back and the mutation parked in about a second.
 */
const nextAttemptAt = new Map<string, number>()

/**
 * Jitter, so a fleet of clients does not sync in lockstep after an outage.
 *
 * `Math.random` is correct HERE and banned three metres away: the engines are pure and
 * take an injected `Rng`, and this file is the impure adapter that supplies it.
 */
const ready = (mutation: QueuedMutation, now: number): boolean =>
  (nextAttemptAt.get(mutation.id) ?? 0) <= now

export type LessonSubmission = {
  lessonId: string
  kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
  startedAt: number
  answers: readonly AnsweredItem[]
  /**
   * Hearts this lesson cost, cumulatively.
   *
   * The one field here the server cannot re-derive. Correctness it decides from the
   * answer key and timing it clamps, but whether a heart was charged depends on whether
   * the ITEM was new to this user at the moment it was shown, which is a property of the
   * lesson the client composed. So it is reported, and treated as a statistic rather than
   * as a reward input: nothing is paid or withheld on the strength of it, which is what
   * makes trusting it acceptable.
   */
  heartsLost: number
}

/**
 * Enqueue a finished lesson. Never awaits the network: a lesson completing must not
 * depend on connectivity, and the queue replays it when the connection returns.
 */
export function enqueueLesson(submission: LessonSubmission): void {
  commit(
    enqueue(queue, {
      id: submission.lessonId, // the server's idempotency key
      kind: 'lesson_complete',
      payload: submission,
      clientTs: Date.now(),
    }),
  )
  void flush()
}

/**
 * The flush in progress, if any.
 *
 * `flush()` is called from three places — `enqueueLesson`, the connectivity listener, and
 * `retryParkedMutation` — and two of them fire together constantly: finishing a lesson
 * the moment a tunnel ends starts both. Each call took its own `nextBatch(queue)`
 * snapshot and then committed against the module variable, so one could `fail()` a
 * mutation the other had just `acknowledge`d, and both would send the same submission.
 *
 * The server's idempotency key meant that never double-awarded anything, which is why it
 * was invisible — but it burned an attempt per collision, and `MAX_ATTEMPTS` is what
 * stands between a flaky connection and parked work the user actually did.
 */
let inFlight: Promise<void> | null = null

export function flush(): Promise<void> {
  // Callers that arrive mid-flush join the one already running rather than starting a
  // second pass over the same queue.
  return (inFlight ??= run().finally(() => {
    inFlight = null
  }))
}

async function run(): Promise<void> {
  // Nothing to talk to. Leave the queue intact rather than failing every item and
  // burning their retry budget against a backend that was never configured.
  if (!isConfigured()) return

  // Offline is not a failure, it is a "not yet". Sending anyway would spend an attempt
  // per queued lesson on a request that cannot succeed, and after enough tunnels the
  // queue parks work the user actually did. `MAX_ATTEMPTS` is there to stop us
  // hammering a broken server, not to punish a commute.
  if (!isOnline()) return

  const now = Date.now()
  for (const mutation of nextBatch(queue)) {
    // Still cooling off from its last failure. Skipped rather than delayed, so one
    // slow item cannot hold up the rest of the batch behind it.
    if (!ready(mutation, now)) continue

    try {
      await send(mutation)
      nextAttemptAt.delete(mutation.id)
      commit(acknowledge(queue, mutation.id))
    } catch (error) {
      const permanent = __isPermanent(error)
      commit(fail(queue, mutation.id, String(error), permanent))
      if (permanent) nextAttemptAt.delete(mutation.id)
      else nextAttemptAt.set(mutation.id, Date.now() + backoffMs(mutation.attempts, Math.random()))
    }
  }
}

/**
 * Try a parked mutation again, at the user's request.
 *
 * Parked means it exhausted its retries — the engine keeps it rather than dropping it,
 * because "I lost my progress" is the most trust-destroying bug a learning app has.
 * Nothing could ever un-park one until now, so the guarantee was only half kept: the
 * work was preserved and unreachable.
 */
export function retryParkedMutation(id: string): void {
  nextAttemptAt.delete(id)
  commit(retryParked(queue, id))
  void flush()
}

/**
 * Replay the moment the connection comes back.
 *
 * Without this, a lesson finished in a tunnel sat in the queue until the user happened
 * to finish another one — `flush()` was only ever called from `enqueueLesson`. A user
 * who studies on the metro and then puts their phone away would see the XP appear a
 * day later, which reads as the app losing their work.
 */
onConnectivityChange(() => {
  if (isOnline()) void flush()
})

/**
 * Statuses that mean "try again later", not "this will never work".
 *
 * 429 is the server asking for patience. 401 and 403 are an expired or not-yet-created
 * session — and treating those as permanent is how a lesson somebody genuinely did gets
 * parked for ever. The anonymous session backing the taster lesson refreshes on a timer,
 * so a flush landing in the gap between expiry and refresh is ordinary, not exceptional,
 * and it was the single most likely 4xx this queue would ever see.
 *
 * "Parked work the user did" is described in this file as the most trust-destroying bug
 * a learning app has. Classifying a token refresh as unrecoverable was a direct route to
 * it.
 */
const RETRYABLE = new Set([401, 403, 408, 425, 429])

/**
 * A 4xx will otherwise fail identically forever, so retrying it wastes battery and delays
 * every item behind it. Everything else (5xx, DNS failure, timeout) is worth a retry.
 */
export function __isPermanent(error: unknown): boolean {
  const status = (error as { status?: number; context?: { status?: number } })?.status
    ?? (error as { context?: { status?: number } })?.context?.status
  if (typeof status !== 'number') return false
  return status >= 400 && status < 500 && !RETRYABLE.has(status)
}

async function send(mutation: QueuedMutation): Promise<void> {
  if (mutation.kind !== 'lesson_complete') {
    throw new Error(`unknown mutation kind: ${mutation.kind}`)
  }

  // Awaited here rather than at enqueue time: on a first launch offline, there is no
  // session to create yet, and this correctly fails and retries later.
  await currentUser()

  const submission = mutation.payload as LessonSubmission
  await submitLesson(supabase(), {
    lessonId: submission.lessonId,
    kind: submission.kind,
    startedAt: submission.startedAt,
    answers: submission.answers,
    heartsLost: submission.heartsLost,
  })

  /**
   * The reconcile every comment in this codebase promised and nothing performed.
   *
   * `submitLesson`'s result was discarded here. The client showed an optimistic
   * prediction, the server computed the truth, and the truth went in the bin — while
   * `useShop`, `useLesson` and `useProgress` all carry comments saying "the server's
   * answer overwrites this on the next reconcile". Home kept the numbers it had until
   * TanStack Query happened to refetch for some other reason, so a user finishing a
   * lesson watched their XP not move.
   *
   * Invalidating rather than writing the response into the cache, deliberately. This
   * flush may be one of several queued lessons, and the last response is not the current
   * total; the query knows how to ask for the total. And the streak, the wallet and the
   * mastery count all move together — a single refetch is both cheaper and less likely
   * to leave two of the three stale than three hand-written cache writes.
   */
  invalidateProgress()
}

export const peekQueue = (): SyncQueue => queue
