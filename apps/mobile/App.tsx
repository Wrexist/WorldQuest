/**
 * App root — Phase 1.
 *
 * Deliberately NOT expo-router yet. Routing, the five tabs and deep links land in
 * week 3 (docs/plan/build-order.md); adding them now would be scaffolding around a
 * loop we have not yet proven. What this file exists to demonstrate is step 8: the
 * loop closes — Home → lesson → real progress → Home.
 */

import { useCallback, useState } from 'react'
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native'
import { colors } from '@worldquest/design'
import { HomeScreen, type HomeProgress } from './src/features/home/HomeScreen.js'
import { LessonScreen } from './src/features/lesson/LessonScreen.js'

type Screen = 'home' | 'lesson'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  // Reads from Supabase in week 3. Zeroed here so a first launch shows the real
  // empty state rather than invented numbers.
  const [progress] = useState<HomeProgress>({
    xpTotal: 0,
    coins: 0,
    streak: 0,
    factsMastered: 0,
    factsTotal: 10,
  })

  const startLesson = useCallback(() => setScreen('lesson'), [])
  const goHome = useCallback(() => setScreen('home'), [])

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.canvas} />
      {screen === 'home' ? (
        <HomeScreen
          progress={progress}
          loading={false}
          isOffline={false}
          onStartLesson={startLesson}
        />
      ) : (
        <LessonScreen onExit={goHome} />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas },
})
