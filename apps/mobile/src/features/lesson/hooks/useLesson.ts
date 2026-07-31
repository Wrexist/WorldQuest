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

import { useCallback, useMemo, useReducer, useRef } from 'react'
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
  onComplete,
}: UseLessonOptions) {
  const [state, dispatch] = useReducer(transition, undefined, () =>
    initialState({ heartsEnabled }),
  )
  // Completion must fire exactly once even if React re-renders or double-invokes.
  const completed = useRef(false)

  const send = useCallback((event: LessonEvent) => dispatch(event), [])

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
