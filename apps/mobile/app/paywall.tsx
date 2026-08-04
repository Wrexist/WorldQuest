/**
 * The paywall route — storage, store prices and navigation only.
 *
 * `/paywall` is its own route rather than a modal inside the lesson, for two reasons
 * that both cost money to get wrong:
 *
 * - The lesson can hand off to it and unmount. Whatever the user decides here, they
 *   are not standing on top of a finished lesson's state machine while deciding.
 * - Settings, the hearts fork and (later) a win-back notification all need the same
 *   destination. A paywall that only exists inside onboarding is a paywall that can be
 *   shown exactly once, to the least-convinced version of the user there will ever be.
 *
 * `?source=` is analytics only and never changes what is shown. `?countries=` is what
 * the taster lesson just covered, so page 1 can talk about what the user did.
 *
 * Spec: docs/systems/monetization.md
 */

import { StyleSheet, View } from 'react-native'
import { colors } from '@worldquest/design'
import { router, useLocalSearchParams } from 'expo-router'
import {
  PaywallScreen,
  type PaywallCountry,
} from '../src/features/paywall/PaywallScreen.js'
import { useContent } from '../src/lib/content.js'
import { currentLocale } from '../src/lib/i18n.js'
import { usePurchases } from '../src/features/paywall/usePurchases.js'
import { useEntitlement } from '../src/features/paywall/useEntitlement.js'
import { useOnboarding } from '../src/features/onboarding/useOnboarding.js'
import { useOnline } from '../src/lib/connectivity.js'
import { track } from '../src/lib/analytics.js'

const SOURCES = ['onboarding', 'hearts', 'settings', 'stats'] as const
type Source = (typeof SOURCES)[number]

const sourceOf = (raw: string | undefined): Source =>
  SOURCES.find((s) => s === raw) ?? 'settings'

export default function PaywallRoute() {
  const { source, countries } = useLocalSearchParams<{
    source?: string
    countries?: string
  }>()
  // From device storage, decided at onboarding and never recomputed from a birthday
  // (see useOnboarding). An under-13 gets the parental gate instead of the offer —
  // read here so a new entry point cannot forget to pass it.
  const { state } = useOnboarding()
  const purchases = usePurchases()
  const entitlement = useEntitlement()
  const online = useOnline()
  // Already in memory — the lesson the user just finished loaded it. Names and flags
  // are pack data, so the route resolves them and the screen only draws.
  const { index, status } = useContent()

  const from = sourceOf(source)

  /**
   * Ids in, countries out. Anything the pack does not recognise is dropped rather
   * than rendered as a blank tile: the ids come off a URL, and a paywall headline
   * that counts a typo is a paywall headline that lies.
   */
  const learned: readonly PaywallCountry[] = (countries ?? '')
    .split(',')
    .filter((id) => id.length > 0)
    .flatMap((id): PaywallCountry[] => {
      const entity = index?.index.entities.get(id)
      if (entity === undefined) return []
      return [
        {
          id,
          // A country name is a fact from the pack, never a translated string.
          name: entity.names?.[currentLocale()] ?? entity.names?.['en'] ?? id,
          flagPath: entity.assets?.['flag']?.path,
        },
      ]
    })

  const dismiss = (): void => {
    track('paywall_dismissed', { source: from })
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  /**
   * Held back only for the hand-off, and only until the pack is readable.
   *
   * `PaywallScreen` picks its opening page once, on mount, from whether there are
   * countries to name. Mounting it mid-load would have it decide "nothing to say",
   * skip to the price list, and stay there after the flags arrived — the value moment
   * lost to a race. Everywhere else the prices do not depend on content at all, and a
   * spinner in front of them would be a wait for nothing.
   */
  if (from === 'onboarding' && status === 'loading') return <View style={styles.wait} />

  return (
    <PaywallScreen
      isChild={state.isChild === true}
      plans={purchases.plans}
      plansLoading={purchases.loading}
      plansFailed={purchases.failed}
      isOffline={!online}
      onRetryPlans={purchases.reload}
      trialOnRecord={entitlement.trialAvailable}
      countries={learned}
      onPurchase={purchases.purchase}
      onRestore={purchases.restore}
      onDismiss={dismiss}
      source={from}
    />
  )
}

const styles = StyleSheet.create({
  // Deliberately blank rather than a skeleton. This is the hand-off frame between a
  // lesson summary and the paywall, measured in a frame or two off a warm cache; a
  // skeleton flashing in that gap draws attention to a wait that is not happening.
  wait: { flex: 1, backgroundColor: colors.bg.canvas },
})
