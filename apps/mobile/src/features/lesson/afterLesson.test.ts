import { describe, expect, it } from 'vitest'
import { hrefFor, nextAfterLesson, parseSteps, planAfterLesson } from './afterLesson.js'

const base = {
  completed: true,
  countedTodayBefore: false,
  questCompleted: false,
  unlocked: 0,
  offerProfile: false,
  offerPaywall: false,
}

const BADGE = { achievementId: 'ach.flags.collector', tier: 'bronze' as const }
const OTHER = { achievementId: 'ach.lessons.done', tier: 'silver' as const }

describe('planAfterLesson', () => {
  it('celebrates the streak once a day, on the first finished lesson', () => {
    expect(planAfterLesson(base)).toEqual(['streak'])
    expect(planAfterLesson({ ...base, countedTodayBefore: true })).toEqual([])
  })

  it('does not celebrate a lesson that was ended early', () => {
    expect(planAfterLesson({ ...base, completed: false, questCompleted: true })).toEqual(['quest'])
  })

  it('orders the day, the quest and the badges before anything is asked of the learner', () => {
    expect(
      planAfterLesson({ ...base, questCompleted: true, unlocked: 2, offerProfile: true, offerPaywall: true }),
    ).toEqual(['streak', 'quest', 'achievements', 'profile', 'paywall'])
  })

  it('shows a badge even after an early exit — the answers that earned it were given', () => {
    expect(planAfterLesson({ ...base, completed: false, unlocked: 1 })).toEqual(['achievements'])
  })

  it('never asks for a profile at the end of a lesson somebody chose to leave', () => {
    expect(planAfterLesson({ ...base, completed: false, offerProfile: true })).toEqual([])
    expect(planAfterLesson({ ...base, countedTodayBefore: true, offerProfile: true })).toEqual(['profile'])
  })

  it('offers a profile independently of the paywall, which exists only while selling', () => {
    expect(planAfterLesson({ ...base, countedTodayBefore: true, offerProfile: true, offerPaywall: false }))
      .toEqual(['profile'])
    expect(planAfterLesson({ ...base, countedTodayBefore: true, offerProfile: false, offerPaywall: true }))
      .toEqual(['paywall'])
  })
})

describe('hrefFor', () => {
  it('goes home when nothing is left', () => {
    expect(hrefFor([])).toBe('/')
  })

  it('carries the rest of the chain and the practised countries', () => {
    expect(hrefFor(['streak', 'quest', 'paywall'], { countries: ['SE', 'NO'] })).toBe(
      '/streak-extended?then=quest%2Cpaywall&countries=SE%2CNO',
    )
  })

  it('opens the paywall on its onboarding page, with the countries it draws', () => {
    expect(hrefFor(['paywall'], { countries: ['SE'] })).toBe('/paywall?countries=SE&source=onboarding')
  })

  it('drops the countries when no paywall follows', () => {
    expect(hrefFor(['quest'], { countries: ['SE'] })).toBe('/quest-complete')
  })

  it('carries the unlocks only while the badge card is still ahead', () => {
    expect(hrefFor(['streak', 'achievements'], { unlocks: [BADGE] })).toBe(
      '/streak-extended?then=achievements&unlocks=ach.flags.collector%3Abronze',
    )
    expect(hrefFor(['profile'], { unlocks: [BADGE] })).toBe('/create-profile')
  })

  it('names a route for every step', () => {
    expect(hrefFor(['achievements'], { unlocks: [BADGE] })).toBe(
      '/achievement-unlocked?unlocks=ach.flags.collector%3Abronze',
    )
    expect(hrefFor(['profile', 'paywall'])).toBe('/create-profile?then=paywall')
  })
})

describe('parseSteps', () => {
  it('ignores unknown and repeated names and restores the canonical order', () => {
    expect(parseSteps('paywall,bogus,quest,quest')).toEqual(['quest', 'paywall'])
    expect(parseSteps('paywall,profile,achievements')).toEqual(['achievements', 'profile', 'paywall'])
    expect(parseSteps(undefined)).toEqual([])
  })
})

describe('nextAfterLesson', () => {
  it('walks a chain one screen at a time', () => {
    expect(nextAfterLesson({ then: 'quest,paywall', countries: 'SE' })).toBe(
      '/quest-complete?then=paywall&countries=SE',
    )
    expect(nextAfterLesson({})).toBe('/')
  })

  it('forwards the unlocks through every step before the card', () => {
    // A step that passed on only `then` would lose them, and the badge card would
    // silently never appear — which is why each route hands over its whole query.
    const unlocks = 'ach.flags.collector:bronze,ach.lessons.done:silver'
    expect(nextAfterLesson({ then: 'quest,achievements,profile', unlocks })).toBe(
      '/quest-complete?then=achievements%2Cprofile&unlocks=ach.flags.collector%3Abronze%2Cach.lessons.done%3Asilver',
    )
    expect(nextAfterLesson({ then: 'achievements', unlocks })).toBe(
      `/achievement-unlocked?unlocks=${encodeURIComponent('ach.flags.collector:bronze,ach.lessons.done:silver')}`,
    )
  })

  it('never forwards an unlock the catalogue does not know', () => {
    expect(nextAfterLesson({ then: 'achievements', unlocks: 'ach.made.up:gold' })).toBe('/achievement-unlocked')
    expect(hrefFor(['achievements'], { unlocks: [BADGE, OTHER] })).toContain('ach.lessons.done%3Asilver')
  })
})
