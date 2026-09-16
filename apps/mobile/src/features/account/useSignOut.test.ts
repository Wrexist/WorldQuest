import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignOut } from './useSignOut.js'
import { signOutEverywhere } from './signOut.js'

vi.mock('./signOut.js', () => ({ signOutEverywhere: vi.fn() }))
beforeEach(() => vi.mocked(signOutEverywhere).mockReset())

describe('logout recovery', () => {
  it('exposes cleanup failure and permits a successful retry', async () => {
    vi.mocked(signOutEverywhere).mockRejectedValueOnce(new Error('protected store locked'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSignOut())
    await act(() => result.current.run())
    expect(result.current.failed).toBe(true)
    expect(result.current.pending).toBe(false)
    await act(() => result.current.run())
    expect(result.current.failed).toBe(false)
    expect(signOutEverywhere).toHaveBeenCalledTimes(2)
  })
  it('ignores repeated taps until the first logout finishes', async () => {
    let finish!: () => void
    vi.mocked(signOutEverywhere).mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    const { result } = renderHook(() => useSignOut())
    let pending!: Promise<void>
    act(() => { pending = result.current.run(); void result.current.run() })
    expect(result.current.pending).toBe(true)
    expect(signOutEverywhere).toHaveBeenCalledOnce()
    await act(async () => { finish(); await pending })
    expect(result.current.pending).toBe(false)
  })
})
