/**
 * A map drill's tries after a graded tap. Only the first tap is graded — the server never
 * hears of a retry — so what is asserted is when the learner may keep looking, and when the
 * answer sheet (and the out-of-hearts fork) must come first.
 */
import { describe, expect, it } from 'vitest'
import { initialState, transition, type LessonState, type Question } from '@worldquest/engines'
import { DRILL_TRIES, drillOf, drillMapHeight } from './LessonScreen.js'

const T0 = 1_000_000
const tapQuestion = (id: string): Question => ({
  item: { id: `geo.${id}.location@tpl.find-on-map.tap`, factId: `geo.${id}.location`, templateId: 'tpl.find-on-map.tap', entityId: id, difficulty: 2, screenReaderSafe: false },
  promptKey: 'lesson:prompt.find_on_map', promptParams: { entityName: id },
  options: ['AT', 'HU', 'DE', 'CH'].map((o) => ({ id: o, label: o, isCorrect: o === id })),
  modality: 'map', timeLimitMs: null, isNew: false, tap: true,
})

const graded = (pick: string, over: Parameters<typeof initialState>[0] = {}): LessonState => {
  let s = initialState(over)
  s = transition(s, { type: 'LOAD', lessonId: 'l', now: T0 })
  s = transition(s, { type: 'LOADED', questions: [tapQuestion('AT'), tapQuestion('HU')], now: T0 })
  s = transition(s, { type: 'SELECT', optionId: pick, now: T0 + 100 })
  return transition(s, { type: 'CHECK', now: T0 + 2000 })
}

describe('a map drill question once graded', () => {
  it('keeps looking after a miss, starting from the graded tap', () => {
    const state = graded('HU')
    const drill = drillOf(state.questions[0]!, state, null)!
    expect(drill.retrying).toBe(true)
    expect(drill.tries.misses).toEqual(['HU'])
    expect(state.answers).toHaveLength(1)
  })

  it('is over at once when the first tap was right', () => {
    const state = graded('AT')
    expect(drillOf(state.questions[0]!, state, null)).toMatchObject({ retrying: false, tries: { misses: [] } })
  })

  it('is over when the country is found on a later try, or the tries run out', () => {
    const state = graded('HU')
    const { tries } = drillOf(state.questions[0]!, state, null)!
    expect(drillOf(state.questions[0]!, state, { ...tries, found: true })!.retrying).toBe(false)
    const spent = { ...tries, misses: ['HU', 'DE', 'CH'].slice(0, DRILL_TRIES) }
    expect(drillOf(state.questions[0]!, state, spent)!.retrying).toBe(false)
  })

  it('forgets the tries of an earlier answer', () => {
    const state = graded('HU')
    const stale = { key: 'l:0:0:0', misses: ['DE', 'CH', 'HU'], found: false, selected: null }
    expect(drillOf(state.questions[0]!, state, stale)!.tries.misses).toEqual(['HU'])
  })

  it('offers no retries once out of hearts: that fork comes first', () => {
    const state: LessonState = { ...graded('HU'), outOfHearts: true }
    expect(drillOf(state.questions[0]!, state, null)!.retrying).toBe(false)
  })

  it('is no drill at all for an ordinary question, or before grading', () => {
    const { tap: _tap, ...plain } = tapQuestion('AT')
    const state = graded('HU')
    expect(drillOf(plain, state, null)).toBeNull()
    const presenting = transition(initialState(), { type: 'LOAD', lessonId: 'l', now: T0 })
    expect(drillOf(tapQuestion('AT'), presenting, null)).toBeNull()
  })
})

describe('the drill map', () => {
  it('fills most of a phone and stops at a tablet', () => {
    expect(drillMapHeight(568)).toBeGreaterThanOrEqual(260)
    expect(drillMapHeight(844)).toBeGreaterThan(drillMapHeight(568))
    expect(drillMapHeight(1366)).toBe(640)
  })
})
