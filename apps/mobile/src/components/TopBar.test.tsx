import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { setLocale } from '../lib/i18n.js'
import { remove, writeJson } from '../lib/storage.js'
import { localDay } from '../lib/day.js'
import { TopBar } from './TopBar.js'

const dimensions = vi.hoisted(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 }))
vi.mock('react-native', async importOriginal => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => dimensions,
}))

beforeEach(async () => {
  dimensions.width = 390
  dimensions.fontScale = 1
  remove('activity.byDay.v1')
  await setLocale('en')
})
afterEach(async () => { await setLocale('en'); remove('activity.byDay.v1') })

describe('header counters', () => {
  it.each([
    [0, '0'], [999, '999'], [1_000, '1K'], [12_850, '12.9K'],
    [999_950, '1M'], [1_000_000_000, '1B'], [Number.MAX_SAFE_INTEGER, '9007.2T'],
  ])('keeps %i compact while announcing the exact coin balance', (coins, visible) => {
    const view = render(<TopBar coins={coins} />)
    const counter = view.getByTestId('header-coins')
    expect(counter.textContent).toBe(visible)
    expect(counter.getAttribute('aria-label')).toBe(`${new Intl.NumberFormat('en').format(coins)} coins`)
    // A balance remains a fact, not a dead button introduced by the new material.
    expect(counter.getAttribute('role')).not.toBe('button')
  })

  it('updates mounted counters on a language change, with Swedish separators and units', async () => {
    const view = render(<TopBar coins={12_850} streak={1_234} onStreak={vi.fn()} />)
    expect(view.getByTestId('header-coins').textContent).toBe('12.9K')
    await act(async () => { await setLocale('sv') })
    expect(view.getByTestId('header-coins').textContent).toBe('12,9\u00a0tn')
    expect(view.getByTestId('header-coins').getAttribute('aria-label')).toBe('12\u00a0850 mynt')
    expect(view.getByTestId('header-streak').textContent).toBe('1,2\u00a0tn')
    expect(view.getByTestId('header-streak').getAttribute('aria-label')).toContain('1\u00a0234 dagar')
  })

  it('preserves pending/completed streak meaning and all navigation actions', () => {
    const onStreak = vi.fn(), onAvatar = vi.fn(), onSettings = vi.fn()
    const props = { streak: 12, coins: 0, onStreak, onAvatar, onSettings }
    const view = render(<TopBar {...props} />)
    fireEvent.click(view.getByRole('button', { name: /Your streak: 12 days\. Today's lesson/ }))
    fireEvent.click(view.getByRole('button', { name: /profile/i }))
    fireEvent.click(view.getByRole('button', { name: 'More' }))
    expect([onStreak.mock.calls.length, onAvatar.mock.calls.length, onSettings.mock.calls.length]).toEqual([1, 1, 1])
    writeJson('activity.byDay.v1', { [localDay(new Date())]: 1 })
    view.rerender(<TopBar {...props} />)
    expect(view.getByRole('button', { name: 'Your streak: 12 days' })).toBeTruthy()
  })

  it('keeps zero neutral and omits unavailable actions and counters', () => {
    const view = render(<TopBar streak={0} coins={0} onStreak={vi.fn()} />)
    expect(view.getByRole('button', { name: 'Your streak: no days yet' })).toBeTruthy()
    view.rerender(<TopBar streak={12} />)
    expect(view.queryByTestId('header-streak')).toBeNull()
    expect(view.queryByTestId('header-coins')).toBeNull()
    expect(view.queryAllByRole('button')).toHaveLength(0)
  })

  it('gives 200% text a full counter row without hiding exact values or settings', () => {
    dimensions.width = 320
    dimensions.fontScale = 2
    const onSettings = vi.fn()
    const view = render(<TopBar streak={12_850} coins={Number.MAX_SAFE_INTEGER} onStreak={vi.fn()} onSettings={onSettings} />)
    expect(view.queryByText('WorldQuest')).toBeNull()
    const group = view.getByTestId('header-coins').parentElement!
    expect(getComputedStyle(group).flexBasis).toBe('100%')
    expect(getComputedStyle(group).flexWrap).toBe('wrap')
    expect(view.getByTestId('header-coins').getAttribute('aria-label')).toBe('9,007,199,254,740,991 coins')
    fireEvent.click(view.getByRole('button', { name: 'More' }))
    expect(onSettings).toHaveBeenCalledOnce()
  })
})
