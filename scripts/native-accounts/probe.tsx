// CI entry point only. No fixture mailbox or seed route exists in the production Worker.
import React, { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Linking, Platform, Text, View } from 'react-native'
import { MMKV } from 'react-native-mmkv'
import * as SplashScreen from 'expo-splash-screen'
import { createD1AccountClient } from '../../apps/mobile/src/lib/d1-auth'
import { createSessionStorage } from '../../apps/mobile/src/lib/credentials'

const baseURL = Platform.OS === 'android' ? 'http://10.0.2.2:8789' : 'http://127.0.0.1:8789'
const email = 'native-proof@example.invalid'
const proof = new MMKV({ id: 'worldquest.account-proof' })
let loseRenewalResponse = false
const client = () => createD1AccountClient(baseURL, async (url, init) => {
  const response = await fetch(url, init)
  if (url.endsWith('/renew') && loseRenewalResponse && response.ok) {
    await response.json(); loseRenewalResponse = false
    throw new Error('Synthetic lost renewal response')
  }
  return response
})
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
    // Age only this synthetic fixture. Both saved and server expiry use the same
    // value; renewal itself runs the actual app transport, OS RNG and vault.
    const aged = await (await fetch(baseURL + '/__proof/renewal-due', { method: 'POST',
      headers: { Authorization: `Bearer ${guest.token}` } })).json()
    const storage = createSessionStorage(), raw = await storage.getItem('d1.auth.state.v1')
    check(raw !== null, 'missing fixture credential')
    const state = JSON.parse(raw!)
    state.session.expiresAt = aged.expiresAt
    await storage.setItem('d1.auth.state.v1', JSON.stringify(state))
    loseRenewalResponse = true
    let interrupted = false
    try { await a.ensureSession() } catch (error) { interrupted = error instanceof Error && error.message === 'Synthetic lost renewal response' }
    check(interrupted && await a.sessionStatus() === 'renewal-pending', 'renewal did not preserve interrupted credentials')
    proof.set('owner', guest.userId); proof.set('stage', 'verification')
    return 'PASS_RENEWAL_READY_RESTART'
  }
  if (stage === 'verification') {
    const a = client()
    check(await a.sessionStatus() === 'renewal-pending', 'restart lost pending renewal')
    const renewed = await a.ensureSession()
    check(renewed.userId === proof.getString('owner') && await a.sessionStatus() === 'active', 'renewal changed owner or remained pending')
    check((await a.account()).xp === 42, 'renewal lost progress')
    check((await a.pending())?.purpose === 'link', 'restart lost pending verification')
    const linked = await a.verifyEmail(await code())
    check('userId' in linked && linked.userId === proof.getString('owner'), 'link changed progress owner')
    check((await a.account()).xp === 42, 'link lost progress')
    await a.signOut()
    const b = client(); await b.startGuest(); await b.recordAudience(2000)
    await b.requestEmail(email, 'login', 'en'); await b.verifyEmail(await code())
    // A retained callback from the discarded client must not erase this account.
    await a.signOut()
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
