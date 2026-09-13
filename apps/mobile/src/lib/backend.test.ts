import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureStorage, clearAll, setStorageAccount } from './storage.js'

const calls = vi.hoisted(() => ({ open: vi.fn(), user: vi.fn() }))
vi.mock('./supabase.js', () => ({
  currentUser: () => calls.user(), accountRepository: (id: string) => calls.open(id),
}))
const { withAccount } = await import('./backend.js')

beforeEach(async () => {
  await clearAll()
  setStorageAccount('A')
  calls.user.mockReset().mockResolvedValue({ userId: 'A' })
  calls.open.mockReset().mockResolvedValue({ identity: { userId: 'A', backendId: 'test' } })
})

describe('account transition barrier', () => {
  it('refuses a stale memo before opening a transport', async () => {
    calls.user.mockResolvedValue({ userId: 'B' })
    await expect(withAccount(async () => 1)).rejects.toMatchObject({ name: 'AccountChangedError' })
    expect(calls.open).not.toHaveBeenCalled()
  })

  it('rejects a delayed result after an account switch', async () => {
    let finish!: (value: number) => void
    const work = vi.fn(() => new Promise<number>((resolve) => { finish = resolve }))
    const pending = withAccount(work)
    await vi.waitFor(() => expect(work).toHaveBeenCalledOnce())
    setStorageAccount('B')
    finish(400)
    await expect(pending).rejects.toMatchObject({ name: 'AccountChangedError' })
    expect(captureStorage().userId).toBe('B')
  })

  it('does not start work when the account changes while opening the transport', async () => {
    calls.open.mockImplementation(async () => { setStorageAccount('B'); return {} })
    const work = vi.fn(async () => 1)
    await expect(withAccount(work)).rejects.toMatchObject({ name: 'AccountChangedError' })
    expect(work).not.toHaveBeenCalled()
  })
})
