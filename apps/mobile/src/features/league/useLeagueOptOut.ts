/** Opt-in preferences are server-owned. A failed change never looks saved. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isConfigured } from '../../lib/supabase.js'
import { withAccount } from '../../lib/backend.js'
import { queryClient, queryKeys } from '../../lib/query.js'
import { useLeagueEnabled } from './flag.js'

export function useLeagueOptOut() {
  const enabled = useLeagueEnabled() && isConfigured()
  const [joined, setValue] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const locked = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setValue(false)
    setLoading(enabled)
    setError(false)
    if (enabled) void withAccount(account => account.fetchLeagueOptOut()).then(out => {
      if (generation.current === current) setValue(!out)
    }).catch(() => {
      if (generation.current === current) setError(true)
    }).finally(() => {
      if (generation.current === current) setLoading(false)
    })
    return () => { generation.current++ }
  }, [enabled])
  const setJoined = useCallback((value: boolean): void => {
    if (!enabled || loading || locked.current) return
    const current = generation.current
    locked.current = true
    setBusy(true)
    setError(false)
    void withAccount(account => account.setLeagueOptOut(!value)).then(() => {
      if (generation.current !== current) return
      setValue(value)
      void queryClient().invalidateQueries({ queryKey: queryKeys.league })
    }).catch(() => {
      if (generation.current === current) setError(true)
    }).finally(() => {
      locked.current = false
      if (generation.current === current) setBusy(false)
    })
  }, [enabled, loading])
  return { joined, setJoined, loading, busy, error }
}
