// Only reachable through the isolated CI package entry point, never the app router.
import React, { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Linking, Text, View } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as SecureStore from 'expo-secure-store'
import { createSessionStorage, clearSessionStorage } from '../../apps/mobile/src/lib/credentials'

const KEY = 'credential-proof.session'
const VALUE = JSON.stringify({ owner: 'synthetic-A', token: 'a'.repeat(5000) })
const RESTART_VALUE = JSON.stringify({ owner: 'synthetic-B', token: 'b'.repeat(5000) })
const proof = new MMKV({ id: 'worldquest.credential-proof' })
const check = (condition: boolean, label: string): void => { if (!condition) throw new Error(label) }

async function run(): Promise<string> {
  const url = await Linking.getInitialURL()
  if (url?.includes('reinstall')) {
    // On iOS, prove the fixture really survived in Keychain before our install
    // boundary clears the application's credential entries.
    const marker = await SecureStore.getItemAsync('proof.reinstall.marker')
    const store = createSessionStorage()
    check(await store.getItem(KEY) === null, 'reinstall adopted previous identity')
    await SecureStore.deleteItemAsync('proof.reinstall.marker')
    return marker === 'present' ? 'PASS_REINSTALL_KEYCHAIN_RETAINED' : 'PASS_REINSTALL_KEYCHAIN_EMPTY'
  }
  const stage = proof.getString('stage')
  if (stage === undefined) {
    const legacy = new MMKV({ id: 'worldquest.auth', encryptionKey: 'worldquest.session.v1' })
    legacy.set(KEY, VALUE)
    legacy.set('credential-proof.verifier', 'synthetic-verifier')
    const store = createSessionStorage()
    check(await store.getItem(KEY) === VALUE, 'migration value differs')
    check(legacy.getString(KEY) === undefined, 'legacy credential retained')
    check(legacy.getAllKeys().length === 0, 'unused legacy verifier retained')
    await store.setItem(KEY, RESTART_VALUE)
    proof.set('stage', 'restart')
    return 'PASS_MIGRATION_READY_RESTART'
  }
  if (stage === 'restart') {
    const old = createSessionStorage()
    check(await old.getItem(KEY) === RESTART_VALUE, 'restart lost credential')
    check(await old.getItem('credential-proof.verifier') === 'synthetic-verifier', 'restart lost verifier')
    await clearSessionStorage()
    let rejected = false
    try { await old.setItem(KEY, 'stale-A') } catch { rejected = true }
    check(rejected, 'discarded client restored credential')
    const fresh = createSessionStorage()
    check(await fresh.getItem(KEY) === null, 'logout retained credential')
    check(await fresh.getItem('credential-proof.verifier') === null, 'logout retained verifier')
    await fresh.setItem(KEY, 'synthetic-C')
    await SecureStore.setItemAsync('proof.reinstall.marker', 'present')
    proof.set('stage', 'reinstall')
    return 'PASS_LOGOUT_READY_REINSTALL'
  }
  return 'READY_REINSTALL'
}

function Probe() {
  const [result, setResult] = useState('RUNNING')
  useEffect(() => { void run().then(setResult, error => {
    // This binary holds synthetic fixtures only; expose the failing check for CI diagnosis.
    setResult('FAIL_CREDENTIAL_PROOF: ' + (error instanceof Error ? error.message : 'unknown'))
  }) }, [])
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
    <Text accessibilityLabel={result}>{result}</Text>
  </View>
}
registerRootComponent(Probe)
