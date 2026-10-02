import { authBudget } from './account-policy'
import type { Clock } from './contracts'
import type { MailDelivery } from './email-provider'

/** Shared, persistent caps for the launch's free transactional-mail allocation.
 * Reserve before contacting the provider; uncertain/failed sends are not refunded.
 * Each D1 upsert is atomic, so concurrent Workers cannot exceed a cap. A later
 * rejected reservation can consume earlier capacity, which fails conservatively.
 */
export function withMailBudget(db: D1Database, mail: MailDelivery, clock: Clock): MailDelivery {
  return { async send(message) {
    const now = clock()
    const date = new Date(now)
    const hourEnd = Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000
    const dayEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
    const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    await authBudget(db, 'mail-global:month', 2700, now, monthEnd - now)
    await authBudget(db, 'mail-global:day', 90, now, dayEnd - now)
    await authBudget(db, 'mail-global:hour', 30, now, hourEnd - now)
    await mail.send(message)
  } }
}
