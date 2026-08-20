/**
 * The outermost trust boundary of the server-authoritative reward path.
 *
 * ## Why this is its own file
 *
 * `submit-lesson/index.ts` is the one place that decides every XP, coin, streak, quest
 * and achievement award — ADR 0006 makes it authoritative and the client explicitly
 * distrusted. It had **no test of its own**. `build.test.ts` tests the bundler, and the
 * six files in `_shared/` test everything except the code that reads the request.
 *
 * Nothing could have tested it in place: the module imports `jsr:@supabase/supabase-js@2`
 * and calls `Deno.serve` at the top level, neither of which vitest can load. So the two
 * functions that need testing most — the ones that turn `unknown` from the network into
 * something the rest of the function trusts — were unreachable by the suite.
 *
 * They are pure, they were already separable, and `_shared/submission-time.ts` is exactly
 * this pattern: the logic lives here and the Deno entrypoint wires it. That is the
 * smallest change that makes the boundary testable, and it moves no behaviour.
 *
 * Every rule below was written as a comment describing a defence. A comment is not a
 * defence — `parse-submission.test.ts` is where each one becomes one.
 */

import { isFiniteMs } from './submission-time.js'
// `.js` specifiers, which is the convention in `_shared` and not a cosmetic one: this
// directory is typechecked by `supabase/tsconfig.json` under Node resolution, and the
// bundler rewrites the extension for Deno on the way out. `index.ts` uses `.ts` because
// it is Deno source that the compiler is told to skip.
import type { AnsweredItem } from '../../../../packages/engines/src/lesson/machine.js'
import type { QuestTask } from '../../../../packages/engines/src/quests/progress.js'

export type SubmitBody = {
  lessonId: string
  kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
  topicId?: string
  startedAt: number
  answers: AnsweredItem[]
  heartsLost?: number
  clientVersion?: string
  /**
   * The five tasks the device composed for today, so the server can pay for them.
   *
   * A proposal, not an instruction. The FIRST submission of a local day pins it; every
   * later one reads the pinned copy back, so a client cannot swap in an easier quest once
   * it knows what it answered. And what a task is worth is never in this payload — the
   * rates come from `BALANCE` on this side. See the migration for why the quest cannot
   * simply be re-derived here.
   */
  quest?: { date: string; tasks: QuestTask[] }
}

export function parseBody(raw: unknown): SubmitBody | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>

  if (typeof b.lessonId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.lessonId)) return null
  /**
   * `kind` reaches `record_lesson` as a `lesson_kind` enum, and was not checked.
   *
   * An unrecognised value is not a security hole — Postgres refuses it — but the refusal
   * arrives as a 22P02 from inside the RPC, which this function reports as
   * `persist_failed` with a 500. The client's queue classifies a 5xx as retryable, so a
   * lesson carrying a bad kind burns all five attempts and PARKS: work the user actually
   * did, held for ever, over a string. A 400 parks it immediately with an honest reason.
   *
   * The list is the enum's, and the shape is the reason it is worth writing out: a value
   * that reaches a database enum is a value this parser should have decided about.
   */
  if (
    typeof b.kind !== 'string' ||
    !['lesson', 'quest', 'review', 'challenge', 'event'].includes(b.kind)
  ) {
    return null
  }
  // Free text on the way to a `text` column, so it is bounded rather than trusted. Nothing
  // reads it back as an identifier; it is a label on a row, and an unbounded one is a
  // client choosing how much of our storage to use.
  if (b.topicId !== undefined && (typeof b.topicId !== 'string' || b.topicId.length > 128)) {
    return null
  }
  // `isFiniteMs`, not `typeof === 'number'`. The latter admits NaN, Infinity and 1e300,
  // all three of which reach `new Date(x).toISOString()` further down and throw a
  // RangeError there — an uncaught 500 any client could ask for.
  if (!isFiniteMs(b.startedAt)) return null
  if (!Array.isArray(b.answers) || b.answers.length === 0) return null
  // `heartsLost` is NOT validated here, because like `wasCorrect` below it is no longer
  // read. It used to be: range-checked, clamped, and written to `lessons.hearts_lost`.
  //
  // The defence for that was "a statistic, not a reward input — nothing is paid or
  // withheld on it". Both halves were true and the conclusion did not follow.
  // `docs/systems/xp-economy.md §7` reads heart-block rate per accuracy band to decide
  // whether the mechanic is aimed the right way, and §3 stakes the entire design of
  // hearts on that reading — so a caller who could choose the number could choose the
  // evidence for the next balance change. Shape validation constrains a forged value to
  // a plausible one, which is the harder kind to notice.
  //
  // `gradeLesson` derives it now, from the correctness the server itself decided and the
  // memory record the server itself holds.
  //
  // A lesson longer than the documented maximum is a forged payload, not a session.
  if (b.answers.length > 50) return null

  for (const a of b.answers) {
    if (typeof a !== 'object' || a === null) return null
    const item = a as Record<string, unknown>
    if (typeof item.factId !== 'string') return null
    if (typeof item.templateId !== 'string') return null
    // `wasCorrect` is deliberately NOT validated, because it is deliberately not
    // read. The server decides correctness itself further down.
    //
    // `elapsedMs` and `answeredAt` are checked for shape here and CLAMPED below. Shape
    // alone was never enough: `answeredAt` is the clock the scheduler runs on, and a
    // client that could date an answer in the future could mint mastery. See
    // _shared/submission-time.ts.
    if (!isFiniteMs(item.elapsedMs)) return null
    if (!isFiniteMs(item.answeredAt)) return null
  }

  // The quest, if this lesson carried one. Rejected rather than ignored when malformed:
  // this decides an award, and a half-read task list is a quest scored against the wrong
  // facts. `factIds` is bounded because the pinned copy is stored and replayed.
  if (b.quest !== undefined && !isQuestPayload(b.quest)) return null

  return b as unknown as SubmitBody
}

/** Five slots at most, each naming a bounded set of facts. Everything else is refused. */
function isQuestPayload(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  // The date the device composed it for. Shape only — what it MEANS is decided by the
  // comparison in `evaluateQuest`, which is the only thing this field is ever used for.
  const date = (raw as { date?: unknown }).date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  const tasks = (raw as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 8) return false

  return tasks.every((t) => {
    if (typeof t !== 'object' || t === null) return false
    const task = t as Record<string, unknown>
    if (typeof task.slot !== 'string' || task.slot.length > 32) return false
    if (typeof task.target !== 'number' || !Number.isInteger(task.target)) return false
    // A target of zero would complete instantly and a large one is not a quest.
    if (task.target < 1 || task.target > 20) return false
    if (!Array.isArray(task.factIds) || task.factIds.length > 40) return false
    if (!task.factIds.every((f) => typeof f === 'string' && f.length <= 128)) return false
    return task.goal === undefined || typeof task.goal === 'string'
  })
}
