import { beforeEach, describe, expect, it } from 'vitest'
import { clearAll, setStorageAccount, startGuestStorage } from '../../lib/storage.js'
import {
  mayOfferProfileAfterNextLesson,
  PROFILE_ASK_LIMIT,
  profileAsksShown,
  recordProfileAskShown,
  shouldOfferProfile,
} from './profileAsk.js'

const ask = {
  lessonsEnded: 1,
  timesShown: 0,
  isChild: false,
  account: 'guest',
  online: true,
} as const

beforeEach(() => clearAll())

describe('shouldOfferProfile', () => {
  it('asks a guest adult after the first and the second lesson', () => {
    expect(shouldOfferProfile(ask)).toBe(true)
    expect(shouldOfferProfile({ ...ask, lessonsEnded: 2, timesShown: 1 })).toBe(true)
  })

  it('never asks a child, and never somebody whose age is unknown', () => {
    // An under-13 is never asked for an email address. Unknown is not permission.
    expect(shouldOfferProfile({ ...ask, isChild: true })).toBe(false)
    expect(shouldOfferProfile({ ...ask, isChild: undefined })).toBe(false)
  })

  it('never asks somebody already linked, or whose account nobody has answered for', () => {
    expect(shouldOfferProfile({ ...ask, account: 'linked' })).toBe(false)
    // Offline at launch the lookup never answers — and a signed-in learner must not be
    // asked to create the profile they already have.
    expect(shouldOfferProfile({ ...ask, account: 'unknown' })).toBe(false)
  })

  it('does not ask when the next screen could not be used', () => {
    expect(shouldOfferProfile({ ...ask, online: false })).toBe(false)
  })

  it('stops after two asks, and after the first two lessons', () => {
    expect(shouldOfferProfile({ ...ask, timesShown: PROFILE_ASK_LIMIT })).toBe(false)
    expect(shouldOfferProfile({ ...ask, lessonsEnded: 3 })).toBe(false)
    expect(shouldOfferProfile({ ...ask, lessonsEnded: 0 })).toBe(false)
  })
})

describe('mayOfferProfileAfterNextLesson', () => {
  it('looks the account up only when the coming lesson could end in the ask', () => {
    expect(mayOfferProfileAfterNextLesson({ lessonsEndedBefore: 0, timesShown: 0, isChild: false })).toBe(true)
    expect(mayOfferProfileAfterNextLesson({ lessonsEndedBefore: 2, timesShown: 0, isChild: false })).toBe(false)
    expect(mayOfferProfileAfterNextLesson({ lessonsEndedBefore: 0, timesShown: 2, isChild: false })).toBe(false)
    expect(mayOfferProfileAfterNextLesson({ lessonsEndedBefore: 0, timesShown: 0, isChild: true })).toBe(false)
  })
})

describe('the count', () => {
  it('starts at zero and counts each showing', () => {
    expect(profileAsksShown()).toBe(0)
    recordProfileAskShown()
    recordProfileAskShown()
    expect(profileAsksShown()).toBe(2)
  })

  it('belongs to the device, so signing out does not reset it', () => {
    recordProfileAskShown()
    recordProfileAskShown()
    setStorageAccount('someone')
    startGuestStorage()
    expect(profileAsksShown()).toBe(2)
  })
})
