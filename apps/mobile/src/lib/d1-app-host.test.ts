import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native-mmkv', () => ({ MMKV: class { getString() { return undefined } set() {} delete() {} } }))
vi.mock('./supabase.js', () => ({ acceptSignedInAccount: vi.fn(), detachSession: vi.fn() }))
vi.mock('./d1-auth.js', () => ({ createD1AccountClient: vi.fn() }))

const { ownerOf } = await import('./d1-app-host.js')

describe('ownerOf', () => {
  it('reads the owner back out of the host namespace, and nothing else', () => {
    const namespace = `d1.data.v1.${encodeURIComponent(JSON.stringify(['https://api.example', 'user-123']))}.`
    expect(ownerOf(namespace)).toBe('user-123')
    expect(() => ownerOf('account.data.v2.x.')).toThrow('Invalid D1 namespace')
    expect(() => ownerOf(`d1.data.v1.${encodeURIComponent(JSON.stringify(['https://api.example', '']))}.`)).toThrow()
  })
})
