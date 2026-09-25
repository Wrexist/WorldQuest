/**
 * The account route — `?mode=link` to save this device's progress, `?mode=signIn` to
 * come back to an account that already exists.
 *
 * A query param rather than two routes, for the same reason `/lesson?taster=1` is one:
 * it is one flow with one state machine, and the sign-in warning can switch the user
 * from one to the other mid-screen without a navigation.
 */

import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { openURL } from 'expo-linking'
import { AccountScreen, type AccountMode } from '../../src/features/account/AccountScreen.js'
import { D1AccountScreen } from '../../src/features/account/D1AccountScreen.js'
import { useD1Account } from '../../src/features/account/useD1Account.js'
import { appD1Host } from '../../src/lib/d1-app-host.js'
import { createD1AccountClient } from '../../src/lib/d1-auth.js'
import { backendConfig } from '../../src/lib/backendConfig.js'
import { isD1 } from '../../src/lib/backendConfig.js'
import { SUPPORT_URL } from '../../src/lib/links.js'
import { currentLocale } from '../../src/lib/i18n.js'
import { useAccount } from '../../src/features/account/useAccount.js'
import { useProgress } from '../../src/features/home/useProgress.js'
import { finishOnboardingBySignIn } from '../../src/features/onboarding/useOnboarding.js'
import { useOnline } from '../../src/lib/connectivity.js'

/**
 * The D1 account flow: link, sign in, recover and delete, against the Worker.
 *
 * Its own screen rather than a mode of the legacy one, because the protocol differs
 * (eight-digit codes, challenge ids, resend cooldowns, fresh proof before deletion) and
 * the host quarantines this device's learning work around every identity change.
 * Deletion is permanent and in-app, which is what guideline 5.1.1(v) asks for.
 */
function D1AccountRoute() {
  const params = useLocalSearchParams<{ mode?: string }>()
  const queryClient = useQueryClient()
  const online = useOnline()
  const flow = useD1Account(createD1AccountClient(backendConfig().url), appD1Host(), currentLocale() === 'sv' ? 'sv' : 'en', online,
    params.mode === 'signIn' ? 'signIn' : undefined)
  const leave = (): void => {
    // Whatever the screen was showing has been seen; it opens afresh next time.
    flow.acknowledge()
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }
  return (
    <D1AccountScreen
      flow={flow}
      online={online}
      onBack={leave}
      onSupport={SUPPORT_URL === undefined ? undefined : () => void openURL(SUPPORT_URL!)}
      onDone={() => {
        // Signed in on a phone that never finished onboarding: the account is the
        // answer to everything onboarding asks, so the app opens rather than asking again.
        if (flow.state.intent === 'login' && !flow.state.deleted) finishOnboardingBySignIn(flow.recordedBirthYear())
        // Every cached server number may belong to a different owner now.
        queryClient.clear()
        flow.acknowledge()
        router.replace('/')
      }}
    />
  )
}

export default function AccountRoute() {
  return isD1() ? <D1AccountRoute /> : <LegacyAccountRoute />
}

function LegacyAccountRoute() {
  const params = useLocalSearchParams<{ mode?: string }>()
  // Anything that is not the sign-in path is the link path. A router can be pointed at
  // this with no param at all, and "save your progress" is the safe reading of an
  // ambiguous one — it cannot lose anything, and signing in can.
  const mode: AccountMode = params.mode === 'signIn' ? 'signIn' : 'link'

  const account = useAccount(mode)
  const { data } = useProgress()
  const queryClient = useQueryClient()
  const online = useOnline()

  const leave = (): void => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  return (
    <AccountScreen
      mode={mode}
      stage={account.stage}
      loading={account.loading}
      {...(account.error !== undefined ? { error: account.error } : {})}
      // Only on the sign-in path, and only the streak — it is the number people care
      // about losing, and a warning that lists four figures is one nobody finishes.
      {...(mode === 'signIn' && data?.streak !== undefined ? { localStreak: data.streak } : {})}
      offline={!online}
      email={account.email}
      onEmail={account.setEmail}
      onSubmitEmail={account.submitEmail}
      code={account.code}
      onCode={account.setCode}
      onSubmitCode={account.submitCode}
      onChangeEmail={account.changeEmail}
      onBack={leave}
      onDone={() => {
        /**
         * Every server-backed number belongs to a different user now.
         *
         * On the sign-in path the session has been replaced, so the wallet, streak and
         * mastery in the query cache are the previous account's — and the cache is
         * PERSISTED, so without this they survive a restart and the user sees somebody
         * else's streak until each query happens to refetch. Clearing is the only
         * correct move; refetching would leave the stale values on screen in the
         * meantime.
         *
         * Cleared on the link path too, where it is merely unnecessary: the user id did
         * not change. One line that is always right beats a condition that is right
         * until somebody adds a third mode.
         */
        queryClient.clear()
        router.replace('/')
      }}
      // Switches the flow in place rather than navigating, so the address they have
      // already typed survives the change of mind.
      {...(mode === 'signIn'
        ? { onLinkInstead: () => router.setParams({ mode: 'link' }) }
        : {})}
    />
  )
}
