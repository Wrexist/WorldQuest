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
import { AppState, type AppStateStatus } from 'react-native'
import {
  accuracy,
  awardForAnswer,
  currentQuestion,
  gradeLesson,
  initialState,
  isFinished,
  masteryOf,
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

  /**
   * Spend coins to finish the lesson you are in.
   *
   * The machine restores hearts to full and resumes at the NEXT question — the one
   * just missed is not re-asked, because paying to retry the same item would be
   * paying for the answer, and this economy never sells an advantage at learning.
   *
   * The coins are not deducted here. The balance is server-authoritative (ADR 0006)
   * and the spend rides the same queue as everything else; the client resumes the
   * lesson optimistically because being wrong about a 250-coin balance is worth far
   * less than interrupting a child mid-lesson to wait for a round trip.
   */
  const revive = useCallback(() => {
    dispatch({ type: 'REVIVE', now: now() })
  }, [])

  const pause = useCallback(() => {
    dispatch({ type: 'PAUSE', now: now() })
  }, [])

  const resume = useCallback(() => {
    dispatch({ type: 'RESUME', now: now() })
  }, [])

  /**
   * Leaving the app pauses the lesson.
   *
   * This is a correctness fix, not a nicety. The countdown above is anchored to
   * `state.shownAt` in wall-clock time, so a user who takes a phone call during a
   * speed round comes back to a question that timed out while the app was not even
   * on screen. `RESUME` resets `shownAt` — the machine already decided that time
   * spent paused is not thinking time — so pausing on background is exactly the fix.
   *
   * The subscription is optional-chained on removal for the same reason
   * `useReducedMotion` is: react-native-web has returned `undefined` here before, and
   * an unguarded `.remove()` throws on every unmount.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') dispatch({ type: 'PAUSE', now: now() })
    }) as { remove?: () => void } | undefined

    return () => subscription?.remove?.()
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

  /**
   * What a given answer earned, using the same rule the server will apply.
   *
   * Lives here rather than in the screen because it needs `memory` — whether the fact
   * was due, and whether it was already known — which is exactly the information the
   * hardcoded `"+10"` was standing in for.
   */
  const awardFor = useCallback(
    (answer: LessonState['answers'][number]) => {
      const before = memory.get(answer.factId) ?? null
      const speedBonusesUsed = state.answers
        .slice(0, state.answers.indexOf(answer))
        .filter((a) => a.wasCorrect && a.elapsedMs < 3_000).length
      return awardForAnswer({
        wasCorrect: answer.wasCorrect,
        elapsedMs: answer.elapsedMs,
        wasOverdue: before !== null && before.dueAt <= answer.answeredAt,
        alreadyKnown:
          before !== null && ['mastered', 'burnished'].includes(masteryOf(before, answer.answeredAt)),
        speedBonusesUsed,
      })
    },
    [memory, state.answers],
  )

  return {
    state,
    awardFor,
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
    revive,
    pause,
    resume,
    send,
  }
}
