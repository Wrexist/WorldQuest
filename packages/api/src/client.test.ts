import { describe, expect, it, vi } from 'vitest'
import {
  createWorldQuestClient,
  ensureSession,
  fetchProgress,
  type WorldQuestClient,
} from './client.js'

// The client is injected into every function here, so a fake is enough — and a fake
// is what lets these run without a network, which is what makes them run at all.
type QueryResult = { data: unknown; error: unknown; count?: number | null }

function fakeClient(options: {
  wallets?: QueryResult
  streaks?: QueryResult
  userFacts?: QueryResult
  session?: { user: { id: string } } | null
  signInAnonymously?: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>
}): WorldQuestClient {
  const results: Record<string, QueryResult> = {
    wallets: options.wallets ?? { data: null, error: null },
    streaks: options.streaks ?? { data: null, error: null },
    user_facts: options.userFacts ?? { data: null, error: null, count: 0 },
  }

  const from = (table: string) => {
    const result = results[table]!
    const chain = {
      select: () => chain,
      in: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    }
    return chain
  }

  return {
    from,
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: options.session ?? null }, error: null }),
      signInAnonymously:
        options.signInAnonymously ??
        (() => Promise.resolve({ data: { user: { id: 'anon-1' } }, error: null })),
    },
  } as unknown as WorldQuestClient
}

describe('createWorldQuestClient', () => {
  it('refuses to start without config', () => {
    expect(() => createWorldQuestClient({ url: '', publishableKey: 'sb_publishable_x' })).toThrow(
      /config missing/i,
    )
    expect(() =>
      createWorldQuestClient({ url: 'https://x.supabase.co', publishableKey: '' }),
    ).toThrow(/config missing/i)
  })

  it('refuses a service-role key', () => {
    // The single worst thing that can happen to this codebase: a service-role key in
    // a client bundle bypasses every RLS policy in the schema, and it does so
    // silently — everything works, for everyone, on everyone else's data.
    for (const key of ['sb_secret_abc123', 'eyJhbGciOi.service_role.xyz']) {
      expect(() =>
        createWorldQuestClient({ url: 'https://x.supabase.co', publishableKey: key }),
      ).toThrow(/service-role/i)
    }
  })

  it('accepts a publishable key', () => {
    expect(() =>
      createWorldQuestClient({
        url: 'https://x.supabase.co',
        publishableKey: 'sb_publishable_abc123',
      }),
    ).not.toThrow()
  })
})

describe('ensureSession', () => {
  it('reuses an existing session rather than creating a second user', async () => {
    const signInAnonymously = vi.fn()
    const client = fakeClient({
      session: { user: { id: 'existing-user' } },
      signInAnonymously: signInAnonymously as never,
    })

    await expect(ensureSession(client)).resolves.toEqual({ userId: 'existing-user' })
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it('creates an anonymous user on a first launch', async () => {
    await expect(ensureSession(fakeClient({ session: null }))).resolves.toEqual({
      userId: 'anon-1',
    })
  })

  it('surfaces a sign-in failure instead of returning a userless session', async () => {
    const client = fakeClient({
      session: null,
      signInAnonymously: () =>
        Promise.resolve({ data: { user: null }, error: new Error('offline') }),
    })
    await expect(ensureSession(client)).rejects.toThrow('offline')
  })
})

describe('fetchProgress', () => {
  it('reports zeroes for a user whose rows do not exist yet', async () => {
    // The provisioning trigger runs on signup, but a first launch can read before it
    // lands. A missing row is a moment in time, not an error — throwing here would
    // put an error screen in front of every brand-new user.
    await expect(fetchProgress(fakeClient({}))).resolves.toEqual({
      xpTotal: 0,
      coins: 0,
      gems: 0,
      hearts: 0,
      streak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      freezesHeld: 0,
      factsMastered: 0,
    })
  })

  it('maps the wallet, streak and mastery count', async () => {
    const progress = await fetchProgress(
      fakeClient({
        wallets: { data: { xp_total: 4820, coins: 430, gems: 12, hearts: 4 }, error: null },
        streaks: {
          data: { current: 12, longest: 31, last_active_date: '2026-08-05', freezes_held: 1 },
          error: null,
        },
        userFacts: { data: null, error: null, count: 7 },
      }),
    )

    expect(progress).toEqual({
      xpTotal: 4820,
      coins: 430,
      gems: 12,
      hearts: 4,
      streak: 12,
      longestStreak: 31,
      // Stubbed to '' and 0 by the streak route with a note saying they "do NOT exist in
      // the progress payload yet". They existed in `streaks` the whole time; nothing
      // selected them, so the freeze mechanic could not be shown OR bought.
      lastActiveDate: '2026-08-05',
      freezesHeld: 1,
      factsMastered: 7,
    })
  })

  it('throws when a query fails rather than reporting zero progress', async () => {
    // Silently showing 0 XP to a user with 4820 is the worst possible failure here:
    // it looks like data loss, and a user who believes their progress is gone does
    // not come back to check.
    await expect(
      fetchProgress(fakeClient({ wallets: { data: null, error: new Error('rls denied') } })),
    ).rejects.toThrow('rls denied')

    await expect(
      fetchProgress(fakeClient({ streaks: { data: null, error: new Error('timeout') } })),
    ).rejects.toThrow('timeout')

    await expect(
      fetchProgress(fakeClient({ userFacts: { data: null, error: new Error('nope') } })),
    ).rejects.toThrow('nope')
  })
})
