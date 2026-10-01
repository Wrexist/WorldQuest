/**
 * How hard this learner's lessons may be right now: onboarding's level, widened by what
 * they have practised and the XP they have earned (`difficultyRamp` in the engines owns the
 * rule; this only counts).
 *
 * Read once per mount. A lesson screen mounts per lesson, so each lesson sees the memory
 * and the XP as the last one left them, and a lesson never changes difficulty halfway
 * through — which is why the XP is held at the first figure seen rather than following the
 * optimistic total, which moves the instant the lesson's own award is queued.
 *
 * The memory is this device's snapshot of the account's — on a D1 build the server's as
 * last seen (`cachedMemory`), and empty on a legacy build, where the ramp therefore stays
 * at the starting band. The Worker composes from its own memory either way; this decides
 * only what the app ASKS for, and the answer is a preference the Worker bounds.
 */
import { useMemo, useRef } from 'react'
import { difficultyRamp, experienceFrom, type Ramp } from '@worldquest/engines'
import { cachedMemory } from '../../lib/d1-memory.js'
import { useOptimisticProgress } from '../home/useOptimisticProgress.js'
import { usePreferences } from '../settings/usePreferences.js'

export function useDifficultyRamp(): Ramp {
  const { preferences } = usePreferences()
  const { shown } = useOptimisticProgress()

  // First figure seen, then frozen. Written during render on purpose and idempotent: the
  // value only ever goes from "not yet known" to "known", so a re-render cannot change it.
  const xpAtStart = useRef<number | null>(null)
  if (xpAtStart.current === null && shown !== null) xpAtStart.current = shown.xpTotal
  const xp = xpAtStart.current ?? 0

  const experience = useMemo(() => ({ ...experienceFrom([...cachedMemory().values()]), xp }), [xp])
  return useMemo(() => difficultyRamp(preferences.startLevel, experience), [preferences.startLevel, experience])
}
