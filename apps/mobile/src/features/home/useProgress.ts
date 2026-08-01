/**
 * Home's data.
 *
 * A hand-rolled hook, not TanStack Query — that lands in Track A4, and the shape here
 * is deliberately the one Query will slot into (`data`/`status`/`refetch`) so the swap
 * is a body change rather than a rewrite of every caller.
 *
 * The rule it already obeys: server state is never copied into a store. This owns the
 * fetch and hands the result down. Nothing writes progress on the client — the server
 * is authoritative for XP, coins and streaks (ADR 0006), and a client that can write
 * them is a client that can be edited.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchProgress, type Progress } from '@worldquest/api'
import { currentUser, isConfigured, supabase } from '../../lib/supabase.js'
import { readJson, writeJson } from '../../lib/storage.js'

const CACHE_KEY = 'home.progress.v1'

export type ProgressStatus = 'loading' | 'ready' | 'error'

export type UseProgress = {
  readonly data: Progress | null
  readonly status: ProgressStatus
  /** True when the numbers on screen came from disk rather than from the server. */
  readonly isStale: boolean
  readonly refetch: () => void
}

export function useProgress(): UseProgress {
  // Seeded from the cache so a returning user sees their real streak in the first
  // frame instead of a skeleton and then a jump. Stale numbers beat no numbers, as
  // long as the screen says which it is showing.
  const cached = useRef(readJson<Progress>(CACHE_KEY)).current

  const [data, setData] = useState<Progress | null>(cached)
  const [status, setStatus] = useState<ProgressStatus>(cached ? 'ready' : 'loading')
  const [isStale, setIsStale] = useState(cached !== null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    // No backend configured — a fresh checkout without .env.local. The app still
    // runs lessons; it just cannot sync them, and pretending otherwise with a
    // spinner that never resolves is worse than an honest empty state.
    if (!isConfigured()) {
      setStatus('ready')
      return
    }

    let cancelled = false

    void (async () => {
      try {
        await currentUser()
        const fresh = await fetchProgress(supabase())
        if (cancelled) return
        writeJson(CACHE_KEY, fresh)
        setData(fresh)
        setIsStale(false)
        setStatus('ready')
      } catch {
        if (cancelled) return
        // Cached numbers are still worth showing. Only a user with nothing cached
        // gets the error state — for everyone else this is a stale badge, not a wall.
        setStatus(cached ? 'ready' : 'error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [nonce, cached])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { data, status, isStale, refetch }
}
