import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { D1AuthError } from '@worldquest/api/d1-auth'
import { LessonScreen } from './LessonScreen.js'
import { clearAll, setStorageAccount } from '../../lib/storage.js'

const { takeLesson, submitLesson, recordLessonCompleted } = vi.hoisted(() => ({ takeLesson: vi.fn(), submitLesson: vi.fn(), recordLessonCompleted: vi.fn() }))
vi.mock('../../lib/backendConfig.js', () => ({ isD1: () => true, backendConfig: () => ({ kind: 'd1', url: 'https://api.example.invalid' }) }))
vi.mock('../../lib/d1-lessons.js', () => ({
  takeLesson, submitLesson, prefetchLessons: vi.fn(),
  flushLessons: vi.fn(async () => []), refreshMemoryOnce: vi.fn(async () => {}),
}))
vi.mock('../profile/useWeekActivity.js', async (original) => ({ ...(await original<Record<string, unknown>>()), recordLessonCompleted }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))
vi.mock('../home/useOptimisticProgress.js', () => ({ useOptimisticProgress: () => ({ shown: null }) }))

beforeEach(() => { clearAll(); takeLesson.mockReset(); submitLesson.mockReset(); recordLessonCompleted.mockReset() })

describe('issued lesson failures', () => {
  it.each([false, true])('waits for durable submission and respects account changes (%s)', async (switchAccount) => {
    let commit!: () => void
    submitLesson.mockReturnValue(new Promise<void>(resolve => { commit = resolve }))
    takeLesson.mockResolvedValue({ kind: 'ready', lesson: {
      lessonId: 'durable-completion', issuedAt: 1,
      request: { lessonId: 'durable-completion', count: 5, locale: 'en', screenReader: false },
      questions: Array.from({ length: 5 }, (_, i) => ({
        item: { id: `item${i}`, factId: `fact${i}`, entityId: `entity${i}`, templateId: 'template', difficulty: 1, screenReaderSafe: true },
        promptKey: 'prompt', promptParams: {}, modality: 'text', isNew: true, timeLimitMs: null,
        options: [{ id: 'yes', label: 'Yes', isCorrect: true }, { id: 'no', label: 'No', isCorrect: false }],
      })),
    } })
    render(<LessonScreen onExit={vi.fn()} />)
    await screen.findAllByTestId('answer-option')
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getAllByTestId('answer-option')[0]!)
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    }
    await waitFor(() => expect(submitLesson).toHaveBeenCalledOnce())
    expect(recordLessonCompleted).not.toHaveBeenCalled()
    if (switchAccount) setStorageAccount('another-account')
    await act(async () => commit())
    expect(recordLessonCompleted).toHaveBeenCalledTimes(switchAccount ? 0 : 1)
  })

  it('explains a closed service and offers Back without suggesting an immediate retry', async () => {
    takeLesson.mockRejectedValue(new D1AuthError('API_NOT_READY', 503))
    const leave = vi.fn()
    render(<LessonScreen onExit={vi.fn()} onLeave={leave} />)
    expect(await screen.findByRole('heading', { name: 'WorldQuest is temporarily unavailable' })).toBeTruthy()
    expect(screen.getByText("You can't start a lesson right now. Please come back a little later.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(leave).toHaveBeenCalledOnce()
    expect(takeLesson).toHaveBeenCalledOnce()
  })

  it('keeps Retry for a recoverable request failure', async () => {
    takeLesson.mockRejectedValue(new D1AuthError('SERVICE_UNAVAILABLE', 503))
    render(<LessonScreen onExit={vi.fn()} onLeave={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByRole('button', { name: 'Try again' })
    expect(takeLesson).toHaveBeenCalledTimes(2)
  })
})
