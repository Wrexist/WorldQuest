/**
 * The offline mutation queue.
 *
 * Priya is on the metro and Emma's tablet has no SIM, so offline is the default
 * assumption rather than a degraded mode. Every progress write becomes an idempotent
 * event here, is replayed on reconnect, and is reconciled against whatever the server
 * says. The server always wins.
 *
 * Pure: no storage, no network, no clock. The adapter owns persistence; this owns the
 * rules. That is what lets us test the awkward cases — duplicate flush, out-of-order
 * arrival, permanent failure — without a device or a network.
 *
 * Spec: docs/engineering/architecture.md §3
 */

export type MutationKind = 'lesson_complete' | 'quest_progress' | 'purchase' | 'setting'

export type QueuedMutation = {
  /** Client-generated UUID. THE idempotency key — the server dedupes on it. */
  readonly id: string
  readonly kind: MutationKind
  readonly payload: unknown
  readonly clientTs: number
  readonly attempts: number
  /** Set once the server has acknowledged it; kept briefly for reconciliation. */
  readonly acknowledgedAt?: number
  readonly lastError?: string
}

export type SyncQueue = {
  readonly pending: readonly QueuedMutation[]
  /** Mutations that exhausted their retries. Surfaced in Settings → Sync. */
  readonly parked: readonly QueuedMutation[]
}

export const emptyQueue = (): SyncQueue => ({ pending: [], parked: [] })

/**
 * Beyond this, retrying is not going to help and hammering the server is rude.
 * The mutation is parked, not dropped — progress is never silently discarded.
 */
export const MAX_ATTEMPTS = 5

/** Exponential backoff with jitter, so a fleet of clients doesn't sync in lockstep. */
export function backoffMs(attempts: number, jitter: number): number {
  const base = Math.min(60_000, 1_000 * Math.pow(2, attempts))
  // jitter is a caller-supplied 0..1 value (from an injected Rng), never Math.random.
  return Math.round(base * (0.5 + jitter * 0.5))
}

/**
 * Enqueue a mutation.
 *
 * Enqueuing the same id twice is a no-op rather than an error: a retry that raced a
 * successful write is normal, and duplicating it would double someone's XP.
 */
export function enqueue(queue: SyncQueue, mutation: Omit<QueuedMutation, 'attempts'>): SyncQueue {
  const exists =
    queue.pending.some((m) => m.id === mutation.id) ||
    queue.parked.some((m) => m.id === mutation.id)
  if (exists) return queue
  return { ...queue, pending: [...queue.pending, { ...mutation, attempts: 0 }] }
}

/** What to send next. Oldest first — order matters for streaks and daily caps. */
export function nextBatch(queue: SyncQueue, limit = 10): readonly QueuedMutation[] {
  return [...queue.pending].sort((a, b) => a.clientTs - b.clientTs).slice(0, limit)
}

/** A mutation the server accepted. Remove it; there is nothing left to retry. */
export function acknowledge(queue: SyncQueue, id: string): SyncQueue {
  return { ...queue, pending: queue.pending.filter((m) => m.id !== id) }
}

/**
 * A mutation the server rejected or that never arrived.
 *
 * `permanent` means the server said no in a way retrying cannot fix (a 4xx that is
 * not a rate limit). Those park immediately rather than burning five attempts.
 */
export function fail(queue: SyncQueue, id: string, error: string, permanent = false): SyncQueue {
  const mutation = queue.pending.find((m) => m.id === id)
  if (!mutation) return queue

  const attempts = mutation.attempts + 1
  const updated: QueuedMutation = { ...mutation, attempts, lastError: error }

  if (permanent || attempts >= MAX_ATTEMPTS) {
    return {
      pending: queue.pending.filter((m) => m.id !== id),
      parked: [...queue.parked, updated],
    }
  }
  return { ...queue, pending: queue.pending.map((m) => (m.id === id ? updated : m)) }
}

/** Manual retry from Settings → Sync. Resets the attempt count. */
export function retryParked(queue: SyncQueue, id: string): SyncQueue {
  const mutation = queue.parked.find((m) => m.id === id)
  if (!mutation) return queue
  const { lastError: _drop, ...rest } = mutation
  return {
    pending: [...queue.pending, { ...rest, attempts: 0 }],
    parked: queue.parked.filter((m) => m.id !== id),
  }
}

// ── reconciliation ──────────────────────────────────────────────────────────

export type Reconciliation = {
  /** The values the client should now display. Always the server's. */
  readonly xpTotal: number
  readonly coins: number
  /** True when the client's optimistic prediction was wrong. */
  readonly mismatch: boolean
  readonly xpDelta: number
  readonly coinsDelta: number
  /**
   * Whether the difference is large enough to tell the user about. A one-XP
   * rounding difference gets corrected silently; losing 200 XP does not.
   */
  readonly shouldNotify: boolean
}

/** Below this, a correction is applied silently. Never a modal, never an accusation. */
const NOTIFY_THRESHOLD_XP = 50

/**
 * The server always wins.
 *
 * A mismatch is logged as `xp_reconciliation_failed` — a spike in that metric means
 * either a real bug or a cheat, and it is the only way we would find out.
 */
export function reconcile(
  optimistic: { xpTotal: number; coins: number },
  authoritative: { xpTotal: number; coins: number },
): Reconciliation {
  const xpDelta = authoritative.xpTotal - optimistic.xpTotal
  const coinsDelta = authoritative.coins - optimistic.coins
  const mismatch = xpDelta !== 0 || coinsDelta !== 0

  return {
    xpTotal: authoritative.xpTotal,
    coins: authoritative.coins,
    mismatch,
    xpDelta,
    coinsDelta,
    shouldNotify: Math.abs(xpDelta) >= NOTIFY_THRESHOLD_XP,
  }
}

/**
 * Which mutation kinds are the user's learning progress, and which are housekeeping.
 *
 * A purchase and a settings change also live in this queue, and losing either is a
 * nuisance rather than a wound: the coins are still on the server and the switch can be
 * flipped again. A finished lesson is the thing nobody can reconstruct.
 */
const carriesProgress = (m: QueuedMutation): boolean =>
  m.kind === 'lesson_complete' || m.kind === 'quest_progress'

/**
 * How much learning progress is still in flight, split by whether it is still trying.
 *
 * Exported alongside `hasUnsyncedProgress` because Settings needs the NUMBER, not just
 * the fact, and was reaching for `queue.pending.length` to get it — the whole queue,
 * including the purchases and settings this predicate deliberately excludes. So finishing
 * a lesson offline and then changing a setting rendered "2 lessons are waiting to reach
 * the server" when one of them was a setting. The same class of bug as a progress bar
 * labelled with a quantity it does not measure, and it cannot come back while both
 * questions are answered by the one predicate above.
 */
export type UnsyncedProgress = {
  /** Queued and still trying. A lesson finished a minute ago on a train. */
  readonly pending: number
  /** Exhausted its retries. Preserved, not dropped, and surfaced in Settings → Sync. */
  readonly parked: number
}

export function countUnsyncedProgress(queue: SyncQueue): UnsyncedProgress {
  return {
    pending: queue.pending.filter(carriesProgress).length,
    parked: queue.parked.filter(carriesProgress).length,
  }
}

/**
 * Does this queue hold work the user would be upset to lose?
 *
 * Used to warn before sign-out or account deletion. "I lost my progress" is the
 * single most trust-destroying bug a learning app can have.
 */
export function hasUnsyncedProgress(queue: SyncQueue): boolean {
  const { pending, parked } = countUnsyncedProgress(queue)
  return pending + parked > 0
}
