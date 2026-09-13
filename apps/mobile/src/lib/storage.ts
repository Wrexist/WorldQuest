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

type Scope = { userId: string | null; guest: number }
const backendId = process.env.EXPO_PUBLIC_SUPABASE_URL || 'unconfigured'
const SCOPE_KEY = `account.scope.v2.${encodeURIComponent(backendId)}`
const TRANSITION_KEY = `account.transition.v2.${encodeURIComponent(backendId)}`
let scope: Scope | null = null
let generation = 0
let treeGeneration = 0
const scopeListeners = new Set<() => void>()

function activeScope(): Scope {
  if (scope) return scope
  try {
    const stored: unknown = appStore().getString(TRANSITION_KEY) === 'pending'
      ? null : JSON.parse(appStore().getString(SCOPE_KEY) ?? 'null')
    if (typeof stored === 'object' && stored !== null) {
      const value = stored as Partial<Scope>
      if ((value.userId === null || (typeof value.userId === 'string' && value.userId.length > 0)) &&
          Number.isSafeInteger(value.guest) && value.guest! >= 0) {
        return (scope = value as Scope)
      }
    }
  } catch { /* The legacy store remains intact for explicit recovery. */ }
  // An interrupted identity change must not reopen the old user's cache on launch.
  let guest = 0
  const keys = appStore().getAllKeys()
  while (keys.some((key) => key.startsWith(prefixOf({ userId: null, guest })))) guest++
  scope = { userId: null, guest }
  appStore().set(SCOPE_KEY, JSON.stringify(scope))
  return scope
}

const prefixOf = (value: Scope): string =>
  `account.data.v2.${encodeURIComponent(JSON.stringify([backendId, value.userId, value.userId === null ? value.guest : null]))}.`
const scopedKey = (key: string): string => prefixOf(activeScope()) + key

/** Bound reads/writes cannot follow a delayed request into a different account. */
export function captureStorage() {
  const captured = activeScope()
  const prefix = prefixOf(captured)
  const capturedGeneration = generation
  return {
    id: prefix,
    userId: captured.userId,
    backendId,
    isCurrent: () => generation === capturedGeneration,
    get: (key: string) => appStore().getString(prefix + key) ?? null,
    set: (key: string, value: string) => appStore().set(prefix + key, value),
    remove: (key: string) => appStore().delete(prefix + key),
  }
}

export const storageGeneration = (): number => generation
export const storageTreeGeneration = (): number => treeGeneration
export const onStorageScopeChange = (listener: () => void): (() => void) => {
  scopeListeners.add(listener)
  return () => scopeListeners.delete(listener)
}

function changeScope(next: Scope, preserveTree = false): void {
  // Persist before publishing the identity. A full disk must not acknowledge a switch.
  appStore().set(SCOPE_KEY, JSON.stringify(next))
  scope = next
  generation++
  if (!preserveTree) treeGeneration++
  for (const listener of scopeListeners) listener()
}

export function setStorageAccount(userId: string, adoptNewGuest = false): void {
  const previous = activeScope()
  if (previous.userId === userId) return
  const next = { userId, guest: previous.guest }
  if (adoptNewGuest && previous.userId === null) {
    const source = prefixOf(previous)
    const destination = prefixOf(next)
    // Only a newly created anonymous identity may adopt this device's guest work.
    // Legacy ownerless v1 records are deliberately outside these prefixes.
    for (const key of appStore().getAllKeys().filter((key) => key.startsWith(source))) {
      const value = appStore().getString(key)
      if (value === undefined) continue
      const target = destination + key.slice(source.length)
      const existing = appStore().getString(target)
      if (existing !== undefined && existing !== value) throw new Error('Guest adoption conflicts with account data')
      appStore().set(target, value)
    }
  }
  changeScope(next, adoptNewGuest && previous.userId === null)
}

/** Detached accounts keep their durable work; a fresh guest cannot read or send it. */
export function startGuestStorage(): void {
  let guest = activeScope().guest + 1
  const keys = appStore().getAllKeys()
  while (keys.some((key) => key.startsWith(prefixOf({ userId: null, guest })))) guest++
  changeScope({ userId: null, guest })
}

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
  const storedKey = scopedKey(key)
  const raw = appStore().getString(storedKey)
  if (raw === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // A corrupt cache entry is not worth crashing over. Drop it and refetch.
    appStore().delete(storedKey)
    return null
  }
  if (shape !== undefined && !shape(parsed)) {
    appStore().delete(storedKey)
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
  const raw = appStore().getString(scopedKey(key))
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
  appStore().set(scopedKey(key), JSON.stringify(value))

export const remove = (key: string): void => appStore().delete(scopedKey(key))

/** Explicit full local reset. Ordinary logout detaches accounts without deleting work. */
export function clearAll(): void {
  authStore().clearAll()
  appStore().clearAll()
  scope = null
  generation++
  treeGeneration++
  for (const listener of scopeListeners) listener()
}

export const clearSessionStorage = (): void => authStore().clearAll()
export const beginStorageTransition = (): void => appStore().set(TRANSITION_KEY, 'pending')
export const finishStorageTransition = (): void => appStore().delete(TRANSITION_KEY)
