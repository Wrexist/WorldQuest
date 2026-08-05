/**
 * The lesson runner, as an explicit state machine.
 *
 *   idle → loading → presenting → answered → feedback → presenting … → summary
 *                                                     ↘ paused / abandoned
 *
 * PROJECT.md §6 requires this to be a machine rather than a pile of booleans, and
 * the reason is concrete: the lesson screen is where double-taps, mid-animation
 * input, back-gesture races, and heart depletion all collide. Every one of those is
 * a transition that either exists or does not — which is testable — instead of a
 * combination of flags that happens to work.
 *
 * Pure: no React, no timers, no clock. `now` arrives with each event.
 */

import { BALANCE } from '../xp/balance.js'
import type { Question } from '../content/types.js'

export type LessonPhase =
  | 'idle'
  | 'loading'
  | 'presenting'
  | 'answered'
  | 'feedback'
  | 'summary'
  | 'paused'
  | 'abandoned'

export type AnsweredItem = {
  readonly itemId: string
  readonly factId: string
  readonly templateId: string
  readonly chosenOptionId: string | null
  readonly wasCorrect: boolean
  readonly elapsedMs: number
  readonly answeredAt: number
}

export type LessonState = {
  readonly phase: LessonPhase
  /** Client-generated UUID. Doubles as the idempotency key on submit. */
  readonly lessonId: string
  readonly questions: readonly Question[]
  readonly index: number
  readonly answers: readonly AnsweredItem[]
  readonly hearts: number
  /**
   * How many hearts this lesson has COST, cumulatively.
   *
   * Not `max - hearts`. A run of correct answers restores one, so the difference tells
   * you the balance and not the history — a lesson that took three and gave two back
   * reads as one. `lessons.hearts_lost` wants the history: it is the column that answers
   * "how often do hearts actually interrupt a lesson", which is the question the whole
   * per-lesson-reset design was argued from and which no production row could answer,
   * because nothing ever wrote it.
   */
  readonly heartsLost: number
  /** Consecutive correct answers — a run restores a heart. */
  readonly correctRun: number
  readonly startedAt: number | null
  /** When the current question was first shown, for elapsed timing. */
  readonly shownAt: number | null
  readonly heartsEnabled: boolean
  readonly outOfHearts: boolean
  /**
   * Milliseconds allowed per question, or null for an untimed lesson.
   *
   * A LESSON property, not a template one. `Template.timeLimitMs` exists and stays
   * null everywhere: whether a question is timed is a property of the mode the user
   * chose, not of the way the fact happens to be asked. Putting it on the template
   * would mean a speed round could only ever contain templates somebody remembered to
   * mark, which is the wrong axis entirely.
   */
  readonly timeLimitMs: number | null
}

export type LessonEvent =
  | { type: 'LOAD'; lessonId: string; now: number }
  | { type: 'LOADED'; questions: readonly Question[]; now: number }
  | { type: 'ANSWER'; optionId: string; now: number }
  | { type: 'CONTINUE'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'ABANDON'; now: number }
  /** Spending coins to keep going after running out of hearts. */
  | { type: 'REVIVE'; now: number }
  /** The clock ran out on a timed question. Only meaningful when `timeLimitMs` is set. */
  | { type: 'TIMEOUT'; now: number }

export function initialState(
  options: { heartsEnabled?: boolean; timeLimitMs?: number | null } = {},
): LessonState {
  return {
    phase: 'idle',
    lessonId: '',
    questions: [],
    index: 0,
    answers: [],
    hearts: BALANCE.hearts.max,
    heartsLost: 0,
    correctRun: 0,
    startedAt: null,
    shownAt: null,
    // Off in Relaxed Mode and Classroom Mode, and for Premium.
    heartsEnabled: options.heartsEnabled ?? true,
    outOfHearts: false,
    timeLimitMs: options.timeLimitMs ?? null,
  }
}

export const currentQuestion = (s: LessonState): Question | null =>
  s.questions[s.index] ?? null

export const isFinished = (s: LessonState): boolean =>
  s.phase === 'summary' || s.phase === 'abandoned'

export function accuracy(s: LessonState): number {
  if (s.answers.length === 0) return 0
  return s.answers.filter((a) => a.wasCorrect).length / s.answers.length
}

/**
 * The single transition function. Unknown transitions return the state unchanged
 * rather than throwing — a stray tap during an animation is a normal occurrence,
 * not a programmer error.
 */
export function transition(state: LessonState, event: LessonEvent): LessonState {
  switch (event.type) {
    case 'LOAD':
      if (state.phase !== 'idle') return state
      return { ...state, phase: 'loading', lessonId: event.lessonId, startedAt: event.now }

    case 'LOADED': {
      if (state.phase !== 'loading') return state
      // An empty queue must never strand the user on a blank screen.
      if (event.questions.length === 0) return { ...state, phase: 'summary' }
      return { ...state, phase: 'presenting', questions: event.questions, shownAt: event.now }
    }

    case 'ANSWER': {
      // Only answerable while presenting. This single guard is what makes
      // double-taps and taps during the feedback animation harmless.
      if (state.phase !== 'presenting') return state
      const question = currentQuestion(state)
      if (!question) return state

      const chosen = question.options.find((o) => o.id === event.optionId)
      if (!chosen) return state

      const elapsedMs = state.shownAt === null ? 0 : Math.max(0, event.now - state.shownAt)
      const answer: AnsweredItem = {
        itemId: question.item.id,
        factId: question.item.factId,
        templateId: question.item.templateId,
        chosenOptionId: event.optionId,
        wasCorrect: chosen.isCorrect,
        elapsedMs,
        answeredAt: event.now,
      }

      let hearts = state.hearts
      let heartsLost = state.heartsLost
      let correctRun = state.correctRun

      if (chosen.isCorrect) {
        correctRun += 1
        // A run of correct answers earns a heart back — rewards recovery and
        // breaks the death spiral. See docs/systems/xp-economy.md §3.
        if (
          state.heartsEnabled &&
          correctRun % BALANCE.hearts.restoreEveryCorrectStreak === 0
        ) {
          hearts = Math.min(BALANCE.hearts.max, hearts + 1)
        }
      } else {
        correctRun = 0
        // New items never cost a heart: you cannot lose a life for not knowing
        // something you have never been taught.
        const isReview = !question.isNew
        if (state.heartsEnabled && (isReview || BALANCE.hearts.newItemsCostHearts)) {
          if (hearts > 0) heartsLost += 1
          hearts = Math.max(0, hearts - 1)
        }
      }

      return {
        ...state,
        phase: 'answered',
        answers: [...state.answers, answer],
        hearts,
        heartsLost,
        correctRun,
        outOfHearts: state.heartsEnabled && hearts === 0,
      }
    }

    case 'TIMEOUT': {
      // Only in a timed lesson, and only while a question is on screen. Firing this
      // in an untimed lesson would be a bug in the caller, and silently accepting it
      // would mark an answer the user never had a chance to give.
      if (state.phase !== 'presenting') return state
      if (state.timeLimitMs === null) return state
      const timedOut = currentQuestion(state)
      if (!timedOut) return state

      /**
       * A timeout is recorded as unanswered, not as a wrong guess.
       *
       * `chosenOptionId: null` is the difference, and it matters downstream: the
       * scheduler should treat "ran out of time" as weaker evidence than "chose the
       * wrong country", and a review of the answer log should be able to tell them
       * apart. The user is told the right answer in the same calm words either way.
       */
      const missed: AnsweredItem = {
        itemId: timedOut.item.id,
        factId: timedOut.item.factId,
        templateId: timedOut.item.templateId,
        chosenOptionId: null,
        wasCorrect: false,
        elapsedMs: state.timeLimitMs,
        answeredAt: event.now,
      }

      // No heart is lost. Hearts are for getting something wrong; a clock running out
      // is the mode being hard, and charging for it twice turns a speed round into a
      // punishment. See docs/design/voice-and-tone.md — we do not punish.
      return {
        ...state,
        phase: 'answered',
        answers: [...state.answers, missed],
        correctRun: 0,
      }
    }

    case 'CONTINUE': {
      if (state.phase !== 'answered' && state.phase !== 'feedback') return state

      // Out of hearts ends the LESSON, never the app. Practice and review remain
      // free at zero hearts, forever.
      if (state.outOfHearts) return { ...state, phase: 'summary' }

      const next = state.index + 1
      if (next >= state.questions.length) return { ...state, phase: 'summary' }
      return { ...state, phase: 'presenting', index: next, shownAt: event.now }
    }

    case 'REVIVE': {
      // Spending coins to finish the lesson you are in. The next lesson always
      // starts fresh regardless, so this buys the moment, not access.
      if (!state.outOfHearts) return state
      return {
        ...state,
        hearts: BALANCE.hearts.max,
        // `heartsLost` is deliberately NOT reset. It is the history of what this lesson
        // cost, and a revive is the most interesting entry in it — a lesson that ran out
        // and was paid for is exactly the event `lessons.hearts_lost` should be able to
        // find later.
        outOfHearts: false,
        phase: 'presenting',
        index: state.index + 1,
        shownAt: event.now,
      }
    }

    case 'PAUSE':
      if (state.phase !== 'presenting') return state
      return { ...state, phase: 'paused' }

    case 'RESUME':
      if (state.phase !== 'paused') return state
      // Restart the timer: time spent in a pause is not thinking time, and
      // counting it would score the user as having forgotten.
      return { ...state, phase: 'presenting', shownAt: event.now }

    case 'ABANDON':
      if (isFinished(state)) return state
      // Answers so far are kept and still submitted — leaving a lesson must never
      // cost someone the work they already did.
      return { ...state, phase: 'abandoned' }
  }
}
