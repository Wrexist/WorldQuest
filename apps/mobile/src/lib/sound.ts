/**
 * Sound.
 *
 * ## Why this file appeared last
 *
 * "Sound respects the Settings toggle" sat in the Definition of Done as blocked on
 * **assets**, filed next to flags and landmarks, for the whole life of the project.
 * That was half right and the half that was wrong cost months.
 *
 * A national flag is somebody's artwork with a licence attached, and we genuinely
 * cannot ship one until that is resolved. A correct-answer chime is a sine wave with
 * an envelope. `scripts/make-sounds.py` generates all six, which means the project
 * owns them outright — no licence to track, no attribution to carry, nothing to take
 * down. The blocker was never "audio is impossible", it was "we cannot license
 * someone else's chime", and nobody had separated the two.
 *
 * Until now the Settings toggle wrote a preference **nothing read** — the fourth time
 * this exact shape of bug has shipped here, after the daily goal, haptics and the
 * language picker. `worldquest-visual-craft` R12 exists because of it: a control that
 * writes a value nothing reads is placeholder UI wearing a real control's clothes.
 *
 * ## What each sound means (design-system.md §9)
 *
 * All six are in C major so two overlapping never clash, and all are under 600 ms so
 * one is never still playing when the next question arrives.
 *
 * **Wrong is not a buzzer.** It is a gentle falling major second — deliberately not a
 * minor second, which is the sound of a mistake in every film score ever written. It
 * says "not that one" and gets out of the way. This is the same rule that gives a
 * wrong answer a muted surface instead of red and `impactMedium` instead of
 * `Notification.Error`: we state the truth and move on, we do not punish.
 *
 * ## Off by default
 *
 * §9 says sound is off on first launch and a one-time prompt offers to enable it. A
 * game that starts making noise on a bus, in a classroom, or next to a sleeping baby
 * has made an enemy in its first ten seconds. So the check here is `=== true`, not
 * `!== false` — the opposite of haptics, which are silent and default on.
 *
 * ## Never throws
 *
 * Audio is unavailable on web without a user gesture, on a simulator, and on any
 * device where the media session is busy. Every call is fire-and-forget with the
 * rejection swallowed: a lesson must never fail because a phone could not beep.
 */

import { Audio } from 'expo-av'
import { readJson } from './storage.js'

export type SoundName = 'correct' | 'wrong' | 'unlock' | 'levelup' | 'streak' | 'tap'

/**
 * Static `require`s, because Metro resolves assets at build time.
 *
 * A computed path (`require(\`../../assets/sounds/${name}.wav\`)`) bundles nothing and
 * fails at runtime with a module-not-found — on device only, where nobody is looking.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const FILES: Record<SoundName, number> = {
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  unlock: require('../../assets/sounds/unlock.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  streak: require('../../assets/sounds/streak.wav'),
  tap: require('../../assets/sounds/tap.wav'),
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** The same key `usePreferences` writes. Read directly so any module can fire. */
const PREFERENCES_KEY = 'preferences.v1'

/**
 * `=== true`, not `!== false`.
 *
 * Sound is opt-in (§9). An unset preference means the user has never been asked, and
 * the safe answer to "should this device make a noise?" when nobody has said yes is
 * silence — the same shape of default as the analytics child gate.
 */
const enabled = (): boolean => readJson<{ sound?: boolean }>(PREFERENCES_KEY)?.sound === true

/** Loaded once each, on first play. Six short files; unloading and reloading per tap
 *  costs more than keeping them. */
const cache = new Map<SoundName, Audio.Sound>()

let configured = false

async function configure(): Promise<void> {
  if (configured) return
  configured = true
  await Audio.setAudioModeAsync({
    // The silent switch is the user telling us directly, and §9 says never play when
    // the device is silenced. iOS only honours that when this is false — the default
    // is to play through silent, which is what a music app wants and a game does not.
    playsInSilentModeIOS: false,
    // Never interrupt whatever the user was already listening to. Someone doing a
    // lesson with a podcast on should keep the podcast.
    shouldDuckAndroid: true,
    staysActiveInBackground: false,
  })
}

export function play(name: SoundName): void {
  if (!enabled()) return
  void (async () => {
    await configure()
    let sound = cache.get(name)
    if (sound === undefined) {
      const created = await Audio.Sound.createAsync(FILES[name], { volume: 0.8 })
      sound = created.sound
      cache.set(name, sound)
    }
    // From the start every time. A second correct answer inside 300 ms must retrigger
    // rather than be swallowed, which is what happens if you only call `playAsync`.
    await sound.setPositionAsync(0)
    await sound.playAsync()
  })().catch(() => {
    // Swallowed on purpose — see the header.
  })
}

export const soundCorrect = (): void => play('correct')
export const soundWrong = (): void => play('wrong')
export const soundUnlock = (): void => play('unlock')
export const soundLevelUp = (): void => play('levelup')
export const soundStreak = (): void => play('streak')
export const soundTap = (): void => play('tap')

/** Test seam: drop the cache so a test can assert loading behaviour. */
export function __resetSoundsForTests(): void {
  cache.clear()
  configured = false
}
