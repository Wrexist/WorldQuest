import { useRef, useState } from 'react'
import { signOutEverywhere } from './signOut.js'

/** A rejected protected-store erase must remain visible and retryable. */
export function useSignOut() {
  const active = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function run(): Promise<void> {
    if (active.current) return
    active.current = true
    setPending(true)
    setFailed(false)
    try { await signOutEverywhere() } catch { setFailed(true) } finally {
      active.current = false
      setPending(false)
    }
  }
  return { pending, failed, run }
}
