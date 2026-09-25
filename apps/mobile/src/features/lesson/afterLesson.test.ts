import { describe, expect, it } from 'vitest'
import { hrefFor, nextAfterLesson, parseSteps, planAfterLesson } from './afterLesson.js'

const base = { completed: true, countedTodayBefore: false, questCompleted: false, offerPaywall: false }

describe('planAfterLesson', () => {
  it('celebrates the streak once a day, on the first finished lesson', () => {
    expect(planAfterLesson(base)).toEqual(['streak'])
    expect(planAfterLesson({ ...base, countedTodayBefore: true })).toEqual([])
  })

  it('does not celebrate a lesson that was ended early', () => {
    expect(planAfterLesson({ ...base, completed: false, questCompleted: true })).toEqual(['quest'])
  })

  it('orders the day before the quest and asks for nothing until both are shown', () => {
    expect(planAfterLesson({ ...base, questCompleted: true, offerPaywall: true })).toEqual(['streak', 'quest', 'paywall'])
  })
})

describe('hrefFor', () => {
  it('goes home when nothing is left', () => {
    expect(hrefFor([])).toBe('/')
  })

  it('carries the rest of the chain and the practised countries', () => {
    expect(hrefFor(['streak', 'quest', 'paywall'], ['SE', 'NO'])).toBe(
      '/streak-extended?then=quest%2Cpaywall&countries=SE%2CNO',
    )
  })

  it('opens the paywall on its onboarding page, with the countries it draws', () => {
    expect(hrefFor(['paywall'], ['SE'])).toBe('/paywall?countries=SE&source=onboarding')
  })

  it('drops the countries when no paywall follows', () => {
    expect(hrefFor(['quest'], ['SE'])).toBe('/quest-complete')
  })
})

describe('parseSteps', () => {
  it('ignores unknown and repeated names and restores the canonical order', () => {
    expect(parseSteps('paywall,bogus,quest,quest')).toEqual(['quest', 'paywall'])
    expect(parseSteps(undefined)).toEqual([])
  })

  it('walks a chain one screen at a time', () => {
    expect(nextAfterLesson('quest,paywall', 'SE')).toBe('/quest-complete?then=paywall&countries=SE')
    expect(nextAfterLesson(undefined, undefined)).toBe('/')
  })
})
