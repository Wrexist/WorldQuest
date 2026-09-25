/**
 * The lesson runner, as an explicit state machine.
 *
 *   idle → loading → presenting → answered → feedback → presenting … → summary
 *                                                     ↘ paused / abandoned
 *
 * Inside `presenting`, an answer is two steps: SELECT (as often as the user likes —
 * changing your mind is allowed) and then CHECK, which grades whatever is selected.
 * `ANSWER` is the same grading in one step and stays, because it is the primitive the
 * other two are built from.
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
  /**
   * The option the user has picked but not yet checked, or null.
   *
   * Only ever non-null while a question is on screen (`presenting`, or `paused` on top
   * of one), and only ever an option of the CURRENT question — grading, advancing,
   * reviving and abandoning all clear it. Selecting is not answering: nothing is scored,
   * no clock stops and no heart moves until CHECK.
   */
  readonly selectedOptionId: string | null
  /**
   * Where the mistake-review round begins in `questions`, or null before it (and in a
   * lesson that has none).
   *
   * Duolingo re-asks what you got wrong at the end of a lesson, and it teaches: "introduce
   * and retest mistakes" is the first line of the launch course's evidence column. The
   * missed questions are appended once, options rotated so the answer is not where it
   * was, and asked again before the summary.
   */
  readonly reviewFrom: number | null
  /**
   * Answers given in the review round. Never graded, submitted or scheduled: the first
   * answer is the evidence, and asking again seconds later would count one fact twice in
   * the scheduler. No hearts are lost here and no XP is earned; it is practice.
   */
  readonly reviewed: readonly AnsweredItem[]
}

export type LessonEvent =
  | { type: 'LOAD'; lessonId: string; now: number }
  | { type: 'LOADED'; questions: readonly Question[]; now: number }
  /** Select and check in one step. */
  | { type: 'ANSWER'; optionId: string; now: number }
  /** Pick an option without committing to it. Repeatable, to change the choice. */
  | { type: 'SELECT'; optionId: string; now: number }
  /** Grade the selected option. Ignored while nothing is selected. */
  | { type: 'CHECK'; now: number }
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
    selectedOptionId: null,
    reviewFrom: null,
    reviewed: [],
  }
}

/** Is the learner in the end-of-lesson review of their mistakes? */
export const inReview = (s: LessonState): boolean => s.reviewFrom !== null && s.index >= s.reviewFrom

/** The answer on screen now: the review round's latest while reviewing, else the lesson's. */
export const lastAnswerOf = (s: LessonState): AnsweredItem | undefined =>
  inReview(s) ? s.reviewed[s.reviewed.length - 1] : s.answers[s.answers.length - 1]

/** Every answer given, graded and reviewed, for cues that fire on each one. */
export const answerCount = (s: LessonState): number => s.answers.length + s.reviewed.length

/**
 * Time spent answering, in milliseconds: each question's clock, from appearing to being
 * answered, summed over the lesson and its review round.
 *
 * The lesson summary's "Time". Pauses are already outside it (RESUME restarts the
 * question's clock), and so is the time spent reading feedback. A wall clock would count
 * a phone left on the pause screen over lunch; this counts the thinking.
 */
export const answeringMs = (s: LessonState): number =>
  [...s.answers, ...s.reviewed].reduce((sum, answer) => sum + answer.elapsedMs, 0)

/**
 * Right answers in a row, counting back from the last one, in the round being played.
 *
 * Derived from the answer log rather than read from `correctRun`, which is the hearts
 * rule's counter and stops at the review round. Once the review starts it counts the
 * review's own answers, so a run from the graded questions does not carry into practice.
 */
export const currentRun = (s: LessonState): number => {
  const log = inReview(s) ? s.reviewed : s.answers
  let run = 0
  for (let i = log.length - 1; i >= 0 && log[i]?.wasCorrect === true; i--) run++
  return run
}

/**
 * The review round for a lesson that just ran out of questions, or null.
 *
 * Only once, only for an untimed lesson (a speed round is a race, not a lesson to go
 * back over), and only for questions actually missed — each once, in the order met.
 * The options rotate by one so a learner cannot answer from where the right one sat.
 */
function reviewRound(s: LessonState): readonly Question[] | null {
  if (s.reviewFrom !== null || s.timeLimitMs !== null) return null
  const missed = new Set(s.answers.filter((a) => !a.wasCorrect).map((a) => a.itemId))
  const again = s.questions
    .filter((q) => missed.has(q.item.id))
    .filter((q, i, all) => all.findIndex((other) => other.item.id === q.item.id) === i)
    .map((q) => ({ ...q, options: q.options.length > 1 ? [...q.options.slice(1), q.options[0]!] : q.options }))
  return again.length > 0 ? again : null
}

export const currentQuestion = (s: LessonState): Question | null =>
  s.questions[s.index] ?? null

/**
 * Is there a question left for a revive to resume at?
 *
 * `REVIVE` resumes at `index + 1`, so running out of hearts on the LAST question left
 * the machine `presenting` with an index past the end. `currentQuestion` returned null,
 * `LessonScreen` renders `<LoadingState />` for a null question, and the user sat on a
 * spinner with no back gesture, no summary and no submission — the whole lesson lost,
 * after paying for it. The transition below refuses that, and this predicate is what
 * lets the screen decline to make the offer in the first place: a purchase that buys
 * nothing must not be on screen, which is the half a defensive transition cannot fix.
 */
export const canRevive = (s: LessonState): boolean =>
  s.outOfHearts && s.index + 1 < s.questions.length

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

    case 'ANSWER':
      // Only answerable while presenting. This single guard is what makes
      // double-taps and taps during the feedback animation harmless.
      if (state.phase !== 'presenting') return state
      return grade(state, event.optionId, event.now)

    case 'SELECT': {
      if (state.phase !== 'presenting') return state
      // An id from another question — a stray tap landing after the index moved — is
      // ignored rather than remembered, so a later CHECK can never grade it.
      const question = currentQuestion(state)
      if (!question?.options.some((o) => o.id === event.optionId)) return state
      if (state.selectedOptionId === event.optionId) return state
      return { ...state, selectedOptionId: event.optionId }
    }

    case 'CHECK':
      if (state.phase !== 'presenting') return state
      if (state.selectedOptionId === null) return state
      // The clock stops HERE, not at selection: `grade` measures from `shownAt` to this
      // event's `now`. Time spent changing your mind is thinking time, and scoring it as
      // faster than it was would hand the scheduler confidence the user did not have.
      return grade(state, state.selectedOptionId, event.now)

    case 'TIMEOUT': {
      // Only in a timed lesson, and only while a question is on screen. Firing this
      // in an untimed lesson would be a bug in the caller, and silently accepting it
      // would mark an answer the user never had a chance to give.
      if (state.phase !== 'presenting') return state
      if (state.timeLimitMs === null) return state
      const timedOut = currentQuestion(state)
      if (!timedOut) return state

      /**
       * At the buzzer, what is selected is the answer.
       *
       * Select-then-check adds a tap, and under a clock that tap must not be the
       * difference between a right answer and a miss: a user who found the answer at
       * nine seconds and reached for Check at ten did answer. So a selection is graded
       * exactly as CHECK would grade it, hearts included — the authoritative grader
       * sees only the chosen option and cannot tell the two apart, so the machine must
       * not either. Elapsed time is capped at the limit: a timer that fires a few
       * milliseconds late is not thinking time.
       *
       * Nothing selected is the miss it always was, below.
       */
      if (state.selectedOptionId !== null) {
        const deadline = (state.shownAt ?? event.now) + state.timeLimitMs
        return grade(state, state.selectedOptionId, Math.min(event.now, deadline))
      }

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
      if (next >= state.questions.length) {
        const review = reviewRound(state)
        if (review === null) return { ...state, phase: 'summary' }
        return {
          ...state,
          phase: 'presenting',
          questions: [...state.questions, ...review],
          reviewFrom: state.questions.length,
          index: next,
          shownAt: event.now,
          selectedOptionId: null,
        }
      }
      return { ...state, phase: 'presenting', index: next, shownAt: event.now }
    }

    case 'REVIVE': {
      // Spending coins to finish the lesson you are in. The next lesson always
      // starts fresh regardless, so this buys the moment, not access.
      if (!state.outOfHearts) return state
      // Nothing left to resume at. Running out on the final question means the lesson
      // is over; `summary` is where `CONTINUE` would have sent it, and it is the only
      // exit that keeps the answers. Resuming would set `index` past the end, which
      // presents a question that does not exist.
      if (!canRevive(state)) return { ...state, phase: 'summary' }
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
      // Leaving the review round is not leaving the lesson: every graded question was
      // answered, so it ends as the finished lesson it is, streak and all.
      if (inReview(state)) return { ...state, phase: 'summary', selectedOptionId: null }
      // Answers so far are kept and still submitted — leaving a lesson must never
      // cost someone the work they already did. An unchecked selection is not an
      // answer, so it is not kept.
      return { ...state, phase: 'abandoned', selectedOptionId: null }
  }
}

/**
 * Score one option against the current question.
 *
 * Shared by ANSWER, CHECK and a TIMEOUT with a selection, so the three can never
 * disagree about hearts, runs or timing. The caller has already checked the phase.
 */
function grade(state: LessonState, optionId: string, now: number): LessonState {
  const question = currentQuestion(state)
  if (!question) return state

  const chosen = question.options.find((o) => o.id === optionId)
  if (!chosen) return state

  const elapsedMs = state.shownAt === null ? 0 : Math.max(0, now - state.shownAt)
  const answer: AnsweredItem = {
    itemId: question.item.id,
    factId: question.item.factId,
    templateId: question.item.templateId,
    chosenOptionId: optionId,
    wasCorrect: chosen.isCorrect,
    elapsedMs,
    answeredAt: now,
  }

  // Practice, not evidence: kept apart from the graded answers, and it moves no heart.
  if (inReview(state)) {
    return { ...state, phase: 'answered', reviewed: [...state.reviewed, answer], selectedOptionId: null }
  }

  let hearts = state.hearts
  let heartsLost = state.heartsLost
  let correctRun = state.correctRun

  if (chosen.isCorrect) {
    correctRun += 1
    // A run of correct answers earns a heart back — rewards recovery and
    // breaks the death spiral. See docs/systems/xp-economy.md §3.
    if (state.heartsEnabled && correctRun % BALANCE.hearts.restoreEveryCorrectStreak === 0) {
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
    selectedOptionId: null,
  }
}
