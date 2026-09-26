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
    // The closing check shares its focus with nothing before it here, but two steps can
    // share one (a check and the review after the course).
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
    const merged = withServerProgress(course, {}, [
      { focus: { attributes: ['flag'], entities: ['SE', 'NO'] }, finished: 2 },
      { focus: { entities: ['NO', 'SE'], attributes: ['capital'] }, finished: 1 },
    ])
    expect(merged).toMatchObject({ n1: 2, n2: 1 })
  })

  it('keeps the higher count, so neither side can make the path go backwards', () => {
    const merged = withServerProgress(course, { n1: 2, n2: 1 }, [
      { focus: { entities: ['SE', 'NO'], attributes: ['capital'] }, finished: 0 + 2 },
    ])
    expect(merged.n1).toBe(2)
    expect(merged.n2).toBe(2)
  })

  it('shares one focus between steps in the order they unlock', () => {
    const merged = withServerProgress(course, {}, [
      { focus: { entities: ['SE', 'NO'], attributes: ['flag'] }, finished: 3 },
    ])
    expect(merged.n1).toBe(2)
    expect(merged.n3).toBe(1)
  })

  it('ignores what is not a course step, and changes nothing when the server said nothing', () => {
    const local = { n1: 1 }
    expect(withServerProgress(course, local, [])).toBe(local)
    expect(withServerProgress(course, local, [{ focus: { factIds: ['geo.SE.flag'] }, finished: 5 }])).toEqual(local)
  })
})
