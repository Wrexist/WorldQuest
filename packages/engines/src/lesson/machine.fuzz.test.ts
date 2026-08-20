/**
 * The lesson machine against event sequences nobody would write by hand.
 *
 * ## Why fuzz a reducer with 33 hand-written tests already on it
 *
 * Every one of those drives a sequence somebody thought of. The machine's own header
 * names the reason it exists — "double-taps, mid-animation input, back-gesture races, and
 * heart depletion all collide" — and collisions are exactly what a written test does not
 * contain: it answers ANSWER after CONTINUE after ANSWER, in the order a person plays.
 *
 * A real device produces the other orders. A REVIVE arriving after a PAUSE that arrived
 * during the feedback animation on the last question is three races at once, and the
 * soft-lock this file was written after — `REVIVE` on the final item leaving `index` past
 * the end of the queue, presenting a question that did not exist — was reachable by an
 * ordinary user in under a minute and by no test in the suite.
 *
 * ## What it asserts
 *
 * Invariants, not outcomes. Nothing here says what SHOULD happen for a given sequence —
 * that is what the hand-written tests are for. It says what must never be true of the
 * state afterwards, whatever the sequence was, because an invariant is the only kind of
 * claim that survives being handed input nobody predicted.
 *
 * Seeded, so a failure is reproducible: the seed is printed with the sequence.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../shared/index.js'
import { buildIndex, type Entity, type Fact, type Question, type Template } from '../content/index.js'
import { BALANCE } from '../xp/balance.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  accuracy,
  canRevive,
  currentQuestion,
  initialState,
  isFinished,
  transition,
  type LessonEvent,
  type LessonState,
} from './machine.js'

const packsDir = join(import.meta.dirname, '..', '..', '..', 'content', 'packs', 'geography')
const read = <T>(f: string): T[] =>
  (JSON.parse(readFileSync(join(packsDir, f), 'utf8')) as { items: T[] }).items

const index = buildIndex({
  entities: read<Entity>('entities.countries.v1.json'),
  facts: read<Fact>('facts.capitals.v1.json'),
  templates: read<Template>('templates.v1.json'),
})

const T0 = 1_800_000_000_000

const makeQuestions = (n: number, isNew: boolean): Question[] =>
  index.items.slice(0, n).map((item, i) => ({
    item,
    promptKey: 'lesson:prompt.capital_of',
    promptParams: {},
    options: [
      { id: `right-${i}`, label: 'Right', isCorrect: true },
      { id: `wrong-${i}`, label: 'Wrong', isCorrect: false },
    ],
    modality: 'text' as const,
    timeLimitMs: null,
    isNew,
  }))

/**
 * Every event the machine accepts, including the ones a screen would never send.
 *
 * `optionId` is drawn from a pool that includes ids belonging to OTHER questions and one
 * that belongs to nothing: a stray tap landing after the index moved is the exact race
 * this suite is about, and the machine's contract is that an unknown option is ignored
 * rather than scored.
 */
function randomEvent(rng: () => number, state: LessonState, now: number): LessonEvent {
  const options = [
    ...state.questions.flatMap((q) => q.options.map((o) => o.id)),
    'no-such-option',
  ]
  const pick = Math.floor(rng() * 8)
  switch (pick) {
    case 0:
      return { type: 'LOAD', lessonId: 'fuzz', now }
    case 1:
      return { type: 'LOADED', questions: makeQuestions(1 + Math.floor(rng() * 12), rng() < 0.5), now }
    case 2:
      return { type: 'ANSWER', optionId: options[Math.floor(rng() * options.length)]!, now }
    case 3:
      return { type: 'CONTINUE', now }
    case 4:
      return { type: 'PAUSE', now }
    case 5:
      return { type: 'RESUME', now }
    case 6:
      return { type: 'REVIVE', now }
    default:
      return { type: 'TIMEOUT', now }
  }
}

const PHASES = new Set([
  'idle',
  'loading',
  'presenting',
  'answered',
  'feedback',
  'summary',
  'paused',
  'abandoned',
])

/** Everything that must be true of the machine after any event, ever. */
function assertInvariants(state: LessonState, trail: string): void {
  expect(PHASES.has(state.phase), `${trail}: phase ${state.phase}`).toBe(true)

  // Counters stay whole and non-negative. A negative heart or a fractional index is the
  // shape of a state nothing downstream is written for.
  for (const [name, value] of [
    ['hearts', state.hearts],
    ['heartsLost', state.heartsLost],
    ['correctRun', state.correctRun],
    ['index', state.index],
  ] as const) {
    expect(Number.isInteger(value), `${trail}: ${name} = ${value}`).toBe(true)
    expect(value, `${trail}: ${name} = ${value}`).toBeGreaterThanOrEqual(0)
  }
  expect(state.hearts).toBeLessThanOrEqual(BALANCE.hearts.max)

  // The one the soft-lock broke. A question is on screen exactly when the phase says one
  // is — `LessonScreen` renders a loading spinner for a null question, so a `presenting`
  // state with no current question is a user with no way out and no submission.
  if (state.phase === 'presenting' || state.phase === 'answered') {
    expect(currentQuestion(state), `${trail}: ${state.phase} with no question`).not.toBeNull()
  }

  // Answers never exceed the queue, and never contain an item the queue does not.
  expect(state.answers.length).toBeLessThanOrEqual(
    // A revive resumes rather than restarting, so one answer per question is the ceiling
    // — and a LOADED mid-lesson is refused, so the queue cannot shrink under the answers.
    Math.max(state.questions.length, state.answers.length === 0 ? 0 : state.questions.length),
  )
  for (const answer of state.answers) {
    expect(Number.isFinite(answer.elapsedMs)).toBe(true)
    expect(answer.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(answer.answeredAt)).toBe(true)
  }

  const acc = accuracy(state)
  expect(Number.isFinite(acc), `${trail}: accuracy ${acc}`).toBe(true)
  expect(acc).toBeGreaterThanOrEqual(0)
  expect(acc).toBeLessThanOrEqual(1)

  // A finished lesson stays finished: nothing may resume a summary, because the summary
  // is where the submission is enqueued and a second pass would be a second lesson.
  if (isFinished(state)) {
    expect(canRevive(state), `${trail}: revive offered after the lesson ended`).toBe(false)
  }
}

describe('the lesson machine survives sequences nobody wrote', () => {
  it('never reaches an impossible state, over 400 random runs', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rng = seededRng(seed)
      let state = initialState({
        heartsEnabled: rng.next() < 0.8,
        timeLimitMs: rng.next() < 0.5 ? 30_000 : null,
      })
      const trail: string[] = []

      for (let step = 0; step < 60; step++) {
        const event = randomEvent(() => rng.next(), state, T0 + step * 1_000)
        trail.push(event.type)
        state = transition(state, event)
        assertInvariants(state, `seed ${seed} · ${trail.join(' → ')}`)
      }
    }
  })

  it('always leaves a way out of an emptied heart pool', () => {
    // The soft-lock, stated as a property rather than as one scenario. Whatever sequence
    // emptied the hearts, the user must end up either at a question they can answer or at
    // the summary — never `presenting` with nothing to present.
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seededRng(seed)
      let state = initialState()
      state = transition(state, { type: 'LOAD', lessonId: 'fuzz', now: T0 })
      state = transition(state, {
        type: 'LOADED',
        questions: makeQuestions(1 + Math.floor(rng.next() * 8), false),
        now: T0,
      })

      for (let step = 0; step < 40 && !isFinished(state); step++) {
        const question = currentQuestion(state)
        if (state.phase === 'presenting' && question !== null) {
          // Always wrong, so the hearts drain as fast as the machine allows.
          const wrong = question.options.find((o) => !o.isCorrect)!
          state = transition(state, { type: 'ANSWER', optionId: wrong.id, now: T0 + step * 1_000 })
          continue
        }
        // Whichever the machine will accept: revive if it is on offer, otherwise carry on.
        state = transition(state, {
          type: rng.next() < 0.5 ? 'REVIVE' : 'CONTINUE',
          now: T0 + step * 1_000,
        })
      }

      expect(
        isFinished(state) || currentQuestion(state) !== null,
        `seed ${seed}: stranded in ${state.phase} at index ${state.index} of ${state.questions.length}`,
      ).toBe(true)
    }
  })
})
