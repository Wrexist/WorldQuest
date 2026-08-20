/**
 * The column that decides which day a user is in, and which nothing wrote.
 *
 * `profiles.timezone` drives the streak day, the XP soft-cap window,
 * `isFirstLessonOfDay` and `expire_streaks()`. It defaults to `'UTC'`, and
 * `signInAnonymously()` sends no metadata, so every user this product created rolled
 * over at UTC midnight — in Auckland, at 11 a.m.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
// Deliberately not 'UTC': the test runner's own zone IS UTC, so a fixture of 'UTC'
// would agree with the device and never exercise the write.
const single = vi.fn(() => Promise.resolve({ data: { timezone: 'Pacific/Auckland' } }))
const from = vi.fn(() => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
  update,
}))

let configured = true

vi.mock('./supabase.js', () => ({
  isConfigured: () => configured,
  supabase: () => ({ from }),
  currentUser: () => Promise.resolve({ userId: 'u1' }),
  backendUrl: () => '',
}))

const { deviceTimeZone, resetTimeZoneMemo, syncTimeZone } = await import('./timezone.js')

beforeEach(() => {
  vi.clearAllMocks()
  resetTimeZoneMemo()
  configured = true
  single.mockResolvedValue({ data: { timezone: 'Pacific/Auckland' } })
})

describe('syncTimeZone', () => {
  it('writes the device zone when the server disagrees', async () => {
    await syncTimeZone()
    expect(update).toHaveBeenCalledWith({ timezone: deviceTimeZone() })
  })

  it('writes nothing when the server already agrees', async () => {
    const zone = deviceTimeZone()
    expect(zone).not.toBeNull()
    single.mockResolvedValue({ data: { timezone: zone as string } })
    await syncTimeZone()
    expect(update).not.toHaveBeenCalled()
  })

  it('writes once, not on every launch', async () => {
    await syncTimeZone()
    await syncTimeZone()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all without a backend', async () => {
    configured = false
    await syncTimeZone()
    expect(from).not.toHaveBeenCalled()
  })

  it('never throws, whatever the network did', async () => {
    // A cold start must not be able to fail on this. The device keeps the zone it had,
    // which is exactly the behaviour that preceded the function.
    single.mockRejectedValue(new Error('offline'))
    await expect(syncTimeZone()).resolves.toBeUndefined()
  })
})

describe('deviceTimeZone', () => {
  it('returns a real IANA name', () => {
    // Anything else is a row `guard_protected_profile_columns` rejects against
    // `pg_timezone_names` — deliberately, because a zone `Intl` cannot parse made every
    // later lesson submission 500 for that account, permanently.
    const zone = deviceTimeZone()
    expect(zone).not.toBeNull()
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: zone! })).not.toThrow()
  })
})
