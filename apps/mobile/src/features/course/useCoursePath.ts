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

import { useMemo } from 'react'
import { courseStanding, type Course, type CourseStanding } from '@worldquest/engines'
import { loadCourse } from './course.js'
import { useCourseProgress } from './progress.js'

export type CoursePath =
  | { readonly status: 'ready'; readonly course: Course; readonly standing: CourseStanding }
  | { readonly status: 'error' }

export function useCoursePath(): CoursePath {
  const loaded = loadCourse()
  // An id no stored course has, when there is no course: the hook must still run, and
  // it then returns the empty record the failure branch below never reads.
  const progress = useCourseProgress(loaded.ok ? loaded.course.id : '')
  return useMemo<CoursePath>(
    () =>
      loaded.ok
        ? { status: 'ready', course: loaded.course, standing: courseStanding(loaded.course, progress) }
        : { status: 'error' },
    [loaded, progress],
  )
}
