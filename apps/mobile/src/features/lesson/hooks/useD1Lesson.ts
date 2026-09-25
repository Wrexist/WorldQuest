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
import { isOnline, onConnectivityChange } from '../../../lib/connectivity.js'
import { reportCrash } from '../../../lib/reporting.js'
import { D1AuthError } from '@worldquest/api/d1-auth'

export type D1LessonStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'too-narrow' | 'error'

export function useD1Lesson(
  enabled: boolean,
  request: { readonly count: number; readonly locale: 'en' | 'sv'; readonly screenReader: boolean; readonly focus?: LessonFocus | undefined
    readonly explicitFocus?: boolean | undefined },
): { readonly status: D1LessonStatus; readonly lesson: D1PreparedLesson | null; readonly retry: () => void } {
  const [status, setStatus] = useState<D1LessonStatus>(enabled ? 'loading' : 'idle')
  const [lesson, setLesson] = useState<D1PreparedLesson | null>(null)
  const [attempt, setAttempt] = useState(0)
  // The request as it is when the lesson is first asked for (once `enabled`), so a pace
  // estimate arriving mid-lesson cannot swap the questions under the learner.
  const first = useRef(request)
  const started = useRef(false)
  if (!started.current) first.current = request

  useEffect(() => {
    if (!enabled) return
    started.current = true
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
      .catch((error: unknown) => {
        // Recorded through the one crash path, by name only: a code is our identifier,
        // never a value from the learner's data.
        reportCrash({ domain: 'lesson', isFatal: false,
          name: error instanceof D1AuthError ? `D1AuthError.${error.code}` : error instanceof Error ? error.name : 'unknown' })
        if (live) setStatus('error')
      })
    return () => {
      live = false
    }
  }, [enabled, attempt])

  // Offline with nothing saved: try again by itself the moment the connection returns,
  // rather than leaving the learner to find the button.
  useEffect(() => {
    if (status !== 'offline') return
    return onConnectivityChange(() => {
      if (isOnline()) setAttempt((n) => n + 1)
    })
  }, [status])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { status, lesson, retry }
}
