/**
 * The lesson hook — the only place the state machine meets React.
 *
 * Everything decision-shaped lives in `@worldquest/engines`. This hook does three
 * things and nothing else: hold the machine's state, inject the clock, and hand
 * results to the sync queue. That boundary is what lets the lesson logic be tested
 * without a renderer, and what lets the same grading run on the server.
 *
 * Spec: PROJECT.md §6 · docs/engineering/architecture.md
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  accuracy,
  currentQuestion,
  gradeLesson,
  initialState,
  isFinished,
  transition,
  type GradeResult,
  type LessonEvent,
  type LessonState,
  type MemoryState,
  type Question,
} from '@worldquest/engines'

export type UseLessonOptions = {
  readonly questions: readonly Question[]
  /** The user's current memory state, for optimistic grading. */
  readonly memory: ReadonlyMap<string, MemoryState>
  readonly heartsEnabled?: boolean
  /** Milliseconds per question, or null for an untimed lesson. */
  readonly timeLimitMs?: number | null
  /** Called once the lesson ends. Enqueues the submit; never awaits the network. */
  readonly onComplete: (state: LessonState, optimistic: GradeResult) => void
}

/**
 * The clock is a parameter of every event rather than a call inside the reducer,
 * so the reducer stays pure and the machine stays testable.
 */
const now = (): number => Date.now()

export function useLesson({
  questions,
  memory,
  heartsEnabled = true,
  timeLimitMs = null,
  onComplete,
}: UseLessonOptions) {
  const [state, dispatch] = useReducer(transition, undefined, () =>
    initialState({ heartsEnabled, timeLimitMs }),
  )
  // Completion must fire exactly once even if React re-renders or double-invokes.
  const completed = useRef(false)

  const send = useCallback((event: LessonEvent) => dispatch(event), [])

  /**
   * The countdown, in a timed lesson.
   *
   * One timeout per question, cleared on every phase or index change — so answering
   * cancels it, and it can never fire against a question the user has already left.
   * Without that cleanup a slow reader gets a TIMEOUT recorded on the NEXT question,
   * which is the worst possible version of this feature.
   *
   * `shownAt` rather than a fresh interval: the deadline is anchored to when the
   * question appeared, so a re-render does not restart the clock and give a bonus
   * second to anyone whose device happened to re-layout.
   */
  useEffect(() => {
    if (state.timeLimitMs === null) return
    if (state.phase !== 'presenting') return
    if (state.shownAt === null) return

    const remaining = state.shownAt + state.timeLimitMs - now()
    const timer = setTimeout(() => dispatch({ type: 'TIMEOUT', now: now() }), Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [state.phase, state.index, state.shownAt, state.timeLimitMs])

  const start = useCallback(
    (lessonId: string) => {
      const t = now()
      dispatch({ type: 'LOAD', lessonId, now: t })
      dispatch({ type: 'LOADED', questions, now: t })
    },
    [questions],
  )

  const answer = useCallback((optionId: string) => {
    dispatch({ type: 'ANSWER', optionId, now: now() })
  }, [])

  const advance = useCallback(() => {
    dispatch({ type: 'CONTINUE', now: now() })
  }, [])

  const abandon = useCallback(() => {
    dispatch({ type: 'ABANDON', now: now() })
  }, [])

  // Optimistic grading: the SAME module the server will run. The number shown is a
  // prediction, and the server's answer replaces it on reconcile.
  const optimistic = useMemo<GradeResult | null>(() => {
    if (!isFinished(state) || state.answers.length === 0) return null
    return gradeLesson({
      lessonId: state.lessonId,
      answers: state.answers,
      memory,
      now: now(),
    })
  }, [state, memory])

  if (isFinished(state) && optimistic && !completed.current) {
    completed.current = true
    onComplete(state, optimistic)
  }

  return {
    state,
    question: currentQuestion(state),
    progress: {
      current: Math.min(state.index + 1, state.questions.length),
      total: state.questions.length,
    },
    accuracy: accuracy(state),
    optimistic,
    start,
    answer,
    advance,
    abandon,
    send,
  }
}
