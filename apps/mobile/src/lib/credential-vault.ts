import type { ProtectedStorage } from '@worldquest/api'

export type SecureValues = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  remove: (key: string) => Promise<void>
}
export type LegacyCredentials = {
  keys: () => string[]
  get: (key: string) => string | null
  remove: (key: string) => void
  clear: () => void
}
export type CredentialLifecycle = {
  isInstalled: () => boolean
  isClearing: () => boolean
  beginClear: () => void
  finishClear: () => void
  markInstalled: () => void
}

const INDEX = 'worldquest.credentials.v2.index'
const physicalKey = (key: string): string => {
  if (key.length === 0 || key.length > 200) throw new Error('Invalid credential key')
  // SecureStore accepts only alphanumeric characters, dots, hyphens and underscores.
  return 'worldquest.credentials.v2.' + Array.from(key).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('')
}

/** Serializes migration, auth writes and logout across every transport instance. */
export function createCredentialVault(secure: SecureValues, legacy: LegacyCredentials, lifecycle: CredentialLifecycle) {
  let tail: Promise<unknown> = Promise.resolve()
  let generation = 0
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work)
    tail = result.catch(() => {})
    return result
  }
  async function keys(): Promise<string[]> {
    const raw = await secure.get(INDEX)
    if (raw === null) return []
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error('Credential index unreadable') }
    if (!Array.isArray(value) || value.length > 16 || !value.every(k =>
      typeof k === 'string' && /^worldquest\.credentials\.v2\.[0-9a-f]+$/.test(k))) {
      throw new Error('Credential index unreadable')
    }
    return value as string[]
  }
  async function eraseProtected(): Promise<void> {
    const index = await keys()
    for (const key of index) await secure.remove(key)
    await secure.remove(INDEX)
  }
  async function ready(): Promise<void> {
    if (lifecycle.isClearing()) {
      legacy.clear()
      await eraseProtected()
      lifecycle.finishClear()
    }
    if (!lifecycle.isInstalled()) {
      // iOS Keychain can outlive uninstall. A new installation must not silently
      // adopt a previous installation's identity. Existing MMKV credentials are
      // retained only for the first upgrade migration.
      await eraseProtected()
      lifecycle.markInstalled()
    }
    // Migrate every credential, including a pending verification key that the SDK
    // may never request again. No weakly protected leftovers remain after success.
    for (const key of legacy.keys()) {
      const protectedValue = await secure.get(physicalKey(key))
      if (protectedValue !== null) { legacy.remove(key); continue }
      const value = legacy.get(key)
      if (value !== null) await write(key, value)
    }
  }
  async function write(key: string, value: string): Promise<void> {
    const storedKey = physicalKey(key)
    const index = await keys()
    if (!index.includes(storedKey)) {
      if (index.length === 16) throw new Error('Credential storage capacity exceeded')
      // Register first: even a crash before the value write leaves a removable entry.
      const updated = JSON.stringify([...index, storedKey])
      await secure.set(INDEX, updated)
      if (await secure.get(INDEX) !== updated) throw new Error('Credential index write not confirmed')
    }
    await secure.set(storedKey, value)
    if (await secure.get(storedKey) !== value) throw new Error('Credential write not confirmed')
    // Never discard the old credential until its protected replacement is readable.
    legacy.remove(key)
  }
  function open(): ProtectedStorage {
    const captured = generation
    const current = (): void => {
      if (captured !== generation) throw new Error('Credential storage session changed')
    }
    return {
      getItem: key => serialize(async () => {
        current()
        await ready()
        current()
        const value = await secure.get(physicalKey(key))
        if (value !== null) { legacy.remove(key); current(); return value }
        const previous = legacy.get(key)
        if (previous === null) return null
        await write(key, previous)
        current()
        return previous
      }),
      setItem: (key, value) => serialize(async () => {
        current(); await ready(); current(); await write(key, value); current()
      }),
      removeItem: key => serialize(async () => {
        current()
        await ready()
        current()
        // Removing the legacy copy first prevents a deleted login being re-imported.
        legacy.remove(key)
        await secure.remove(physicalKey(key))
      }),
    }
  }
  function clear(): Promise<void> {
    generation++ // Immediately invalidate delayed writes from the discarded auth SDK.
    try { lifecycle.beginClear() } catch { return Promise.reject(new Error('Credential logout could not be persisted')) }
    return serialize(async () => {
      await ready()
    })
  }
  return { open, clear }
}
