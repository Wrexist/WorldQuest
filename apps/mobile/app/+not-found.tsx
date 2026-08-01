/**
 * H9 — a deep link that leads nowhere.
 *
 * expo-router renders this for any route it cannot match. Without it the user gets a
 * blank screen with no way back, which is the worst possible outcome for a link
 * someone shared with them.
 *
 * Reachable in practice: a notification for a country we removed from a pack, a link
 * from an older version, or a typo in a shared URL.
 */

import { router } from 'expo-router'
import { FailureState } from '../src/components/FailureState.js'

export default function NotFoundRoute() {
  return (
    <FailureState
      titleKey="errors:notFound.title"
      bodyKey="errors:notFound.body"
      ctaKey="errors:notFound.cta"
      onPress={() => router.replace('/')}
    />
  )
}
