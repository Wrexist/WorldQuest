import { BALANCE, FREEZE_PRICE, SELLABLE_KINDS, currentStreak, grantFreeze, localDate, masteryOf, priceFor, repair, repairAvailability,
  type CosmeticKind, type IsoDate, type MemoryState, type RecoveryState } from '@worldquest/engines'
import { z } from 'zod'
import shopPack from '../../content/packs/shop/titles.v1.json'
import { ApiError, type Account, type Clock } from './contracts'
import { knownTimeZone } from './time-zone'

/**
 * Coin spending, decided by the server.
 *
 * Every spend is keyed by a request id the client makes once per OFFER (a lesson can
 * run out of hearts twice, and the second continue is a real purchase). A replay of
 * the same id returns the stored result and moves nothing; the same id reused for a
 * different thing is a conflict. Refusals (too few coins, at the cap) write nothing,
 * so the same offer can succeed later.
 *
 * Writes share the account revision guard with lesson submission, so a freeze bought
 * while a lesson is being graded cannot lose either one (S06): whichever lands second
 * re-reads and retries.
 */

export type SpendKind = 'freeze' | 'repair' | 'continue' | 'item'
export const spendSchema = z.object({ requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
  itemId: z.string().regex(/^[a-z0-9.-]{1,80}$/).optional() }).strict()
type SpendInput = z.infer<typeof spendSchema>

/** What the shop may sell: the pack's titles whose price agrees with the balance table. */
const CATALOGUE = new Map((shopPack.items as { id: string; kind: string; price: number }[])
  .filter(item => SELLABLE_KINDS.includes(item.kind as CosmeticKind) && item.price === priceFor(item.kind as CosmeticKind))
  .map(item => [item.id, item.price]))

const addDays = (day: IsoDate, n: number): IsoDate => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * The streak as the learner should see it now, and what a repair could restore.
 *
 * A break is known two ways: a lesson that reset the streak stored it, or no lesson has
 * happened since and the gap is too long for the freezes held. The second is derived at
 * read time, so nothing needs a nightly job to be honest.
 */
export function recoveryView(a: Account, now: number) {
  const zone = knownTimeZone(a.time_zone)
  const today = localDate(now, zone)
  const shown = currentStreak({ current: a.streak_current, lastActiveDate: a.streak_last_day, freezesHeld: a.freezes_held }, now, zone)
  let brokenOn: IsoDate | null = a.streak_broken_on
  let restorable = a.streak_broken_on ? a.streak_restorable : 0
  if (!brokenOn && a.streak_last_day && shown === 0 && a.streak_current > 0) {
    // The first day no lesson and no freeze covered.
    brokenOn = addDays(a.streak_last_day, 1 + Math.min(a.freezes_held, 1))
    restorable = a.streak_current
  }
  const state: RecoveryState = { current: restorable, longest: a.streak_longest, lastActiveDate: a.streak_last_day,
    freezesHeld: a.freezes_held, brokenOn, lastRepairAt: a.last_repair_at }
  // A lesson today already started a fresh day-one streak; the repair keeps that day.
  const restoreTo = restorable + (a.streak_broken_on && a.streak_last_day === today ? 1 : 0)
  return { zone, today, shown, state, restoreTo }
}

type Decision = { result: Record<string, unknown>; cost: number; set?: Record<string, unknown>; item?: string }

function decide(kind: SpendKind, a: Account, input: SpendInput, now: number, owned: boolean): Decision {
  const view = recoveryView(a, now)
  if (kind === 'freeze') {
    if (view.shown === 0) return { result: { status: 'no_streak' }, cost: 0 }
    const granted = grantFreeze({ freezesHeld: a.freezes_held })
    if (!granted.granted) return { result: { status: 'at_cap', freezesHeld: a.freezes_held }, cost: 0 }
    if (a.coins < FREEZE_PRICE) return { result: { status: 'insufficient_funds' }, cost: 0 }
    return { result: { status: 'purchased', freezesHeld: granted.freezesHeld, coins: a.coins - FREEZE_PRICE },
      cost: FREEZE_PRICE, set: { freezes_held: granted.freezesHeld } }
  }
  if (kind === 'continue') {
    const price = BALANCE.prices.continueLesson
    if (a.coins < price) return { result: { status: 'insufficient_funds' }, cost: 0 }
    return { result: { status: 'purchased', spent: price, coins: a.coins - price }, cost: price }
  }
  if (kind === 'item') {
    const price = input.itemId === undefined ? undefined : CATALOGUE.get(input.itemId)
    if (price === undefined) return { result: { status: 'not_for_sale' }, cost: 0 }
    if (owned) return { result: { status: 'owned' }, cost: 0 }
    if (a.coins < price) return { result: { status: 'insufficient_funds' }, cost: 0 }
    return { result: { status: 'purchased', coins: a.coins - price }, cost: price, item: input.itemId! }
  }
  const availability = repairAvailability(view.state, now, view.zone)
  if (!availability.available && availability.reason === 'cooldown') {
    return { result: { status: 'cooldown', availableInDays: availability.availableInDays }, cost: 0 }
  }
  const outcome = repair(view.state, view.restoreTo, a.coins, now, view.zone)
  if (!outcome.ok) {
    const status = { 'not-broken': 'not_broken', 'window-expired': 'window_expired', 'nothing-to-restore': 'nothing_to_restore',
      'insufficient-coins': 'insufficient_funds', cooldown: 'cooldown' }[outcome.reason]
    return { result: { status }, cost: 0 }
  }
  return { result: { status: 'repaired', spent: outcome.coinsSpent, current: outcome.state.current, coins: a.coins - outcome.coinsSpent },
    cost: outcome.coinsSpent, set: { streak_current: outcome.state.current, streak_longest: outcome.state.longest,
      streak_last_day: outcome.state.lastActiveDate, streak_broken_on: null, streak_restorable: 0, last_repair_at: now } }
}

export async function spend(db: D1Database, owner: string, tokenHash: string, kind: SpendKind, input: SpendInput,
  clock: Clock = Date.now): Promise<Record<string, unknown>> {
  if ((kind === 'item') !== (input.itemId !== undefined)) throw new ApiError('INVALID_BODY', 400)
  const subject = input.itemId ?? ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = clock()
    const read = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
      db.prepare('SELECT kind, subject, result FROM spends WHERE account_id = ? AND request_id = ?').bind(owner, input.requestId),
      db.prepare('SELECT 1 FROM inventory WHERE account_id = ? AND item_id = ?').bind(owner, subject),
    ])
    const account = read[0]?.results[0] as unknown as Account | undefined
    if (!account) throw new ApiError('SESSION_EXPIRED', 401)
    const prior = read[1]?.results[0] as { kind: string; subject: string; result: string } | undefined
    if (prior) {
      if (prior.kind !== kind || prior.subject !== subject) throw new ApiError('IDEMPOTENCY_CONFLICT', 409)
      const stored = JSON.parse(prior.result) as Record<string, unknown>
      // The client asked again for a spend that already landed. For a continue that is
      // "already paid", with the balance as it stands now.
      return kind === 'continue' ? { status: 'already_paid', coins: account.coins } : stored
    }
    const decision = decide(kind, account, input, now, (read[2]?.results.length ?? 0) > 0)
    if (decision.cost === 0) return decision.result
    const set = Object.entries(decision.set ?? {})
    const guardId = crypto.randomUUID()
    const statements = [
      db.prepare(`INSERT INTO transaction_guards (id, valid) VALUES (?, CASE WHEN EXISTS (
        SELECT 1 FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND a.revision = ? AND a.deleted_at IS NULL AND s.token_hash = ? AND s.expires_at > ?
      ) THEN 1 ELSE 0 END)`).bind(guardId, owner, account.revision, tokenHash, now),
      db.prepare('INSERT INTO spends (account_id, request_id, kind, subject, result) VALUES (?, ?, ?, ?, ?)')
        .bind(owner, input.requestId, kind, subject, JSON.stringify(decision.result)),
      db.prepare('INSERT INTO ledger (account_id, lesson_id, xp, coins) VALUES (?, ?, 0, ?)')
        .bind(owner, `spend:${input.requestId}`, -decision.cost),
      db.prepare(`UPDATE accounts SET revision = revision + 1, coins = coins - ?${set.map(([k]) => `, ${k} = ?`).join('')} WHERE id = ?`)
        .bind(decision.cost, ...set.map(([, v]) => v), owner),
      ...(decision.item ? [db.prepare('INSERT INTO inventory (account_id, item_id, request_id) VALUES (?, ?, ?)')
        .bind(owner, decision.item, input.requestId)] : []),
      db.prepare('DELETE FROM transaction_guards WHERE id = ?').bind(guardId),
    ]
    try { await db.batch(statements); return decision.result } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('wq_revision_guard')) throw error
    }
  }
  throw new ApiError('RETRY_LATER', 503)
}

/** The `Progress` projection the app's Home, Profile and Streak screens read. */
export async function progress(db: D1Database, owner: string, tokenHash: string, now: number) {
  const read = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
      WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
    db.prepare('SELECT state FROM memories WHERE account_id = ? LIMIT 5001').bind(owner),
    db.prepare('SELECT item_id FROM inventory WHERE account_id = ? ORDER BY item_id').bind(owner),
  ])
  const account = read[0]?.results[0] as unknown as Account | undefined
  if (!account) throw new ApiError('SESSION_EXPIRED', 401)
  const view = recoveryView(account, now)
  const mastered = (read[1]?.results ?? []).filter(row =>
    ['mastered', 'burnished'].includes(masteryOf(JSON.parse(String(row.state)) as MemoryState, now))).length
  return {
    xpTotal: account.xp, coins: account.coins, hearts: BALANCE.hearts.max,
    streak: view.shown, longestStreak: account.streak_longest, factsMastered: mastered,
    lastActiveDate: account.streak_last_day, freezesHeld: account.freezes_held,
    brokenOn: view.state.brokenOn, lastRepairAt: account.last_repair_at,
    // The length `repair` would restore, from the same view the repair itself uses, so
    // "bring back your 10-day streak" on Home and the 10 days a repair buys cannot differ.
    restoreTo: view.state.brokenOn === null ? null : view.restoreTo,
    inventory: (read[2]?.results ?? []).map(row => String(row.item_id)),
  }
}
