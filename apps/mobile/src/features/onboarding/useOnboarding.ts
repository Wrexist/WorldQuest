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

export function readOnboarding(): OnboardingState {
  return readJson<OnboardingState>(KEY) ?? NOT_DONE
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
