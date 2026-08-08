/**
 * Profile — the record of what the user has done.
 *
 * Two sources, deliberately: XP, coins and streaks come from the server, because the
 * client may never decide them (ADR 0006). The per-continent bars come from the
 * progression engine over local memory, so they work offline and update the instant a
 * lesson ends rather than after a sync.
 */

import { useMemo } from 'react'
import { router } from 'expo-router'
import { equippedTitleKey, levelProgress, worldProgress } from '@worldquest/engines'
import { CATALOGUE } from '../../src/features/shop/catalogue.js'
import { useShop } from '../../src/features/shop/useShop.js'
import { useWeekActivity } from '../../src/features/profile/useWeekActivity.js'
import { usePreferences } from '../../src/features/settings/usePreferences.js'
import { ProfileScreen } from '../../src/features/profile/ProfileScreen.js'
import { useProgress } from '../../src/features/home/useProgress.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useContent } from '../../src/lib/content.js'

export default function ProfileRoute() {
  const { preferences } = usePreferences()
  const { data, status } = useProgress()
  // Renamed: `useProgress` already owns `status` on this screen, and two different
  // meanings behind one name is how the wrong one gets read.
  const { index, memory, status: contentStatus, reload, isOffline } = useContent()
  const week = useWeekActivity()
  const shop = useShop()

  /**
   * Which title is actually worn.
   *
   * Resolved HERE rather than in the screen, and through the engine rather than by
   * hand: `equippedTitleKey` is the function that knows a stale local row can name
   * something no longer owned, and falls back to the earned title instead of
   * rendering "shop:title.mapNerd" at a child.
   */
  const worn = equippedTitleKey(
    levelProgress(data?.xpTotal ?? 0).titleKey,
    shop.equippedId,
    CATALOGUE,
    shop.owned,
  )

  const world = useMemo(() => {
    if (index === null) return null

    // Per-continent progress is derived from LOCAL memory, which is empty until
    // review history syncs down. Rendering it anyway puts "7 facts mastered" from
    // the server directly above "0 of 10 facts learned" from here — a contradiction
    // on one screen, which reads as data loss. Better to show nothing than to show
    // two different truths.
    if (memory.size === 0) return null

    return worldProgress(index.index, memory, Date.now())
  }, [index, memory])

  return (
    <ContentGate status={contentStatus} onRetry={reload} isOffline={isOffline}>
      <ProfileScreen
        stats={
          data === null
            ? null
            : {
                xpTotal: data.xpTotal,
                coins: data.coins,
                streak: data.streak,
                longestStreak: data.longestStreak,
                factsMastered: data.factsMastered,
              }
        }
        week={week}
        world={world}
        loading={status === 'loading'}
        // The account prompt appears only while there is no account. It disappears with
        // its own reason rather than becoming a permanent piece of furniture.
        onCreateAccount={undefined}
        wornTitleKey={worn}
        avatar={preferences.avatar}
        onOpenShop={() => router.push('/shop')}
        onStartLesson={() => router.push('/lesson')}
      />
    </ContentGate>
  )
}
