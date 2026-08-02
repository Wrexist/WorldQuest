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

import { useEffect } from 'react'
import { Stack, router, usePathname } from 'expo-router'
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { colors, motion } from '@worldquest/design'
import { ErrorBoundary } from '../src/components/ErrorBoundary.js'
import { readOnboarding } from '../src/features/onboarding/useOnboarding.js'
import { SplashScreen, useSplashPhase } from '../src/features/splash/SplashScreen.js'
import { useReturnVisit } from '../src/features/welcome/useReturnVisit.js'
import { useAppFonts } from '../src/lib/fonts.js'
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

export default function RootLayout() {
  const fontsReady = useAppFonts()
  const phase = useSplashPhase(fontsReady)
  useDeviceLocale()
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
