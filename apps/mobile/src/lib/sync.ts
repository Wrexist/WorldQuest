/**
 * The sync adapter.
 *
 * Queue RULES live in `@worldquest/engines/sync` and are unit-tested. This file only
 * owns persistence and the network call, which is the part that genuinely needs a
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

// MMKV-backed in week 3. In-memory now so the flow is real and testable.
let queue: SyncQueue = emptyQueue()

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
  queue = enqueue(queue, {
    id: submission.lessonId, // the server's idempotency key
    kind: 'lesson_complete',
    payload: submission,
    clientTs: Date.now(),
  })
  void flush()
}

export async function flush(): Promise<void> {
  const batch = nextBatch(queue)
  for (const mutation of batch) {
    try {
      await send(mutation)
      queue = acknowledge(queue, mutation.id)
    } catch (error) {
      const permanent = error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429
      queue = fail(queue, mutation.id, String(error), permanent)
    }
  }
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

async function send(_mutation: QueuedMutation): Promise<void> {
  // POSTs to the submit-lesson edge function in week 3. Throwing for now means the
  // queue exercises its real retry path rather than silently pretending to succeed —
  // a stub that resolves would hide exactly the bugs this layer exists to prevent.
  throw new HttpError(0)
}

export const peekQueue = (): SyncQueue => queue
