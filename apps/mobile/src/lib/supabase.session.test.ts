import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureStorage, clearAll, readJson, writeJson } from './storage.js'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(), signInAnonymously: vi.fn(), stopAutoRefresh: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}))
vi.mock('@worldquest/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createWorldQuestClient: () => ({ auth }),
}))
const { currentUser, acceptSignedInAccount, resetClient, withAccountTransition } = await import('./supabase.js')

beforeEach(async () => {
  resetClient()
  await clearAll()
  auth.getSession.mockReset().mockResolvedValue({ error: null, data: { session: null } })
  auth.signInAnonymously.mockReset().mockResolvedValue({ error: null, data: { user: { id: 'A' } } })
})

describe('session resolution and account ownership', () => {
  it('creates one guest identity for concurrent callers and adopts only that guest work', async () => {
    writeJson('sync.queue.v2', { pending: ['local-lesson'] })
    await expect(Promise.all([currentUser(), currentUser()])).resolves.toEqual([{ userId: 'A' }, { userId: 'A' }])
    expect(auth.signInAnonymously).toHaveBeenCalledOnce()
    expect(captureStorage().userId).toBe('A')
    expect(readJson('sync.queue.v2')).toEqual({ pending: ['local-lesson'] })
  })

  it('does not assign local lessons to an existing login', async () => {
    writeJson('sync.queue.v2', { pending: ['local-lesson'] })
    auth.getSession.mockResolvedValue({ error: null, data: { session: { user: { id: 'B' } } } })
    await currentUser()
    expect(captureStorage().userId).toBe('B')
    expect(readJson('sync.queue.v2')).toBeNull()
  })

  it('a stale A initializer cannot replace or clear the newly accepted B session', async () => {
    let finish!: (value: unknown) => void
    auth.getSession.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = currentUser()
    await vi.waitFor(() => expect(auth.getSession).toHaveBeenCalledOnce())
    acceptSignedInAccount('B')
    finish({ error: null, data: { session: { user: { id: 'A' } } } })
    await expect(pending).rejects.toMatchObject({ name: 'AccountChangedError' })
    await expect(currentUser()).resolves.toEqual({ userId: 'B' })
    expect(captureStorage().userId).toBe('B')
  })

  it('refuses background identity creation while login or logout is pending', async () => {
    await withAccountTransition(async () => {
      await expect(currentUser()).rejects.toMatchObject({ name: 'AccountChangedError' })
      expect(auth.signInAnonymously).not.toHaveBeenCalled()
    })
    await expect(currentUser()).resolves.toEqual({ userId: 'A' })
  })
})
