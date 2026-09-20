// Isolated native acceptance entry: real screens, OS vault and local synthetic D1.
import React, { useState } from 'react'
import { Platform, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { MMKV } from 'react-native-mmkv'
import { colors } from '../../packages/design/src/index'
import { createD1AccountClient } from '../../apps/mobile/src/lib/d1-auth'
import { createD1AccountHost } from '../../apps/mobile/src/lib/d1-account-host'
import { useAppFonts } from '../../apps/mobile/src/lib/fonts'
import { useD1Account } from '../../apps/mobile/src/features/account/useD1Account'
import { D1AccountScreen } from '../../apps/mobile/src/features/account/D1AccountScreen'

const baseURL = Platform.OS === 'android' ? 'http://10.0.2.2:8789' : 'http://127.0.0.1:8789'
const store = new MMKV({ id: 'worldquest.account-ui-proof' })
const client = () => createD1AccountClient(baseURL)
// The vault cannot be made to fail from a test, and the production client must not
// grow a test-only storage seam, so this fixture asks the proof server to arm one
// failure of its own erase step. That is the interruption the roadmap asks about:
// the account is already erased on the server while this device still holds it.
async function eraseFailureArmed(): Promise<boolean> {
  try {
    const response = await fetch(baseURL + '/__proof/cleanup-failure')
    return (await response.json() as { armed?: boolean }).armed === true
  } catch { return false }
}
const host = createD1AccountHost({ baseURL, client,
  store: { get: key => store.getString(key) ?? null, set: (key, value) => store.set(key, value), remove: key => store.delete(key) },
  stopLearning: async () => {}, activateOwner: async () => {},
  eraseOwner: async prefix => {
    if (await eraseFailureArmed()) throw new Error('Synthetic device cleanup failure')
    store.getAllKeys().filter(key => key.startsWith(prefix)).forEach(key => store.delete(key))
  },
})
function Flow({ remount }: { remount: () => void }) {
  const flow = useD1Account(client(), host, 'en', true)
  return <D1AccountScreen flow={flow} online={true} onBack={remount} onDone={remount} onSupport={remount} />
}
export function NativeAccountUI() {
  const ready = useAppFonts(), [generation, setGeneration] = useState(0)
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
    {ready ? <Flow key={generation} remount={() => setGeneration(value => value + 1)} /> : <View />}
  </SafeAreaView></SafeAreaProvider>
}
