import { describe, expect, it } from 'vitest'
import type { Course, CourseNode } from '@worldquest/engines'
import { focusKey, withServerProgress } from './serverProgress.js'

const node = (id: string, entities: string[], attributes: string[], lessons = 2, kind: CourseNode['kind'] = 'lesson'): CourseNode => ({
  id, kind, objectiveKey: `course:${id}`, focus: { entities, attributes }, lessons,
})

const course: Course = {
  id: 'course.test',
  version: '1',
  titleKey: 'course:title',
  units: [
    { id: 'u1', titleKey: 'u1', objectiveKey: 'u1', nodes: [node('n1', ['SE', 'NO'], ['flag']), node('n2', ['SE', 'NO'], ['capital'])] },
    // The check asks what n1 asks, as the first week's check asks what its mix does.
    { id: 'u2', titleKey: 'u2', objectiveKey: 'u2', nodes: [node('n3', ['NO', 'SE'], ['flag'], 1, 'check')] },
  ],
}

describe('a course path from the server\'s records', () => {
  it('reads a step\'s focus the same way whatever order it was sent in', () => {
    expect(focusKey({ entities: ['SE', 'NO'], attributes: ['flag'] }))
      .toBe(focusKey({ attributes: ['flag'], entities: ['NO', 'SE'] }))
  })

  it('never counts another kind of focus as a course step', () => {
    expect(focusKey({ factIds: ['geo.SE.flag'] })).toBeNull()
    expect(focusKey({ entities: ['SE'], attributes: ['flag'], regions: ['EU'] })).toBeNull()
    expect(focusKey({ entities: [], attributes: ['flag'] })).toBeNull()
  })

  it('gives a phone that has played nothing the progress the account made elsewhere', () => {
    const merged = withServerProgress(course, {}, [], [
      { node: 'n1', finished: 2 },
      { node: 'n2', finished: 1 },
    ])
    expect(merged).toMatchObject({ n1: 2, n2: 1 })
  })

  it('counts practice on a finished step for that step, never for the next one asking the same', () => {
    // n1 finished (two lessons) and practised once: three lessons with the check's focus.
    // Shared out in path order that was two for n1 and one for the check, which then
    // showed done without ever being played (PR #21 review).
    const merged = withServerProgress(course, { n1: 2 }, [
      { focus: { entities: ['SE', 'NO'], attributes: ['flag'] }, finished: 3 },
    ], [{ node: 'n1', finished: 3 }])
    expect(merged.n1).toBe(2)
    expect(merged.n3).toBeUndefined()
  })

  it('trusts a per-focus count only for a focus no other step has', () => {
    // Tickets from before steps were named: the capital step's focus is its own, so its
    // count is its lessons; the flag focus is n1's and the check's, so it says nothing.
    const merged = withServerProgress(course, {}, [
      { focus: { entities: ['SE', 'NO'], attributes: ['flag'] }, finished: 3 },
      { focus: { entities: ['NO', 'SE'], attributes: ['capital'] }, finished: 1 },
    ])
    expect(merged).toEqual({ n2: 1 })
  })

  it('keeps the higher count, so neither side can make the path go backwards', () => {
    const merged = withServerProgress(course, { n1: 2, n2: 1 }, [
      { focus: { entities: ['SE', 'NO'], attributes: ['capital'] }, finished: 0 + 2 },
    ])
    expect(merged.n1).toBe(2)
    expect(merged.n2).toBe(2)
  })

  it('credits the check from its own lessons, and caps any step at its own count', () => {
    const merged = withServerProgress(course, {}, [], [
      { node: 'n1', finished: 5 },
      { node: 'n3', finished: 1 },
    ])
    expect(merged).toEqual({ n1: 2, n3: 1 })
  })

  it('ignores what is not a course step, and changes nothing when the server said nothing', () => {
    const local = { n1: 1 }
    expect(withServerProgress(course, local, [])).toBe(local)
    expect(withServerProgress(course, local, [], [])).toBe(local)
    expect(withServerProgress(course, local, [], [{ node: 'node.retired', finished: 4 }])).toEqual(local)
    expect(withServerProgress(course, local, [{ focus: { factIds: ['geo.SE.flag'] }, finished: 5 }])).toEqual(local)
  })
})
