import { beforeEach, describe, expect, it } from 'vitest'
import { clearAll, setStorageAccount, writeJson } from '../../lib/storage.js'
import { openDailyChest, readDailyChest, readStreakGems, rememberDailyChest } from './dailyChest.js'

const receipt = { day: '2026-09-26', lessonId: 'lesson-one', xp: 15, coins: 5 }
beforeEach(() => clearAll())

describe('collectible streak gems', () => {
  it('requires a completed lesson receipt and the matching lesson', () => {
    openDailyChest(receipt.day, receipt.lessonId)
    expect(readStreakGems()).toEqual([])
    rememberDailyChest(receipt)
    openDailyChest(receipt.day, 'another-lesson')
    expect(readStreakGems()).toEqual([])
  })
  it('keeps the first receipt and awards one badge even after repeated openings', () => {
    rememberDailyChest(receipt)
    rememberDailyChest({ ...receipt, lessonId: 'replay' })
    openDailyChest(receipt.day, receipt.lessonId)
    openDailyChest(receipt.day, receipt.lessonId)
    expect(readDailyChest(receipt.day)).toEqual({ ...receipt, opened: true })
    expect(readStreakGems()).toEqual([receipt.day])
  })
  it('keeps earlier gems when another day is learned, including after a gap', () => {
    rememberDailyChest(receipt)
    openDailyChest(receipt.day, receipt.lessonId)
    const next = { ...receipt, day: '2026-09-29', lessonId: 'next' }
    expect(readDailyChest(next.day)).toBeNull()
    rememberDailyChest(next)
    openDailyChest(next.day, next.lessonId)
    expect(readStreakGems()).toEqual([receipt.day, next.day])
  })
  it('recovers valid unique dates from malformed saved collections', () => {
    writeJson('streak.gem-days.v1', [receipt.day, null, '2026-02-30', receipt.day, {}, 'bad'])
    expect(readStreakGems()).toEqual([receipt.day])
    writeJson('streak.chest.v1', { ...receipt, opened: false, coins: -5 })
    expect(readDailyChest(receipt.day)).toBeNull()
  })
  it('isolates collections and unopened chests between accounts', () => {
    setStorageAccount('gem-owner')
    rememberDailyChest(receipt)
    openDailyChest(receipt.day, receipt.lessonId)
    setStorageAccount('other-explorer')
    expect(readStreakGems()).toEqual([])
    expect(readDailyChest(receipt.day)).toBeNull()
    setStorageAccount('gem-owner')
    expect(readStreakGems()).toEqual([receipt.day])
  })
})
