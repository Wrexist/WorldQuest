/**
 * The lesson's outcome, translated into the events the achievement engine counts.
 *
 * ## Why this is its own file
 *
 * Same reason as `parse-submission.ts`: `submit-lesson/index.ts` imports
 * `jsr:@supabase/supabase-js@2` and calls `Deno.serve` at module scope, so nothing under
 * vitest can load it — and this function decides which achievements unlock, which is XP
 * and coins from `BALANCE.xp.achievementByTier`. It was untested for the same reason the
 * parser was: not because it was thought safe, but because it was unreachable.
 *
 * Being unreachable is what let the bug below live.
 *
 * ## Do not derive a fact's attribute from its id
 *
 * This function used to read the event's `attribute` and `entityId` by splitting the fact
 * id on dots — `geo.SE.capital` → attribute `capital`, entity `SE`. That is true for five
 * of the pack's six attributes and false for the sixth:
 *
 *     { "id": "geo.AR.continent", "entity": "AR", "attribute": "location" }
 *
 * The 64 location facts are keyed `.continent` and are authored as attribute `location`,
 * which is what `ach.locations.collector` filters on. So every one of its four tiers —
 * bronze at 5, platinum at all 64 — was unreachable, on the client and on the server,
 * for as long as both sides split the string. Nothing caught it: the content is
 * self-consistent (the ceiling check counts the same authored field the rule names), and
 * the code was consistent with itself. Only the join between them was wrong, and nothing
 * executed the join.
 *
 * A fact id is an opaque, permanent key — `PROJECT.md` makes renaming one a migration —
 * so its last segment is a coincidence, not a contract. The attribute and the entity are
 * fields the fact DECLARES. They are passed in here as maps generated from the packs by
 * `supabase/functions/build.ts`, and this module refuses a fact it has no entry for
 * rather than guessing one from the text of its name.
 *
 * ## Injected rather than imported
 *
 * The three maps live in `submit-lesson/_content/`, which is generated at bundle time and
 * gitignored. Importing them would make this module unloadable in exactly the way it
 * exists to avoid. They are parameters, which also means a test can state the content it
 * is reasoning about instead of inheriting 350 facts.
 */

import { levelProgress } from '../../../../packages/engines/src/xp/level.js'
import type { DomainEvent } from '../../../../packages/engines/src/achievements/index.js'

/** The projection of the content packs this needs: what a fact is about, and where. */
export type ContentMaps = {
  /** fact id → the entity it is about. `ANSWER_BY_FACT`. */
  readonly entityByFact: Readonly<Record<string, string>>
  /** fact id → the attribute it declares. `ATTRIBUTE_BY_FACT`. */
  readonly attributeByFact: Readonly<Record<string, string>>
  /** entity id → its region code, for the one achievement that counts continents. */
  readonly regionByEntity: Readonly<Record<string, string>>
}

export type AchievementEventInput = {
  readonly graded: readonly { factId: string; wasCorrect: boolean }[]
  readonly masteryChanges: readonly { factId: string; to: string }[]
  readonly entityMastered: readonly string[]
  readonly overdueCleared: number
  readonly streak: number | null
  readonly accuracy: number
  readonly durationMs: number
  readonly questCompleted: boolean
  readonly xpTotalAfter: number
  readonly at: number
}

export function achievementEvents(
  input: AchievementEventInput,
  content: ContentMaps,
): readonly DomainEvent[] {
  const { at } = input
  const events: DomainEvent[] = []

  for (const change of input.masteryChanges) {
    if (change.to !== 'mastered' && change.to !== 'burnished') continue
    const attribute = content.attributeByFact[change.factId]
    // The BARE entity code, because `distinctBy: 'entityId'` and every `members` list use
    // it — `geo.SE` here would count as a different country from `SE` in `ach.set.nordics`.
    const entityId = content.entityByFact[change.factId]
    // A fact the shipped packs do not contain. Skipped rather than guessed: this arrives
    // from the user's own memory rows, which outlive the pack that created them, so a
    // retired fact is an ordinary thing to meet and not an error.
    if (attribute === undefined || entityId === undefined) continue
    events.push({
      name: 'fact_mastered',
      at,
      payload: { attribute, entityId, factId: change.factId },
    })
  }

  for (const entityId of input.entityMastered) {
    events.push({ name: 'entity_mastered', at, payload: { entityId } })
  }

  // One event per cleared review, because `counter` counts events — sending one carrying
  // the number would make a ten-review lesson worth one, and a 1000-tier take a decade.
  // Bounded by the answer count, which is already capped at 50 by the parser.
  const cleared = Number.isInteger(input.overdueCleared)
    ? Math.min(Math.max(input.overdueCleared, 0), input.graded.length)
    : 0
  for (let i = 0; i < cleared; i++) {
    events.push({ name: 'overdue_review_cleared', at, payload: {} })
  }

  if (input.streak !== null) {
    // `streak_extended` rather than `daily_lesson`: the name predates the rule and ships
    // in dashboards, so it is not renameable. `length` is the field the rule reads.
    events.push({ name: 'streak_extended', at, payload: { length: input.streak } })
  }

  events.push({
    name: 'lesson_completed',
    at,
    payload: { accuracy: input.accuracy, durationMs: input.durationMs },
  })

  if (input.questCompleted) {
    events.push({ name: 'daily_quest_completed', at, payload: {} })
  }

  // The regions this lesson actually earned something in. Distinct, because the
  // set-completion rule dedupes by member anyway and a shorter event list is cheaper.
  const regions = new Set<string>()
  for (const answer of input.graded) {
    if (!answer.wasCorrect) continue
    const entity = content.entityByFact[answer.factId]
    const region = entity === undefined ? undefined : content.regionByEntity[entity]
    if (region !== undefined) regions.add(region)
  }
  for (const region of regions) {
    events.push({ name: 'region_started', at, payload: { region } })
  }

  // Absolute rather than incremental — `threshold` compares the stat the event reports.
  events.push({
    name: 'level_reached',
    at,
    payload: { level: levelProgress(Math.max(0, input.xpTotalAfter)).level },
  })

  return events
}
