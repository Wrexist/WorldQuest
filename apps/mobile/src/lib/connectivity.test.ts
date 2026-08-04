import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { __setOnlineForTests, isOnline, onConnectivityChange, useOnline } from './connectivity.js'

afterEach(() => __setOnlineForTests(true))

describe('connectivity', () => {
  it('assumes online until told otherwise', () => {
    // NetInfo's first reachability probe takes a moment. Flashing "you're offline"
    // for 400ms on every cold start of a perfectly good connection is how a banner
    // becomes something users learn to ignore.
    expect(isOnline()).toBe(true)
  })

  it('reports a lost connection', () => {
    __setOnlineForTests(false)
    expect(isOnline()).toBe(false)
  })

  it('re-renders every subscriber on a change', () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)

    act(() => __setOnlineForTests(false))
    expect(result.current).toBe(false)

    act(() => __setOnlineForTests(true))
    expect(result.current).toBe(true)
  })

  it('reaches every screen, not just the one that asked', () => {
    const a = renderHook(() => useOnline())
    const b = renderHook(() => useOnline())
    act(() => __setOnlineForTests(false))
    expect(a.result.current).toBe(false)
    expect(b.result.current).toBe(false)
  })

  it('does not fire on a non-change', () => {
    // The sync queue flushes on every transition to online. A NetInfo event stream
    // that repeats "still connected" would otherwise re-flush on every heartbeat.
    const listener = vi.fn()
    const stop = onConnectivityChange(listener)
    __setOnlineForTests(true)
    expect(listener).not.toHaveBeenCalled()

    __setOnlineForTests(false)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops calling a listener that unsubscribed', () => {
    const listener = vi.fn()
    onConnectivityChange(listener)()
    __setOnlineForTests(false)
    expect(listener).not.toHaveBeenCalled()
  })
})
