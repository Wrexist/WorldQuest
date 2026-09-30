import { describe, expect, it } from 'vitest'
import { FACE, MOODS, boopAt, idleAt, performanceAt, type Pose } from './mascotPerformance.js'

/** Neutral at both ends, and no step between frames big enough to read as a snap. */
function expectSmooth(at: (t: number) => Pose) {
  for (const time of [0, 1]) {
    for (const value of Object.values(at(time))) expect(Math.abs(value)).toBeLessThan(.00001)
  }
  let previous = at(0)
  for (let i = 1; i <= 1000; i++) {
    const current = at(i / 1000)
    for (const key of Object.keys(current) as (keyof Pose)[]) expect(Math.abs(current[key] - previous[key])).toBeLessThan(.3)
    previous = current
  }
}

describe('Mascot motion continuity', () => {
  it.each(MOODS)('%s enters and leaves at a neutral pose without snapping', mood => expectSmooth(t => performanceAt(mood, t)))
  it.each(MOODS)('%s idles in a loop that joins itself without a pop', mood => expectSmooth(t => idleAt(mood, t)))
  it('laughs when booped, and settles back', () => expectSmooth(boopAt))

  it('keeps feet grounded outside celebrations and uses one takeoff', () => {
    for (const mood of MOODS.filter(value => value !== 'celebrate')) {
      for (let i = 0; i <= 100; i++) {
        expect(performanceAt(mood, i / 100).jump).toBe(0)
        expect(idleAt(mood, i / 100).jump).toBe(0)
      }
    }
    expect(performanceAt('celebrate', .1).jump).toBeCloseTo(0)
    expect(performanceAt('celebrate', .45).jump).toBeLessThan(-9)
    expect(performanceAt('celebrate', .8).jump).toBeCloseTo(0)
  })
})

describe('Mascot faces', () => {
  it.each(MOODS)('%s has a face that reads with motion off', mood => {
    const face = FACE[mood]
    for (const lid of face.lids) { expect(lid).toBeGreaterThanOrEqual(0); expect(lid).toBeLessThan(1) }
    expect(face.pupil).toBeGreaterThan(.5)
  })

  it('never shuts an eye for good: a lid closes only in motion, and opens again', () => {
    for (const mood of MOODS) {
      for (let i = 0; i <= 100; i++) {
        const lids = [performanceAt(mood, i / 100), idleAt(mood, i / 100)]
        for (const pose of lids) expect(FACE[mood].lids[1] + pose.lidR).toBeLessThanOrEqual(1.0001)
      }
    }
  })

  it('winks: the right lid closes fully at the top of the wink', () => {
    expect(performanceAt('wink', .425).lidR).toBeGreaterThan(.95)
  })
})
