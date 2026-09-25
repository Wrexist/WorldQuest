/**
 * `known` separates an answer from the starting assumption.
 *
 * `linked` begins false, which is the right default for an offer card and the wrong one
 * for a full screen after a lesson: offline, a signed-in learner would be asked to create
 * the profile they already have. These pin down when "not linked" may be believed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  configured: true,
  lookup: vi.fn<() => Promise<string | null>>(),
}))

vi.mock('../../lib/supabase.js', () => ({
  isConfigured: () => mocks.configured,
  supabase: () => ({}),
}))
vi.mock('../../lib/backendConfig.js', () => ({
  isD1: () => false,
  backendConfig: () => ({ kind: 'supabase', url: 'https://example.test', publishableKey: 'key' }),
}))
vi.mock('@worldquest/api', () => ({ accountEmail: () => mocks.lookup() }))

import { useAccountStatus } from './useAccountStatus.js'

beforeEach(() => {
  mocks.configured = true
  mocks.lookup.mockReset()
})

describe('useAccountStatus', () => {
  it('is not known until the server answers, then says what it answered', async () => {
    mocks.lookup.mockResolvedValue(null)
    const { result } = renderHook(() => useAccountStatus())
    expect(result.current.known).toBe(false)
    await waitFor(() => expect(result.current.known).toBe(true))
    expect(result.current.linked).toBe(false)
  })

  it('knows a linked account as linked', async () => {
    mocks.lookup.mockResolvedValue('someone@example.test')
    const { result } = renderHook(() => useAccountStatus())
    await waitFor(() => expect(result.current.linked).toBe(true))
    expect(result.current.known).toBe(true)
  })

  it('stays unknown when the lookup fails — offline is not "no account"', async () => {
    mocks.lookup.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAccountStatus())
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledOnce())
    expect(result.current.known).toBe(false)
    expect(result.current.linked).toBe(false)
  })

  it('makes no round trip when the caller does not need one', () => {
    const { result } = renderHook(() => useAccountStatus({ enabled: false }))
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(result.current.known).toBe(false)
  })

  it('knows every session is a guest in a build with no backend', () => {
    mocks.configured = false
    const { result } = renderHook(() => useAccountStatus())
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(result.current.known).toBe(true)
    expect(result.current.linked).toBe(false)
  })
})
