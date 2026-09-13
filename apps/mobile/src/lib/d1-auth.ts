import { getRandomBytesAsync } from 'expo-crypto'
import { createD1AuthClient, D1AuthError, type AuthFetch } from '@worldquest/api'
import { createSessionStorage, clearSessionStorage } from './credentials'

let active: { baseURL: string; client: ReturnType<typeof createD1AuthClient> } | null = null

/** One writer per vault generation. Enable with the complete D1 progress adapter. */
export function createD1AccountClient(baseURL: string, transport: AuthFetch = fetch) {
  if (active) {
    if (active.baseURL !== baseURL) throw new D1AuthError('ACCOUNT_ENDPOINT_CHANGED')
    return active.client
  }
  const client = createD1AuthClient({ baseURL, storage: createSessionStorage(), clearCredentials: async () => {
    await clearSessionStorage()
    active = null
  }, fetch: transport, randomBytes: () => getRandomBytesAsync(32) })
  active = { baseURL, client }
  return client
}
