import { BALANCE, evaluateAll, isQuizzable, masteryOf, type AchievementDef, type AchievementProgress,
  type MemoryState, type Unlock } from '@worldquest/engines'
import pack from '../../content/packs/achievements/core.v1.json'
// One implementation of "which events a lesson produces", shared with the legacy
// function until it is retired (B20), when this moves into the engines.
import { achievementEvents, type ContentMaps } from '../../../supabase/functions/_src/_shared/achievement-events'
import { learningContent } from './learning-content'

/**
 * Achievements, decided and paid by the server.
 *
 * The same catalogue the device renders, projected to what the evaluator reads, and the
 * same `evaluateAll` — over events this Worker derived from its own grading, never ones
 * a client reported. Tier rewards come from the balance table and land in the lesson's
 * own ledger row, inside the revision guard, so a replayed lesson cannot pay twice.
 */

const CATALOGUE: readonly AchievementDef[] = (pack.items as { id: string; rule: unknown; tiers?: { tier: string; threshold: number }[] }[])
  .map(item => ({ id: item.id, rule: item.rule, tiers: (item.tiers ?? []).map(t => ({ tier: t.tier, threshold: t.threshold })) })) as unknown as AchievementDef[]

const CONTENT: ContentMaps = {
  entityByFact: Object.fromEntries([...learningContent.facts.values()].map(f => [f.id, f.entity])),
  attributeByFact: Object.fromEntries([...learningContent.facts.values()].map(f => [f.id, f.attribute])),
  regionByEntity: Object.fromEntries([...learningContent.entities.values()]
    .filter(e => typeof (e as { region?: unknown }).region === 'string')
    .map(e => [e.id, (e as unknown as { region: string }).region])),
}

/** Every quizzable fact of each entity: an entity is mastered when all of them are. */
const FACTS_BY_ENTITY = new Map<string, string[]>()
for (const fact of learningContent.facts.values()) {
  if (!isQuizzable(fact)) continue
  FACTS_BY_ENTITY.set(fact.entity, [...(FACTS_BY_ENTITY.get(fact.entity) ?? []), fact.id])
}

/** Stored progress, re-validated on read; a malformed row counts from zero, never crashes. */
export function readProgress(stored: string): Map<string, AchievementProgress> {
  const progress = new Map<string, AchievementProgress>()
  let value: unknown
  try { value = JSON.parse(stored) } catch { return progress }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return progress
  for (const [id, row] of Object.entries(value as Record<string, unknown>)) {
    if (typeof row !== 'object' || row === null) continue
    const candidate = row as AchievementProgress
    if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) continue
    if (candidate.seen !== undefined && !Array.isArray(candidate.seen)) continue
    if (candidate.tier !== null && typeof candidate.tier !== 'string') continue
    progress.set(id, { ...candidate, achievementId: id })
  }
  return progress
}

const tierReward = (tier: string) => ({
  xp: (BALANCE.xp.achievementByTier as Record<string, number | undefined>)[tier] ?? 0,
  coins: (BALANCE.coins.achievementByTier as Record<string, number | undefined>)[tier] ?? 0,
})

export type AchievementOutcome = { stored: string; unlocked: Unlock[]; xp: number; coins: number }

export function applyAchievements(input: {
  stored: string
  answers: readonly { factId: string; wasCorrect: boolean }[]
  masteryChanges: readonly { factId: string; to: string }[]
  /** Memory after this lesson, for every content fact the account has seen. */
  memoryAfter: ReadonlyMap<string, MemoryState>
  overdueCleared: number
  /** Only a finished lesson counts as a lesson, a streak day or a quest. */
  finished: boolean
  streak: number | null
  accuracy: number
  durationMs: number
  questCompleted: boolean
  xpTotalAfter: number
  now: number
}): AchievementOutcome {
  const promoted = new Set(input.masteryChanges.filter(c => c.to === 'mastered' || c.to === 'burnished')
    .map(c => CONTENT.entityByFact[c.factId]).filter((e): e is string => e !== undefined))
  const entityMastered = [...promoted].filter(entity => (FACTS_BY_ENTITY.get(entity) ?? []).every(id => {
    const state = input.memoryAfter.get(id)
    return state !== undefined && ['mastered', 'burnished'].includes(masteryOf(state, input.now))
  }))
  const events = achievementEvents({
    graded: input.answers, masteryChanges: input.masteryChanges, entityMastered,
    overdueCleared: input.overdueCleared, streak: input.finished ? input.streak : null,
    accuracy: input.accuracy, durationMs: input.durationMs,
    questCompleted: input.finished && input.questCompleted, xpTotalAfter: input.xpTotalAfter, at: input.now,
  }, CONTENT)
    // A lesson ended early is not a lesson for the session rules ("a perfect lesson"):
    // three right answers and a quit must not count as a flawless round.
    .filter(event => input.finished || event.name !== 'lesson_completed')
  let progress = readProgress(input.stored)
  const unlocked: Unlock[] = []
  for (const event of events) {
    const evaluated = evaluateAll(CATALOGUE, progress, event)
    progress = evaluated.progress
    unlocked.push(...evaluated.unlocked)
  }
  const reward = unlocked.map(u => tierReward(u.tier)).reduce((sum, r) => ({ xp: sum.xp + r.xp, coins: sum.coins + r.coins }), { xp: 0, coins: 0 })
  return { stored: JSON.stringify(Object.fromEntries(progress)), unlocked, xp: reward.xp, coins: reward.coins }
}
