import React from 'react'
import { createRoot } from 'react-dom/client'
import { View } from 'react-native'
import { setAppearance, setAppReducedMotion } from '@worldquest/design'
import { setLocale } from '@worldquest/i18n'
import { PaywallScreen } from '../../apps/mobile/src/features/paywall/PaywallScreen.js'
import { SAMPLE_PLANS } from '../../apps/mobile/src/features/paywall/purchases.js'
const params = new URLSearchParams(location.search)
setAppearance(params.get('theme') === 'dark' ? 'dark' : 'light')
setAppReducedMotion(params.has('reduced'))
await setLocale(params.get('locale') === 'sv' ? 'sv' : 'en')
const state = params.get('state') ?? 'content'
const plans = ['empty','error','offline','loading'].includes(state) ? [] : SAMPLE_PLANS.map(p => ({ ...p, trialEligible: state !== 'purchase', trialDays: Number(params.get('days') ?? 7) }))
createRoot(document.getElementById('root')!).render(<View style={{ flex: 1 }}>
  <PaywallScreen isChild={state === 'child'} source="settings" countries={[]} plans={plans}
    plansLoading={state === 'loading'} plansFailed={state === 'error'} isOffline={state === 'offline'}
    onRetryPlans={() => location.assign('?state=content')} onDismiss={() => { document.body.dataset.dismissed = 'true' }}
    onPurchase={async () => ({ kind: 'cancelled' })} onRestore={async () => ({ kind: 'cancelled' })} />
</View>)
// The URL option is confined to this local review harness.
if (params.get('text') === '2') {
  const measured = new WeakSet<HTMLElement>()
  const enlarge = () => {
    const nodes = [...document.querySelectorAll<HTMLElement>('[dir="auto"]')].filter(node => !measured.has(node))
    const sizes = nodes.map(node => { const css = getComputedStyle(node); return [parseFloat(css.fontSize), parseFloat(css.lineHeight)] })
    nodes.forEach((node, i) => { measured.add(node); node.style.fontSize = sizes[i]![0]! * 2 + 'px'; node.style.lineHeight = sizes[i]![1]! * 2 + 'px' })
  }
  new MutationObserver(enlarge).observe(document.getElementById('root')!, { childList:true, subtree:true })
  requestAnimationFrame(enlarge)
}
