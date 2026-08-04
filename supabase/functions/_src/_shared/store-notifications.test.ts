/**
 * The order the checks run in, and what each failure tells the store to do next.
 *
 * Every assertion here is about a decision that is invisible in production until it has
 * been wrong for a month: a retry loop nobody notices, a duplicate applied twice, an
 * error message that teaches a forger what to fix.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  handleStoreNotification,
  type NotificationDeps,
  type VerifiedNotification,
} from './store-notifications.js'

type Sub = { readonly status: string }
type Note = { readonly kind: string }

const verified: VerifiedNotification<Note> = {
  notificationId: 'apple-uuid-1',
  storeRef: 'original-txn-1',
  platform: 'ios',
  notification: { kind: 'DID_RENEW' },
  payload: { raw: true },
}

const deps = (over: Partial<NotificationDeps<Sub, Note>> = {}): NotificationDeps<Sub, Note> => ({
  verify: vi.fn(async () => verified),
  seen: vi.fn(async () => false),
  findUser: vi.fn(async () => 'user-1'),
  load: vi.fn(async () => ({ status: 'active' })),
  record: vi.fn(async () => {}),
  apply: vi.fn(() => ({ status: 'active' })),
  ...over,
})

describe('what the store is told to do next', () => {
  it('applies and acknowledges a good notification', async () => {
    const d = deps()
    const result = await handleStoreNotification('jws', d)
    expect(result.status).toBe(200)
    expect(d.record).toHaveBeenCalledWith('user-1', verified, { status: 'active' })
  })

  it('refuses an unverifiable notification without saying which check failed', async () => {
    // "wrong bundleId" vs "chain does not terminate at the pinned root" is a free
    // tutorial in what to fix. The body carries nothing; the reason is for our logs.
    const d = deps({ verify: vi.fn(async () => null) })
    const result = await handleStoreNotification('forged', d)
    expect(result.status).toBe(401)
    expect(result.body).toEqual({ ok: false })
    expect(d.record).not.toHaveBeenCalled()
  })

  it('refuses when verification throws rather than returning null', async () => {
    const d = deps({
      verify: vi.fn(async () => {
        throw new Error('malformed JWS')
      }),
    })
    expect((await handleStoreNotification('{{{', d)).status).toBe(401)
    expect(d.record).not.toHaveBeenCalled()
  })

  it('checks authenticity BEFORE touching the database', async () => {
    // Otherwise an unauthenticated caller can probe which notification ids we hold by
    // timing the duplicate check. Provenance first, always.
    const d = deps({ verify: vi.fn(async () => null) })
    await handleStoreNotification('forged', d)
    expect(d.seen).not.toHaveBeenCalled()
    expect(d.findUser).not.toHaveBeenCalled()
    expect(d.load).not.toHaveBeenCalled()
  })

  it('acknowledges a redelivery without applying it twice', async () => {
    // Both stores redeliver until acknowledged. A DID_RENEW applied twice is a second
    // month granted.
    const d = deps({ seen: vi.fn(async () => true) })
    const result = await handleStoreNotification('jws', d)
    expect(result.status).toBe(200)
    expect(d.apply).not.toHaveBeenCalled()
    expect(d.record).not.toHaveBeenCalled()
  })

  it('acknowledges a notification for a subscription no user owns', async () => {
    // Real and permanent: a purchase made before the account was linked, a refund for a
    // deleted account. It will be exactly as unmatchable tomorrow, so a retry loop here
    // buries the failures that ARE actionable.
    const d = deps({ findUser: vi.fn(async () => null) })
    const result = await handleStoreNotification('jws', d)
    expect(result.status).toBe(200)
    expect(result.reason).toMatch(/no user/)
    expect(d.record).not.toHaveBeenCalled()
  })

  it('records the event even when the decision declines to change anything', async () => {
    // Unknown type, sandbox payload, out of order. These are exactly the notifications
    // somebody will want to read back when a subscription looks wrong — dropping them
    // keeps the table tidy and makes the dispute unanswerable.
    const d = deps({ apply: vi.fn(() => null) })
    const result = await handleStoreNotification('jws', d)
    expect(result.status).toBe(200)
    expect(d.record).toHaveBeenCalledWith('user-1', verified, null)
  })

  it('hands findUser the whole notification, not just the store reference', async () => {
    // A first purchase has no row to match on: nothing has ever linked that store
    // subscription to a user, so `storeRef` cannot find one and the only thread back is
    // `accountRef`. Passing just the reference would make that fallback impossible to
    // reach from inside the one dependency that is supposed to own it.
    const d = deps()
    await handleStoreNotification('jws', { ...d, verify: async () => ({ ...verified, accountRef: 'user-uuid' }) })
    expect(d.findUser).toHaveBeenCalledWith(expect.objectContaining({ accountRef: 'user-uuid' }))
  })

  it('asks the store to retry when OUR storage fails', async () => {
    // The one case where retrying is what we want: the next attempt might work.
    const d = deps({
      record: vi.fn(async () => {
        throw new Error('connection reset')
      }),
    })
    const result = await handleStoreNotification('jws', d)
    expect(result.status).toBe(500)
  })

  it('asks the store to retry when the duplicate check itself fails', async () => {
    // Not 200: we do not know whether this was a duplicate, and acknowledging an
    // unexamined notification loses it for ever.
    const d = deps({
      seen: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    expect((await handleStoreNotification('jws', d)).status).toBe(500)
  })

  it('never leaks an internal error message to the store', async () => {
    const d = deps({
      load: vi.fn(async () => {
        throw new Error('relation "subscriptions" does not exist')
      }),
    })
    const result = await handleStoreNotification('jws', d)
    expect(JSON.stringify(result.body)).not.toMatch(/relation|subscriptions/)
  })
})
