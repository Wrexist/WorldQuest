import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { courseStanding } from '@worldquest/engines'
import { clearAll, readJson, setStorageAccount, startGuestStorage, writeJson } from '../../lib/storage.js'
import { loadCourse } from './course.js'
import { courseProgress, recordCourseLesson, resetCourseProgressCache, useCourseProgress } from './progress.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course
const FLAGS = 'node.first-week.flags'
const LOCATIONS = 'node.first-week.locations'

const nextStep = () => {
  const next = courseStanding(COURSE, courseProgress(COURSE.id)).next
  return next.kind === 'node' ? next.node.id : 'review'
}

beforeEach(async () => {
  await clearAll()
  resetCourseProgressCache()
})

describe('course progress', () => {
  it('counts a finished lesson against the step it was started from', () => {
    expect(recordCourseLesson(COURSE, FLAGS)).toBe(true)
    expect(courseProgress(COURSE.id)).toEqual({ [FLAGS]: 1 })
    expect(nextStep()).toBe(FLAGS)
    recordCourseLesson(COURSE, FLAGS)
    // Two finished lessons complete the flag step, and the path moves on.
    expect(nextStep()).toBe(LOCATIONS)
  })

  it('gives nothing to a step that is not open yet', () => {
    expect(recordCourseLesson(COURSE, LOCATIONS)).toBe(false)
    expect(courseProgress(COURSE.id)).toEqual({})
  })

  it('gives nothing to a step this course does not have', () => {
    expect(recordCourseLesson(COURSE, 'node.first-week.retired')).toBe(false)
  })

  it('keeps each account on its own path', () => {
    setStorageAccount('alex')
    resetCourseProgressCache()
    recordCourseLesson(COURSE, FLAGS)
    recordCourseLesson(COURSE, FLAGS)
    expect(nextStep()).toBe(LOCATIONS)

    // Somebody else on the same phone starts at the beginning — and never sees Alex's.
    setStorageAccount('priya')
    expect(courseProgress(COURSE.id)).toEqual({})
    expect(nextStep()).toBe(FLAGS)

    setStorageAccount('alex')
    expect(nextStep()).toBe(LOCATIONS)
  })

  it('starts a fresh guest from the first step', () => {
    recordCourseLesson(COURSE, FLAGS)
    startGuestStorage()
    expect(courseProgress(COURSE.id)).toEqual({})
  })

  it('re-renders the path when a lesson is recorded, and when the account changes', () => {
    setStorageAccount('alex')
    const { result } = renderHook(() => useCourseProgress(COURSE.id))
    expect(result.current).toEqual({})
    act(() => {
      recordCourseLesson(COURSE, FLAGS)
    })
    expect(result.current).toEqual({ [FLAGS]: 1 })
    act(() => setStorageAccount('priya'))
    expect(result.current).toEqual({})
  })

  it('drops a corrupt stored value rather than breaking Home', () => {
    writeJson('course.progress.v1', { [COURSE.id]: { [FLAGS]: 'two' } })
    resetCourseProgressCache()
    expect(courseProgress(COURSE.id)).toEqual({})
    // Deleted by the shape check, so the next launch does not read it again.
    expect(readJson('course.progress.v1')).toBeNull()
  })
})
