/**
 * The rules that matter, and the one a runtime test cannot see.
 *
 * Sound was blocked on "assets" for the whole project, next to flags. It was never
 * the same problem: a flag is somebody's artwork, a chime is a sine wave. These tests
 * exist so the distinction — and the no-punishment rule — do not quietly rot.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { play, __resetSoundsForTests } from './sound.js'
import { remove, writeJson } from './storage.js'

const source = readFileSync(join(import.meta.dirname, 'sound.ts'), 'utf8')

/**
 * The source with its commentary removed.
 *
 * The header explains at length why a wrong answer must NOT be a buzzer, which means
 * a naive search for "buzzer" matches the very paragraph forbidding it. This repo has
 * made that mistake before — a no-shame check that failed on "Nothing is lost." A ban
 * is about what the code does, so it is asserted against the code.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  remove('preferences.v1')
  __resetSoundsForTests()
})

describe('sound — the rule that matters', () => {
  it('never reaches for a buzzer or an error tone', () => {
    // The wrong-answer sound is a gentle falling major second, generated in
    // `scripts/make-sounds.py`. A runtime test cannot hear the difference between
    // that and a buzzer — both are "a file was played" — so the assertion is that
    // nothing in this module names one.
    expect(code).not.toMatch(/buzz|error\.wav|fail\.wav|alarm/i)
  })

  it('offers no way to make sound louder or more frequent', () => {
    // Same principle as haptics: a ten-year-old with the phone under a desk does not
    // need the app to be more insistent. Volume is fixed at the call site.
    expect(code).not.toMatch(/setVolumeAsync|volume:\s*1(\.0)?\b|isLooping:\s*true/)
  })
})

describe('sound — the setting', () => {
  it('is silent until the user has actually said yes', () => {
    // `=== true`, not `!== false`. An unset preference means nobody has been asked,
    // and the safe answer to "should this device make a noise?" is silence.
    expect(source).toMatch(/\?\.sound === true/)
    expect(() => play('correct')).not.toThrow()
  })

  it('stays silent when the preference is explicitly off', () => {
    writeJson('preferences.v1', { sound: false })
    expect(() => play('correct')).not.toThrow()
  })

  it('does not throw when enabled in an environment with no audio device', () => {
    // Web without a gesture, a simulator, a busy media session. A lesson must never
    // fail because a phone could not beep.
    writeJson('preferences.v1', { sound: true })
    expect(() => play('wrong')).not.toThrow()
  })

  it('honours the silent switch rather than playing through it', () => {
    // iOS defaults to playing through the silent switch, which is what a music app
    // wants and a game does not. §9: never play when the device is silenced.
    //
    // `playsInSilentMode`, not expo-av's `playsInSilentModeIOS`: SDK 54 removed
    // expo-av and expo-audio renamed the flag. The rule it encodes is unchanged, and
    // asserting the new name is what stops the migration from quietly dropping it —
    // the old key on the new API is simply ignored, so a rename that lost this would
    // have compiled, shipped, and started playing through a silenced phone.
    expect(source).toMatch(/playsInSilentMode:\s*false/)
    expect(source).not.toMatch(/^\s*playsInSilentModeIOS:/m)
  })

  it('ducks rather than interrupts', () => {
    // Someone doing a lesson with a podcast on should keep the podcast.
    //
    // expo-audio's `interruptionMode: 'duckOthers'` is the cross-platform successor
    // to expo-av's Android-only `shouldDuckAndroid: true` — same intent, and now it
    // applies on iOS too, which is a straight improvement rather than a compromise.
    expect(source).toMatch(/interruptionMode:\s*'duckOthers'/)
    expect(source).not.toMatch(/^\s*shouldDuckAndroid:/m)
  })
})

describe('sound — the files', () => {
  it('requires every asset statically so Metro can bundle it', () => {
    // A computed `require(\`...${name}.wav\`)` bundles nothing and fails at runtime on
    // device only — the one place nobody is looking.
    expect(source).not.toMatch(/require\(`/)
    for (const name of ['correct', 'wrong', 'unlock', 'levelup', 'streak', 'tap']) {
      expect(source).toContain(`assets/sounds/${name}.wav`)
    }
  })

  it('ships all six, and each is under the 600 ms the spec allows', () => {
    const dir = join(import.meta.dirname, '..', '..', 'assets', 'sounds')
    for (const name of ['correct', 'wrong', 'unlock', 'levelup', 'streak', 'tap']) {
      const wav = readFileSync(join(dir, `${name}.wav`))
      // 44.1 kHz, 16-bit mono → 88200 bytes per second. Header is 44 bytes.
      const ms = ((wav.length - 44) / 88_200) * 1000
      expect(ms, `${name} is ${ms.toFixed(0)}ms`).toBeLessThan(600)
      expect(ms, `${name} is empty`).toBeGreaterThan(20)
    }
  })
})
