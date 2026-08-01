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

import { Stack } from 'expo-router'
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { colors, motion } from '@worldquest/design'
import { useAppFonts } from '../src/lib/fonts.js'
import { t } from '../src/lib/i18n.js'
import { useDeviceLocale } from '../src/lib/locale.js'
import { QueryProvider } from '../src/lib/query.js'

export default function RootLayout() {
  const fontsReady = useAppFonts()
  useDeviceLocale()

  // The native splash is still covering the screen here, so there is nothing to see.
  // Rendering before the fonts land means laying out in the system font and jumping
  // when Baloo 2 arrives — its metrics are nothing like the fallback's.
  if (!fontsReady) return null

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.canvas} />
      <QueryProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg.canvas },
            animationDuration: motion.quick.duration,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="region/[code]" />
          <Stack.Screen name="country/[code]" />
          <Stack.Screen name="achievements" />
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas },
})
