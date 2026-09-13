import { beforeEach, describe, expect, it } from 'vitest'
import { createElement, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { captureStorage, clearAll, setStorageAccount } from './storage.js'
import { QueryProvider, queryClient, queryKeys } from './query.js'
import { peekAwards, recordPredictedAward } from './awards.js'

beforeEach(clearAll)

describe('in-memory account isolation', () => {
  it('keeps live guest observers and persistence attached during anonymous adoption', async () => {
    let mounts = 0
    function Probe() {
      useState(() => { mounts++; return 0 })
      const query = useQuery({ queryKey: ['adoption'], queryFn: async () => 1, staleTime: Infinity })
      return createElement('span', null, query.data ?? 'loading')
    }
    render(createElement(QueryProvider, { children: createElement(Probe) }))
    await screen.findByText('1')
    const guestClient = queryClient()
    act(() => setStorageAccount('new-anonymous-A', true))
    expect(queryClient()).toBe(guestClient)
    expect(mounts).toBe(1)
    const accountA = captureStorage()
    act(() => guestClient.setQueryData(['adoption'], 2))
    await screen.findByText('2')
    await waitFor(() => expect(accountA.get('query.cache.v2')).toContain('"data":2'), { timeout: 2500 })

    act(() => setStorageAccount('B'))
    await screen.findByText('1')
    expect(queryClient()).not.toBe(guestClient)
    expect(mounts).toBe(2)
    act(() => guestClient.setQueryData(['adoption'], 99))
    expect(screen.queryByText('99')).toBeNull()
    const accountB = captureStorage()
    await waitFor(() => expect(accountB.get('query.cache.v2')).toContain('"data":1'), { timeout: 2500 })
    // Let the departed client's throttled persistence settle before checking its retained cache.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1200)) })
    expect(accountA.get('query.cache.v2')).toContain('"data":2')
  })
  it('replaces the query client and drops optimistic awards on a switch', () => {
    setStorageAccount('A')
    const old = queryClient()
    old.setQueryData(queryKeys.progress, { coins: 400 })
    recordPredictedAward({ lessonId: 'A-lesson', xp: 20, coins: 2, localDay: '2026-09-13' })
    expect(peekAwards()).toHaveLength(1)
    setStorageAccount('B')
    const next = queryClient()
    expect(next).not.toBe(old)
    expect(next.getQueryData(queryKeys.progress)).toBeUndefined()
    expect(peekAwards()).toHaveLength(0)
    old.setQueryData(queryKeys.progress, { coins: 900 })
    expect(next.getQueryData(queryKeys.progress)).toBeUndefined()
    setStorageAccount('A')
    expect(peekAwards().map((award) => award.lessonId)).toEqual(['A-lesson'])
  })
})
