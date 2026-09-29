/**
 * How hard this learner's lessons may be right now: onboarding's level, widened by what
 * they have practised (`difficultyRamp` in the engines owns the rule; this only counts).
 *
 * Read once per mount. A lesson screen mounts per lesson, so each lesson sees the memory
 * as the last one left it, and a lesson never changes difficulty halfway through.
 *
 * The memory is this device's snapshot of the account's — on a D1 build the server's as
 * last seen (`cachedMemory`), and empty on a legacy build, where the ramp therefore stays
 * at the starting band. The Worker composes from its own memory either way; this decides
 * only what the app ASKS for, and the answer is a preference the Worker bounds.
 */
import { useMemo } from 'react'
import { difficultyRamp, experienceFrom, type Ramp } from '@worldquest/engines'
import { cachedMemory } from '../../lib/d1-memory.js'
import { usePreferences } from '../settings/usePreferences.js'

export function useDifficultyRamp(): Ramp {
  const { preferences } = usePreferences()
  const experience = useMemo(() => experienceFrom([...cachedMemory().values()]), [])
  return useMemo(() => difficultyRamp(preferences.startLevel, experience), [preferences.startLevel, experience])
}
