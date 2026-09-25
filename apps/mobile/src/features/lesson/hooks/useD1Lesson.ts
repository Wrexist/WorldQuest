/**
 * The issued lesson for this screen, on a D1 build.
 *
 * Taken once per mount: a lesson is a ticket the server issued, and re-asking on every
 * render would issue a new one each time. `retry` asks again after an offline start or
 * a failure. On a legacy build (`enabled: false`) it does nothing and says so.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LessonFocus } from '@worldquest/engines'
import type { D1PreparedLesson } from '@worldquest/api/d1-learning'
import { takeLesson } from '../../../lib/d1-lessons.js'

export type D1LessonStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'too-narrow' | 'error'

export function useD1Lesson(
  enabled: boolean,
  request: { readonly count: number; readonly locale: 'en' | 'sv'; readonly screenReader: boolean; readonly focus?: LessonFocus | undefined },
): { readonly status: D1LessonStatus; readonly lesson: D1PreparedLesson | null; readonly retry: () => void } {
  const [status, setStatus] = useState<D1LessonStatus>(enabled ? 'loading' : 'idle')
  const [lesson, setLesson] = useState<D1PreparedLesson | null>(null)
  const [attempt, setAttempt] = useState(0)
  // The request as it was when the screen opened. A pace estimate or a screen-reader
  // toggle arriving mid-lesson must not swap the questions under the learner.
  const first = useRef(request)

  useEffect(() => {
    if (!enabled) return
    let live = true
    setStatus('loading')
    takeLesson(first.current)
      .then((result) => {
        if (!live) return
        if (result.kind === 'ready') {
          setLesson(result.lesson)
          setStatus('ready')
        } else setStatus(result.kind)
      })
      .catch(() => {
        if (live) setStatus('error')
      })
    return () => {
      live = false
    }
  }, [enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { status, lesson, retry }
}
