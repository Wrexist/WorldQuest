import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CHILD_AGE, OnboardingScreen } from './OnboardingScreen.js'
import { clearAll, writeJson } from '../../lib/storage.js'
import { readOnboarding } from './useOnboarding.js'

const YEAR = 2026
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const pickYear = (year: number) => fireEvent.click(screen.getByRole('radio', { name: String(year) }))
const mount = (onFinish = vi.fn(), onSignIn = vi.fn(), onLanguage = vi.fn()) =>
  render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={onLanguage} onFinish={onFinish} onSignIn={onSignIn} />)

describe('short onboarding', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('requires only age before the lesson invitation, without a signup wall', () => {
    const finish = vi.fn()
    mount(finish)
    click('Get started')
    expect(screen.getByText('When were you born?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBe('true')
    pickYear(1996)
    click('Continue')
    expect(screen.getByText('One short lesson. No account needed.')).toBeTruthy()
    expect(screen.queryByText('I already have an account')).toBeNull()
    const start = screen.getByRole('button', { name: 'Start learning' })
    fireEvent.click(start)
    fireEvent.click(start)
    expect(finish).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith({ birthYear: 1996, isChild: false, language: 'en', dailyGoalMinutes: 10, startRegion: null, level: 'some' })
  })

  it('keeps returning sign-in at welcome', () => {
    const signIn = vi.fn()
    mount(vi.fn(), signIn)
    click('I already have an account')
    expect(signIn).toHaveBeenCalledOnce()
  })

  it('makes language optional and does not silently advance after changing it', () => {
    const language = vi.fn()
    mount(vi.fn(), vi.fn(), language)
    click('Language')
    fireEvent.click(screen.getByRole('radio', { name: 'Svenska' }))
    expect(language).toHaveBeenCalledWith('sv')
    expect(screen.getByText('Choose your language')).toBeTruthy()
    click('Continue')
    expect(screen.getByRole('button', { name: 'Get started' })).toBeTruthy()
  })

  it('offers an optional practice question and then the same age safeguard', () => {
    const finish = vi.fn()
    mount(finish)
    click('Try a question')
    click('Try it')
    click('United States')
    click('Continue')
    expect(screen.getByText('When were you born?')).toBeTruthy()
    expect(finish).not.toHaveBeenCalled()
  })

  it.each([YEAR, YEAR - CHILD_AGE + 1, YEAR - CHILD_AGE, YEAR - 100])('classifies birth year %i at the privacy boundary', birthYear => {
    const finish = vi.fn()
    mount(finish)
    click('Get started')
    pickYear(birthYear)
    click('Continue')
    expect(screen.queryByText('I already have an account')).toBeNull()
    click('Start learning')
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ birthYear, isChild: YEAR - birthYear < CHILD_AGE }))
  })

  it('does not preselect a year or offer future years, and includes every age', () => {
    mount()
    click('Get started')
    const rows = screen.getAllByRole('radio')
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['Choose a year', ...Array.from({ length: 101 }, (_, offset) => String(YEAR - offset))])
    expect(rows.slice(1).every(row => row.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('keeps the selected year when going back, but clearing it disables Continue', () => {
    mount()
    click('Get started')
    pickYear(1996)
    click('Continue')
    click('Back')
    expect(screen.getByRole('radio', { name: '1996' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Choose a year' }))
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBe('true')
    click('Back')
    expect(screen.getByRole('button', { name: 'Get started' })).toBeTruthy()
  })
})

describe('readOnboarding â€” the flag that decides a privacy question', () => {
  const KEY = 'onboarding.v1'

  beforeEach(() => clearAll())

  it('reads a real row', () => {
    writeJson(KEY, { completed: true, birthYear: 2014, isChild: true })
    expect(readOnboarding()).toEqual({ completed: true, birthYear: 2014, isChild: true })
  })

  it.each([
    ['a non-boolean isChild', { completed: true, isChild: 'false' }],
    ['a non-boolean completed', { completed: 'yes' }],
    ['a birth year that is not a year', { completed: true, birthYear: 'nineteen' }],
    ['not an object at all', 5],
  ])('runs the age gate again rather than guessing, for %s', (_label, stored) => {
    // `_layout` does `if (completed && isChild !== undefined) setChildAccount(isChild)`,
    // and a cast let a non-boolean through that gate. The failure direction happened to
    // be safe â€” `track()` tests `!== false` â€” but "happens to fail safe" is not the same
    // claim as "cannot be wrong", and this decides whether a ten-year-old's device talks
    // to a third party. Asking once more is the correct cost.
    writeJson(KEY, stored)
    expect(readOnboarding()).toEqual({ completed: false })
  })
})
