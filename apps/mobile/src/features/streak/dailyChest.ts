/** A receipt for a visual reveal, never a wallet or an award command. */
import { readJson, writeJson, onStorageScopeChange } from '../../lib/storage.js'
import { localDay } from '../../lib/day.js'

const KEY = 'streak.chest.v1'
const GEMS_KEY = 'streak.gem-days.v1'
const gemListeners = new Set<() => void>()
let gemSnapshot: readonly string[] = []
export const subscribeStreakGems = (listener: () => void) => { gemListeners.add(listener); return () => { gemListeners.delete(listener) } }
const emitGems = () => gemListeners.forEach(listener => listener())
onStorageScopeChange(() => { gemSnapshot = []; emitGems() })
const validDay = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

/** Cosmetic keepsakes on this device, scoped to the active account. Never spendable. */
export function readStreakGems(): readonly string[] {
  const days = readJson<unknown[]>(GEMS_KEY, Array.isArray) ?? []
  const next = [...new Set(days.filter(validDay))].sort()
  if (next.join() !== gemSnapshot.join()) gemSnapshot = next
  return gemSnapshot
}
export type DailyChest = {
  readonly day: string
  readonly lessonId: string
  readonly xp: number
  readonly coins: number
  readonly opened: boolean
}
const valid = (value: unknown): value is DailyChest => {
  if (typeof value !== 'object' || value === null) return false
  const row = value as DailyChest
  return validDay(row.day) &&
    typeof row.lessonId === 'string' && row.lessonId.length > 0 && typeof row.opened === 'boolean' &&
    Number.isSafeInteger(row.xp) && row.xp >= 0 && Number.isSafeInteger(row.coins) && row.coins >= 0
}
export function readDailyChest(day = localDay(new Date())): DailyChest | null {
  const row = readJson<DailyChest>(KEY, valid)
  return row?.day === day ? row : null
}
/** Only the first completed lesson creates today's receipt. Replays cannot replace it. */
export function rememberDailyChest(receipt: Omit<DailyChest, 'opened'>): void {
  const candidate = { ...receipt, opened: false }
  if (!valid(candidate) || readDailyChest(receipt.day) !== null) return
  writeJson(KEY, candidate)
}
/** One dated badge per learning day. Write the badge before marking its reveal. */
export function openDailyChest(day: string, lessonId: string): void {
  const row = readDailyChest(day)
  if (row === null || row.lessonId !== lessonId) return
  const days = readStreakGems()
  if (!days.includes(day)) writeJson(GEMS_KEY, [...days, day].sort())
  emitGems()
  if (row.opened) return
  writeJson(KEY, { ...row, opened: true })
}
