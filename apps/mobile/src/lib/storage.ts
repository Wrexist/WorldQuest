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

export const readJson = <T>(key: string): T | null => {
  const raw = appStore().getString(key)
  if (raw === undefined) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // A corrupt cache entry is not worth crashing over. Drop it and refetch.
    appStore().delete(key)
    return null
  }
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
