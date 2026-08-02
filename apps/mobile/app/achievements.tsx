/**
 * `/achievements` — outside the tabs, reached from Profile.
 *
 * Not a sixth tab. Five tabs, forever (PROJECT.md §7), and an achievements list is
 * something a user visits occasionally rather than daily — putting it in the bar
 * would cost the space of something they use every session.
 */

import { router } from 'expo-router'
import { AchievementsScreen } from '../src/features/achievements/AchievementsScreen.js'
import { useAchievements } from '../src/features/achievements/useAchievements.js'

export default function AchievementsRoute() {
  // Progress arrives from the server once the table exists. Until then everything
  // reads as locked, which is the truth rather than a placeholder.
  const rows = useAchievements()
  return <AchievementsScreen rows={rows} onStartLesson={() => router.push('/lesson')} />
}
