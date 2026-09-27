import { describe, expect, it } from 'vitest'
import { performanceAt, type MascotMood } from './mascotPerformance.js'
const moods: MascotMood[] = ['welcome', 'celebrate', 'thinking', 'resting', 'encouraging']
describe('Mascot motion continuity', () => {
  it.each(moods)('%s enters and leaves at a neutral pose without snapping', mood => {
    for (const time of [0, 1]) {
      for (const value of Object.values(performanceAt(mood, time))) expect(Math.abs(value)).toBeLessThan(.00001)
    }
    // Small finite differences catch jumps at the join between preparation, action and settle.
    let previous = performanceAt(mood, 0)
    for (let i = 1; i <= 1000; i++) {
      const current = performanceAt(mood, i / 1000)
      for (const key of Object.keys(current) as (keyof typeof current)[]) expect(Math.abs(current[key] - previous[key])).toBeLessThan(.3)
      previous = current
    }
  })
  it('keeps feet grounded outside celebrations and uses one takeoff', () => {
    for (const mood of moods.filter(value => value !== 'celebrate')) {
      for (let i = 0; i <= 100; i++) expect(performanceAt(mood, i / 100).jump).toBe(0)
    }
    expect(performanceAt('celebrate', .1).jump).toBeCloseTo(0)
    expect(performanceAt('celebrate', .45).jump).toBeLessThan(-9)
    expect(performanceAt('celebrate', .8).jump).toBeCloseTo(0)
  })
})

