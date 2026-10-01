/**
 * Which finished steps on the path are fading.
 *
 * Duolingo draws a finished skill gold and, as time passes, cracked — and the cracked ones are
 * where it sends a learner to refresh. This is the same signal read off what the scheduler
 * already knows (`strengthOf`: the mean probability of recalling the step's facts right now),
 * so the path and the scheduler cannot disagree about whether a step is still held.
 *
 * Only DONE steps. A step in progress is unfinished, not rusty, and one not yet started has
 * nothing to fade. And only where there is memory to read: a legacy build has none on the
 * device, so nothing there ever shows as fading — silence rather than a guess.
 *
 * Computed once per mount, like the ramp: the path is a snapshot of where the learner stands
 * when they open Home, and it must not flicker as the clock ticks.
 */
import { useMemo } from 'react'
import { strengthOf } from '@worldquest/engines'
import { useContent } from '../../lib/content.js'
import { cachedMemory } from '../../lib/d1-memory.js'
import type { CoursePath } from './useCoursePath.js'

export function useFadingSteps(path: CoursePath): ReadonlySet<string> {
  const { index } = useContent()
  return useMemo(() => {
    const fading = new Set<string>()
    if (path.status !== 'ready' || index === null) return fading
    const memory = cachedMemory()
    if (memory.size === 0) return fading
    const now = Date.now()
    for (const unit of path.standing.units) {
      for (const step of unit.nodes) {
        if (step.state !== 'done') continue
        const { fading: rusty } = strengthOf(
          index.index,
          memory,
          { entities: [...step.node.focus.entities], attributes: [...step.node.focus.attributes] },
          now,
        )
        if (rusty) fading.add(step.node.id)
      }
    }
    return fading
    // `path` carries the standing; the memory is a snapshot taken when the screen mounts.
  }, [path, index])
}
