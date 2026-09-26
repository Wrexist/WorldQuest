/**
 * The course path for Home: the course, this account's progress on it, and where that
 * leaves the learner.
 *
 * Synchronous on purpose. The course is in the binary and the progress is in device
 * storage, so there is no loading window to draw — the path is on screen in the same
 * frame as everything else, which is what a skeleton-free primary action looks like.
 * The one failure is a pack that did not parse (`course.ts`), and that is the path's
 * error state rather than an exception.
 */

import { useEffect, useMemo } from 'react'
import { isD1 } from '../../lib/backendConfig.js'
import { courseStanding, type Course, type CourseStanding } from '@worldquest/engines'
import { useFocusFinished } from '../../lib/d1-memory.js'
import { loadCourse } from './course.js'
import { useCourseProgress } from './progress.js'
import { withServerProgress } from './serverProgress.js'

export type CoursePath =
  | { readonly status: 'ready'; readonly course: Course; readonly standing: CourseStanding }
  | { readonly status: 'error' }

export function useCoursePath(): CoursePath {
  const loaded = loadCourse()
  // An id no stored course has, when there is no course: the hook must still run, and
  // it then returns the empty record the failure branch below never reads.
  const progress = useCourseProgress(loaded.ok ? loaded.course.id : '')
  // What the account has finished on any phone, as the server last counted it (D1 only;
  // empty elsewhere, which leaves the device's own count as it was).
  const server = useFocusFinished()
  // Asked for once per account per launch, here as well as by the sync loop, so a missed
  // wake-up cannot leave a newly signed-in phone's path at step one. Loaded lazily: the
  // D1 client reaches native crypto and a legacy build never loads it.
  useEffect(() => {
    if (!isD1()) return
    void import('../../lib/d1-lessons.js').then(({ refreshMemoryOnce }) => refreshMemoryOnce()).catch(() => {})
  }, [])
  return useMemo<CoursePath>(
    () =>
      loaded.ok
        ? {
            status: 'ready',
            course: loaded.course,
            standing: courseStanding(loaded.course, withServerProgress(loaded.course, progress, server)),
          }
        : { status: 'error' },
    [loaded, progress, server],
  )
}
