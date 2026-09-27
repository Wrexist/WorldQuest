import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useLeagueOptOut } from './useLeagueOptOut.js'
const backend = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), invalidate: vi.fn(), enabled: true }))
vi.mock('./flag.js', () => ({ useLeagueEnabled: () => backend.enabled }))
vi.mock('../../lib/supabase.js', () => ({ isConfigured: () => true }))
vi.mock('../../lib/backend.js', () => ({ withAccount: (work: (api: unknown) => unknown) => work({ fetchLeagueOptOut: backend.get, setLeagueOptOut: backend.set }) }))
vi.mock('../../lib/query.js', () => ({ queryKeys: { league: ['league'] }, queryClient: () => ({ invalidateQueries: backend.invalidate }) }))
beforeEach(() => { backend.enabled=true; backend.get.mockReset().mockResolvedValue(true); backend.set.mockReset(); backend.invalidate.mockReset() })
it('does not claim enrollment until the server confirms and blocks rapid taps', async () => {
  let resolve!: () => void
  backend.set.mockReturnValue(new Promise<void>(r => { resolve=r }))
  const { result } = renderHook(useLeagueOptOut)
  expect(result.current.joined).toBe(false)
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => { result.current.setJoined(true); result.current.setJoined(true) })
  expect(backend.set).toHaveBeenCalledTimes(1)
  expect(result.current.joined).toBe(false)
  await act(async () => resolve())
  expect(result.current.joined).toBe(true)
  expect(result.current.busy).toBe(false)
})
it('preserves the saved preference and exposes a failed update', async () => {
  backend.get.mockResolvedValue(false)
  backend.set.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(useLeagueOptOut)
  await waitFor(() => expect(result.current.joined).toBe(true))
  await act(async () => result.current.setJoined(false))
  expect(result.current.joined).toBe(true)
  expect(result.current.error).toBe(true)
})
it('does not request or modify preferences when rollout is closed', async () => {
  backend.enabled=false
  const { result }=renderHook(useLeagueOptOut)
  act(() => result.current.setJoined(true))
  expect(backend.get).not.toHaveBeenCalled()
  expect(backend.set).not.toHaveBeenCalled()
})
