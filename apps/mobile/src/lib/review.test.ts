import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * The store SDK, stubbed so each test can decide what the platform says.
 *
 * `vi.mock` is hoisted above the imports, so the two spies have to be declared inside
 * the factory and read back out through the module.
 */
vi.mock('expo-store-review', () => ({
  isAvailableAsync: vi.fn(async () => true),
  requestReview: vi.fn(async () => {}),
}))

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))

import * as StoreReview from 'expo-store-review'
import { COOL_OFF_DAYS, MIN_ACTIVE_DAYS, askForReview, reviewVerdict } from './review.js'
import { clearAll, readJson, writeJson } from './storage.js'

const isAvailableAsync = vi.mocked(StoreReview.isAvailableAsync)
const requestReview = vi.mocked(StoreReview.requestReview)

/**
 * The module's CODE, with every comment stripped.
 *
 * The header explains at length why `hasAction` is the wrong call, and a naive grep for
 * the word finds that explanation and reports the bug it is warning about. This repo has
 * already shipped that exact false positive once — `pnpm reachability` marked an export
 * wired because a comment used the word — so the check reads what runs.
 */
const source = readFileSync(join(import.meta.dirname, 'review.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

const DAY_MS = 86_400_000
const NOW = Date.UTC(2026, 7, 14)

/** A situation that would otherwise say "ask", so each test can spoil exactly one rule. */
const willing = {
  available: true,
  isChild: false,
  version: '1.0.0',
  now: NOW,
  activeDays: MIN_ACTIVE_DAYS,
  log: null,
} as const

/** Puts `days` distinct days of finished lessons into the activity log. */
const usedFor = (days: number): void => {
  const log: Record<string, number> = {}
  for (let i = 0; i < days; i++) log[`2026-08-${String(i + 1).padStart(2, '0')}`] = 1
  writeJson('activity.byDay.v1', log)
}

beforeEach(() => {
  clearAll()
  vi.clearAllMocks()
  isAvailableAsync.mockResolvedValue(true)
  requestReview.mockResolvedValue(undefined)
  vi.setSystemTime(NOW)
})

describe('reviewVerdict — the four rules', () => {
  it('asks when the moment has been earned', () => {
    expect(reviewVerdict(willing)).toBe('ask')
  })

  it('never asks a child, even when every other rule says yes', () => {
    // Rule 1, and the one with no override: a rating prompt is a request to leave the
    // app and write in public. We do not send ten-year-olds to the App Store.
    expect(reviewVerdict({ ...willing, isChild: true })).toBe('child')
    // Checked FIRST, so it cannot be reached around by a future rule that returns
    // early. If this ever reports 'unavailable' the child check has moved down.
    expect(reviewVerdict({ ...willing, isChild: true, available: false })).toBe('child')
    expect(reviewVerdict({ ...willing, isChild: true, activeDays: 0 })).toBe('child')
  })

  it('waits until the app has been used on separate days', () => {
    // A five-star rating on day one is a rating of the App Store screenshots.
    expect(reviewVerdict({ ...willing, activeDays: MIN_ACTIVE_DAYS - 1 })).toBe('too-new')
    expect(reviewVerdict({ ...willing, activeDays: 1 })).toBe('too-new')
  })

  it('asks at most once per version', () => {
    const log = { version: '1.0.0', at: NOW - 400 * DAY_MS }
    expect(reviewVerdict({ ...willing, log })).toBe('asked-this-version')
  })

  it('holds off for the cool-off even across a version bump', () => {
    // iOS silently caps the prompt at three per year. Asking on every release burns
    // the allowance on the first three builds and the request that mattered no-ops.
    const recent = { version: '0.9.0', at: NOW - (COOL_OFF_DAYS - 1) * DAY_MS }
    expect(reviewVerdict({ ...willing, log: recent })).toBe('cooling-off')

    const old = { version: '0.9.0', at: NOW - (COOL_OFF_DAYS + 1) * DAY_MS }
    expect(reviewVerdict({ ...willing, log: old })).toBe('ask')
  })

  it('spends the allowance no faster than the platform refills it', () => {
    // Three a year is what iOS permits; COOL_OFF_DAYS must not let us exceed it.
    expect(COOL_OFF_DAYS * 3).toBeGreaterThanOrEqual(365)
  })

  it('does nothing when the native modal is not available', () => {
    // False under TestFlight and on web. The alternative — opening the store in a
    // browser — is the one thing this module refuses to do.
    expect(reviewVerdict({ ...willing, available: false })).toBe('unavailable')
  })
})

describe('askForReview', () => {
  it('asks once, and then not again on the same version', async () => {
    usedFor(MIN_ACTIVE_DAYS)

    await expect(askForReview('quest_complete')).resolves.toBe('ask')
    expect(requestReview).toHaveBeenCalledTimes(1)

    await expect(askForReview('quest_complete')).resolves.toBe('asked-this-version')
    expect(requestReview).toHaveBeenCalledTimes(1)
  })

  it('never reaches the store SDK at all for a child', async () => {
    usedFor(MIN_ACTIVE_DAYS)
    writeJson('onboarding.v1', { completed: true, birthYear: 2016, isChild: true })

    await expect(askForReview('quest_complete')).resolves.toBe('child')
    expect(requestReview).not.toHaveBeenCalled()
    // Not even the availability question. A child's device should not be asked.
    expect(isAvailableAsync).not.toHaveBeenCalled()
  })

  it('records the ask BEFORE making it, so a crash cannot cause a loop', async () => {
    usedFor(MIN_ACTIVE_DAYS)
    requestReview.mockRejectedValueOnce(new Error('store went away'))

    // Swallowed, because a celebration must not fail because a store SDK did.
    await expect(askForReview('quest_complete')).resolves.toBe('unavailable')
    // But recorded. Over-recording costs one missed prompt; under-recording asks the
    // user on every single quest until they uninstall.
    expect(readJson('review.asked.v1')).toEqual({ version: '1.0.0', at: NOW })
  })

  it('does not ask a user who has only been here today', async () => {
    usedFor(1)
    await expect(askForReview('quest_complete')).resolves.toBe('too-new')
    expect(requestReview).not.toHaveBeenCalled()
  })

  it('records nothing when it decides not to ask', async () => {
    usedFor(1)
    await askForReview('quest_complete')
    expect(readJson('review.asked.v1')).toBeNull()
  })
})

describe('review — the rules a runtime test cannot see', () => {
  it('never uses hasAction, which would open the App Store in a browser', () => {
    // `hasAction()` is true whenever the app config carries a store URL, and
    // `requestReview()` then falls back to `Linking.openURL` — throwing the user out
    // of the app in the middle of a celebration. Both spellings resolve to "a
    // function was called", so only the source can tell them apart.
    expect(source).not.toMatch(/hasAction/)
    expect(source).toMatch(/isAvailableAsync/)
  })

  it('is asked for from the celebration and nowhere else', () => {
    // Rule 2 is enforced by the absence of a code path: there is no moment value for
    // a lesson summary, so the prompt structurally cannot follow a wrong answer, a
    // lost heart or a broken streak. This is the test that notices when someone adds
    // a second caller.
    const callers = execFileSync(
      'git',
      // `--untracked` so a caller added but not yet committed still counts. Without it
      // this test passes for exactly as long as the new call site is unstaged.
      ['grep', '-l', '--untracked', 'askForReview', '--', 'apps/mobile/app', 'apps/mobile/src'],
      { cwd: join(import.meta.dirname, '../../../..'), encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0 && !line.endsWith('review.test.ts'))

    expect(callers.sort()).toEqual([
      'apps/mobile/app/quest-complete.tsx',
      'apps/mobile/src/lib/review.ts',
    ])
  })
})
