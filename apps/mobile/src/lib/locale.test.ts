/**
 * The language the app starts in.
 *
 * This existed as a bug for as long as Settings has had a language picker. The root
 * layout applied `deviceLocale()` unconditionally on mount, and the only reader of
 * the stored preference was the picker itself — so a user on an English phone who
 * chose Swedish got Swedish until they closed the app, and English every time they
 * opened it again, for ever. There was no way to notice from inside a session.
 *
 * The device mock in `test/setup.ts` reports `en-GB`, so every case below is "the
 * device says English" and the question is only whether the user's own answer
 * survives.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { startupLocale } from './locale.js'
import { remove, writeJson } from './storage.js'

beforeEach(() => {
  remove('preferences.v1')
})

describe('startupLocale', () => {
  it('follows the device when the user has never chosen', () => {
    expect(startupLocale()).toBe('en')
  })

  it('keeps an explicit choice across a cold start', () => {
    writeJson('preferences.v1', { language: 'sv' })
    expect(startupLocale()).toBe('sv')
  })

  it('follows the device when the user chose "match my device"', () => {
    // Stored as `'system'` rather than resolved at write time on purpose: someone who
    // asked to follow their phone should keep following it after they change their
    // phone's language, not stay frozen at whatever it said that day.
    writeJson('preferences.v1', { language: 'system' })
    expect(startupLocale()).toBe('en')
  })

  it('falls back to the device for a language we do not ship', () => {
    // A preference file can outlive a locale — a build that shipped `de` and then
    // dropped it, or a hand-edited store. Rendering keys is worse than rendering
    // English.
    writeJson('preferences.v1', { language: 'de' })
    expect(startupLocale()).toBe('en')
  })

  it('ignores a preferences blob with no language in it', () => {
    writeJson('preferences.v1', { haptics: false })
    expect(startupLocale()).toBe('en')
  })
})
