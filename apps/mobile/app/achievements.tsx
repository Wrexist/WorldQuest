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
import { useAchievementProgress } from '../src/features/achievements/progress.js'

export default function AchievementsRoute() {
  // Evaluated on device from the events the client can actually observe, and merged
  // with the server's view when there is one. Before this it was called with nothing,
  // so every achievement was permanently locked — see features/achievements/progress.
  const rows = useAchievements(useAchievementProgress())
  return <AchievementsScreen rows={rows} onStartLesson={() => router.push('/lesson')} />
}
