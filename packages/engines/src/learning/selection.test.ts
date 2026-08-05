import { describe, expect, it } from 'vitest'
import { MS_PER_DAY, seededRng } from '../shared/index.js'
import { review } from './fsrs.js'
import {
  MAX_LESSON_ITEMS,
  MIN_LESSON_ITEMS,
  lessonLength,
  lessonsPerDay,
  selectItems,
} from './selection.js'
import type { MemoryState } from './types.js'

const NOW = 1_800_000_000_000

const entityOf = (id: string) => id.split('.').slice(0, 2).join('.')

/** Build a due memory state for a fact. */
function dueFact(factId: string, overdueHours = 1, over: Partial<MemoryState> = {}): MemoryState {
  const base = review({ factId, state: null, rating: 3, now: NOW - 10 * MS_PER_DAY })
  return { ...base, dueAt: NOW - overdueHours * 3_600_000, ...over }
}

/** 10 entities × 4 attributes = 40 due facts. */
const dueCandidates = (): MemoryState[] => {
  const out: MemoryState[] = []
  for (let e = 0; e < 10; e++) {
    for (const attr of ['capital', 'flag', 'locate', 'currency']) {
      out.push(dueFact(`geo.C${e}.${attr}`, e + 1))
    }
  }
  return out
}

const newFacts = (n = 20) => Array.from({ length: n }, (_, i) => `geo.N${i}.capital`)

describe('selectItems', () => {
  it('returns exactly the requested count when supply allows', () => {
    const picked = selectItems({
      candidates: dueCandidates(),
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
      rng: seededRng(42),
    })
    expect(picked).toHaveLength(10)
  })

  it('never repeats a fact within one lesson', () => {
    const picked = selectItems({
      candidates: dueCandidates(),
      newFactIds: newFacts(),
      count: 15,
      now: NOW,
      rng: seededRng(7),
    })
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('never places two facts about the same entity back to back', () => {
    // Interleaving beats blocking for retention, and blocked repetition simply
    // reads as broken to a user.
    for (let seed = 0; seed < 25; seed++) {
      const picked = selectItems({
        candidates: dueCandidates(),
        newFactIds: newFacts(),
        count: 12,
        now: NOW,
        rng: seededRng(seed),
      })
      for (let i = 1; i < picked.length; i++) {
        expect(entityOf(picked[i]!)).not.toBe(entityOf(picked[i - 1]!))
      }
    }
  })

  it('honours the minimum new-item share so a session never becomes pure review', () => {
    // Reviews-only feels like a treadmill, and the treadmill is the top reason
    // people abandon spaced-repetition tools.
    const picked = selectItems({
      candidates: dueCandidates(),
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
      rng: seededRng(1),
    })
    const fresh = picked.filter((id) => id.startsWith('geo.N'))
    expect(fresh.length).toBeGreaterThanOrEqual(2)
  })

  it('drops the new-item floor when the user opts into catch-up', () => {
    const picked = selectItems({
      candidates: dueCandidates(),
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
      rng: seededRng(1),
      catchUpMode: true,
    })
    const fresh = picked.filter((id) => id.startsWith('geo.N'))
    expect(fresh.length).toBeLessThanOrEqual(3)
  })

  it('leads with new content on a cold start and never returns an empty queue', () => {
    const picked = selectItems({
      candidates: [],
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
      rng: seededRng(3),
    })
    expect(picked).toHaveLength(10)
    expect(picked.every((id) => id.startsWith('geo.N'))).toBe(true)
  })

  it('respects a topic filter — free topic choice is non-negotiable', () => {
    const inTopic = (id: string) => id.startsWith('geo.C1.') || id.startsWith('geo.C2.')
    const picked = selectItems({
      candidates: dueCandidates(),
      newFactIds: newFacts(),
      count: 8,
      now: NOW,
      rng: seededRng(5),
      topicFilter: inTopic,
    })
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.every(inTopic)).toBe(true)
  })

  it('excludes a leech that is still resting', () => {
    const candidates = dueCandidates().map((c, i) =>
      // Suspended AND not yet due: mid-cooldown, so it stays out.
      i % 2 === 0 ? { ...c, suspended: true, dueAt: NOW + 5 * 86_400_000 } : c,
    )
    const picked = selectItems({
      candidates,
      newFactIds: [],
      count: 40,
      now: NOW,
      rng: seededRng(9),
    })
    const restingIds = new Set(candidates.filter((c) => c.suspended).map((c) => c.factId))
    expect(picked.some((id) => restingIds.has(id))).toBe(false)
  })

  it('offers a leech again once its cooldown has passed', () => {
    // This assertion is the fix. The old test asserted that suspended candidates were
    // never picked, full stop — which, with `suspended` derived from a lapse count that
    // only rises, meant the engine was correctly implementing a life sentence. A fact the
    // user could not be shown was a fact they could never get right, and the app went on
    // reporting they had not learned it.
    const candidates = dueCandidates().map((c, i) =>
      i === 0 ? { ...c, suspended: true, lapses: 9, dueAt: NOW - 86_400_000 } : c,
    )
    const picked = selectItems({
      candidates,
      newFactIds: [],
      count: 40,
      now: NOW,
      rng: seededRng(9),
    })
    expect(picked).toContain(candidates[0]!.factId)
  })

  it('never lets a backlog of rested leeches crowd out the session', () => {
    // They rejoin through `struggling`, which the mix caps at 10 % — the reason dropping
    // them entirely once looked like the reasonable option.
    const resting = Array.from({ length: 30 }, (_, i) => ({
      ...dueCandidates()[0]!,
      factId: `geo.L${i}.capital`,
      suspended: true,
      lapses: 9,
      dueAt: NOW - 86_400_000,
    }))
    const picked = selectItems({
      candidates: [...dueCandidates(), ...resting],
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
      rng: seededRng(11),
    })
    const restingIds = new Set(resting.map((c) => c.factId))
    expect(picked.filter((id) => restingIds.has(id)).length).toBeLessThanOrEqual(3)
  })

  it('prefers the most overdue reviews', () => {
    const candidates = [
      dueFact('geo.A1.capital', 1),
      dueFact('geo.B1.capital', 200),
      dueFact('geo.C1.capital', 50),
    ]
    const picked = selectItems({
      candidates,
      newFactIds: [],
      count: 1,
      now: NOW,
      rng: seededRng(11),
    })
    expect(picked[0]).toBe('geo.B1.capital')
  })

  it('ignores facts that are not yet due', () => {
    const notDue = dueCandidates().map((c) => ({ ...c, dueAt: NOW + 30 * MS_PER_DAY }))
    const picked = selectItems({
      candidates: notDue,
      newFactIds: newFacts(5),
      count: 10,
      now: NOW,
      rng: seededRng(13),
    })
    // Falls back to new content rather than drilling things that aren't due.
    expect(picked.filter((id) => id.startsWith('geo.N')).length).toBeGreaterThanOrEqual(5)
  })

  it('rebalances towards reviews when the backlog is large', () => {
    const backlog: MemoryState[] = []
    for (let e = 0; e < 30; e++) {
      for (const attr of ['capital', 'flag']) {
        backlog.push(dueFact(`geo.B${e}.${attr}`, e + 1))
      }
    }
    const picked = selectItems({
      candidates: backlog,
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
      rng: seededRng(17),
    })
    const reviews = picked.filter((id) => id.startsWith('geo.B'))
    expect(reviews.length).toBeGreaterThanOrEqual(7)
  })

  it('degrades gracefully when supply is short rather than throwing', () => {
    const picked = selectItems({
      candidates: [dueFact('geo.A1.capital')],
      newFactIds: ['geo.N0.capital'],
      count: 10,
      now: NOW,
      rng: seededRng(19),
    })
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.length).toBeLessThanOrEqual(2)
  })

  it('is deterministic for a given seed and varies across seeds', () => {
    // Friend challenges depend on this: both players must get the same questions.
    const args = {
      candidates: dueCandidates(),
      newFactIds: newFacts(),
      count: 10,
      now: NOW,
    }
    const a = selectItems({ ...args, rng: seededRng(42) })
    const b = selectItems({ ...args, rng: seededRng(42) })
    const c = selectItems({ ...args, rng: seededRng(43) })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('lessonLength', () => {
  it('targets roughly two minutes of items', () => {
    expect(lessonLength(8_000)).toBe(15)
    expect(lessonLength(12_000)).toBe(10)
  })

  it('clamps to the documented bounds', () => {
    expect(lessonLength(60_000)).toBe(MIN_LESSON_ITEMS)
    expect(lessonLength(1_000)).toBe(MAX_LESSON_ITEMS)
  })
})

describe('lessonsPerDay', () => {
  it('scales with the daily goal, so the setting actually does something', () => {
    // The earlier design derived lesson LENGTH from the goal, which collapsed
    // against the 20-item cap and made 5, 10 and 20 minutes identical.
    const five = lessonsPerDay(5, 8_000)
    const ten = lessonsPerDay(10, 8_000)
    const twenty = lessonsPerDay(20, 8_000)
    expect(five).toBeLessThan(ten)
    expect(ten).toBeLessThan(twenty)
  })

  it('always returns at least one lesson', () => {
    expect(lessonsPerDay(1, 60_000)).toBeGreaterThanOrEqual(1)
    expect(lessonsPerDay(0, 8_000)).toBeGreaterThanOrEqual(1)
  })
})
