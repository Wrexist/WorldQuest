import type { MemoryState, Question } from '@worldquest/engines'
import { D1AuthError } from './d1-auth.js'

const fail = (): never => { throw new D1AuthError('INVALID_RESPONSE') }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const string = (v: unknown): string => typeof v === 'string' && v.length <= 4096 ? v : fail()
const number = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : fail()
const boolean = (v: unknown): boolean => typeof v === 'boolean' ? v : fail()
export function parseD1Memory(value: unknown): MemoryState {
  if (!object(value)) return fail()
  const state = { factId: string(value.factId), stability: number(value.stability), difficulty: number(value.difficulty),
    reps: number(value.reps), lapses: number(value.lapses), lastReviewAt: value.lastReviewAt === null ? null : number(value.lastReviewAt),
    dueAt: number(value.dueAt), suspended: boolean(value.suspended) }
  if (state.stability < 0 || state.difficulty < 1 || state.difficulty > 10 || !Number.isSafeInteger(state.reps) || state.reps < 0
    || !Number.isSafeInteger(state.lapses) || state.lapses < 0) return fail()
  return state
}
export function parseD1Question(value: unknown): Question {
  if (!object(value) || !object(value.item) || !object(value.promptParams) || !Array.isArray(value.options)
    || value.options.length < 2 || value.options.length > 8) return fail()
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
    ...(value.promptAsset === undefined ? {} : { promptAsset: string(value.promptAsset) }),
    ...(value.revealAsset === undefined ? {} : { revealAsset: string(value.revealAsset) }),
    ...(value.hint === undefined ? {} : { hint: string(value.hint) }),
    ...(locator === undefined ? {} : { locator: { path: string(locator.path), contextPath: string(locator.contextPath) } }) }
}
