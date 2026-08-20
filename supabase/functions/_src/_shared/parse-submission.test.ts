/**
 * The request parser, executed rather than grepped.
 *
 * ## What this replaces
 *
 * `submit-lesson/index.ts` decides every XP, coin, streak, quest and achievement award,
 * and ADR 0006 makes it authoritative precisely because the client is not trusted. It had
 * no test. Nothing could load it — the module imports `jsr:@supabase/supabase-js@2` and
 * calls `Deno.serve` — so `build.test.ts` did the only thing available and asserted
 * against the file's TEXT:
 *
 *     expect(index).toMatch(/'lesson', 'quest', 'review', 'challenge', 'event'/)
 *
 * That is a real check of a real rule and it proves the string is present, not that a
 * request carrying `kind: "drill"` is refused. A regex cannot tell those apart, and it
 * fails the day somebody reformats the array across two lines.
 *
 * Now that the parser is a plain module, every rule its comments describe can be a rule
 * something enforces. The source-grep versions in `build.test.ts` are gone; the ones that
 * remain there guard properties of the BUNDLE, which is what that file is for.
 *
 * ## Why the parser is worth this much attention
 *
 * It is the outermost trust boundary. Everything after it — the grader, the balance
 * table, the RPC — is written assuming the shape it returns. A field that slips past here
 * is a field the rest of the function believes.
 */

import { describe, expect, it } from 'vitest'
import { parseBody } from './parse-submission.js'

const UUID = '3f8a1b2c-4d5e-6f70-8a9b-0c1d2e3f4a5b'

/** A submission that should always parse, so a case can change exactly one thing. */
const valid = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  lessonId: UUID,
  kind: 'lesson',
  startedAt: 1_700_000_000_000,
  answers: [{ factId: 'geo.SE.capital', templateId: 'tpl.capital.mc4', elapsedMs: 4200, answeredAt: 1_700_000_004_200 }],
  ...over,
})

describe('what is refused outright', () => {
  it('refuses anything that is not an object', () => {
    for (const raw of [null, undefined, 'lesson', 42, [], true]) {
      expect(parseBody(raw)).toBeNull()
    }
  })

  it('requires a UUID-shaped lesson id', () => {
    // The id IS the idempotency key — it is the primary key of `lessons`, and replaying it
    // is what makes offline queuing safe. A malformed one is not a lesson we can dedupe.
    expect(parseBody(valid({ lessonId: 'not-a-uuid' }))).toBeNull()
    expect(parseBody(valid({ lessonId: '' }))).toBeNull()
    expect(parseBody(valid({ lessonId: 42 }))).toBeNull()
    expect(parseBody(valid())).not.toBeNull()
  })

  it('checks the lesson kind against the enum before it reaches the database', () => {
    // Not a security hole — Postgres refuses an unknown enum value — but the refusal
    // arrives as a 22P02 from inside the RPC, which the endpoint reports as
    // `persist_failed` and a 500. The client's queue treats a 5xx as retryable, so a
    // lesson with a bad `kind` burns all five attempts and PARKS: work the user actually
    // did, held for ever, over a string. A 400 parks it immediately and says why.
    for (const kind of ['lesson', 'quest', 'review', 'challenge', 'event']) {
      expect(parseBody(valid({ kind })), kind).not.toBeNull()
    }
    for (const kind of ['drill', 'LESSON', '', 'lesson ', 7, null]) {
      expect(parseBody(valid({ kind })), JSON.stringify(kind)).toBeNull()
    }
  })

  it('bounds the topic id rather than trusting it', () => {
    // Free text on the way to a `text` column. Nothing reads it back as an identifier; it
    // is a label on a row, and an unbounded one is a client choosing how much of our
    // storage to use.
    expect(parseBody(valid({ topicId: 'x'.repeat(128) }))).not.toBeNull()
    expect(parseBody(valid({ topicId: 'x'.repeat(129) }))).toBeNull()
    expect(parseBody(valid({ topicId: 42 }))).toBeNull()
    // Absent is fine — it is optional.
    expect(parseBody(valid())).not.toBeNull()
  })

  it('rejects a lesson longer than any real session', () => {
    const answer = { factId: 'f', templateId: 't', elapsedMs: 1, answeredAt: 1 }
    expect(parseBody(valid({ answers: Array.from({ length: 50 }, () => answer) }))).not.toBeNull()
    expect(parseBody(valid({ answers: Array.from({ length: 51 }, () => answer) }))).toBeNull()
    expect(parseBody(valid({ answers: [] }))).toBeNull()
    expect(parseBody(valid({ answers: 'nope' }))).toBeNull()
  })
})

describe('the numbers that reach a Date', () => {
  // `isFiniteMs`, not `typeof === 'number'`. The latter admits NaN, Infinity and 1e300,
  // all three of which reach `new Date(x).toISOString()` further down and throw a
  // RangeError there — an uncaught 500 that any client could ask for on purpose.
  const hostile = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, '5', null]

  it('refuses a startedAt that is not a finite millisecond', () => {
    for (const startedAt of hostile) {
      expect(parseBody(valid({ startedAt })), String(startedAt)).toBeNull()
    }
  })

  it('refuses an answer whose timestamps are not finite milliseconds', () => {
    for (const bad of hostile) {
      const one = { factId: 'f', templateId: 't', elapsedMs: 1, answeredAt: 1 }
      expect(parseBody(valid({ answers: [{ ...one, elapsedMs: bad }] })), `elapsed ${bad}`).toBeNull()
      expect(parseBody(valid({ answers: [{ ...one, answeredAt: bad }] })), `at ${bad}`).toBeNull()
    }
  })

  it('requires every answer to name a fact and a template', () => {
    expect(parseBody(valid({ answers: [{ templateId: 't', elapsedMs: 1, answeredAt: 1 }] }))).toBeNull()
    expect(parseBody(valid({ answers: [{ factId: 'f', elapsedMs: 1, answeredAt: 1 }] }))).toBeNull()
    expect(parseBody(valid({ answers: [null] }))).toBeNull()
  })
})

describe('the fields that are deliberately NOT validated', () => {
  it('accepts any wasCorrect, because the server decides correctness itself', () => {
    // Not laxness — the opposite. Validating it would imply it is read, and the entire
    // point of this endpoint is that it is not. The server re-grades from its own answer
    // key. A test that demanded a boolean here would be enforcing a contract nobody keeps.
    const answers = [
      { factId: 'f', templateId: 't', elapsedMs: 1, answeredAt: 1, wasCorrect: 'absolutely' },
    ]
    expect(parseBody(valid({ answers }))).not.toBeNull()
  })

  it('accepts any heartsLost, because gradeLesson derives it', () => {
    // It used to be range-checked and written to `lessons.hearts_lost`. The defence was
    // "a statistic, not a reward input". True, and it did not follow: `xp-economy.md §7`
    // reads heart-block rate per accuracy band to decide whether the mechanic is aimed the
    // right way, so a caller who could choose the number could choose the evidence for the
    // next balance change. It is derived now, and the field is simply ignored.
    expect(parseBody(valid({ heartsLost: -99 }))).not.toBeNull()
  })
})

describe('the quest, which decides an award', () => {
  const task = { slot: 'map', target: 4, factIds: ['geo.SE.capital'], goal: 'find-it' }
  const quest = (over: Record<string, unknown> = {}) => ({ date: '2026-08-19', tasks: [task], ...over })

  it('accepts a well-formed quest', () => {
    expect(parseBody(valid({ quest: quest() }))).not.toBeNull()
  })

  it('rejects a malformed quest rather than ignoring it', () => {
    // Ignoring would be worse than refusing: this decides an award, and a half-read task
    // list is a quest scored against the wrong facts.
    expect(parseBody(valid({ quest: {} }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ date: '19-08-2026' }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: [] }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: Array.from({ length: 9 }, () => task) }) }))).toBeNull()
  })

  it('bounds a task target to something a quest could actually be', () => {
    // Zero completes instantly and a large one is not a quest.
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, target: 0 }] }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, target: 21 }] }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, target: 2.5 }] }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, target: 20 }] }) }))).not.toBeNull()
  })

  it('bounds the fact list, because the pinned copy is stored and replayed', () => {
    const many = Array.from({ length: 41 }, (_, i) => `f${i}`)
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, factIds: many }] }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, factIds: [42] }] }) }))).toBeNull()
    const long = ['x'.repeat(129)]
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, factIds: long }] }) }))).toBeNull()
  })

  it('bounds the slot name', () => {
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, slot: 'x'.repeat(33) }] }) }))).toBeNull()
    expect(parseBody(valid({ quest: quest({ tasks: [{ ...task, slot: 7 }] }) }))).toBeNull()
  })

  it('treats an absent quest as a lesson without one', () => {
    expect(parseBody(valid())).not.toBeNull()
    expect(parseBody(valid())?.quest).toBeUndefined()
  })
})
