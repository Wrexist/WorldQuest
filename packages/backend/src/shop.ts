import { BALANCE } from '@worldquest/engines'
import { z } from 'zod'
import { ApiError, type Account } from './contracts'

/** The only utility the server sells so far. The price is the balance table's, never a caller's. */
export const STREAK_FREEZE = 'utility.streak_freeze'

export const purchaseSchema = z.object({
  purchaseId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
}).strict()

export type PurchaseResult = { itemId: string; count: number; coinBalance: number; revision: number; spent: number }

/**
 * Buy one streak freeze.
 *
 * ## Why this is a server route rather than a shop helper
 *
 * `BALANCE.prices.streakFreeze` is the price, and it is read here rather than sent by the
 * client — a client that could name its own price could name zero. That is also why the
 * *decision* stays in the engines and only the transaction is here: the engines own what
 * a freeze costs and what it does, and this owns not charging twice.
 *
 * ## Not charging twice
 *
 * Two mechanisms, because either alone is a story rather than a guarantee. `purchaseId`
 * is the client's own idempotency key, and the receipt keyed (account, purchase_id) turns
 * a retry into a read. The account's `coins >= 0` check turns a second concurrent debit
 * that raced past the read into an aborted batch rather than a negative balance.
 *
 * Insufficient coins is a refusal that changes nothing at all: the guard row makes the
 * whole batch a no-op rather than leaving a receipt behind for a purchase that did not
 * happen.
 */
export async function buyStreakFreeze(db: D1Database, owner: string, tokenHash: string, input: unknown, now: number): Promise<PurchaseResult> {
  const parsed = purchaseSchema.safeParse(input)
  if (!parsed.success) throw new ApiError('INVALID_BODY', 400)
  const { purchaseId } = parsed.data
  const price = BALANCE.prices.streakFreeze
  for (let attempt = 0; attempt < 3; attempt++) {
    const read = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
      db.prepare('SELECT item_id, coins_spent FROM inventory_receipts WHERE account_id = ? AND purchase_id = ?')
        .bind(owner, purchaseId),
      db.prepare('SELECT count FROM inventory WHERE account_id = ? AND item_id = ?').bind(owner, STREAK_FREEZE),
    ])
    const account = read[0]?.results[0] as unknown as Account | undefined
    if (!account) throw new ApiError('SESSION_EXPIRED', 401)

    // A retried purchase answers with what it already bought. `spent` is zero here because
    // this call spent nothing — the balance it returns is the account's current one.
    const prior = read[1]?.results[0] as { item_id: string; coins_spent: number } | undefined
    if (prior) {
      return { itemId: prior.item_id, count: Number(read[2]?.results[0]?.count ?? 0),
        coinBalance: account.coins, revision: account.revision, spent: 0 }
    }
    if (account.coins < price) {
      throw new ApiError('CANNOT_AFFORD', 409, undefined)
    }

    const revision = account.revision + 1
    const guardId = crypto.randomUUID()
    try {
      await db.batch([
        db.prepare(`INSERT INTO transaction_guards (id, valid) VALUES (?, CASE WHEN EXISTS (
          SELECT 1 FROM accounts a JOIN sessions s ON s.account_id = a.id
          WHERE a.id = ? AND a.revision = ? AND a.deleted_at IS NULL
          AND s.token_hash = ? AND s.expires_at > ?
        ) AND NOT EXISTS (SELECT 1 FROM inventory_receipts WHERE account_id = ? AND purchase_id = ?) THEN 1 ELSE 0 END)`)
          .bind(guardId, owner, account.revision, tokenHash, Date.now(), owner, purchaseId),
        db.prepare('UPDATE accounts SET coins = coins - ?, revision = ? WHERE id = ?').bind(price, revision, owner),
        db.prepare(`INSERT INTO inventory (account_id, item_id, count, updated_at) VALUES (?, ?, 1, ?)
          ON CONFLICT (account_id, item_id) DO UPDATE SET count = inventory.count + 1, updated_at = excluded.updated_at`)
          .bind(owner, STREAK_FREEZE, now),
        db.prepare('INSERT INTO inventory_receipts (account_id, purchase_id, item_id, coins_spent, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(owner, purchaseId, STREAK_FREEZE, price, now),
        db.prepare('DELETE FROM transaction_guards WHERE id = ?').bind(guardId),
      ])
      const count = await db.prepare('SELECT count FROM inventory WHERE account_id = ? AND item_id = ?').bind(owner, STREAK_FREEZE).first<{ count: number }>()
      return { itemId: STREAK_FREEZE, count: Number(count?.count ?? 1), coinBalance: account.coins - price,
        revision, spent: price }
    } catch (error) {
      // The guard failed, another writer moved the revision, or the balance would have gone
      // negative. All three mean: read again and decide again.
      if (!(error instanceof Error)) throw error
    }
  }
  throw new ApiError('RETRY_LATER', 503)
}
