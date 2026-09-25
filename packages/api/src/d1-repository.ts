import { AccountChangedError, type AccountRepository } from './ports.js'
import { D1AuthError, type AuthFetch, type createD1AuthClient } from './d1-auth.js'
import type { ContinuePurchase, FreezePurchase, Progress, StreakRepair } from './contracts.js'

/**
 * The account repository over the Cloudflare Worker (ADR 0013).
 *
 * Same port as the legacy adapter, so screens do not know which backend answered. Two
 * honest differences:
 *
 * · Lessons do not go through `submitLesson`. The Worker grades only lessons it issued
 *   (tickets), so the app uses `createD1LearningClient`/`createD1LessonQueue` for them;
 *   calling the legacy method here is a wiring bug and says so.
 * · Leagues, subscriptions and remote flags do not exist on this backend yet. They answer
 *   "none" rather than failing, which is what the app already shows when they are off.
 *
 * Owner-bound for its whole life, like the learning client: a renewal may change the
 * token, never the owner, and a response for a previous owner is discarded.
 */
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const day = (v: unknown): v is string | null => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))

/** A fresh id per offer. Not a secret; it only has to be unlikely to collide. */
function offerId(prefix: string, randomBytes: () => Uint8Array): string {
  return `${prefix}-${[...randomBytes()].map(b => b.toString(16).padStart(2, '0')).join('')}`
}

export function createD1AccountRepository(options: {
  auth: ReturnType<typeof createD1AuthClient>; owner: string; isCurrent: () => boolean; fetch: AuthFetch
  /** Twelve random bytes per call; native callers pass the OS generator. */
  randomBytes: () => Uint8Array
}): AccountRepository & { progressWithInventory: () => Promise<Progress & { inventory: string[] }> } {
  const assertCurrent = () => { if (!options.isCurrent()) throw new AccountChangedError() }
  async function request(path: string, body?: unknown): Promise<unknown> {
    assertCurrent()
    const session = await options.auth.ensureSession()
    assertCurrent()
    if (session.userId !== options.owner) throw new AccountChangedError()
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000)
    try {
      const response = await options.fetch(options.auth.endpoint + path, { method: body === undefined ? 'GET' : 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const value = await response.json()
      assertCurrent()
      if (!response.ok) throw new D1AuthError(object(value) && typeof value.error === 'string' ? value.error : 'SERVICE_UNAVAILABLE', response.status)
      return value
    } finally { clearTimeout(timeout) }
  }
  const status = (value: unknown, allowed: readonly string[]): Record<string, unknown> & { status: string } => {
    if (!object(value) || typeof value.status !== 'string' || !allowed.includes(value.status)) throw new D1AuthError('INVALID_RESPONSE')
    return value as Record<string, unknown> & { status: string }
  }
  async function progressWithInventory() {
    const v = await request('/v1/progress')
    if (!object(v) || !count(v.xpTotal) || !count(v.coins) || !count(v.hearts) || !count(v.streak) || !count(v.longestStreak)
      || !count(v.factsMastered) || !day(v.lastActiveDate) || !count(v.freezesHeld) || !day(v.brokenOn)
      || !(v.lastRepairAt === null || count(v.lastRepairAt)) || !Array.isArray(v.inventory)
      || !v.inventory.every((id: unknown) => typeof id === 'string')) throw new D1AuthError('INVALID_RESPONSE')
    return { xpTotal: v.xpTotal, coins: v.coins, hearts: v.hearts, streak: v.streak, longestStreak: v.longestStreak,
      factsMastered: v.factsMastered, lastActiveDate: v.lastActiveDate, freezesHeld: v.freezesHeld, brokenOn: v.brokenOn,
      lastRepairAt: v.lastRepairAt, inventory: v.inventory as string[] }
  }
  return {
    identity: { backendId: options.auth.endpoint, userId: options.owner },
    submitLesson: async () => { throw new D1AuthError('USE_D1_LESSON_QUEUE') },
    progressWithInventory,
    fetchProgress: async () => {
      const { inventory: _inventory, ...progress } = await progressWithInventory()
      return progress
    },
    fetchSubscription: async () => ({ status: 'none', tier: 'free', expiresAt: null, willRenew: false, hasUsedTrial: false }),
    buyStreakFreeze: async () => status(await request('/v1/shop/freeze', { requestId: offerId('freeze', options.randomBytes) }),
      ['purchased', 'at_cap', 'insufficient_funds', 'not_for_sale', 'no_streak']) as FreezePurchase,
    repairStreak: async () => status(await request('/v1/streak/repair', { requestId: offerId('repair', options.randomBytes) }),
      ['repaired', 'cooldown', 'insufficient_funds', 'not_for_sale', 'no_streak', 'not_broken', 'nothing_to_restore', 'window_expired']) as StreakRepair,
    buyLessonContinue: async (continueId) => status(await request('/v1/lessons/continue', { requestId: continueId }),
      ['purchased', 'already_paid', 'insufficient_funds', 'not_for_sale']) as ContinuePurchase,
    fetchLeague: async () => null,
    fetchLeagueOptOut: async () => true,
    setLeagueOptOut: async () => {},
    fetchInventory: async () => (await progressWithInventory()).inventory,
    // One request id per item, ever: a cosmetic is bought once, so a retry after a lost
    // response is the same purchase, not a second one.
    purchaseItem: async (itemId) => {
      const result = status(await request('/v1/shop/item', { requestId: `item-${itemId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, itemId }),
        ['purchased', 'owned', 'insufficient_funds', 'not_for_sale'])
      return { status: result.status }
    },
    fetchTimeZone: async () => {
      const v = await request('/v1/account')
      if (!object(v) || typeof v.timeZone !== 'string') throw new D1AuthError('INVALID_RESPONSE')
      return v.timeZone
    },
    setTimeZone: async (zone) => { await request('/v1/account/time-zone', { timeZone: zone }) },
    fetchFeatureFlags: async () => [],
  }
}
