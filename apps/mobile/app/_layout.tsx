/**
 * The root layout — every route in the app renders inside this.
 *
 * It owns exactly three things: the window background, the status bar, and the stack
 * that separates the tabbed app from the full-screen lesson. Providers (query client,
 * i18n, session) land here as they arrive; nothing else belongs in this file.
 *
 * The lesson is a sibling of the tabs rather than a screen inside them. That is a
 * product decision, not a routing detail: a lesson takes over the screen, and the tab
 * bar staying visible would invite the user to leave halfway through.
 */

import { useEffect, useRef } from 'react'
import { Stack, router, usePathname } from 'expo-router'
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { colors, motion } from '@worldquest/design'
import { ErrorBoundary } from '../src/components/ErrorBoundary.js'
import { readOnboarding } from '../src/features/onboarding/useOnboarding.js'
import { SplashScreen, useSplashPhase } from '../src/features/splash/SplashScreen.js'
import { useReturnVisit } from '../src/features/welcome/useReturnVisit.js'
import { useAppFonts } from '../src/lib/fonts.js'
import { setChildAccount, track } from '../src/lib/analytics.js'
import { t } from '../src/lib/i18n.js'
import { useDeviceLocale } from '../src/lib/locale.js'
import { QueryProvider } from '../src/lib/query.js'

/**
 * Sends a first-time user to onboarding, once.
 *
 * `replace`, never `push`: onboarding is not somewhere you go back from, and leaving
 * Home underneath it means the back gesture lands on a Home the user has not earned
 * yet — with no streak, no progress, and no idea what the app is.
 *
 * Reading storage synchronously is what makes this a redirect rather than a flash of
 * Home. It is also why the age answer is on device (see useOnboarding): the child
 * branch has to be decided before the first frame, not after a round trip.
 */
function useOnboardingGate(ready: boolean): void {
  const pathname = usePathname()

  useEffect(() => {
    if (!ready) return
    if (pathname.startsWith('/onboarding')) return
    if (readOnboarding().completed) return
    router.replace('/onboarding')
  }, [ready, pathname])
}

/**
 * Sends a returning user to the welcome-back screen, once per return.
 *
 * Ordered AFTER the onboarding gate deliberately: a first-time user has never been
 * away, and greeting them "back" would be the app's first lie. `useReturnVisit`
 * already refuses to fire without prior activity, so this is belt and braces on the
 * one screen where getting it wrong is most obvious.
 */
function useReturnGate(ready: boolean, onboarded: boolean): void {
  const pathname = usePathname()
  const { daysAway } = useReturnVisit()

  useEffect(() => {
    if (!ready || !onboarded) return
    if (daysAway === null) return
    if (pathname.startsWith('/welcome-back') || pathname.startsWith('/onboarding')) return
    router.replace('/welcome-back')
  }, [ready, onboarded, daysAway, pathname])
}

/**
 * Tells analytics who it is talking to, before anything can track.
 *
 * Read synchronously from device storage for the same reason the age answer lives
 * there: this decision has to be correct on the very first frame, and a flag we have
 * to wait for is a window in which a child is treated as an adult.
 *
 * `isChild` is undefined until the age gate is answered, and that stays unknown rather
 * than becoming `false` — `track` treats unknown as a child, because unknown is not
 * permission.
 */
function useAnalyticsAudience(): void {
  const { completed, isChild } = readOnboarding()
  useEffect(() => {
    if (completed && isChild !== undefined) setChildAccount(isChild)
  }, [completed, isChild])
}

/**
 * One `screen_viewed` per navigation, and none on a redirect.
 *
 * `usePathname` fires for every route change including the gates above, so a first
 * launch would otherwise record Home → onboarding as two screens the user "viewed"
 * when they saw one. Recording the previous path as `from` is what makes the event
 * worth having: a list of screens is a popularity contest, and a list of transitions
 * is a map of how people actually move.
 *
 * Sampled at 1.0 in the registry, which is deliberate — this is the event every funnel
 * is built from, and a sampled funnel is a funnel nobody trusts.
 */
function useScreenViews(ready: boolean): void {
  const pathname = usePathname()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (previous.current === pathname) return
    const from = previous.current
    previous.current = pathname
    track('screen_viewed', { screen: pathname, ...(from !== null ? { from } : {}) })
  }, [ready, pathname])
}

/**
 * One `app_opened` per launch.
 *
 * `from: 'icon'` because at this layer we genuinely do not know: a push or a deep link
 * would have to tell us, and neither exists yet. Recording the honest default beats
 * inventing an attribution that a funnel would then be built on.
 */
function useAppOpened(): void {
  useEffect(() => {
    track('app_opened', { is_cold_start: true, from: 'icon' })
  }, [])
}

export default function RootLayout() {
  const fontsReady = useAppFonts()
  useAnalyticsAudience()
  useAppOpened()
  const phase = useSplashPhase(fontsReady)
  useDeviceLocale()
  useScreenViews(fontsReady)
  useOnboardingGate(fontsReady)
  useReturnGate(fontsReady, readOnboarding().completed)

  // Rendering the app before the fonts land means laying out in the system font and
  // jumping when Baloo 2 arrives — its metrics are nothing like the fallback's.
  //
  // This used to be `return null`. On device the native splash covers that, so it
  // looked fine; on web and on a slow cold start it is a blank dark rectangle with no
  // way to tell a slow boot from a dead one. Our own splash renders here instead, in
  // the system font on purpose — the whole reason we are still waiting is that the
  // real one has not arrived, and one screen in the fallback face is a far smaller
  // problem than an unexplained void.
  if (!fontsReady) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg.canvas} />
        <SplashScreen
          phase={phase}
          // Fonts are the only boot work today and `useFonts` has no retry, so the
          // honest retry is a full reload. `onRetry` stays undefined until there is
          // something a button could actually re-attempt; a button that does nothing
          // is worse than no button.
          onRetry={undefined}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.canvas} />
      <ErrorBoundary>
        <QueryProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg.canvas },
              animationDuration: motion.quick.duration,
            }}
          >
            <Stack.Screen name="(tabs)" />
            {/* No back gesture: onboarding is a one-way flow, and swiping out of the
                age gate would leave the app not knowing whether it is talking to a
                child. The only ways forward are the buttons. */}
            <Stack.Screen name="(auth)/onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="region/[code]" />
            <Stack.Screen name="country/[code]" />
            <Stack.Screen name="collection/[kind]" />
            <Stack.Screen name="achievements" />
            <Stack.Screen name="streak" />
            <Stack.Screen name="welcome-back" options={{ gestureEnabled: false }} />
            <Stack.Screen
              name="lesson"
              options={{
                // Full screen, not a card: the lesson is the whole experience while it
                // runs, and a card presentation leaves a strip of Home visible behind it.
                presentation: 'fullScreenModal',
                title: t('nav:lesson.title'),
                // Swiping down mid-question would discard answers the user has earned.
                // Leaving is deliberate — the in-screen exit control, which confirms.
                gestureEnabled: false,
              }}
            />
          </Stack>
        </QueryProvider>
      </ErrorBoundary>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas },
})
