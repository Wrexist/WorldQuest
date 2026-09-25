import { describe, expect, it } from 'vitest'
import { loadCourse } from './course.js'
import { courseLesson, nodeLessonHref, reviewLessonHref } from './courseLesson.js'
import { parseFocusParams } from '../lesson/focusParams.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course

describe('a lesson from the course path', () => {
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
    expect(courseLesson(COURSE, { review: COURSE.id })).toEqual({
      kind: 'review',
      params: {
        entity: 'SE,NO,US,JP,BR,KE,CA,MX,FR,DE,IN,AU',
        attr: 'flag,location,capital',
      },
      explicit: false,
    })
  })

  it('falls back to an ordinary lesson for a step or course this build does not know', () => {
    expect(courseLesson(COURSE, { node: 'node.first-week.retired' })).toBeUndefined()
    expect(courseLesson(COURSE, { review: 'courses.other' })).toBeUndefined()
    expect(courseLesson(COURSE, {})).toBeUndefined()
    expect(courseLesson(null, { node: 'node.first-week.flags' })).toBeUndefined()
  })
})
