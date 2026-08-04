import { describe, expect, it } from 'vitest'
import { EVENTS, SAMPLE_RATES, type EventName } from './events.js'

const names = Object.keys(EVENTS) as EventName[]

describe('event registry', () => {
  it('names every event object_action, snake_case, past tense', () => {
    // An event name is an API — it ships into dashboards and saved queries, and
    // renaming one breaks a year of history.
    for (const name of names) {
      expect(name, `${name} is not snake_case`).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/)
      const verb = name.split('_').pop()!
      // Regular -ed forms, plus the irregular past participles we actually use.
      const irregular = ['shown', 'broken', 'sent', 'lost', 'spent', 'won', 'up']
      expect(
        verb.endsWith('ed') || irregular.includes(verb),
        `${name} does not read as past tense`,
      ).toBe(true)
    }
  })

  it('gives every event a description', () => {
    for (const name of names) {
      expect(EVENTS[name].description.length, `${name} has no description`).toBeGreaterThan(10)
    }
  })

  it('declares no property that could carry PII', () => {
    const banned = ['email', 'name', 'phone', 'address', 'password', 'ip', 'lat', 'lng']
    for (const name of names) {
      for (const prop of Object.keys(EVENTS[name].properties)) {
        if (prop.startsWith('$comment')) continue
        const bare = prop.replace(/_id$|_hashed$/, '')
        expect(banned, `${name}.${prop} looks like PII`).not.toContain(bare)
      }
    }
  })

  it('samples only high-volume, low-value events at full rate deliberately', () => {
    for (const [name, rate] of Object.entries(SAMPLE_RATES)) {
      expect(names, `${name} is sampled but not declared`).toContain(name as EventName)
      expect(rate).toBeGreaterThan(0)
      expect(rate).toBeLessThanOrEqual(1)
    }
  })

  it('keeps the events the core funnels depend on', () => {
    // Deleting one of these silently breaks a dashboard rather than a build.
    for (const required of [
      'lesson_started', 'lesson_completed', 'lesson_abandoned',
      'question_answered', 'fact_mastered', 'streak_extended',
      'taster_lesson_completed', 'signup_completed',
    ] as EventName[]) {
      expect(names).toContain(required)
    }
  })

  it('records position on question_answered', () => {
    // Accuracy by position within a lesson is how lesson length gets set honestly
    // rather than guessed.
    expect(Object.keys(EVENTS.question_answered.properties)).toContain('position')
  })
})
