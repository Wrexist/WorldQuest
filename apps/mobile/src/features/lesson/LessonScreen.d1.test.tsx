import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { D1AuthError } from '@worldquest/api/d1-auth'
import { LessonScreen } from './LessonScreen.js'

const { takeLesson } = vi.hoisted(() => ({ takeLesson: vi.fn() }))
vi.mock('../../lib/backendConfig.js', () => ({ isD1: () => true, backendConfig: () => ({ kind: 'd1', url: 'https://api.example.invalid' }) }))
vi.mock('../../lib/d1-lessons.js', () => ({ takeLesson }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))
vi.mock('../home/useOptimisticProgress.js', () => ({ useOptimisticProgress: () => ({ shown: null }) }))

beforeEach(() => { takeLesson.mockReset() })

describe('issued lesson failures', () => {
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
