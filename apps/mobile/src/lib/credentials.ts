import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import { createCredentialVault, type SecureValues } from './credential-vault.js'

const options: SecureStore.SecureStoreOptions = {
  keychainService: 'com.wrexist.worldquest.credentials',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
}
// Browser previews deliberately keep credentials only for the current page lifetime.
const memory = new Map<string, string>()
const secure: SecureValues = Platform.OS === 'web' ? {
  get: async key => memory.get(key) ?? null,
  set: async (key, value) => { memory.set(key, value) },
  remove: async key => { memory.delete(key) },
} : {
  get: key => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: key => SecureStore.deleteItemAsync(key, options),
}

let legacy: MMKV | undefined
let metadata: MMKV | undefined
const metadataStore = (): MMKV => metadata ??= new MMKV({ id: 'worldquest.credentials.metadata' })
function legacyStore(): MMKV {
  // Read/delete only. This old shared key cannot protect a credential; new writes
  // go directly to Keychain/Keystore, never to an MMKV instance with a bundled key.
  return legacy ??= new MMKV({ id: 'worldquest.auth', encryptionKey: 'worldquest.session.v1' })
}
const vault = createCredentialVault(secure, {
  keys: () => Platform.OS === 'web' ? [] : legacyStore().getAllKeys(),
  get: key => Platform.OS === 'web' ? null : legacyStore().getString(key) ?? null,
  remove: key => { if (Platform.OS !== 'web') legacyStore().delete(key) },
  clear: () => { if (Platform.OS !== 'web') legacyStore().clearAll() },
}, {
  isInstalled: () => metadataStore().getString('installed') === 'v2',
  isClearing: () => metadataStore().getString('clearing') === 'yes',
  beginClear: () => { metadataStore().set('clearing', 'yes') },
  finishClear: () => { metadataStore().delete('clearing') },
  markInstalled: () => { metadataStore().set('installed', 'v2') },
})

/** Each auth client gets a handle that logout can invalidate permanently. */
export const createSessionStorage = vault.open
export const clearSessionStorage = vault.clear
