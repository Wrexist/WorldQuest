/**
 * The disclosure policy, phase by phase. These are the tests that keep the map from
 * answering the question.
 *
 * `t` here returns the key and every param, so an assertion can see EXACTLY what a
 * screen reader would be given — a hidden name smuggled into a summary param fails.
 */

import { describe, expect, it } from 'vitest'
import { buildLessonScene, lessonAtlasPolicy, MAP_REVEALS, placeForFact, type LessonSceneInput } from './lessonScene.js'
import type { AtlasSceneSpec } from './types.js'

const NAMES: Record<string, string> = { ES: 'Spain', JP: 'Japan', SE: 'Sweden', NO: 'Norway', VA: 'Vatican City', FJ: 'Fiji' }
const CAPITALS: Record<string, string> = {
  'geo.ES.capital': 'Madrid',
  'geo.JP.capital': 'Tokyo',
  'geo.SE.capital': 'Stockholm',
  'geo.FJ.capital': 'Suva',
  'geo.BO.capital': 'Sucre',
}

const t = (key: string, params?: Record<string, string | number>) => `${key}|${JSON.stringify(params ?? {})}`

const input = (over: Partial<LessonSceneInput> & Pick<LessonSceneInput, 'policy' | 'entityId'>): LessonSceneInput => ({
  sceneKey: 'lesson-1:0',
  factId: `geo.${over.entityId}.capital`,
  phase: 'question',
  chosenOptionId: null,
  countryName: (id) => NAMES[id],
  factValueName: (id) => CAPITALS[id],
  t,
  ...over,
})

/** Everything in a spec a person could read or hear. */
const disclosed = (spec: AtlasSceneSpec) =>
  [spec.summary, ...spec.labels.map((l) => l.text), ...spec.markers.map((m) => m.label ?? '')].join(' ¦ ')

const capital = { mode: 'capital-name', beforeAnswer: true } as const
const identify = { mode: 'identify-country', beforeAnswer: true } as const

describe('which questions get a map', () => {
  it('never takes a flag question’s picture slot', () => {
    expect(lessonAtlasPolicy({ attribute: 'flag', modality: 'image', hasLocator: false, hasPromptAsset: true })).toBeNull()
  })

  it('draws nothing without the composer’s locator, which is absent whenever the answer is the country', () => {
    expect(lessonAtlasPolicy({ attribute: 'capital', modality: 'text', hasLocator: false, hasPromptAsset: false })).toBeNull()
  })

  it('withholds the map before grading for every attribute a map would answer', () => {
    for (const attribute of MAP_REVEALS) {
      expect(lessonAtlasPolicy({ attribute, modality: 'text', hasLocator: true, hasPromptAsset: false })).toEqual({
        mode: 'context',
        beforeAnswer: false,
      })
    }
  })

  it('treats an attribute it does not know as reveal-only', () => {
    expect(lessonAtlasPolicy({ attribute: 'brand-new', modality: 'text', hasLocator: true, hasPromptAsset: false })?.beforeAnswer).toBe(false)
    expect(lessonAtlasPolicy({ attribute: undefined, modality: 'text', hasLocator: true, hasPromptAsset: false })?.beforeAnswer).toBe(false)
  })

  it('sorts capitals, map prompts and safe context', () => {
    expect(lessonAtlasPolicy({ attribute: 'capital', modality: 'text', hasLocator: true, hasPromptAsset: false })).toEqual(capital)
    expect(lessonAtlasPolicy({ attribute: 'location', modality: 'map', hasLocator: true, hasPromptAsset: false })).toEqual(identify)
    expect(lessonAtlasPolicy({ attribute: 'currency', modality: 'text', hasLocator: true, hasPromptAsset: false })).toEqual({ mode: 'context', beforeAnswer: true })
  })
})

describe('capital name', () => {
  it.each(['question', 'selected', 'submitting'] as const)('hides the capital while %s', (phase) => {
    const spec = buildLessonScene(input({ policy: capital, entityId: 'ES', phase }))!
    expect(spec.markers).toEqual([])
    expect(spec.labels).toEqual([])
    expect(disclosed(spec)).not.toContain('Madrid')
    expect(spec.highlights).toEqual([{ countryId: 'ES', state: 'subject' }])
    expect(spec.interaction.selectable).toEqual([])
  })

  it('pins the verified capital, by its coordinate, once graded', () => {
    const spec = buildLessonScene(input({ policy: capital, entityId: 'ES', phase: 'revealed' }))!
    const place = placeForFact('geo.ES.capital')!
    expect(spec.markers).toEqual([{ placeId: place.id, lat: place.lat, lon: place.lon, label: 'Madrid', emphasis: 'answer' }])
    expect(spec.labels).toEqual([])
    // Verified, not illustrated: within a few km of Puerta del Sol.
    expect(Math.abs(place.lat - 40.4168)).toBeLessThan(0.05)
    expect(Math.abs(place.lon - -3.7038)).toBeLessThan(0.05)
    expect(spec.summary).toContain('capitalPinned')
  })

  it('states a capital it cannot pin, and draws no pin', () => {
    const spec = buildLessonScene(input({ policy: capital, entityId: 'BO', factId: 'geo.BO.capital', phase: 'revealed' }))
    // Bolivia's capital is review-required: no verified place, so no marker — only the fact.
    expect(spec?.markers ?? []).toEqual([])
  })

  it('keeps the same scene key for one question and frames the country with its surroundings', () => {
    const a = buildLessonScene(input({ policy: capital, entityId: 'JP' }))!
    const b = buildLessonScene(input({ policy: capital, entityId: 'JP', phase: 'revealed' }))!
    expect(a.sceneKey).toBe(b.sceneKey)
    expect(a.focus).toEqual(b.focus)
    expect(a.focus.kind === 'country' && a.focus.frame.radius).toBeGreaterThanOrEqual(10)
  })
})

describe('identify the highlighted country', () => {
  it.each(['question', 'selected', 'submitting'] as const)('names nothing while %s — not a label, not the summary', (phase) => {
    const spec = buildLessonScene(input({ policy: identify, entityId: 'SE', phase }))!
    expect(spec.labels).toEqual([])
    expect(spec.markers).toEqual([])
    expect(disclosed(spec)).not.toContain('Sweden')
    expect(spec.summary).toBe('atlas:summary.identify|{}')
    expect(spec.highlights).toEqual([{ countryId: 'SE', state: 'subject' }])
  })

  it('never shows the learner’s pending choice on the map, which would rule options out', () => {
    const spec = buildLessonScene(input({ policy: identify, entityId: 'SE', phase: 'selected', chosenOptionId: 'NO' }))!
    expect(spec.highlights.map((h) => h.countryId)).toEqual(['SE'])
  })

  it('names the country once graded, and shows a wrong pick beside it', () => {
    const right = buildLessonScene(input({ policy: identify, entityId: 'SE', phase: 'revealed', chosenOptionId: 'SE' }))!
    expect(right.highlights).toEqual([{ countryId: 'SE', state: 'correct' }])
    expect(right.labels.map((l) => l.text)).toEqual(['Sweden'])

    const wrong = buildLessonScene(input({ policy: identify, entityId: 'SE', phase: 'revealed', chosenOptionId: 'NO' }))!
    expect(wrong.highlights).toEqual([
      { countryId: 'SE', state: 'correct' },
      { countryId: 'NO', state: 'incorrect' },
    ])
    expect(wrong.summary).toContain('Norway')
  })

  it('rings a country too small to see by its fill', () => {
    const spec = buildLessonScene(input({ policy: identify, entityId: 'VA' }))!
    expect(spec.rings.map((r) => r.countryId)).toEqual(['VA'])
    expect(disclosed(spec)).not.toContain('Vatican')
  })
})

describe('reveal-only questions', () => {
  it('show no map before grading and the plain context map after', () => {
    const policy = { mode: 'context', beforeAnswer: false } as const
    expect(buildLessonScene(input({ policy, entityId: 'JP', phase: 'question' }))).toBeNull()
    expect(buildLessonScene(input({ policy, entityId: 'JP', phase: 'selected' }))).toBeNull()
    const after = buildLessonScene(input({ policy, entityId: 'JP', phase: 'revealed' }))!
    expect(after.highlights).toEqual([{ countryId: 'JP', state: 'subject' }])
    expect(after.markers).toEqual([])
  })
})

it('returns no scene for a country the atlas has no geometry for, rather than a neighbour', () => {
  expect(buildLessonScene(input({ policy: capital, entityId: 'XK' }))).toBeNull()
})
