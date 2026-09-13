import { describe, expect, it, vi } from 'vitest'
import { createCredentialVault, type CredentialLifecycle } from './credential-vault.js'

function fixture() {
  const protectedValues = new Map<string, string>()
  const oldValues = new Map<string, string>()
  let installed = true
  let clearing = false
  const secure = {
    get: vi.fn(async (key: string) => protectedValues.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { protectedValues.set(key, value) }),
    remove: vi.fn(async (key: string) => { protectedValues.delete(key) }),
  }
  const legacy = {
    keys: () => [...oldValues.keys()],
    get: (key: string) => oldValues.get(key) ?? null,
    remove: vi.fn((key: string) => { oldValues.delete(key) }),
    clear: () => { oldValues.clear() },
  }
  const lifecycle: CredentialLifecycle = {
    isInstalled: () => installed, isClearing: () => clearing,
    beginClear: () => { clearing = true }, finishClear: () => { clearing = false },
    markInstalled: () => { installed = true },
  }
  const make = () => createCredentialVault(secure, legacy, lifecycle)
  return { secure, legacy, make, vault: make(), oldValues, protectedValues, reinstall: () => { installed = false } }
}

describe('protected credential lifecycle', () => {
  it('migrates only after readback, then survives a new process', async () => {
    const f = fixture()
    const credential = JSON.stringify({ token: 'x'.repeat(5000), owner: 'A' })
    f.oldValues.set('legacy:session', credential)
    await expect(f.vault.open().getItem('legacy:session')).resolves.toBe(credential)
    expect(f.oldValues.size).toBe(0)
    await expect(f.make().open().getItem('legacy:session')).resolves.toBe(credential)
  })
  it('preserves the migration source when protected storage rejects a write', async () => {
    const f = fixture()
    f.oldValues.set('session', 'A')
    f.secure.set.mockRejectedValueOnce(new Error('locked'))
    await expect(f.vault.open().getItem('session')).rejects.toThrow('locked')
    expect(f.oldValues.get('session')).toBe('A')
    await expect(f.vault.open().getItem('session')).resolves.toBe('A')
  })
  it('rejects unreadable protected storage instead of falling back to old credentials', async () => {
    const f = fixture()
    f.oldValues.set('session', 'A')
    f.secure.get.mockRejectedValueOnce(new Error('device locked'))
    await expect(f.vault.open().getItem('session')).rejects.toThrow('device locked')
    expect(f.oldValues.get('session')).toBe('A')
  })
  it('does not acknowledge a write the native store silently dropped', async () => {
    const f = fixture()
    f.oldValues.set('session', 'A')
    f.secure.set.mockImplementation(async () => {})
    await expect(f.vault.open().getItem('session')).rejects.toThrow('not confirmed')
    expect(f.oldValues.get('session')).toBe('A')
  })
  it('finishes an interrupted migration without restoring an older token', async () => {
    const f = fixture()
    f.oldValues.set('session', 'old-A')
    await f.vault.open().getItem('session')
    f.oldValues.set('session', 'old-A')
    // The initial cleanup succeeds, but cleanup after the replacement write fails.
    f.legacy.remove.mockImplementationOnce(key => { f.oldValues.delete(key) })
      .mockImplementationOnce(() => { f.oldValues.set('session', 'old-A'); throw new Error('disk failure') })
    await expect(f.vault.open().setItem('session', 'new-A')).rejects.toThrow('disk failure')
    await expect(f.make().open().getItem('session')).resolves.toBe('new-A')
    expect(f.oldValues.size).toBe(0)
  })
  it('serializes simultaneous writes so logout can enumerate every credential', async () => {
    const f = fixture()
    const handle = f.vault.open()
    await Promise.all([handle.setItem('session', 'A'), handle.setItem('verifier', 'code')])
    await f.vault.clear()
    expect(f.protectedValues.size).toBe(0)
    expect(f.oldValues.size).toBe(0)
  })
  it('invalidates queued and future writes from a discarded auth client', async () => {
    const f = fixture()
    const old = f.vault.open()
    const pending = old.setItem('session', 'A')
    const cleared = f.vault.clear()
    await expect(pending).rejects.toThrow('session changed')
    await cleared
    await expect(old.setItem('session', 'late-A')).rejects.toThrow('session changed')
    await f.vault.open().setItem('session', 'B')
    await expect(f.vault.open().getItem('session')).resolves.toBe('B')
  })
  it('retries interrupted logout after restart before any old identity can be read', async () => {
    const f = fixture()
    await f.vault.open().setItem('session', 'A')
    f.secure.remove.mockRejectedValueOnce(new Error('device locked'))
    await expect(f.vault.clear()).rejects.toThrow('device locked')
    await expect(f.make().open().getItem('session')).resolves.toBeNull()
    expect(f.protectedValues.size).toBe(0)
  })
  it('removes old Keychain identities after reinstall instead of auto-signing in', async () => {
    const f = fixture()
    await f.vault.open().setItem('session', 'A')
    f.reinstall()
    await expect(f.make().open().getItem('session')).resolves.toBeNull()
    expect(f.protectedValues.size).toBe(0)
  })
  it('removing a credential cannot revive the legacy copy', async () => {
    const f = fixture()
    f.oldValues.set('session', 'A')
    await f.vault.open().removeItem('session')
    await expect(f.make().open().getItem('session')).resolves.toBeNull()
  })
  it('migrates unused verification entries alongside the requested session', async () => {
    const f = fixture()
    f.oldValues.set('session', 'A')
    f.oldValues.set('verifier', 'old-verifier')
    await f.vault.open().getItem('session')
    expect(f.oldValues.size).toBe(0)
    await expect(f.make().open().getItem('verifier')).resolves.toBe('old-verifier')
  })
  it('keeps the vault closed when its cleanup index is corrupt', async () => {
    const f = fixture()
    f.protectedValues.set('worldquest.credentials.v2.index', '["unrelated-key"]')
    await expect(f.vault.clear()).rejects.toThrow('index unreadable')
    await expect(f.make().open().getItem('session')).rejects.toThrow('index unreadable')
    expect(f.secure.remove).not.toHaveBeenCalled()
  })
})
