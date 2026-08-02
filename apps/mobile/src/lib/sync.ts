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

export async function flush(): Promise<void> {
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
      const permanent = isPermanent(error)
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
 * A 4xx will fail identically forever, so retrying it wastes battery and delays every
 * item behind it. 429 is the exception — it is the server asking for patience, not
 * rejecting the request. Everything else (5xx, DNS failure, timeout) is worth a retry.
 */
function isPermanent(error: unknown): boolean {
  const status = (error as { status?: number; context?: { status?: number } })?.status
    ?? (error as { context?: { status?: number } })?.context?.status
  if (typeof status !== 'number') return false
  return status >= 400 && status < 500 && status !== 429
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
  })
}

export const peekQueue = (): SyncQueue => queue
