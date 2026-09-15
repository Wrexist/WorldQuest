// Browser fixture only: synthetic credentials in localStorage are NEVER a native vault.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { View } from 'react-native'
import { colors } from '@worldquest/design'
import { createD1AuthClient } from '../../packages/api/src/d1-auth'
import { setLocale } from '@worldquest/i18n'
import { useD1Account } from '../../apps/mobile/src/features/account/useD1Account'
import { D1AccountScreen } from '../../apps/mobile/src/features/account/D1AccountScreen'
import { createD1AccountHost } from '../../apps/mobile/src/lib/d1-account-host'

const locale = new URL(location.href).searchParams.get('locale') === 'sv' ? 'sv' : 'en'
let active: ReturnType<typeof createD1AuthClient> | null = null
const client = (): ReturnType<typeof createD1AuthClient> => active ??= createD1AuthClient({ baseURL: location.origin,
  storage: { getItem: async key => localStorage.getItem('proof.' + key), setItem: async (key, value) => localStorage.setItem('proof.' + key, value), removeItem: async key => localStorage.removeItem('proof.' + key) },
  clearCredentials: async () => { localStorage.removeItem('proof.d1.auth.state.v1'); active = null }, fetch,
})
const host = createD1AccountHost({ baseURL: location.origin, client,
  store: { get: key => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value), remove: key => localStorage.removeItem(key) },
  stopLearning: async () => {}, activateOwner: async () => {},
  eraseOwner: async prefix => { Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key)) },
})
function App() {
  const flow = useD1Account(client(), host, locale, navigator.onLine)
  return <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.bg.canvas }}>
    <D1AccountScreen flow={flow} online={navigator.onLine} onBack={() => location.reload()} onDone={() => location.reload()} onSupport={() => {}} />
  </View>
}
void setLocale(locale).then(() => createRoot(document.getElementById('root')!).render(<App />))
