import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { emptyProgress, evaluate, type AchievementProgress } from '@worldquest/engines'
import { i18n } from '@worldquest/i18n'
import { AchievementsScreen, type AchievementRow } from './AchievementsScreen.js'
import { CATALOGUE } from './useAchievements.js'

const rowsFor = (progress: Record<string, AchievementProgress> = {}): AchievementRow[] =>
  CATALOGUE.map((def) => ({ def, progress: progress[def.id] ?? emptyProgress(def.id) }))

describe('the catalogue', () => {
  it('has copy for every definition, in every shipped locale', () => {
    // Keys are derived from the id by convention, so a definition cannot reference a
    // typo'd key — but it CAN reference a key nobody wrote. That renders the key
    // itself on screen, and this is the only thing that would catch it.
    const missing: string[] = []
    for (const def of CATALOGUE) {
      const suffix = def.id.slice('ach.'.length)
      for (const locale of ['en', 'sv']) {
        for (const part of ['name', 'desc']) {
          const key = `achievements:${suffix}.${part}`
          if (!i18n.exists(key, { lng: locale })) missing.push(`${locale} → ${key}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('gives every definition ascending tier thresholds', () => {
    // The engine sorts before evaluating, so a mis-ordered file cannot award the
    // wrong tier — but it is still a content mistake, and it is invisible in review.
    for (const def of CATALOGUE) {
      const thresholds = def.tiers.map((tier) => tier.threshold)
      expect([...thresholds].sort((a, b) => a - b), def.id).toEqual(thresholds)
    }
  })

  it('marks every unreplayable rule as such', () => {
    // Nothing in review_log records that a lesson was finished in under a minute two
    // years ago. A `session` rule without `backfill: false` would have a migration
    // invent unlocks that never happened.
    for (const def of CATALOGUE) {
      if (def.rule.type === 'session') {
        expect(def.backfill, `${def.id} is a session rule`).toBe(false)
      }
    }
  })

  it('is actually reachable by the engine it was written for', () => {
    // A definition the engine never advances is a locked row forever. This drives a
    // matching event through each one rather than trusting that the shapes line up.
    const events: Record<string, { name: string; payload?: Record<string, string | number> }> = {
      'ach.flags.collector': { name: 'fact_mastered', payload: { attribute: 'flag', entityId: 'SE' } },
      'ach.capitals.collector': { name: 'fact_mastered', payload: { attribute: 'capital', entityId: 'SE' } },
      'ach.countries.complete': { name: 'entity_mastered', payload: { entityId: 'SE' } },
      'ach.streak.keeper': { name: 'streak_extended', payload: { length: 7 } },
      'ach.level.climber': { name: 'level_changed', payload: { level: 5 } },
      'ach.lessons.done': { name: 'lesson_completed' },
      'ach.session.perfect': { name: 'lesson_completed', payload: { accuracy: 1 } },
      'ach.session.speedrun': { name: 'lesson_completed', payload: { accuracy: 1, durationMs: 30_000 } },
      'ach.set.nordics': { name: 'entity_mastered', payload: { entityId: 'SE' } },
      'ach.review.faithful': { name: 'overdue_review_cleared' },
      'ach.quest.regular': { name: 'daily_quest_completed' },
      'ach.explorer.continents': { name: 'region_started', payload: { region: 'EU' } },
    }

    for (const def of CATALOGUE) {
      const event = events[def.id]
      expect(event, `${def.id} has no event in this test — is it reachable at all?`).toBeDefined()
      const result = evaluate(def, emptyProgress(def.id), {
        name: event!.name,
        at: 0,
        ...(event!.payload ? { payload: event!.payload } : {}),
      })
      expect(result.progress.value, `${def.id} did not advance`).toBeGreaterThan(0)
    }
  })
})

describe('Achievements screen', () => {
  it('shows a locked achievement in full rather than hiding it', () => {
    // A grid of grey question marks is a list of things you cannot aim at. The whole
    // reason to show achievements is that they suggest what to do next.
    render(<AchievementsScreen rows={rowsFor()} />)
    expect(screen.getByText('Flag Collector')).toBeTruthy()
    expect(screen.getByText(/Master the flag of 5 countries/)).toBeTruthy()
  })

  it('counts what is unlocked', () => {
    // `textContent`: the count styles its digits apart from its words, so the line is
    // several nodes.
    const { container } = render(<AchievementsScreen rows={rowsFor()} />)
    expect(container.textContent).toContain(`0 of ${CATALOGUE.length} unlocked`)
  })

  it('puts earned achievements first', () => {
    const earned: AchievementProgress = {
      achievementId: 'ach.quest.regular',
      value: 5,
      tier: 'bronze',
    }
    const { container } = render(rowsRender(earned))
    const names = Array.from(container.querySelectorAll('[aria-label]'), (el) =>
      el.getAttribute('aria-label'),
    ).filter((label) => label?.includes(','))
    expect(names[0]).toContain('Quest Regular')
  })

  it('measures progress towards the next tier, not from zero', () => {
    // A bar that restarts after every tier makes a long climb look like no progress.
    //
    // Derived from the catalogue rather than written down. The thresholds used to be
    // hardcoded here, and when the pack's unreachable tiers were corrected — flags asked
    // for 195 of the 65 that exist — this test failed for a reason that had nothing to do
    // with the behaviour it names. A test that breaks when content changes is testing the
    // content.
    const flags = CATALOGUE.find((d) => d.id === 'ach.flags.collector')!
    const bronze = flags.tiers[0]!.threshold
    const silver = flags.tiers[1]!.threshold
    const value = bronze + Math.floor((silver - bronze) / 2)

    const half: AchievementProgress = {
      achievementId: 'ach.flags.collector',
      value,
      tier: 'bronze',
    }
    const { container } = render(rowsRender(half))
    // Scoped to the card: the same "N to go" is legitimately true of another achievement
    // too, and a global text query would pass on the wrong one. Found by ID rather than
    // by the name a user reads — achievement ids are permanent by rule and ship in save
    // data, while the name is copy a translator may rewrite tomorrow.
    const card = container.querySelector('[data-testid="achievement-ach.flags.collector"]')
    expect(card?.textContent).toContain(`${silver - value} to go`)
    expect(card?.textContent).toContain('Bronze')
  })

  it('explains itself when the catalogue is empty', () => {
    render(<AchievementsScreen rows={[]} />)
    expect(screen.getByText('Nothing unlocked yet')).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<AchievementsScreen rows={rowsFor()} />)
    expect(container.textContent).not.toMatch(/\bachievements:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})

const rowsRender = (progress: AchievementProgress) => (
  <AchievementsScreen rows={rowsFor({ [progress.achievementId]: progress })} />
)

describe('Achievements — the empty state (H13)', () => {
  it('names the next step that actually fixes it', () => {
    render(<AchievementsScreen rows={[]} onStartLesson={vi.fn()} />)
    expect(screen.getByText(/Nothing unlocked yet/i)).toBeTruthy()
    expect(screen.getByText(/within reach/i)).toBeTruthy()
  })

  it('offers a way to take that step', () => {
    // Copy that says "one lesson away" with no way to start one is a signpost
    // pointing at a wall.
    const onStartLesson = vi.fn()
    render(<AchievementsScreen rows={[]} onStartLesson={onStartLesson} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a lesson' }))
    expect(onStartLesson).toHaveBeenCalledOnce()
  })

  it('draws no button when there is nothing behind it', () => {
    render(<AchievementsScreen rows={[]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not frame an empty list as a failure', () => {
    const { container } = render(<AchievementsScreen rows={[]} onStartLesson={vi.fn()} />)
    // `\blocked\b` rather than `locked` — the first draft of this matched "unlocked"
    // inside "Nothing unlocked yet" and failed perfectly good copy.
    expect(container.textContent).not.toMatch(/you haven'?t|none earned|0 of|failed|\blocked\b/i)
  })
})

describe('Achievements — what leads the list', () => {
  const def = (id: string, threshold: number) => ({
    id,
    rule: { kind: 'count' as const, event: 'lesson_completed' as const },
    tiers: [{ tier: 'bronze' as const, threshold, xp: 10, coins: 5 }],
  })

  const row = (id: string, threshold: number, value = 0) => ({
    def: def(id, threshold) as never,
    progress: { achievementId: id, value, seen: [], tier: null } as never,
  })

  it('leads with the nearest target when every row is at zero', () => {
    // The case every new user sees, and the one the comparator could not decide: at
    // 0% the fraction tiebreak is a no-op, so the list came out in pack order — a
    // file's ordering deciding what a user is shown, which is exactly the defect that
    // made lessons all-capitals for the first 65 countries.
    const { container } = render(
      <AchievementsScreen
        rows={[row('ach.far', 50), row('ach.near', 3), row('ach.mid', 10)]}
      />,
    )
    const order = ['ach.near', 'ach.mid', 'ach.far'].map(
      (id) => container.textContent!.indexOf(`${id.slice(4)}.name`),
    )
    expect(order[0]).toBeLessThan(order[1]!)
    expect(order[1]).toBeLessThan(order[2]!)
  })

  it('still ranks by proportion when there is real progress to compare', () => {
    // The absolute tiebreak must not override the fraction: 45 of 50 is nearer than
    // 1 of 3, even though 2 remaining is a smaller number than 5.
    const { container } = render(
      <AchievementsScreen rows={[row('ach.early', 3, 1), row('ach.nearlythere', 50, 45)]} />,
    )
    expect(container.textContent!.indexOf('nearlythere.name')).toBeLessThan(
      container.textContent!.indexOf('early.name'),
    )
  })
})
