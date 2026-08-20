/**
 * Device storage.
 *
 * MMKV rather than AsyncStorage (ADR 0007): it is synchronous, which matters because
 * the very first thing a cold start does is read a session, and an async read there
 * is a frame of "signed out" before a frame of "signed in".
 *
 * Two separate instances on purpose. The auth session is a credential and gets its
 * own encrypted store; cached progress and preferences are neither secret nor worth
 * the encryption cost on every read. Mixing them means either encrypting everything
 * or encrypting nothing, and both are wrong.
 */

import { MMKV } from 'react-native-mmkv'
import type { SessionStorage } from '@worldquest/api'

/**
 * Lazily constructed. The MMKV constructor reaches into a native module, and doing
 * that at import time makes any environment without one — a unit test, the screenshot
 * renderer — fail at the import rather than at the call.
 */
let auth: MMKV | undefined
let app: MMKV | undefined

const authStore = (): MMKV =>
  (auth ??= new MMKV({
    id: 'worldquest.auth',
    // Not a secret in itself — MMKV derives the key from it, and on a rooted device
    // an attacker with the binary has this too. It raises the cost of a casual dump
    // of another app's data, which is the realistic threat for a phone that gets
    // lost. Real secrets stay server-side.
    encryptionKey: 'worldquest.session.v1',
  }))

const appStore = (): MMKV => (app ??= new MMKV({ id: 'worldquest.app' }))

/**
 * The session adapter supabase-js expects.
 *
 * Its interface allows promises, and MMKV is synchronous — returning plain values is
 * valid and skips a microtask on the hot path.
 */
export const sessionStorage: SessionStorage = {
  getItem: (key) => authStore().getString(key) ?? null,
  setItem: (key, value) => authStore().set(key, value),
  removeItem: (key) => authStore().delete(key),
}

// ── app storage ─────────────────────────────────────────────────────────────

/**
 * A shape check for something that came off disk.
 *
 * `unknown` in, boolean out — deliberately not a `value is T` predicate, because the
 * useful ones here are partial ("an object whose values are all numbers") and claiming
 * to prove `T` would be the same unchecked assertion one level further from the read.
 */
export type Shape = (value: unknown) => boolean

/**
 * Is this a plain object we can index?
 *
 * `typeof x === 'object'` is true of `null` and of every array, and both reach code that
 * expects to write a key. `recordLessonCompleted` did exactly that — `log[day] = ...`
 * against a number is a TypeError in a module, which modules always are.
 */
export const isRecord: Shape = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** An object whose every value is a finite number. The shape of every day-count log. */
export const isNumberRecord: Shape = (value) =>
  isRecord(value) &&
  Object.values(value as Record<string, unknown>).every(
    (n) => typeof n === 'number' && Number.isFinite(n),
  )

export const isNumberArray: Shape = (value) =>
  Array.isArray(value) && value.every((n) => typeof n === 'number' && Number.isFinite(n))

export const isFiniteNumber: Shape = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Reads, parses and — given a shape — checks before handing the value over.
 *
 * ## Why the shape argument exists
 *
 * Every caller here used to cast: `readJson<SyncQueue>(...)`, `readJson<Record<string,
 * number>>(...)`. `JSON.parse` guarantees the bytes are JSON and nothing else, so a value
 * written by an older build, edited on a rooted device, or truncated by a full disk
 * arrives as a lie with a type annotation on it. The failures are not theoretical:
 * spreading a non-array throws, indexing `undefined` throws, and assigning a key to a
 * number throws — and the two worst sites are the sync queue, which throws at the end of
 * every lesson, and the quest log, which throws while rendering Home.
 *
 * ## Why a failed shape DELETES
 *
 * Same rule the parse failure already followed, for the same reason: an entry this build
 * cannot use is not going to become usable, and keeping it means re-reading the same bad
 * value on every launch for ever. Dropping it costs the user a cache and restores a
 * working app. This is the one direction persistence may lose something, and it is
 * bounded to values nothing could have read anyway.
 */
export const readJson = <T>(key: string, shape?: Shape): T | null => {
  const raw = appStore().getString(key)
  if (raw === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // A corrupt cache entry is not worth crashing over. Drop it and refetch.
    appStore().delete(key)
    return null
  }
  if (shape !== undefined && !shape(parsed)) {
    appStore().delete(key)
    return null
  }
  return parsed as T
}

/**
 * Reads without repairing — for callers that read during a React render.
 *
 * `readJson` deletes an entry it cannot parse, which is right on a normal code path and
 * wrong inside a render: React is explicitly allowed to throw a render away and run it
 * again, so a delete from in there is a side effect nobody asked for and StrictMode will
 * perform twice. `useDailyGoal` reads its stored target during render by design, and was
 * therefore mutating storage on the one input it cannot control — a corrupt entry.
 *
 * `corrupt` is reported rather than swallowed so the caller can repair it where repairs
 * belong: in an effect, after the render has committed.
 */
export const peekJson = <T>(key: string, shape?: Shape): { value: T | null; corrupt: boolean } => {
  const raw = appStore().getString(key)
  if (raw === undefined) return { value: null, corrupt: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { value: null, corrupt: true }
  }
  // A wrong shape is reported exactly as unparseable JSON is: this function's whole
  // contract is that it repairs nothing, so the caller's effect does it.
  if (shape !== undefined && !shape(parsed)) return { value: null, corrupt: true }
  return { value: parsed as T, corrupt: false }
}

export const writeJson = (key: string, value: unknown): void =>
  appStore().set(key, JSON.stringify(value))

export const remove = (key: string): void => appStore().delete(key)

/**
 * Wipes everything. Used by "delete my account" and by sign-out.
 *
 * Both stores, not just one — leaving cached progress behind after a sign-out means
 * the next user on a shared family device sees someone else's streak.
 */
export function clearAll(): void {
  authStore().clearAll()
  appStore().clearAll()
}
