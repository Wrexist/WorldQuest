/**
 * `/grown-up?link=privacy` or `?to=account` — the grown-up gate in front of a child's
 * way out of the app (`GrownUpGate`).
 *
 * Destinations are NAMED, never passed: a link is looked up in the app's own list and a
 * route is one of a fixed few, so this screen cannot be pointed at an arbitrary address
 * by a deep link, which a gate that opened whatever it was given would be.
 */

import { router, useLocalSearchParams } from 'expo-router'
import { openURL } from 'expo-linking'
import { GrownUpGate } from '../src/features/settings/GrownUpGate.js'
import { LICENCES_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../src/lib/links.js'

const LINKS: Readonly<Record<string, string | undefined>> = {
  privacy: PRIVACY_URL,
  terms: TERMS_URL,
  licences: LICENCES_URL,
  support: SUPPORT_URL,
}
const ROUTES: Readonly<Record<string, '/account'>> = { account: '/account' }

export default function GrownUpRoute() {
  const params = useLocalSearchParams<{ link?: string; to?: string }>()
  const leave = (): void => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }
  const link = params.link === undefined ? undefined : LINKS[params.link]
  const route = params.to === undefined ? undefined : ROUTES[params.to]

  return (
    <GrownUpGate
      onCancel={leave}
      onPass={() => {
        if (route !== undefined) {
          router.replace(route)
          return
        }
        if (link !== undefined) void openURL(link)
        leave()
      }}
    />
  )
}
