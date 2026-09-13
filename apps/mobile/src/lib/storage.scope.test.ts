import { beforeEach, describe, expect, it } from 'vitest'
import { MMKV } from 'react-native-mmkv'
import {
  captureStorage, clearAll, readJson, setStorageAccount, startGuestStorage,
  storageTreeGeneration, writeJson,
} from './storage.js'

beforeEach(clearAll)

describe('account-scoped durable state', () => {
  it('never reopens an earlier guest namespace after returning to an older account', () => {
    setStorageAccount('A')
    startGuestStorage()
    writeJson('private-work', ['B'])
    setStorageAccount('B', true)
    setStorageAccount('A')
    startGuestStorage()
    expect(readJson('private-work')).toBeNull()
  })
  it('keeps each account separate and restores its data on return', () => {
    setStorageAccount('A')
    writeJson('wallet', { coins: 40 })
    setStorageAccount('B')
    expect(readJson('wallet')).toBeNull()
    writeJson('wallet', { coins: 7 })
    setStorageAccount('A')
    expect(readJson('wallet')).toEqual({ coins: 40 })
    setStorageAccount('B')
    expect(readJson('wallet')).toEqual({ coins: 7 })
  })

  it('detaches queued work at logout without erasing it', () => {
    setStorageAccount('A')
    writeJson('sync.queue.v2', { pending: ['lesson-A'] })
    startGuestStorage()
    expect(readJson('sync.queue.v2')).toBeNull()
    setStorageAccount('A')
    expect(readJson('sync.queue.v2')).toEqual({ pending: ['lesson-A'] })
  })

  it('never assigns local guest work to an existing signed-in account', () => {
    writeJson('sync.queue.v2', { pending: ['guest-lesson'] })
    const guest = captureStorage()
    setStorageAccount('existing')
    expect(readJson('sync.queue.v2')).toBeNull()
    expect(JSON.parse(guest.get('sync.queue.v2')!)).toEqual({ pending: ['guest-lesson'] })
  })

  it('adopts fresh guest work only for a newly created identity without unmounting the lesson', () => {
    writeJson('sync.queue.v2', { pending: ['guest-lesson'] })
    const tree = storageTreeGeneration()
    setStorageAccount('new-anonymous', true)
    expect(readJson('sync.queue.v2')).toEqual({ pending: ['guest-lesson'] })
    expect(storageTreeGeneration()).toBe(tree)
  })

  it('keeps late persistence writes in their original namespace', () => {
    setStorageAccount('A')
    const old = captureStorage()
    setStorageAccount('B')
    old.set('query.cache.v2', JSON.stringify({ coins: 400 }))
    expect(old.isCurrent()).toBe(false)
    expect(readJson('query.cache.v2')).toBeNull()
    setStorageAccount('A')
    expect(readJson('query.cache.v2')).toEqual({ coins: 400 })
  })

  it('preserves ownerless legacy records without replaying or displaying them', () => {
    const legacy = new MMKV({ id: 'worldquest.app' })
    legacy.set('sync.queue.v1', JSON.stringify({ pending: ['unknown-owner'] }))
    legacy.set('query.cache.v1', JSON.stringify({ coins: 400 }))
    setStorageAccount('new-anonymous', true)
    expect(readJson('sync.queue.v1')).toBeNull()
    expect(readJson('query.cache.v1')).toBeNull()
    expect(legacy.getString('sync.queue.v1')).toContain('unknown-owner')
  })
})
