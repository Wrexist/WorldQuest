import { initialState, transition, type LessonEvent, type LessonState, type Question } from '@worldquest/engines'
import { AccountChangedError } from '@worldquest/api'
import { captureStorage } from './storage.js'

const keyFor = (id: string) => `lesson.recovery.v1.${id}`
type SavedEvent = Exclude<LessonEvent, { type: 'LOAD' | 'LOADED' }>
type Journal = { version: 1; signature: string; startedAt: number; events: SavedEvent[] }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function isEvent(value: unknown): value is SavedEvent {
  if (!record(value) || typeof value.now !== 'number' || !Number.isFinite(value.now) || value.now < 0) return false
  switch (value.type) {
    case 'ANSWER': case 'SELECT': return typeof value.optionId === 'string' && value.optionId.length < 500
    case 'TYPE': return typeof value.text === 'string' && value.text.length <= 1000
    case 'ANSWER_GROUP': return record(value.choices) && Object.keys(value.choices).length <= 20
      && Object.values(value.choices).every(v => typeof v === 'string' && v.length < 500)
    case 'CHECK': case 'CONTINUE': case 'PAUSE': case 'RESUME': case 'ABANDON': case 'REVIVE': case 'TIMEOUT': return true
    default: return false
  }
}

/** Account-bound input journal. Derived grades/hearts are replayed, never trusted from disk. */
export function openLessonRecovery(input: {
  lessonId: string; questions: readonly Question[]; heartsEnabled: boolean; timeLimitMs: number | null; now: number
}) {
  const store = captureStorage(), key = keyFor(input.lessonId)
  const signature = JSON.stringify([input.questions, input.heartsEnabled, input.timeLimitMs])
  let journal: Journal = { version: 1, signature, startedAt: input.now, events: [] }
  let recovered = false
  try {
    const raw = store.get(key)
    const value: unknown = raw && raw.length < 2_000_000 ? JSON.parse(raw) : null
    if (record(value) && value.version === 1 && value.signature === signature
      && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) && value.startedAt >= 0
      && Array.isArray(value.events)
      && value.events.length <= 10_000 && value.events.every(isEvent)) {
      journal = value as Journal
      recovered = true
    }
  } catch { /* An invalid cache cannot prevent a lesson starting from its issued ticket. */ }
  let state = transition(initialState(input), { type: 'LOAD', lessonId: input.lessonId, now: journal.startedAt })
  state = transition(state, { type: 'LOADED', questions: input.questions, now: journal.startedAt })
  for (const event of journal.events) state = transition(state, event)
  const save = (value = journal) => {
    if (!store.isCurrent()) throw new AccountChangedError()
    store.set(key, JSON.stringify(value))
  }
  const apply = (event: LessonEvent): LessonState => {
    if (!store.isCurrent()) throw new AccountChangedError()
    if (event.type === 'LOAD' || event.type === 'LOADED') return state
    const next = transition(state, event)
    if (next === state) return state
    const events = [...journal.events]
    // Editing one unsubmitted answer need not store every keystroke or selection.
    if ((event.type === 'TYPE' || event.type === 'SELECT') && events.at(-1)?.type === event.type) events.pop()
    const nextJournal = { ...journal, events: [...events, event] }
    save(nextJournal) // Persist before acknowledging the action to React.
    journal = nextJournal
    state = next
    return state
  }
  // Time away is not thinking time. Feedback and completed answers remain intact.
  if (recovered && state.phase === 'presenting') apply({ type: 'PAUSE', now: input.now })
  else save()
  return { state, recovered, apply, isCurrent: store.isCurrent }
}

export function hasLessonRecovery(id: string): boolean {
  return captureStorage().get(keyFor(id)) !== null
}

/** Called only after the original ticket's answers have reached the durable outbox. */
export function clearLessonRecovery(id: string, store = captureStorage()): void {
  if (store.isCurrent()) store.remove(keyFor(id))
}
