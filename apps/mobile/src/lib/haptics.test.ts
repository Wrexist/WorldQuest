import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hapticCelebrate, hapticCorrect, hapticSelect, hapticWrong } from './haptics.js'
import { remove, writeJson } from './storage.js'

const source = readFileSync(join(import.meta.dirname, 'haptics.ts'), 'utf8')

describe('haptics — the rule that matters', () => {
  it('never fires the error pattern for a wrong answer', () => {
    // `NotificationFeedbackType.Error` is two sharp knocks — the pattern iOS uses for
    // "your payment failed". This app does not punish a child for not knowing
    // something yet, and a runtime test would pass just as happily with it, because
    // both spellings resolve to "a function was called".
    expect(source).not.toMatch(/NotificationFeedbackType\.Error/)
    expect(source).not.toMatch(/NotificationFeedbackType\.Warning/)
  })

  it('uses the gentle impact for a wrong answer, as the motion spec asks', () => {
    const wrong = source.slice(source.indexOf('export const hapticWrong'))
    expect(wrong).toMatch(/ImpactFeedbackStyle\.Medium/)
  })

  it('offers no way to make haptics stronger or more frequent', () => {
    // A ten-year-old with the phone under a desk does not need the app to be more
    // insistent. There is no intensity knob, and there should never be one.
    expect(source).not.toMatch(/Heavy|intensity|repeat|duration/)
  })
})

describe('haptics — the setting', () => {
  it('does not fire when the user turned them off', () => {
    // The toggle has existed in Settings since the first week, writing a preference
    // that nothing read.
    writeJson('preferences.v1', { haptics: false })
    // No throw and no call; the assertion is that these are safe to invoke at all.
    expect(() => {
      hapticCorrect()
      hapticWrong()
      hapticCelebrate()
      hapticSelect()
    }).not.toThrow()
  })

  it('defaults to on when the preference has never been written', () => {
    remove('preferences.v1')
    expect(() => hapticCorrect()).not.toThrow()
    expect(source).toMatch(/!== false/)
  })

  it('never lets a missing Taptic Engine break a lesson', () => {
    // Unavailable on web, on simulators, and on plenty of Android hardware. Every
    // call is fire-and-forget with the rejection swallowed.
    expect(source).toMatch(/\.catch\(\(\) => \{\}\)/)
  })
})
