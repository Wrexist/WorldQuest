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
  emptyQueue,
  enqueue,
  fail,
  nextBatch,
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
}

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

  for (const mutation of nextBatch(queue)) {
    try {
      await send(mutation)
      commit(acknowledge(queue, mutation.id))
    } catch (error) {
      commit(fail(queue, mutation.id, String(error), isPermanent(error)))
    }
  }
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
