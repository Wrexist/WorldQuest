import { beforeEach, expect, it, vi } from 'vitest'
import { writeJson } from './storage.js'
import { play, __resetSoundsForTests } from './sound.js'

const audio = vi.hoisted(() => ({ configure: vi.fn(), play: vi.fn(), seek: vi.fn() }))
vi.mock('expo-audio', () => ({
  setAudioModeAsync: audio.configure,
  createAudioPlayer: () => ({ volume: 0, play: audio.play, seekTo: audio.seek }),
}))
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

beforeEach(() => {
  __resetSoundsForTests()
  vi.resetAllMocks()
  audio.configure.mockResolvedValue(undefined)
  audio.seek.mockResolvedValue(undefined)
  writeJson('preferences.v1', { sound: true })
})

it('awaits shared audio setup for simultaneous cues', async () => {
  let ready!: () => void
  audio.configure.mockReturnValue(new Promise<void>(resolve => { ready = resolve }))
  play('correct'); play('unlock')
  await flush()
  expect(audio.configure).toHaveBeenCalledOnce()
  expect(audio.play).not.toHaveBeenCalled()
  ready(); await flush()
  expect(audio.play).toHaveBeenCalledTimes(2)
})

it('retries after a transient setup failure', async () => {
  audio.configure.mockRejectedValueOnce(new Error('busy'))
  play('correct'); await flush()
  expect(audio.play).not.toHaveBeenCalled()
  play('correct'); await flush()
  expect(audio.configure).toHaveBeenCalledTimes(2)
  expect(audio.play).toHaveBeenCalledOnce()
})

it('honours sound being switched off while a cue is seeking', async () => {
  let ready!: () => void
  audio.seek.mockReturnValue(new Promise<void>(resolve => { ready = resolve }))
  play('correct'); await flush()
  writeJson('preferences.v1', { sound: false })
  ready(); await flush()
  expect(audio.play).not.toHaveBeenCalled()
})
