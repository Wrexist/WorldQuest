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
import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { StatusBar, StyleSheet } from 'react-native'
/**
 * `SafeAreaView` from react-native-safe-area-context, NOT the one in react-native.
 *
 * The React Native component is legacy, iOS-only, and — the part that showed on screen —
 * it PAINTS. It carried `bg.canvas` and sat outside `ScreenBackground`, so the flat navy
 * of the status-bar inset met the top of the canvas gradient along a hard horizontal
 * line, about 44 pt down, on every screen in the app. It is visible in all five of the
 * TestFlight screenshots that started this work (docs/design/ios-native-audit.md, N3).
 *
 * The context version is transparent, knows the real insets on both platforms, and takes
 * `edges` — so the gradient can now run to the physical edges of the display while the
 * content stays clear of the notch and the home indicator, which is what iOS does with
 * every full-screen surface it draws.
 *
 * The package was already a dependency and had never been imported: `grep -r
 * useSafeAreaInsets apps/mobile` returned nothing.
 */
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { colors, layout, motion, ScreenBackground } from '@worldquest/design'
import { ErrorBoundary } from '../src/components/ErrorBoundary.js'
import { readOnboarding } from '../src/features/onboarding/useOnboarding.js'
import { SplashScreen, useSplashPhase } from '../src/features/splash/SplashScreen.js'
import { useReturnVisit } from '../src/features/welcome/useReturnVisit.js'
import { useSubscriptionSync } from '../src/features/paywall/useSubscriptionSync.js'
import { useAppFonts } from '../src/lib/fonts.js'
import { setChildAccount, track } from '../src/lib/analytics.js'
import { t } from '../src/lib/i18n.js'
import { useDeviceLocale } from '../src/lib/locale.js'
import { QueryProvider } from '../src/lib/query.js'
import { initCrashReporting } from '../src/lib/reporting.js'
import { isConfigured } from '../src/lib/supabase.js'
import { startFeatureFlagPolling } from '../src/lib/featureFlags.js'

/**
 * At module scope, deliberately — not in an effect.
 *
 * This module is evaluated before React renders anything, so a crash in the very
 * first render would be captured by whatever is behind `initCrashReporting`. An effect
 * runs after that first render, which is exactly the window where a bad font load or a
 * corrupt storage read takes the app down, and exactly the crash nobody would ever see
 * reported.
 *
 * Always a no-op as of 2026-08-09 — `@sentry/react-native` was removed to hold the
 * 4 MiB bundle budget (see lib/reporting.ts header). The call stays so re-adding a
 * transport later does not mean re-wiring this file.
 */
initCrashReporting()

/**
 * Also at module scope, and also never torn down — same shape as the `NetInfo`
 * subscription in `connectivity.ts`. This is a process-wide poll for the app's whole
 * life, not a component concern, so there is nothing to clean up until the process
 * exits. Guarded on `isConfigured()` so a fork with no Supabase project configured
 * does not spend a request every five minutes on a call that can only fail.
 */
if (isConfigured()) startFeatureFlagPolling()

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

/**
 * Pulls the server's subscription into the local entitlement cache, once per launch.
 *
 * A component rather than a call in `RootLayout`, because it must run INSIDE
 * `QueryProvider` and `RootLayout` renders the provider rather than living under it.
 * Renders nothing: it exists for its effect, and mounting it here rather than in the
 * paywall means a returning subscriber never sees a frame of the free tier on Home.
 */
function SubscriptionSync(): null {
  useSubscriptionSync()
  return null
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
      <SafeAreaProvider style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg.canvas} />
        <SplashScreen
          phase={phase}
          // Fonts are the only boot work today and `useFonts` has no retry, so the
          // honest retry is a full reload. `onRetry` stays undefined until there is
          // something a button could actually re-attempt; a button that does nothing
          // is worse than no button.
          onRetry={undefined}
        />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.canvas} />
      <ErrorBoundary>
        {/* The gradient is OUTSIDE the safe area now, so it paints the whole display —
            under the status bar, under the home indicator, into the notch. The inset is
            applied to the content instead, one level down. That ordering is the entire
            fix for the seam: a painted safe area is a second background, and two
            backgrounds meeting is a line. */}
        <ScreenBackground>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* React Navigation paints its own background behind every screen, and its
            default theme is LIGHT — `rgb(242,242,242)`, absolutely positioned over the
            whole viewport. Every screen used to paint `bg.canvas` on top of it, which
            hid it completely; the moment the screens went transparent so the canvas
            gradient could show, that grey surfaced on every route. `sceneStyle` does
            not reach it — it comes from the theme, so the theme is where it is fixed. */}
        <ThemeProvider
          value={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: 'transparent' } }}
        >
        <QueryProvider>
          <SubscriptionSync />
          <Stack
            screenOptions={{
              headerShown: false,
              // Transparent, so the root gradient behind the router is what shows.
              // A flat fill here would sit on top of it and the token would go back to
              // having no readers.
              // The same cap the tab scenes get, for every screen that is NOT a tab —
              // country, collection, streak, shop, achievements, the paywall. Without it
              // half the app is a readable column on a tablet and half is stretched.
              contentStyle: {
                backgroundColor: 'transparent',
                width: '100%',
                maxWidth: layout.maxContentWidth,
                alignSelf: 'center',
              },
              animationDuration: motion.quick.duration,
            }}
          >
            {/* The one screen that opts OUT of the width cap, because it is not a
                screen — it is the tab navigator, and the cap belongs to the content
                inside it rather than to the bar around it. Capped here, the tab bar
                itself came out 600pt wide and centred, floating with dark bands either
                side. `(tabs)/_layout.tsx` applies the same cap to its SCENES, which is
                where it was always meant to go. */}
            <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: 'transparent' } }} />
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
        </ThemeProvider>
        </SafeAreaView>
        </ScreenBackground>
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  // The flat canvas stays as the base coat under the gradient: it is what paints
  // during the frame before layout, and what shows if the native gradient module is
  // ever absent.
  root: { flex: 1, backgroundColor: colors.bg.canvas },
  // Transparent, deliberately and load-bearing — see the import note. The gradient is
  // the layer above this one now, and anything painted here would cover it.
  safe: { flex: 1, backgroundColor: 'transparent' },
})
