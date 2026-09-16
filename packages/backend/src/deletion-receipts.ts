import { hashToken } from './auth'

export const DELETION_RECEIPT_MS = 24 * 60 * 60 * 1000

/** A receipt can acknowledge erasure; it cannot authenticate or recover any data. */
export async function deletionCompleted(db: D1Database, request: Request, challengeId: string | null, now: number): Promise<boolean> {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!token) return false
  const receipt = await db.prepare(`SELECT token_hash FROM deletion_receipts
    WHERE token_hash=? AND challenge_id IS ? AND expires_at>?`)
    .bind(await hashToken(token), challengeId, now).first()
  return receipt !== null
}

/** Bounded hourly maintenance; expired receipts never authorize acknowledgments. */
export async function pruneDeletionReceipts(db: D1Database, now: number): Promise<void> {
  await db.prepare(`DELETE FROM deletion_receipts WHERE token_hash IN (
    SELECT token_hash FROM deletion_receipts WHERE expires_at<=? ORDER BY expires_at LIMIT 1000
  )`).bind(now).run()
}
