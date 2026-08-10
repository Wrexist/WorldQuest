/**
 * Playing the daily quest, rather than watching it advance.
 *
 * ## The gap this closes
 *
 * Every `QuestTask` carries `factIds` — the exact facts that task needs answered. So a
 * daily quest has always been a complete, precise specification of a session. Nothing
 * ever played it. Home's Continue button started a *generic* lesson and the quest moved
 * as a **side effect**: if the shuffle happened to include a fact a task happened to
 * want, a counter ticked.
 *
 * From the user's side that is a progress bar moving for reasons they cannot see, under a
 * heading promising five specific things. The app had a structured daily quiz built and
 * played a shuffle instead — see `docs/product/daily-quest-research.md`.
 *
 * This turns the specification back into a lesson.
 *
 * ## Why the union rather than one task at a time
 *
 * Slot order is how the quest READS, not how it has to be played. Serving one task per
 * run would mean five separate lessons a day, five summary screens, and five chances to
 * stop — and the spec is explicit that a quest must be finishable in one sitting
 * (`quests-and-liveops.md §1`). Handing the composer every outstanding fact lets it build
 * one session and apply its own rules to the pool: due items first, the 60/30/10 mix,
 * never two questions about the same country in a row.
 *
 * The tasks still complete in whatever order the answers land, which is what the quest
 * screen already draws.
 *
 * ## `perform` has no facts, and that is correct
 *
 * Slot 5 is about HOW a lesson went — perfect, fast, or merely finished — not about which
 * facts it contained. It carries no `factIds` and contributes none here; it completes off
 * the back of whatever the other four are already doing, which is why it can be last
 * without ever being a sixth thing to do.
 */

import type { DailyQuest } from './index.js'

/**
 * The facts a quest wants, in the shape a lesson focus takes.
 *
 * Declared here rather than imported as `LessonFocus` from `../lesson/focus.js`, which
 * is what this file did first. Rule 6 in `packages/engines/CLAUDE.md` is that engines
 * never import each other except through `shared` — and a type-only import breaks it as
 * surely as a value one does, because the coupling a rule about imports is protecting is
 * the coupling between the two engines' contracts, not between their bundles. The quest
 * engine deciding "which facts are outstanding" must not be a thing that stops compiling
 * because the lesson engine added a field.
 *
 * It stays assignable to `LessonFocus` structurally, which is all the host needs: the app
 * hands this straight to `focusFilter`, and TypeScript checks the fit at that call site
 * without either engine having to know the other exists.
 */
export type QuestFocus = {
  readonly factIds: readonly string[]
}

/**
 * The facts today's quest still needs, as a lesson focus.
 *
 * `undefined` when there is nothing outstanding — a finished quest, or one whose only
 * incomplete task is `perform`. Undefined rather than an empty focus on purpose: an empty
 * `factIds` array means "these facts, of which there are none" and would compose a lesson
 * of nothing, whereas the honest reading of "the quest wants no particular fact" is an
 * ordinary lesson. That distinction is the same one `focusFilter` draws, and getting it
 * backwards here would hand somebody a zero-question lesson for finishing their quest.
 */
export function questFocus(quest: DailyQuest): QuestFocus | undefined {
  const outstanding = quest.tasks
    .filter((task) => !task.complete)
    .flatMap((task) => task.factIds)

  const unique = [...new Set(outstanding)]
  return unique.length === 0 ? undefined : { factIds: unique }
}

/**
 * How much of today's quest is done, as tasks rather than as facts.
 *
 * Tasks, because that is the promise on screen: "five things, about ten minutes". Facts
 * would be a truer measure of effort and a worse measure of the thing the user was told
 * they were doing — the mismatch this whole module exists to remove.
 */
export function questStanding(quest: DailyQuest): {
  readonly done: number
  readonly total: number
  readonly complete: boolean
} {
  const done = quest.tasks.filter((task) => task.complete).length
  return { done, total: quest.tasks.length, complete: quest.complete }
}
