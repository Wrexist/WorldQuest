import { describe, expect, it } from 'vitest'
import { courseStanding } from '@worldquest/engines'
import { loadCourse } from './course.js'
import { nodeIcon, toPathView } from './pathView.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course

describe('nodeIcon', () => {
  it('gives a step the mark its subject has everywhere else', () => {
    // The same glyphs the country page puts beside its Flag, Location and Capital rows.
    expect(nodeIcon({ kind: 'lesson', focus: { entities: ['SE'], attributes: ['flag'] } })).toBe('flag')
    expect(nodeIcon({ kind: 'lesson', focus: { entities: ['SE'], attributes: ['location'] } })).toBe('continent')
    expect(nodeIcon({ kind: 'lesson', focus: { entities: ['SE'], attributes: ['capital'] } })).toBe('capital')
  })

  it('draws a globe for a mix, a trophy for a check, and a star for a subject with no mark', () => {
    expect(nodeIcon({ kind: 'lesson', focus: { entities: ['SE'], attributes: ['flag', 'capital'] } })).toBe('globe')
    expect(nodeIcon({ kind: 'check', focus: { entities: ['SE'], attributes: ['flag'] } })).toBe('trophy')
    expect(nodeIcon({ kind: 'lesson', focus: { entities: ['SE'], attributes: ['anthem'] } })).toBe('star')
  })
})

describe('toPathView', () => {
  it('numbers units and steps from one, across the whole course, in path order', () => {
    const view = toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, {}) })
    if (view.status !== 'ready') throw new Error('expected a path')
    expect(view.total).toBe(7)
    expect(view.units.map((u) => u.number)).toEqual([1, 2])
    expect(view.units.flatMap((u) => u.nodes.map((n) => n.position))).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(view.units.flatMap((u) => u.nodes.map((n) => n.state))).toEqual([
      'current', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked',
    ])
  })

  it('carries the pack\'s own counts, so copy never states a number the data does not', () => {
    const view = toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, {}) })
    if (view.status !== 'ready') throw new Error('expected a path')
    expect(view.units.flatMap((u) => u.nodes.map((n) => n.count))).toEqual([6, 6, 6, 6, 12, 12, 12])
  })

  it('passes an unreadable course through as the error state', () => {
    expect(toPathView({ status: 'error' })).toEqual({ status: 'error' })
  })
})
