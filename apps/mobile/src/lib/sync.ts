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
