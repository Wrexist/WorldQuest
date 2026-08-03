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
import { ContentGate } from '../src/components/ContentGate.js'
import { useContent } from '../src/lib/content.js'

export default function AchievementsRoute() {
  // Evaluated on device from the events the client can actually observe, and merged
  // with the server's view when there is one. Before this it was called with nothing,
  // so every achievement was permanently locked — see features/achievements/progress.
  const rows = useAchievements(useAchievementProgress())
  // Achievement definitions ship in a content pack, so this screen has the same three
  // non-content states as the browse screens and had none of them.
  const { status, reload, isOffline } = useContent()

  return (
    <ContentGate status={status} onRetry={reload} isOffline={isOffline} showLoading>
      <AchievementsScreen
        rows={rows}
        onStartLesson={() => router.push('/lesson')}
        // `back()` when there is somewhere to go back to, otherwise Profile — this
        // route is deep-linkable, and `back()` on a cold open does nothing at all,
        // which is the same dead end in a different disguise.
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      />
    </ContentGate>
  )
}
