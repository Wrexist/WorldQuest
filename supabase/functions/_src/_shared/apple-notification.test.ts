/**
 * Reading somebody else's JSON, and the ways that goes wrong quietly.
 *
 * Every case here is a field Apple might not send, or might send in a shape we did not
 * expect. None of them throws in production — they return null and the notification is
 * refused with a reason — and that is the property being asserted, because the
 * alternative is a `TypeError` that becomes a 500 and asks Apple to redeliver the same
 * broken payload for three days.
 */

import { describe, expect, it } from 'vitest'
import { parseAppleNotification } from './apple-notification.js'

const payload = {
  notificationType: 'DID_RENEW',
  notificationUUID: 'apple-uuid-0001',
  signedDate: 1_785_000_000_000,
  data: { bundleId: 'com.wrexist.worldquest', environment: 'Production' },
}

const transaction = {
  originalTransactionId: '2000000000000001',
  expiresDate: 1_787_592_000_000,
}

describe('a well-formed notification', () => {
  it('reads the fields the decision needs and nothing else', () => {
    const parsed = parseAppleNotification(payload, transaction)!
    expect(parsed.notificationId).toBe('apple-uuid-0001')
    expect(parsed.storeRef).toBe('2000000000000001')
    expect(parsed.notification).toEqual({
      platform: 'ios',
      kind: 'DID_RENEW',
      notifiedAt: 1_785_000_000_000,
      expiresAt: 1_787_592_000_000,
      environment: 'production',
      isTrial: false,
    })
  })

  it('keys the subscription on originalTransactionId, not transactionId', () => {
    // transactionId changes every renewal; originalTransactionId is the one that stays
    // the same for the life of the subscription. Keying on the wrong one means every
    // renewal looks like a subscription no user owns.
    const parsed = parseAppleNotification(payload, {
      ...transaction,
      transactionId: '2000000000000099',
    })!
    expect(parsed.storeRef).toBe('2000000000000001')
  })

  it('carries the subtype through, and omits it when there is none', () => {
    // DID_FAIL_TO_RENEW means two different things with and without GRACE_PERIOD. An
    // invented empty string resolves the ambiguity towards pausing a paying customer.
    const withSubtype = parseAppleNotification(
      { ...payload, notificationType: 'DID_FAIL_TO_RENEW', subtype: 'GRACE_PERIOD' },
      transaction,
    )!
    expect(withSubtype.notification.subtype).toBe('GRACE_PERIOD')
    expect('subtype' in parseAppleNotification(payload, transaction)!.notification).toBe(false)
  })

  it('lower-cases the environment Apple actually sends', () => {
    // Apple sends "Production" and "Sandbox", capitalised. The engine compares against
    // lower-case literals, and a mismatch would silently refuse every notification.
    expect(
      parseAppleNotification({ ...payload, data: { ...payload.data, environment: 'Sandbox' } }, transaction)!
        .notification.environment,
    ).toBe('sandbox')
  })
})

describe('what it refuses', () => {
  it('refuses an environment it does not recognise rather than assuming one', () => {
    // Falling through to production is the assumption that costs money.
    for (const environment of ['Staging', '', undefined, 42]) {
      expect(parseAppleNotification({ ...payload, data: { ...payload.data, environment } }, transaction)).toBeNull()
    }
  })

  it('refuses a notification with no signedDate', () => {
    // signedDate IS the out-of-order guard. Without one, a delayed failure cannot be
    // ordered against the row and would be applied over the renewal that fixed it.
    expect(parseAppleNotification({ ...payload, signedDate: undefined }, transaction)).toBeNull()
    expect(parseAppleNotification({ ...payload, signedDate: '1785000000000' }, transaction)).toBeNull()
    expect(parseAppleNotification({ ...payload, signedDate: Number.NaN }, transaction)).toBeNull()
  })

  it('refuses when the fields that identify the notification are missing', () => {
    expect(parseAppleNotification({ ...payload, notificationType: undefined }, transaction)).toBeNull()
    expect(parseAppleNotification({ ...payload, notificationUUID: '' }, transaction)).toBeNull()
    expect(parseAppleNotification(payload, { ...transaction, originalTransactionId: undefined })).toBeNull()
  })

  it('does not throw on an empty object', () => {
    // The input is from the wire. "Not the shape we expected" is an ordinary Tuesday.
    expect(parseAppleNotification({}, {})).toBeNull()
  })
})

describe('the paid-through date', () => {
  it('is null when Apple did not send one, so the existing date stands', () => {
    // A cancellation carries no new expiry, and the engine reads null as "leave it
    // alone". Defaulting to 0 or to now would end a period somebody already paid for.
    const parsed = parseAppleNotification(payload, { originalTransactionId: '1' })!
    expect(parsed.notification.expiresAt).toBeNull()
  })

  it('is null rather than NaN when the field is not a number', () => {
    const parsed = parseAppleNotification(payload, {
      originalTransactionId: '1',
      expiresDate: '1787592000000',
    })!
    expect(parsed.notification.expiresAt).toBeNull()
  })
})

describe('trial detection errs towards "used"', () => {
  it('reads the unambiguous signal', () => {
    expect(
      parseAppleNotification(payload, { ...transaction, offerDiscountType: 'FREE_TRIAL' })!.notification.isTrial,
    ).toBe(true)
  })

  it('also treats an introductory offer as a consumed trial', () => {
    // offerType 1 is an introductory offer, which is how a free trial is delivered. A
    // paid introductory offer is also type 1, so this marks the trial used either way —
    // deliberately, because the opposite mistake offers a second free week the store
    // then refuses at the till.
    expect(parseAppleNotification(payload, { ...transaction, offerType: 1 })!.notification.isTrial).toBe(true)
  })

  it('does not treat an ordinary renewal as a trial', () => {
    expect(parseAppleNotification(payload, transaction)!.notification.isTrial).toBe(false)
    expect(parseAppleNotification(payload, { ...transaction, offerType: 2 })!.notification.isTrial).toBe(false)
  })
})
