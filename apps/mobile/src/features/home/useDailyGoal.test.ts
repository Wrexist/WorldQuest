/**
 * The two ways this hook's date can be wrong, and the one way its read can misbehave.
 *
 * The hook's own header is mostly about a target that MOVED when it should have held
 * still. These are the opposite failure: a target that held still while the day
 * underneath it changed, and a read that wrote to storage when it should only have
 * looked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { useDailyGoal } from './useDailyGoal.js'
import { peekJson } from '../../lib/storage.js'
import { localDay } from '../../lib/day.js'

const KEY = 'goal.today.v1'

/** One minute to midnight, local, so a short tick of fake time crosses the day. */
const ALMOST_MIDNIGHT = new Date(2026, 7, 11, 23, 59, 0)

const storedDay = (): string | undefined => peekJson<{ day: string }>(KEY).value?.day

describe('useDailyGoal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(ALMOST_MIDNIGHT)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rolls over at midnight with nothing else touching the screen', () => {
    // The case a date computed during render cannot reach: Home is mounted, the phone is
    // awake and face-up, and nobody taps anything. No render happens, so the day stays on
    // yesterday — and the first lesson of the new day counts towards a goal that was
    // already met.
    const { result } = renderHook(() => useDailyGoal())
    expect(result.current.target).toBeGreaterThan(0)
    expect(storedDay()).toBe(localDay(ALMOST_MIDNIGHT))

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000) // through midnight
    })

    expect(storedDay()).toBe(localDay(new Date()))
    expect(storedDay()).not.toBe(localDay(ALMOST_MIDNIGHT))
  })

  it('reads storage without repairing it, because it reads during render', () => {
    // Asserted against the source rather than by planting a corrupt entry: the MMKV
    // stand-in in `test/setup.ts` is reached through `writeJson`, which produces valid
    // JSON by construction, so there is no way from here to store bytes that fail to
    // parse. `sound.test.ts` takes the same approach for the same reason.
    //
    // The distinction is not cosmetic. `readJson` DELETES an entry it cannot parse, and
    // this file's target read happens inside a `useMemo` — work React is allowed to throw
    // away and re-run, and does re-run under StrictMode. A delete from in there is a
    // side effect nobody asked for.
    const source = readFileSync(join(import.meta.dirname, 'useDailyGoal.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
    expect(code).toMatch(/\bpeekJson\b/)
    expect(code).not.toMatch(/\breadJson\b/)
  })
})
