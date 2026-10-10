import type { MemoryState, Question } from '@worldquest/engines'
import { D1AuthError } from './d1-auth.js'

const fail = (): never => { throw new D1AuthError('INVALID_RESPONSE') }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const string = (v: unknown): string => typeof v === 'string' && v.length <= 4096 ? v : fail()
const number = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : fail()
const boolean = (v: unknown): boolean => typeof v === 'boolean' ? v : fail()
const spellings = (v: unknown): string[] => {
  if (!Array.isArray(v) || v.length > 1000) return fail()
  return v.map(string)
}
export function parseD1Memory(value: unknown): MemoryState {
  if (!object(value)) return fail()
  const state = { factId: string(value.factId), stability: number(value.stability), difficulty: number(value.difficulty),
    reps: number(value.reps), lapses: number(value.lapses), lastReviewAt: value.lastReviewAt === null ? null : number(value.lastReviewAt),
    dueAt: number(value.dueAt), suspended: boolean(value.suspended) }
  if (state.stability < 0 || state.difficulty < 1 || state.difficulty > 10 || !Number.isSafeInteger(state.reps) || state.reps < 0
    || !Number.isSafeInteger(state.lapses) || state.lapses < 0) return fail()
  return state
}
/** Africa's 54 and room to grow; a ticket is never larger than its continent. */
const MAX_TAP_OPTIONS = 80
export function parseD1Question(value: unknown): Question {
  if (!object(value) || !object(value.item) || !object(value.promptParams) || !Array.isArray(value.options)) return fail()
  // A tapped answer offers every place on the map it may land on: a continent's countries.
  if (value.tap !== undefined && value.tap !== true) return fail()
  const most = value.tap === true ? MAX_TAP_OPTIONS : 8
  if (value.options.length < 1 || value.options.length > most) return fail()
  // Typed questions carry one answer key, never a visible choice. Dropping `typed`
  // either rejected a valid issued lesson or exposed that answer as a choice.
  let typed: Question['typed']
  if (value.typed !== undefined) {
    if (!object(value.typed) || value.options.length !== 1) return fail()
    const accepts = spellings(value.typed.accepts)
    if (accepts.length === 0 || accepts.some(s => s.trim() === '')) return fail()
    typed = { accepts, ...(value.typed.rivals === undefined ? {} : { rivals: spellings(value.typed.rivals) }) }
  } else if (value.options.length < 2) return fail()
  let group: Question['group']
  if (value.group !== undefined) {
    const g = value.group
    if (!object(g) || typed !== undefined || !Number.isSafeInteger(g.size) || !Number.isSafeInteger(g.position)) return fail()
    const size = number(g.size), position = number(g.position)
    if (size < 2 || size > 8 || size !== value.options.length || position < 0 || position >= size) return fail()
    group = { id: string(g.id), size, position }
  }
  const item = value.item
  const options = value.options.map((option: unknown) => {
    if (!object(option)) return fail()
    return { id: string(option.id), label: string(option.label), isCorrect: boolean(option.isCorrect),
      ...(option.asset === undefined ? {} : { asset: string(option.asset) }) }
  })
  if (options.filter(o => o.isCorrect).length !== 1 || new Set(options.map(o => o.id)).size !== options.length) return fail()
  const modality = value.modality
  if (modality !== 'text' && modality !== 'image' && modality !== 'map') return fail()
  const locator = value.locator
  if (locator !== undefined && !object(locator)) return fail()
  return { item: { id: string(item.id), factId: string(item.factId), templateId: string(item.templateId), entityId: string(item.entityId),
    difficulty: number(item.difficulty), screenReaderSafe: boolean(item.screenReaderSafe) },
    promptKey: string(value.promptKey), promptParams: Object.fromEntries(Object.entries(value.promptParams).map(([key, val]) => [key, string(val)])),
    options, modality, timeLimitMs: value.timeLimitMs === null ? null : number(value.timeLimitMs), isNew: boolean(value.isNew),
    ...(typed === undefined ? {} : { typed }), ...(group === undefined ? {} : { group }),
    ...(value.tap === true && typed === undefined && group === undefined ? { tap: true as const } : {}),
    ...(value.promptAsset === undefined ? {} : { promptAsset: string(value.promptAsset) }),
    ...(value.revealAsset === undefined ? {} : { revealAsset: string(value.revealAsset) }),
    ...(value.hint === undefined ? {} : { hint: string(value.hint) }),
    ...(locator === undefined ? {} : { locator: { path: string(locator.path), contextPath: string(locator.contextPath) } }) }
}
