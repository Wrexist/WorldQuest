// CI entry point only. No fixture mailbox or seed route exists in the production Worker.
import React, { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Linking, Platform, Text, View } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as SplashScreen from 'expo-splash-screen'
import { createD1AuthClient } from '../../packages/api/src/d1-auth'
import { createSessionStorage, clearSessionStorage } from '../../apps/mobile/src/lib/credentials'

const baseURL = Platform.OS === 'android' ? 'http://10.0.2.2:8789' : 'http://127.0.0.1:8789'
const email = 'native-proof@example.invalid'
const proof = new MMKV({ id: 'worldquest.account-proof' })
const client = () => createD1AuthClient({ baseURL, storage: createSessionStorage(), clearCredentials: clearSessionStorage, fetch })
const check = (ok: boolean, message: string): void => { if (!ok) throw new Error(message) }
const code = async (): Promise<string> => (await (await fetch(baseURL + '/__proof/mailbox')).json()).code
async function run(): Promise<string> {
  const url = await Linking.getInitialURL()
  if (url?.includes('reinstall')) {
    const a = client()
    check(await a.restore() === null, 'reinstall adopted previous credentials')
    await a.startGuest(); await a.recordAudience(2000)
    await a.requestEmail(email, 'login', 'en')
    const restored = await a.verifyEmail(await code())
    check('token' in restored, 'recovery did not return a session')
    const account = await a.account()
    const fixture = await (await fetch(baseURL + '/__proof/state')).json()
    check(account.userId === fixture.originalOwner && account.xp === 42, 'reinstall recovery lost progress')
    await a.requestEmail(email, 'delete', 'en')
    check('deleted' in await a.verifyEmail(await code()), 'deletion not confirmed')
    check(await client().restore() === null, 'deletion retained credentials')
    const deleted = await (await fetch(baseURL + '/__proof/state')).json()
    check(deleted.remaining === null && deleted.identities === 0, 'deletion retained identity or progress')
    return 'PASS_RECOVERY_AND_DELETION'
  }
  const stage = proof.getString('stage')
  if (!stage) {
    const protectedClient = client()
    await protectedClient.startGuest(); await protectedClient.recordAudience(2016)
    let refused = false
    try { await protectedClient.requestEmail(email, 'link', 'en') } catch { refused = true }
    check(refused, 'protected user requested email')
    await protectedClient.deleteGuest()
    const a = client(), guest = await a.startGuest()
    await a.recordAudience(2000)
    await fetch(baseURL + '/__proof/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: guest.userId }) })
    await a.requestEmail(email, 'link', 'sv')
    proof.set('owner', guest.userId); proof.set('stage', 'verification')
    return 'PASS_READY_EMAIL_RESTART'
  }
  if (stage === 'verification') {
    const a = client()
    check((await a.pending())?.purpose === 'link', 'restart lost pending verification')
    const linked = await a.verifyEmail(await code())
    check('userId' in linked && linked.userId === proof.getString('owner'), 'link changed progress owner')
    check((await a.account()).xp === 42, 'link lost progress')
    await a.signOut()
    const b = client(); await b.startGuest(); await b.recordAudience(2000)
    await b.requestEmail(email, 'login', 'en'); await b.verifyEmail(await code())
    check((await b.account()).userId === proof.getString('owner'), 'login changed owner')
    proof.set('stage', 'reinstall')
    return 'PASS_RECOVERY_READY_REINSTALL'
  }
  return 'READY_REINSTALL'
}
function Probe() {
  const [result, setResult] = useState('RUNNING')
  useEffect(() => { void run().then(setResult, error => setResult('FAIL_ACCOUNT_PROOF: ' + (error instanceof Error ? error.message : 'unknown'))) }, [])
  return <View onLayout={() => { void SplashScreen.hideAsync() }} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#ffffff' }}>
    <Text accessible accessibilityLabel={result} style={{ color: '#000000', fontSize: 18 }}>{result}</Text>
  </View>
}
registerRootComponent(Probe)
