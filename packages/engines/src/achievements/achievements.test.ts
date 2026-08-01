import { describe, expect, it } from 'vitest'
import {
  backfill,
  emptyProgress,
  evaluate,
  evaluateAll,
  tierProgress,
  type AchievementDef,
  type DomainEvent,
} from './index.js'

const AT = Date.parse('2026-08-01T09:00:00Z')

const event = (
  name: string,
  payload?: Record<string, string | number | boolean>,
  at = AT,
): DomainEvent => (payload === undefined ? { name, at } : { name, at, payload })

const flagCollector: AchievementDef = {
  id: 'ach.flags.collector',
  category: 'flags',
  rule: {
    type: 'counter',
    event: 'fact_mastered',
    where: { attribute: 'flag' },
    distinctBy: 'entityId',
  },
  tiers: [
    { tier: 'bronze', threshold: 2 },
    { tier: 'silver', threshold: 4 },
    { tier: 'gold', threshold: 6 },
  ],
}

const apply = (def: AchievementDef, events: readonly DomainEvent[]) => {
  let progress = emptyProgress(def.id)
  const unlocked = []
  for (const e of events) {
    const result = evaluate(def, progress, e)
    progress = result.progress
    unlocked.push(...result.unlocked)
  }
  return { progress, unlocked }
}

describe('counter', () => {
  it('ignores events it does not care about', () => {
    const { progress } = apply(flagCollector, [
      event('lesson_completed'),
      event('fact_mastered', { attribute: 'capital', entityId: 'SE' }),
    ])
    expect(progress.value).toBe(0)
    expect(progress.tier).toBeNull()
  })

  it('counts distinct entities, not repetitions', () => {
    // The bug this prevents: mastering, forgetting and re-mastering one flag a
    // hundred times would otherwise satisfy "100 flags mastered".
    const { progress } = apply(flagCollector, [
      event('fact_mastered', { attribute: 'flag', entityId: 'SE' }),
      event('fact_mastered', { attribute: 'flag', entityId: 'SE' }),
      event('fact_mastered', { attribute: 'flag', entityId: 'SE' }),
    ])
    expect(progress.value).toBe(1)
  })

  it('unlocks each tier once, in order', () => {
    const { progress, unlocked } = apply(
      flagCollector,
      ['SE', 'FR', 'JP', 'BR'].map((id) =>
        event('fact_mastered', { attribute: 'flag', entityId: id }),
      ),
    )
    expect(unlocked.map((u) => u.tier)).toEqual(['bronze', 'silver'])
    expect(progress.tier).toBe('silver')
  })

  it('crosses several tiers at once when a single event jumps the gap', () => {
    // A backfilled counter goes from 0 to 200 in one step. The caller needs to know
    // all three were crossed — and to show ONE summary rather than three animations.
    const jump: AchievementDef = {
      ...flagCollector,
      rule: { type: 'counter', event: 'flags_backfilled' },
      tiers: [
        { tier: 'bronze', threshold: 1 },
        { tier: 'silver', threshold: 1 },
        { tier: 'gold', threshold: 1 },
      ],
    }
    const { unlocked } = apply(jump, [event('flags_backfilled')])
    expect(unlocked.map((u) => u.tier)).toEqual(['bronze', 'silver', 'gold'])
  })

  it('respects the filter', () => {
    const { progress } = apply(flagCollector, [
      event('fact_mastered', { attribute: 'capital', entityId: 'SE' }),
      event('fact_mastered', { attribute: 'flag', entityId: 'SE' }),
    ])
    expect(progress.value).toBe(1)
  })

  it('awards tiers by threshold order, not by the order they are written', () => {
    // A mis-ordered content file must not silently award gold at two flags.
    const misordered: AchievementDef = {
      ...flagCollector,
      tiers: [
        { tier: 'gold', threshold: 6 },
        { tier: 'bronze', threshold: 2 },
        { tier: 'silver', threshold: 4 },
      ],
    }
    const { progress } = apply(
      misordered,
      ['SE', 'FR'].map((id) => event('fact_mastered', { attribute: 'flag', entityId: id })),
    )
    expect(progress.tier).toBe('bronze')
  })
})

describe('streak', () => {
  const streaker: AchievementDef = {
    id: 'ach.streak.week',
    category: 'streak',
    rule: { type: 'streak', metric: 'daily_lesson' },
    tiers: [
      { tier: 'bronze', threshold: 7 },
      { tier: 'silver', threshold: 30 },
    ],
  }

  it('tracks the current length, not a running total', () => {
    const { progress } = apply(streaker, [
      event('streak_extended', { length: 5 }),
      event('streak_extended', { length: 6 }),
      event('streak_extended', { length: 7 }),
    ])
    expect(progress.value).toBe(7)
    expect(progress.tier).toBe('bronze')
  })

  it('lets the value fall when a streak breaks but keeps the badge', () => {
    // Showing "28 / 30" after the streak died at 28 is a lie the user notices the
    // next day. Revoking the badge for something they genuinely did is worse.
    const { progress } = apply(streaker, [
      event('streak_extended', { length: 9 }),
      event('streak_extended', { length: 1 }),
    ])
    expect(progress.value).toBe(1)
    expect(progress.tier).toBe('bronze')
  })
})

describe('threshold', () => {
  const leveller: AchievementDef = {
    id: 'ach.level.50',
    category: 'progression',
    rule: { type: 'threshold', stat: 'level' },
    tiers: [{ tier: 'gold', threshold: 50 }],
  }

  it('compares an absolute stat rather than accumulating', () => {
    const { progress, unlocked } = apply(leveller, [
      event('level_changed', { level: 12 }),
      event('level_changed', { level: 50 }),
    ])
    expect(progress.value).toBe(50)
    expect(unlocked).toHaveLength(1)
  })
})

describe('set completion', () => {
  const africa: AchievementDef = {
    id: 'ach.set.africa',
    category: 'regions',
    rule: {
      type: 'set-completion',
      event: 'entity_mastered',
      distinctBy: 'entityId',
      members: ['EG', 'KE', 'NG'],
    },
    tiers: [{ tier: 'platinum', threshold: 3 }],
  }

  it('ignores members that are not in the set', () => {
    // Without this, "all African countries" completes on 54 European ones.
    const { progress } = apply(africa, [
      event('entity_mastered', { entityId: 'SE' }),
      event('entity_mastered', { entityId: 'FR' }),
      event('entity_mastered', { entityId: 'EG' }),
    ])
    expect(progress.value).toBe(1)
    expect(progress.tier).toBeNull()
  })

  it('unlocks when every member is seen', () => {
    const { progress, unlocked } = apply(
      africa,
      ['EG', 'KE', 'EG', 'NG'].map((id) => event('entity_mastered', { entityId: id })),
    )
    expect(progress.value).toBe(3)
    expect(unlocked.map((u) => u.tier)).toEqual(['platinum'])
  })
})

describe('session', () => {
  const speedrun: AchievementDef = {
    id: 'ach.session.perfect_fast',
    category: 'skill',
    rule: {
      type: 'session',
      event: 'lesson_completed',
      conditions: [
        { stat: 'accuracy', gte: 1 },
        { stat: 'durationMs', lte: 60_000 },
      ],
    },
    tiers: [{ tier: 'bronze', threshold: 1 }],
    backfill: false,
  }

  it('requires every condition in the SAME event', () => {
    // A perfect lesson last week and a fast one today is not a fast perfect lesson.
    const { progress } = apply(speedrun, [
      event('lesson_completed', { accuracy: 1, durationMs: 90_000 }),
      event('lesson_completed', { accuracy: 0.8, durationMs: 30_000 }),
    ])
    expect(progress.value).toBe(0)
  })

  it('counts qualifying sessions so it can tier', () => {
    const { progress, unlocked } = apply(speedrun, [
      event('lesson_completed', { accuracy: 1, durationMs: 42_000 }),
    ])
    expect(progress.value).toBe(1)
    expect(unlocked).toHaveLength(1)
  })

  it('ignores an event missing a stat it needs', () => {
    const { progress } = apply(speedrun, [event('lesson_completed', { accuracy: 1 })])
    expect(progress.value).toBe(0)
  })
})

describe('composite', () => {
  const completionist: AchievementDef = {
    id: 'ach.composite.completionist',
    category: 'meta',
    rule: {
      op: 'and',
      type: 'composite',
      rules: [
        { type: 'counter', event: 'entity_mastered' },
        { type: 'threshold', stat: 'prestige' },
      ],
    },
    tiers: [{ tier: 'legendary', threshold: 1 }],
  }

  it('requires every branch under AND', () => {
    const one = apply(completionist, [event('entity_mastered', { entityId: 'SE' })])
    expect(one.unlocked).toHaveLength(0)

    const both = apply(completionist, [
      event('entity_mastered', { entityId: 'SE' }),
      event('prestige_changed', { prestige: 1 }),
    ])
    expect(both.unlocked.map((u) => u.tier)).toEqual(['legendary'])
  })

  it('needs only one branch under OR', () => {
    const either: AchievementDef = {
      ...completionist,
      rule: { ...completionist.rule, op: 'or' } as typeof completionist.rule,
    }
    const { unlocked } = apply(either, [event('prestige_changed', { prestige: 1 })])
    expect(unlocked.map((u) => u.tier)).toEqual(['legendary'])
  })

  it('round-trips each branch through a single progress row', () => {
    // The composite must not be the one rule type the database schema has to know
    // about — its branch state packs into the same `seen` array as everything else.
    const first = evaluate(
      completionist,
      emptyProgress(completionist.id),
      event('entity_mastered', { entityId: 'SE' }),
    )
    const stored: typeof first.progress = JSON.parse(JSON.stringify(first.progress))
    const second = evaluate(completionist, stored, event('prestige_changed', { prestige: 1 }))
    expect(second.unlocked.map((u) => u.tier)).toEqual(['legendary'])
  })
})

describe('evaluateAll', () => {
  it('applies one event across a catalogue and collects every unlock', () => {
    const capitals: AchievementDef = {
      id: 'ach.capitals.first',
      category: 'capitals',
      rule: { type: 'counter', event: 'fact_mastered', where: { attribute: 'capital' } },
      tiers: [{ tier: 'bronze', threshold: 1 }],
    }

    const result = evaluateAll(
      [flagCollector, capitals],
      new Map(),
      event('fact_mastered', { attribute: 'capital', entityId: 'SE' }),
    )

    expect(result.unlocked.map((u) => u.achievementId)).toEqual(['ach.capitals.first'])
    expect(result.progress.get('ach.flags.collector')).toBeUndefined()
  })
})

describe('backfill', () => {
  it('replays history for replayable rules', () => {
    // A user with 200 days of history must never see a 7-day achievement as locked.
    const history = ['SE', 'FR', 'JP'].map((id) =>
      event('fact_mastered', { attribute: 'flag', entityId: id }),
    )
    const { progress, unlocked } = backfill([flagCollector], history)
    expect(progress.get('ach.flags.collector')?.value).toBe(3)
    expect(unlocked.map((u) => u.tier)).toEqual(['bronze'])
  })

  it('skips rules that cannot be replayed', () => {
    // Nothing in the log records that a lesson was finished in under sixty seconds
    // two years ago. Inventing that unlock is worse than granting it late.
    const speedrun: AchievementDef = {
      id: 'ach.session.perfect_fast',
      category: 'skill',
      rule: {
        type: 'session',
        event: 'lesson_completed',
        conditions: [{ stat: 'accuracy', gte: 1 }],
      },
      tiers: [{ tier: 'bronze', threshold: 1 }],
      backfill: false,
    }
    const { unlocked } = backfill([speedrun], [event('lesson_completed', { accuracy: 1 })])
    expect(unlocked).toEqual([])
  })
})

describe('tierProgress', () => {
  it('measures towards the NEXT tier, not from zero', () => {
    // A bar that restarts from 0 after bronze tells a user with 3 of 4 flags that
    // they are at 75 % of silver, which they are.
    const at3 = { achievementId: flagCollector.id, value: 3, tier: 'bronze' as const }
    expect(tierProgress(flagCollector, at3)).toEqual({ next: 'silver', fraction: 0.5 })
  })

  it('is full and has no next tier once complete', () => {
    const done = { achievementId: flagCollector.id, value: 9, tier: 'gold' as const }
    expect(tierProgress(flagCollector, done)).toEqual({ next: null, fraction: 1 })
  })

  it('never reports outside 0–1', () => {
    const over = { achievementId: flagCollector.id, value: 99, tier: 'bronze' as const }
    expect(tierProgress(flagCollector, over).fraction).toBe(1)
  })
})

describe('purity', () => {
  it('never mutates the progress it is given', () => {
    // The identical module runs in the app for an optimistic celebration and in the
    // edge function that awards the XP. Shared mutable state between those two is
    // how a client and server come to disagree about what a user has earned.
    const before = emptyProgress(flagCollector.id)
    const frozen = Object.freeze({ ...before })
    const result = evaluate(
      flagCollector,
      frozen,
      event('fact_mastered', { attribute: 'flag', entityId: 'SE' }),
    )
    expect(frozen.value).toBe(0)
    expect(result.progress.value).toBe(1)
  })

  it('is deterministic — the same events give the same result', () => {
    const events = ['SE', 'FR', 'JP'].map((id) =>
      event('fact_mastered', { attribute: 'flag', entityId: id }),
    )
    expect(apply(flagCollector, events)).toEqual(apply(flagCollector, events))
  })
})
