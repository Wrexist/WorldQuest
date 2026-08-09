/**
 * Feature flags — staged rollout, not a second source of truth.
 *
 * Built 2026-08-09, in response to `docs/plan/cowork-handoff.md` §3: the release plan
 * has named a 5 → 25 → 50 → 100 % ladder since `docs/plan/build-order.md` was written,
 * and `docs/engineering/rollback-plan.md` names two things that could not happen
 * without this file — staging a rollout, and halting one without shipping a new
 * binary. There was no flag store, no remote config, and no gating anywhere in the app
 * before this.
 *
 * ## What a flag is allowed to gate, and what it is not
 *
 * A flag controls whether a SCREEN or CODE PATH is reachable. It must never become a
 * second, client-trusted source of truth about what a user is entitled to — that is
 * `entitlementOf` and the server-authoritative reward path (ADR 0006), full stop. This
 * module never reads `wallets`, `subscriptions`, or anything reward-shaped, and
 * nothing here writes them. `assertNotEntitlementFlag` below is a soft guard against a
 * future call site drifting into that shape by naming a flag `premium_x` or similar —
 * advisory, not a type-level guarantee, because a flag *key* is a string and a string
 * cannot be fully checked at compile time. If something here ever needs to know
 * whether a user has paid, that is a bug in the call site, not a reason to widen this
 * module.
 *
 * ## The offline default, decided rather than defaulted into
 *
 * Two different situations both count as "offline", and they get different answers:
 *
 * - **A flag was fetched before, and the device is offline now.** Use the cached
 *   value. Flipping every flag off the moment a train enters a tunnel would make
 *   "offline" and "this release is disabled" indistinguishable to the user, on an app
 *   whose whole offline story (`connectivity.ts`) is built around the opposite promise.
 * - **A flag has never been fetched — first launch, no network yet.** Default to
 *   **closed** (`false`), not open. The app must never grant a freshly-shipped, not-yet
 *   -confirmed-working code path to a user purely because it could not ask. A rollout
 *   ladder that starts at 5% and defaults to "everyone" when it cannot reach the
 *   server is not a 5% rollout. This mirrors the rule `analytics.ts` already states for
 *   an unknown child flag: unknown is not permission.
 *
 * ## Why percentage rollout is computed on the client from one row per flag
 *
 * The alternative — one row per (user, flag) assignment, written server-side — was
 * rejected. That table would be joinable against everything else a user has, which is
 * exactly the shape the entitlement rule above forbids building by accident. Instead
 * the server holds one row per FLAG (key, enabled, rollout_percent) and the client
 * buckets itself: `hash(flagKey + userId) % 100 < rolloutPercent`. The hash is stable
 * per (user, flag) pair, so a user does not flicker in and out of a rollout on every
 * refetch, and nothing about which bucket a user landed in is ever sent to the server.
 *
 * ## Why polling, not a realtime subscription
 *
 * A kill switch that takes up to `POLL_INTERVAL_MS` to reach a foregrounded device is
 * still a kill switch, and it needs no realtime infrastructure, no extra connection
 * held open on a battery, and no new failure mode for the offline story to account
 * for. `docs/engineering/rollback-plan.md` step 3 asks for "halt the rollout" to be
 * fast, not instantaneous — the store-console pull it replaces takes hours.
 */

import { useEffect, useState } from 'react'
import { supabase, currentUser } from './supabase.js'
import { readJson, writeJson } from './storage.js'
import { onConnectivityChange } from './connectivity.js'

export type FeatureFlagRow = {
  readonly key: string
  readonly enabled: boolean
  readonly rolloutPercent: number
}

const CACHE_KEY = 'featureFlags.cache.v1'

/** How often a foregrounded app re-checks flags. See the header for why polling. */
const POLL_INTERVAL_MS = 5 * 60_000

/**
 * Substrings that make a flag key look like it is standing in for an entitlement.
 * Advisory only — see the module header. Extend this list rather than working around
 * it if a real flag legitimately needs one of these words in its name.
 */
const ENTITLEMENT_LOOKALIKE = ['premium', 'entitlement', 'subscription', 'paid', 'unlock_tier']

function assertNotEntitlementFlag(key: string): void {
  if (!__DEV__) return
  const lower = key.toLowerCase()
  if (ENTITLEMENT_LOOKALIKE.some((word) => lower.includes(word))) {
    console.warn(
      `[featureFlags] "${key}" looks like it gates entitlement rather than a code path. ` +
        'Flags must never be a second source of truth for what a user is entitled to — ' +
        'see the header of featureFlags.ts. If this is really a rollout flag, rename it.',
    )
  }
}

// ── module state — one fetch loop for the whole process, same shape as connectivity.ts ──

let cache: Map<string, FeatureFlagRow> | null = null
let loadedFromDisk = false
let lastFetchFailed = false
const listeners = new Set<() => void>()

function diskCache(): Map<string, FeatureFlagRow> {
  if (!loadedFromDisk) {
    loadedFromDisk = true
    const stored = readJson<readonly FeatureFlagRow[]>(CACHE_KEY)
    cache = new Map((stored ?? []).map((row) => [row.key, row]))
  }
  return cache ?? new Map()
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Pull the current flag rows and refresh the cache. Never throws — a failed refresh
 * leaves the previous cache (or the closed default) exactly as it was; see the header
 * for why that is the deliberate behaviour rather than a shortcut.
 */
export async function refreshFeatureFlags(): Promise<void> {
  try {
    const { data, error } = await supabase()
      .from('feature_flags')
      .select('key, enabled, rollout_percent')
    if (error || data === null) {
      lastFetchFailed = true
      return
    }
    const next = new Map<string, FeatureFlagRow>(
      data.map((row) => [
        row.key,
        { key: row.key, enabled: row.enabled, rolloutPercent: row.rollout_percent },
      ]),
    )
    cache = next
    lastFetchFailed = false
    writeJson(CACHE_KEY, [...next.values()])
    notify()
  } catch {
    // Same contract as the sink in reporting.ts: a failure in telemetry-adjacent
    // plumbing must never become a crash of its own.
    lastFetchFailed = true
  }
}

/**
 * A stable, non-cryptographic hash — FNV-1a — used only to bucket a user into a
 * rollout percentage. It does not need to resist an adversary; it needs to be the same
 * number every time for the same (key, userId) pair, and roughly uniform across users.
 */
function bucketOf(flagKey: string, userId: string): number {
  const input = `${flagKey}:${userId}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // >>> 0 forces an unsigned 32-bit value before the modulo.
  return (hash >>> 0) % 100
}

/**
 * The pure decision function — fetch and caching are above, this is the part worth
 * unit-testing in isolation. `row === undefined` covers both "never fetched" and
 * "fetched, and this key does not exist": both are the closed default.
 */
export function evaluateFlag(
  row: FeatureFlagRow | undefined,
  userId: string | null,
): boolean {
  if (row === undefined || !row.enabled) return false
  // No user yet (session still resolving) — closed, same as "never fetched", and
  // checked BEFORE the rollout-percentage shortcuts below. A 100% rollout is still a
  // rollout to identified users; it must not read as "everyone, including whoever we
  // cannot yet identify". This ordering is the fix for a real bug caught by this
  // file's own test on 2026-08-09: the >=100 shortcut used to run first, so a flag at
  // 100% rollout evaluated `true` for a null userId — the exact case the comment above
  // says must not happen. `pnpm bundle:native`/`pnpm test` are what caught it; nothing
  // about the shape of the bug was visible from reading the function.
  if (userId === null) return false
  if (row.rolloutPercent >= 100) return true
  if (row.rolloutPercent <= 0) return false
  return bucketOf(row.key, userId) < row.rolloutPercent
}

/**
 * Read a flag's current value without subscribing to changes. For call sites outside
 * React (the sync queue, a startup check) — `useFeatureFlag` below is the hook for
 * components.
 */
export function getFeatureFlag(key: string, userId: string | null): boolean {
  assertNotEntitlementFlag(key)
  return evaluateFlag(diskCache().get(key), userId)
}

/**
 * The hook. Re-renders on cache refresh and on reconnect — a flag flipped off during
 * an incident should reach a foregrounded, online screen within one poll interval, not
 * only on the next cold start.
 */
export function useFeatureFlag(key: string): boolean {
  assertNotEntitlementFlag(key)
  const [userId, setUserId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void currentUser().then(({ userId: id }) => {
      if (!cancelled) setUserId(id)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onConnectivityChange(() => setTick((n) => n + 1)), [])

  useEffect(() => {
    const listener = () => setTick((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return evaluateFlag(diskCache().get(key), userId)
}

/**
 * Start the poll loop. Called once from the root layout, same pattern as
 * `initCrashReporting` — a named call so the loop is visible from `_layout.tsx` rather
 * than hidden in a module side effect.
 */
export function startFeatureFlagPolling(): () => void {
  void refreshFeatureFlags()
  const id = setInterval(() => void refreshFeatureFlags(), POLL_INTERVAL_MS)
  return () => clearInterval(id)
}

/** Whether the most recent refresh attempt failed. Exposed for a debug/status screen. */
export const featureFlagsStale = (): boolean => lastFetchFailed

/** Test seam. Not for app code. */
export function __resetFeatureFlagsForTests(): void {
  cache = null
  loadedFromDisk = false
  lastFetchFailed = false
  listeners.clear()
}
