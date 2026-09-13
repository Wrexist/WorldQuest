import { beforeEach, expect, it, vi } from 'vitest'
import type { AuthFetch } from '@worldquest/api'

const fixture = vi.hoisted(() => ({ values: new Map<string, string>(), clear: vi.fn(async () => {}) }))
vi.mock('expo-crypto', () => ({ getRandomBytesAsync: async () => new Uint8Array(32).fill(0xee) }))
vi.mock('./credentials', () => ({
  createSessionStorage: () => ({
    getItem: async (key: string) => fixture.values.get(key) ?? null,
    setItem: async (key: string, value: string) => { fixture.values.set(key, value) },
    removeItem: async (key: string) => { fixture.values.delete(key) },
  }),
  clearSessionStorage: () => fixture.clear(),
}))
const baseURL = 'https://api.example.invalid'
const session = { userId: '11111111-1111-4111-8111-111111111111', token: 'a'.repeat(64), expiresAt: Date.now() + 30 * 86_400_000 }
beforeEach(() => {
  vi.resetModules(); fixture.values.clear()
  fixture.clear.mockReset().mockImplementation(async () => { fixture.values.clear() })
})

it('shares a single auth writer across native consumers and refuses concurrent owner transitions', async () => {
  const { createD1AccountClient } = await import('./d1-auth')
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const transport: AuthFetch = async () => { await wait; return { status: 201, ok: true, json: async () => session } }
  const a = createD1AccountClient(baseURL, transport), b = createD1AccountClient(baseURL)
  const guest = a.startGuest()
  await expect(b.startGuest()).rejects.toMatchObject({ code: 'AUTH_BUSY' })
  expect(() => createD1AccountClient('https://different.example.invalid')).toThrow('ACCOUNT_ENDPOINT_CHANGED')
  release(); expect(await guest).toEqual(session)
})

it('keeps a failed logout closed until erasure succeeds, then gives the next account a fresh client', async () => {
  const { createD1AccountClient } = await import('./d1-auth')
  const transport: AuthFetch = async url => ({ status: 200, ok: true, json: async () => url.endsWith('/guest') ? session : { signedOut: true } })
  const a = createD1AccountClient(baseURL, transport); await a.startGuest()
  fixture.clear.mockRejectedValueOnce(new Error('device locked'))
  await expect(a.signOut()).rejects.toThrow('device locked')
  await expect(createD1AccountClient(baseURL).startGuest()).rejects.toThrow('Account changed')
  await a.signOut()
  expect(await createD1AccountClient(baseURL, transport).restore()).toBeNull()
  await expect(a.startGuest()).rejects.toThrow('Account changed')
})

it('passes the native async random bytes into renewal without changing the progress owner', async () => {
  const { createD1AccountClient } = await import('./d1-auth')
  const transport = vi.fn<AuthFetch>(async (url, init) => ({ status: 200, ok: true,
    json: async () => url.endsWith('/guest') ? { ...session, expiresAt: Date.now() + 86_400_000 }
      : { ...session, token: (JSON.parse(String(init.body)) as { replacement: string }).replacement } }))
  const a = createD1AccountClient(baseURL, transport); await a.startGuest()
  expect(await a.ensureSession()).toEqual({ ...session, token: 'e'.repeat(64) })
  expect(await a.sessionStatus()).toBe('active')
})
