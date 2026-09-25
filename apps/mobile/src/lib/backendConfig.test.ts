import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendConfig } from './backendConfig.js'

afterEach(() => vi.unstubAllEnvs())

describe('backendConfig', () => {
  it('selects the Worker only when asked for by name and given an origin', () => {
    vi.stubEnv('EXPO_PUBLIC_BACKEND', 'd1')
    vi.stubEnv('EXPO_PUBLIC_D1_URL', 'https://api.worldquest.example/')
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://legacy.example')
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk')
    expect(backendConfig()).toEqual({ kind: 'd1', url: 'https://api.worldquest.example' })
  })

  it('keeps the legacy pair when D1 is named without an origin, and none without either', () => {
    vi.stubEnv('EXPO_PUBLIC_BACKEND', 'd1')
    vi.stubEnv('EXPO_PUBLIC_D1_URL', '')
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://legacy.example')
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk')
    expect(backendConfig()).toMatchObject({ kind: 'supabase', url: 'https://legacy.example' })
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', '')
    expect(backendConfig()).toEqual({ kind: 'none', url: '' })
  })
})
