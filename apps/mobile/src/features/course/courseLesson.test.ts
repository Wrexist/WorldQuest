import { describe, expect, it } from 'vitest'
import { loadCourse } from './course.js'
import { courseLesson, nodeLessonHref, reviewLessonHref } from './courseLesson.js'
import { parseFocusParams } from '../lesson/focusParams.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course

describe('a lesson from the course path', () => {
  it('makes the introductory lesson the first course step, without overriding an explicit step', () => {
    expect(courseLesson(COURSE, { taster: '1' })).toEqual(courseLesson(COURSE, { node: COURSE.units[0]!.nodes[0]!.id }))
    expect(courseLesson(COURSE, { taster: '1', node: 'node.first-week.locations' })?.kind).toBe('node')
    expect(courseLesson(COURSE, { taster: '1', node: 'node.first-week.locations' })).toEqual(courseLesson(COURSE, { node: 'node.first-week.locations' }))
    expect(courseLesson(null, { taster: '1' })).toBeUndefined()
  })
  it('names the step in its link, not the step\'s content', () => {
    expect(nodeLessonHref('node.first-week.flags')).toBe('/lesson?node=node.first-week.flags')
    expect(reviewLessonHref('courses.first-week')).toBe('/lesson?review=courses.first-week')
  })

  it('resolves a step to its own focus, as the params every focused lesson reads', () => {
    const lesson = courseLesson(COURSE, { node: 'node.first-week.flags' })
    expect(lesson).toEqual({
      kind: 'node',
      nodeId: 'node.first-week.flags',
      params: { entity: 'SE,NO,US,JP,BR,KE', attr: 'flag' },
      explicit: true,
    })
    // Through the same parser the country page's links go through.
    expect(parseFocusParams(lesson!.params)).toMatchObject({
      entities: ['SE', 'NO', 'US', 'JP', 'BR', 'KE'],
      attributes: ['flag'],
    })
  })

  it('treats a step as the learner\'s choice and review as the app\'s suggestion', () => {
    // A step may not be swapped for a different saved lesson offline; review may.
    expect(courseLesson(COURSE, { node: 'node.first-week.check' })?.explicit).toBe(true)
    // Review is everything the course taught: what its closing check asks.
    const closing = COURSE.units.at(-1)!.nodes.at(-1)!
    expect(closing.kind).toBe('check')
    expect(courseLesson(COURSE, { review: COURSE.id })).toEqual({
      kind: 'review',
      params: {
        entity: closing.focus.entities.join(','),
        attr: 'flag,location,capital',
      },
      explicit: false,
    })
    expect(closing.focus.entities.slice(0, 12).join(',')).toBe('SE,NO,US,JP,BR,KE,CA,MX,FR,DE,IN,AU')
  })

  it('falls back to an ordinary lesson for a step or course this build does not know', () => {
    expect(courseLesson(COURSE, { node: 'node.first-week.retired' })).toBeUndefined()
    expect(courseLesson(COURSE, { review: 'courses.other' })).toBeUndefined()
    expect(courseLesson(COURSE, {})).toBeUndefined()
    expect(courseLesson(null, { node: 'node.first-week.flags' })).toBeUndefined()
  })
})
