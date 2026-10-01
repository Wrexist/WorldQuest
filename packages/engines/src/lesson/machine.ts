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
import { MAX_TYPED_LENGTH, TYPED_WRONG, matchTyped, type TypedMatch } from '../content/typed.js'

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
  /**
   * What was typed, for the feedback sheet, when the question was typed. Device-only: the
   * submission carries `chosenOptionId`, which for a typed answer is the right option's id or
   * `TYPED_WRONG` — never this.
   */
  readonly typedText?: string
  /** How the typed text was judged: `near` is right with a typo, shown the real spelling. */
  readonly typedMatch?: TypedMatch
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
   * What the learner has typed into the current typed question, or ''. Like
   * `selectedOptionId` it is only ever about the question on screen, and nothing is graded
   * until CHECK.
   */
  readonly typedText: string
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
  /**
   * Answer a whole "match the pairs" board at once: for each of its questions, the first thing
   * the learner tried to match it with. Only meaningful while the board's FIRST question is
   * showing; ignored otherwise.
   */
  | { type: 'ANSWER_GROUP'; choices: Readonly<Record<string, string>>; now: number }
  /** Replace what has been typed into a typed question. Ignored for any other kind. */
  | { type: 'TYPE'; text: string; now: number }
  /** Grade the selected option, or the typed text. Ignored while nothing is selected or typed. */
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
    typedText: '',
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
    // A board's members come back as the plain questions they are: re-asking one pair of four
    // as a board of one would be a board with nothing to match.
    .map(({ group: _group, ...q }) => ({ ...q, options: q.options.length > 1 ? [...q.options.slice(1), q.options[0]!] : q.options }))
  return again.length > 0 ? again : null
}

export const currentQuestion = (s: LessonState): Question | null =>
  s.questions[s.index] ?? null

/**
 * The lesson's progress bar: questions settled, out of the lesson's own.
 *
 * A right answer settles its question; a missed one is settled by its second look in the
 * review round, as Duolingo's bar fills on what you get right and the mistakes fill the
 * rest. Counting the question on screen instead, with the review appended to the total,
 * sent the bar backwards at the worst moment: "20 / 20" became "21 / 36" and a nearly
 * full bar dropped to 58 % for the learner who had struggled most (round-3 design
 * review). This one only grows, and a lesson with a review ends it full.
 *
 * A timed lesson has no review round, so there every answer settles its question.
 */
export function lessonProgress(s: LessonState): { readonly current: number; readonly total: number } {
  const total = s.reviewFrom ?? s.questions.length
  const settled =
    s.timeLimitMs !== null
      ? s.answers.length
      : s.answers.filter((a) => a.wasCorrect).length + s.reviewed.length
  return { current: Math.min(total, settled), total }
}

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
      // A typed question's only option is the right one; answering it by id would be answering
      // without typing. The screen never sends this for one, and the machine does not trust that.
      if (currentQuestion(state)?.typed !== undefined) return state
      return grade(state, event.optionId, event.now)

    case 'ANSWER_GROUP': {
      if (state.phase !== 'presenting' || inReview(state)) return state
      const first = currentQuestion(state)
      const group = first?.group
      if (!first || !group || group.position !== 0) return state
      const members = state.questions.slice(state.index, state.index + group.size)
      const whole =
        members.length === group.size &&
        members.every((q, i) => q.group?.id === group.id && q.group.position === i && event.choices[q.item.id] !== undefined &&
          q.options.some((o) => o.id === event.choices[q.item.id]))
      if (!whole) return state
      return gradeGroup(state, members, event.choices, event.now)
    }

    case 'SELECT': {
      if (state.phase !== 'presenting') return state
      // An id from another question — a stray tap landing after the index moved — is
      // ignored rather than remembered, so a later CHECK can never grade it.
      const question = currentQuestion(state)
      if (question?.typed !== undefined) return state
      if (!question?.options.some((o) => o.id === event.optionId)) return state
      if (state.selectedOptionId === event.optionId) return state
      return { ...state, selectedOptionId: event.optionId }
    }

    case 'TYPE': {
      if (state.phase !== 'presenting') return state
      if (currentQuestion(state)?.typed === undefined) return state
      const text = event.text.slice(0, MAX_TYPED_LENGTH)
      return text === state.typedText ? state : { ...state, typedText: text }
    }

    case 'CHECK':
      if (state.phase !== 'presenting') return state
      if (currentQuestion(state)?.typed !== undefined) {
        // Same rule as a selection: the clock stops here, not at the first keystroke.
        return state.typedText.trim() === '' ? state : gradeTyped(state, state.typedText, event.now)
      }
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
      if (timedOut.typed !== undefined && state.typedText.trim() !== '') {
        const deadline = (state.shownAt ?? event.now) + state.timeLimitMs
        return gradeTyped(state, state.typedText, Math.min(event.now, deadline))
      }
      if (timedOut.typed === undefined && state.selectedOptionId !== null) {
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
        typedText: '',
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
          typedText: '',
        }
      }
      return { ...state, phase: 'presenting', index: next, shownAt: event.now, typedText: '' }
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
        typedText: '',
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
      if (inReview(state)) return { ...state, phase: 'summary', selectedOptionId: null, typedText: '' }
      // Answers so far are kept and still submitted — leaving a lesson must never
      // cost someone the work they already did. An unchecked selection is not an
      // answer, so it is not kept.
      return { ...state, phase: 'abandoned', selectedOptionId: null, typedText: '' }
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

  return record(state, question, optionId, chosen.isCorrect, now, {})
}

/**
 * Grade a board: each member as the fact it is, in order, as if answered one after another.
 *
 * Two things differ from four separate questions. The time is shared out evenly — the board
 * was one sitting, and charging the last pair for the minutes spent on the first would hand the
 * scheduler a hesitation that was never there. And a board costs AT MOST ONE heart: four misses
 * on a board are one difficult exercise, and four hearts for it would end a lesson in a single
 * screen on the very exercise that exists to be forgiving. Every miss is still recorded as a
 * miss, for the scheduler and for the mistake-review round.
 */
function gradeGroup(
  state: LessonState,
  members: readonly Question[],
  choices: Readonly<Record<string, string>>,
  now: number,
): LessonState {
  const start = state.index
  const each = state.shownAt === null ? 0 : Math.max(0, now - state.shownAt) / members.length
  let s: LessonState = state
  let paidHeart = false
  members.forEach((q, i) => {
    const chosen = q.options.find((o) => o.id === choices[q.item.id])
    if (!chosen) return
    const before = s.hearts
    s = record(
      { ...s, index: start + i, phase: 'presenting', shownAt: now - each },
      q,
      chosen.id,
      chosen.isCorrect,
      now,
      {},
      paidHeart,
    )
    if (s.hearts < before) paidHeart = true
  })
  // Left on the board's last question, in the same phase a single answer leaves it in, so
  // CONTINUE, REVIVE and the out-of-hearts fork all behave as they always have.
  return { ...s, index: start + members.length - 1, phase: 'answered' }
}

/**
 * Judge typed text against the question's accepted spellings, then record it exactly as a
 * tapped answer would be.
 *
 * What goes down as `chosenOptionId` is the right option's id when the text was right (or one
 * typo off) and `TYPED_WRONG` when it was not — never the text. The text stays in
 * `typedText` for the sheet to show and is gone with the question.
 */
function gradeTyped(state: LessonState, text: string, now: number): LessonState {
  const question = currentQuestion(state)
  if (!question?.typed) return state
  const right = question.options.find((o) => o.isCorrect)
  if (!right) return state
  const match = matchTyped(text, question.typed.accepts, question.typed.rivals)
  return record(state, question, match === 'wrong' ? TYPED_WRONG : right.id, match !== 'wrong', now, {
    typedText: text.slice(0, MAX_TYPED_LENGTH),
    typedMatch: match,
  })
}

/** The shared tail of grading: log the answer, move the hearts, settle the phase. */
function record(
  state: LessonState,
  question: Question,
  chosenOptionId: string,
  wasCorrect: boolean,
  now: number,
  extra: { readonly typedText?: string; readonly typedMatch?: TypedMatch },
  /** Do not charge a heart for this answer: the board has already charged one. */
  freeOfHearts = false,
): LessonState {
  const elapsedMs = state.shownAt === null ? 0 : Math.max(0, now - state.shownAt)
  const answer: AnsweredItem = {
    itemId: question.item.id,
    factId: question.item.factId,
    templateId: question.item.templateId,
    chosenOptionId,
    wasCorrect,
    elapsedMs,
    answeredAt: now,
    ...extra,
  }

  // Practice, not evidence: kept apart from the graded answers, and it moves no heart.
  if (inReview(state)) {
    return { ...state, phase: 'answered', reviewed: [...state.reviewed, answer], selectedOptionId: null, typedText: '' }
  }

  let hearts = state.hearts
  let heartsLost = state.heartsLost
  let correctRun = state.correctRun

  if (wasCorrect) {
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
    if (!freeOfHearts && state.heartsEnabled && (isReview || BALANCE.hearts.newItemsCostHearts)) {
      if (hearts > 0) heartsLost += 1
      hearts = Math.max(0, hearts - 1)
    }
  }

  const settled: LessonState = {
    ...state,
    phase: 'answered',
    answers: [...state.answers, answer],
    hearts,
    heartsLost,
    correctRun,
    outOfHearts: state.heartsEnabled && hearts === 0,
    selectedOptionId: null,
    // Kept through `answered` so the sheet can show what was typed; `CONTINUE` clears it.
    typedText: extra.typedText ?? '',
  }
  return { ...settled, questions: rescued(settled) }
}

/**
 * After two misses in a row, the next question is an easier one.
 *
 * A lesson that goes wrong goes wrong in a run: a hard fact, then another, and by the third the
 * learner is guessing at things they half know. A fixed order hands them more of the same. The
 * adaptive answer — Duolingo's, and any decent tutor's — is to put something they can get right
 * next, so the lesson ends on knowing something rather than on a streak of not.
 *
 * What it does: when the last TWO graded answers were wrong, the easiest question still to come
 * (by authored difficulty, ties to the earliest) swaps places with the next one if it is
 * strictly easier. Nothing is added, dropped or repeated — the same questions, in a kinder
 * order — so the lesson's length, its facts and its scheduling are untouched.
 *
 * What it will not do: touch a matching board or a typed question (a board is one sitting; a
 * typed question is the hardest way of being asked and is not a "rescue" either way), reorder
 * the review round, act in a timed lesson, or act once hearts have run out. The Worker grades
 * each answer by the slot it was ISSUED in, so the answers go up in the order they were given
 * and no longer need to be a prefix of the issued order.
 */
function rescued(state: LessonState): readonly Question[] {
  if (state.timeLimitMs !== null || state.outOfHearts || inReview(state)) return state.questions
  const [previous, latest] = state.answers.slice(-2)
  if (previous === undefined || latest === undefined || previous.wasCorrect || latest.wasCorrect) return state.questions

  const next = state.index + 1
  const upcoming = state.questions[next]
  if (upcoming === undefined || upcoming.group !== undefined || upcoming.typed !== undefined) return state.questions
  const end = state.reviewFrom ?? state.questions.length

  let easiest = -1
  for (let i = next + 1; i < end; i++) {
    const candidate = state.questions[i]!
    if (candidate.group !== undefined || candidate.typed !== undefined) continue
    if (easiest === -1 || candidate.item.difficulty < state.questions[easiest]!.item.difficulty) easiest = i
  }
  if (easiest === -1 || state.questions[easiest]!.item.difficulty >= upcoming.item.difficulty) return state.questions

  const out = [...state.questions]
  out[next] = state.questions[easiest]!
  out[easiest] = upcoming
  return out
}
