import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const played: string[] = []
vi.mock('../../lib/sound.js', () => ({ soundCorrect: () => played.push('correct') }))

import { clearAll, readJson, writeJson } from '../../lib/storage.js'
import { useSoundAsk } from './useSoundAsk.js'

beforeEach(async () => {
  await clearAll()
  played.length = 0
})

describe("Home's sound ask", () => {
  it('is not offered before the first finished lesson', async () => {
    const { result } = renderHook(() => useSoundAsk())
    await act(async () => {})
    expect(result.current).toBeUndefined()
  })

  it('turns sound on and lets the learner hear it at once', async () => {
    writeJson('activity.total.v1', 1)
    const { result } = renderHook(() => useSoundAsk())
    await waitFor(() => expect(result.current).toBeDefined())

    act(() => result.current?.onAccept())

    expect(readJson<{ sound: boolean }>('preferences.v1')?.sound).toBe(true)
    expect(played).toEqual(['correct'])
    expect(result.current).toBeUndefined()
  })

  it('asks once: "not now" is remembered and sound stays off', async () => {
    writeJson('activity.total.v1', 1)
    const first = renderHook(() => useSoundAsk())
    await waitFor(() => expect(first.result.current).toBeDefined())
    act(() => first.result.current?.onDismiss())
    expect(first.result.current).toBeUndefined()

    const again = renderHook(() => useSoundAsk())
    await act(async () => {})
    expect(again.result.current).toBeUndefined()
    expect(readJson<{ sound?: boolean }>('preferences.v1')?.sound).not.toBe(true)
  })

  it('is not offered to someone who already turned sound on in Settings', async () => {
    writeJson('activity.total.v1', 4)
    writeJson('preferences.v1', { sound: true })
    const { result } = renderHook(() => useSoundAsk())
    await act(async () => {})
    expect(result.current).toBeUndefined()
  })
})
