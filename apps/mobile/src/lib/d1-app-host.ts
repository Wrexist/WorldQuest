/**
 * The D1 account host, connected to the app's real storage scopes.
 *
 * `createD1AccountHost` sequences an identity change (marker → pause → server → open)
 * but leaves what "pause", "open" and "erase" MEAN to its caller; the native proof app
 * passed no-ops. Here they are the same moves the legacy path makes:
 *
 * · pause — mark the transition (a crash mid-change must not reopen the old cache),
 *   move storage to a fresh guest scope so every captured read/write of the previous
 *   owner goes stale, and forget the memoised identity.
 * · open — adopt the owner the server now says this device holds, and clear the mark.
 * · erase — delete that owner's local data after the server confirmed deletion.
 *
 * The host's own namespace string encodes `[endpoint, owner]`; the owner is read back
 * out of it rather than trusted from anywhere else.
 */

import { MMKV } from 'react-native-mmkv'
import { createD1AccountHost } from './d1-account-host.js'
import { createD1AccountClient } from './d1-auth.js'
import { backendConfig } from './backendConfig.js'
import { beginStorageTransition, eraseAccountStorage, finishStorageTransition, startGuestStorage } from './storage.js'
import { acceptSignedInAccount, detachSession } from './supabase.js'

let marker: MMKV | undefined
const markerStore = (): MMKV => (marker ??= new MMKV({ id: 'worldquest.d1-account' }))

/** `d1.data.v1.<encodeURIComponent(JSON.stringify([endpoint, owner]))>.` → owner. */
export function ownerOf(namespace: string): string {
  const match = /^d1\.data\.v1\.(.+)\.$/.exec(namespace)
  const decoded: unknown = match ? JSON.parse(decodeURIComponent(match[1]!)) : null
  if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[1] !== 'string' || decoded[1] === '') {
    throw new Error('Invalid D1 namespace')
  }
  return decoded[1]
}

let host: ReturnType<typeof createD1AccountHost> | undefined

export function appD1Host(): ReturnType<typeof createD1AccountHost> {
  const baseURL = backendConfig().url
  return (host ??= createD1AccountHost({
    baseURL,
    client: () => createD1AccountClient(baseURL),
    store: {
      get: (key) => markerStore().getString(key) ?? null,
      set: (key, value) => markerStore().set(key, value),
      remove: (key) => markerStore().delete(key),
    },
    stopLearning: async () => {
      beginStorageTransition()
      startGuestStorage()
      detachSession()
    },
    activateOwner: async (namespace) => {
      acceptSignedInAccount(ownerOf(namespace))
      finishStorageTransition()
    },
    eraseOwner: async (namespace) => {
      eraseAccountStorage(ownerOf(namespace))
    },
  }))
}
