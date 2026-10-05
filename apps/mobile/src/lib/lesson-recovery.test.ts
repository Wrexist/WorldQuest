import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Question } from '@worldquest/engines'
import { captureStorage, clearAll, setStorageAccount } from './storage.js'
import { clearLessonRecovery, hasLessonRecovery, openLessonRecovery } from './lesson-recovery.js'
import { useLesson } from '../features/lesson/hooks/useLesson.js'

const questions: Question[] = Array.from({ length: 5 }, (_, i) => ({
  item: { id: `item${i}`, factId: `fact${i}`, entityId: `entity${i}`, templateId: 'template', difficulty: 1, screenReaderSafe: true },
  promptKey: 'prompt', promptParams: {}, modality: 'text', isNew: true, timeLimitMs: null,
  options: [{ id: 'yes', label: 'Yes', isCorrect: true }, { id: 'no', label: 'No', isCorrect: false }],
}))
const input = { lessonId: 'ticket', questions, heartsEnabled: true, timeLimitMs: null, now: 1000 }
beforeEach(clearAll)

describe('unfinished issued lessons', () => {
  it('recovers through the real React hook after unmounting without completing the lesson', () => {
    const onComplete = vi.fn()
    const options = { recover: true, questions, memory: new Map(), onComplete }
    const first = renderHook(() => useLesson(options))
    act(() => first.result.current.start('ticket'))
    // Repeated start effects must not mistake this mount for a cold recovery.
    act(() => first.result.current.start('ticket'))
    expect(first.result.current.state.phase).toBe('presenting')
    act(() => first.result.current.answer('no'))
    const answers = first.result.current.state.answers
    first.unmount()
    const next = renderHook(() => useLesson(options))
    act(() => next.result.current.start('ticket'))
    expect(next.result.current.state.phase).toBe('answered')
    expect(next.result.current.state.answers).toEqual(answers)
    expect(onComplete).not.toHaveBeenCalled()
    act(() => next.result.current.advance())
    expect(next.result.current.state.phase).toBe('presenting')
    next.unmount()
  })

  it('restores feedback, hearts and the exact answer without accepting another answer', () => {
    const first = openLessonRecovery(input)
    const answered = first.apply({ type: 'ANSWER', optionId: 'no', now: 2500 })
    const reopened = openLessonRecovery({ ...input, now: 50000 })
    expect(reopened.recovered).toBe(true)
    expect(reopened.state).toEqual(answered)
    expect(reopened.apply({ type: 'ANSWER', optionId: 'yes', now: 50001 }).answers).toEqual(answered.answers)
  })

  it('pauses a restored question and excludes closed-app time from its next answer', () => {
    const first = openLessonRecovery(input)
    first.apply({ type: 'ANSWER', optionId: 'yes', now: 2000 })
    const next = first.apply({ type: 'CONTINUE', now: 2500 })
    const reopened = openLessonRecovery({ ...input, now: 80000 })
    expect(reopened.state.phase).toBe('paused')
    expect(reopened.state.questions).toEqual(next.questions)
    expect(reopened.state.answers).toEqual(next.answers)
    reopened.apply({ type: 'RESUME', now: 81000 })
    const answered = reopened.apply({ type: 'ANSWER', optionId: 'yes', now: 82000 })
    expect(answered.answers.at(-1)?.elapsedMs).toBe(1000)
  })

  it('does not reuse old input against a different question order or mode', () => {
    openLessonRecovery(input).apply({ type: 'ANSWER', optionId: 'yes', now: 2000 })
    expect(openLessonRecovery({ ...input, questions: [...questions].reverse() }).recovered).toBe(false)
    expect(openLessonRecovery({ ...input, timeLimitMs: 5000 }).state.answers).toHaveLength(0)
  })

  it('preserves the mistake-review round without counting its answer twice', () => {
    const first = openLessonRecovery(input)
    let current = first.state
    for (let i = 0; i < 5; i++) {
      current = first.apply({ type: 'ANSWER', optionId: i === 0 ? 'no' : 'yes', now: 2000 + i * 2000 })
      current = first.apply({ type: 'CONTINUE', now: 3000 + i * 2000 })
    }
    expect(current.reviewFrom).toBe(5)
    const reopened = openLessonRecovery({ ...input, now: 80000 })
    expect(reopened.state.reviewFrom).toBe(5)
    expect(reopened.state.questions).toEqual(current.questions)
    reopened.apply({ type: 'RESUME', now: 81000 })
    const reviewed = reopened.apply({ type: 'ANSWER', optionId: 'yes', now: 82000 })
    expect(reviewed.answers).toHaveLength(5)
    expect(reviewed.reviewed).toHaveLength(1)
  })

  it('rejects malformed cached events rather than trusting saved grades', () => {
    openLessonRecovery(input)
    const store = captureStorage(), key = 'lesson.recovery.v1.ticket'
    const cached = JSON.parse(store.get(key)!)
    store.set(key, JSON.stringify({ ...cached, events: [{ type: 'ANSWER', optionId: null, now: 2 }] }))
    expect(openLessonRecovery(input).recovered).toBe(false)
    store.set(key, '{broken')
    expect(openLessonRecovery(input).state.phase).toBe('presenting')
  })

  it('isolates accounts and rejects a delayed action from the old account', () => {
    setStorageAccount('A')
    const first = openLessonRecovery(input)
    first.apply({ type: 'ANSWER', optionId: 'yes', now: 2000 })
    setStorageAccount('B')
    expect(hasLessonRecovery('ticket')).toBe(false)
    expect(() => first.apply({ type: 'CONTINUE', now: 2500 })).toThrow()
    setStorageAccount('A')
    expect(openLessonRecovery(input).state.answers).toHaveLength(1)
  })

  it('retains a finished journal until durable queue handoff', () => {
    const first = openLessonRecovery(input)
    for (let i = 0; i < 5; i++) {
      first.apply({ type: 'ANSWER', optionId: 'yes', now: 2000 + i * 2000 })
      first.apply({ type: 'CONTINUE', now: 3000 + i * 2000 })
    }
    expect(openLessonRecovery(input).state.phase).toBe('summary')
    expect(hasLessonRecovery('ticket')).toBe(true)
    clearLessonRecovery('ticket')
    expect(hasLessonRecovery('ticket')).toBe(false)
  })
})
