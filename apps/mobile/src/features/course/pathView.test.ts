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
    // The first week's seven, then one unit per continent (course v1.1.0).
    expect(view.total).toBe(33)
    expect(view.units.map((u) => u.number)).toEqual([1, 2, 3, 4, 5, 6])
    expect(view.units.flatMap((u) => u.nodes.map((n) => n.position))).toEqual(
      Array.from({ length: 33 }, (_, i) => i + 1),
    )
    expect(view.units.flatMap((u) => u.nodes.map((n) => n.state))).toEqual([
      'current', ...Array.from({ length: 32 }, () => 'locked'),
    ])
  })

  it('carries the pack\'s own counts, so copy never states a number the data does not', () => {
    const view = toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, {}) })
    if (view.status !== 'ready') throw new Error('expected a path')
    const counts = view.units.flatMap((u) => u.nodes.map((n) => n.count))
    expect(counts.slice(0, 7)).toEqual([6, 6, 6, 6, 12, 12, 12])
    expect(counts).toEqual(COURSE.units.flatMap((u) => u.nodes.map((n) => n.focus.entities.length)))
  })

  it('passes an unreadable course through as the error state', () => {
    expect(toPathView({ status: 'error' })).toEqual({ status: 'error' })
  })
})

describe('toPathView and fading steps', () => {
  const firstTwoDone = Object.fromEntries(COURSE.units[0]!.nodes.slice(0, 2).map((n) => [n.id, n.lessons]))
  const stepsOf = (fading: ReadonlySet<string>) => {
    const view = toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, firstTwoDone) }, fading)
    if (view.status !== 'ready') throw new Error('expected a path')
    return view.units.flatMap((u) => u.nodes)
  }
  const [first, second] = COURSE.units[0]!.nodes

  it('marks a finished step that is in the set', () => {
    const marked = stepsOf(new Set([first!.id])).find((n) => n.id === first!.id)!
    expect(marked.state).toBe('done')
    expect(marked.fading).toBe(true)
  })

  it('leaves every other finished step unmarked, and marks nothing by default', () => {
    expect(stepsOf(new Set([first!.id])).find((n) => n.id === second!.id)!.fading).toBeUndefined()
    expect(stepsOf(new Set()).some((n) => n.fading !== undefined)).toBe(false)
  })

  it('never marks a step that is not finished, whatever it is told', () => {
    const everything = new Set(COURSE.units.flatMap((u) => u.nodes.map((n) => n.id)))
    for (const node of stepsOf(everything)) expect(node.fading === true).toBe(node.state === 'done')
  })
})
