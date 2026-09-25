/**
 * Unlocks in a URL are a string anybody can type, so every one is re-read against the
 * catalogue that ships in the binary before a card is drawn for it.
 */

import { describe, expect, it } from 'vitest'
import {
  formatUnlocks,
  MAX_CARRIED_UNLOCKS,
  parseUnlocks,
  thresholdOf,
  unlockCards,
} from './unlockParams.js'
import { CATALOGUE } from './useAchievements.js'

const flags = CATALOGUE.find((def) => def.id === 'ach.flags.collector')!
const speedrun = CATALOGUE.find((def) => def.id === 'ach.session.speedrun')!

describe('unlocks in the after-lesson URL', () => {
  it('round-trips what the queue holds', () => {
    const unlocks = [
      { achievementId: flags.id, tier: 'bronze' as const },
      { achievementId: 'ach.lessons.done', tier: 'silver' as const },
    ]
    expect(parseUnlocks(formatUnlocks(unlocks))).toEqual(unlocks)
  })

  it('never draws an id the shipped catalogue does not have', () => {
    expect(parseUnlocks('ach.not.real:gold')).toEqual([])
    expect(parseUnlocks('')).toEqual([])
    expect(parseUnlocks(undefined)).toEqual([])
  })

  it('never draws a tier the achievement does not define', () => {
    // The speedrun starts at silver. "Bronze Speedrun" would be a medal for nothing.
    expect(speedrun.tiers.some((spec) => spec.tier === 'bronze')).toBe(false)
    expect(parseUnlocks(`${speedrun.id}:bronze`)).toEqual([])
    expect(parseUnlocks(`${flags.id}:diamond`)).toEqual([])
  })

  it('ignores malformed entries and keeps the good ones in order, once each', () => {
    expect(
      parseUnlocks(`${flags.id}:bronze,garbage,${flags.id}:bronze:extra,${flags.id}:silver,${flags.id}:bronze`),
    ).toEqual([
      { achievementId: flags.id, tier: 'bronze' },
      { achievementId: flags.id, tier: 'silver' },
    ])
  })

  it('carries at most what the queue could ever hold', () => {
    const many = CATALOGUE.slice(0, 12)
      .map((def) => `${def.id}:${def.tiers[0]!.tier}`)
      .join(',')
    expect(parseUnlocks(many)).toHaveLength(MAX_CARRIED_UNLOCKS)
  })

  it('gives three cards at most and counts the rest for the last one', () => {
    const five = CATALOGUE.slice(0, 5).map((def) => ({ achievementId: def.id, tier: def.tiers[0]!.tier }))
    expect(unlockCards(five)).toEqual({ cards: five.slice(0, 3), more: 2 })
    expect(unlockCards(five.slice(0, 2))).toEqual({ cards: five.slice(0, 2), more: 0 })
    expect(unlockCards([])).toEqual({ cards: [], more: 0 })
  })

  it('knows the target each tier asked for, for the card to say what was done', () => {
    expect(thresholdOf({ achievementId: flags.id, tier: 'bronze' })).toBe(flags.tiers[0]!.threshold)
    expect(thresholdOf({ achievementId: 'ach.not.real', tier: 'gold' })).toBeUndefined()
  })
})
