/**
 * Has this install been through onboarding, and what did it say.
 *
 * On device, not on the server, and deliberately so. The age answer decides whether
 * this is a child experience, and that decision has to be correct on the very first
 * frame of the very first launch — before any network call could have returned. A
 * server-held flag would mean a window in which we do not know whether we are talking
 * to a ten-year-old, and the safe thing to do in that window is nothing at all.
 *
 * It syncs upward once an account exists. It is never read from there.
 */

import { useCallback, useState } from 'react'
import { readJson, writeJson } from '../../lib/storage.js'
import type { OnboardingResult } from './OnboardingScreen.js'

const KEY = 'onboarding.v1'

export type OnboardingState = {
  readonly completed: boolean
  readonly birthYear?: number
  /**
   * Derived at onboarding time and then STORED, not recomputed from the birth year.
   *
   * A child who turns 13 mid-year does not silently gain a friends list and
   * third-party analytics because a birthday passed. Leaving the child experience is
   * a deliberate action with a consent step behind it, not a date arithmetic result.
   */
  readonly isChild?: boolean
}

const NOT_DONE: OnboardingState = { completed: false }

/**
 * The one persisted read in the app whose type is a privacy decision.
 *
 * `_layout` does `if (completed && isChild !== undefined) setChildAccount(isChild)`, and
 * a cast let a non-boolean through that gate. The failure direction happened to be the
 * safe one — `track()` tests `isChildAccount !== false`, so anything that is not the
 * boolean `false` emits nothing — but "happens to fail safe" is not the same claim as
 * "cannot be wrong", and this is the flag that decides whether a ten-year-old's device
 * talks to a third party.
 *
 * A row that fails is `NOT_DONE`, which runs the age gate again. Asking once more is the
 * correct cost; guessing is not.
 */
const isOnboardingState = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const state = value as OnboardingState
  if (typeof state.completed !== 'boolean') return false
  if (state.birthYear !== undefined && !Number.isInteger(state.birthYear)) return false
  return state.isChild === undefined || typeof state.isChild === 'boolean'
}

export function readOnboarding(): OnboardingState {
  return readJson<OnboardingState>(KEY, isOnboardingState) ?? NOT_DONE
}

export type UseOnboarding = {
  readonly state: OnboardingState
  readonly complete: (result: OnboardingResult) => void
  /** Settings → "replay the intro", and the only way back into the flow. */
  readonly reset: () => void
}

export function useOnboarding(): UseOnboarding {
  const [state, setState] = useState<OnboardingState>(readOnboarding)

  const complete = useCallback((result: OnboardingResult) => {
    const next: OnboardingState = {
      completed: true,
      birthYear: result.birthYear,
      isChild: result.isChild,
    }
    writeJson(KEY, next)
    setState(next)
  }, [])

  const reset = useCallback(() => {
    writeJson(KEY, NOT_DONE)
    setState(NOT_DONE)
  }, [])

  return { state, complete, reset }
}
