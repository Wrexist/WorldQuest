import { beforeEach, describe, expect, it } from 'vitest'
import { clearAll, setStorageAccount } from './storage.js'
import { queryClient, queryKeys } from './query.js'
import { peekAwards, recordPredictedAward } from './awards.js'

beforeEach(clearAll)

describe('in-memory account isolation', () => {
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
