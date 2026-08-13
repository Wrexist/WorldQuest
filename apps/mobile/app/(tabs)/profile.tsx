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
import { equippedTitleKey, levelProgress, worldProgress, type Tier } from '@worldquest/engines'
import { CATALOGUE } from '../../src/features/shop/catalogue.js'
import { useShop } from '../../src/features/shop/useShop.js'
import { useWeekActivity } from '../../src/features/profile/useWeekActivity.js'
import { useAchievements } from '../../src/features/achievements/useAchievements.js'
import { usePreferences } from '../../src/features/settings/usePreferences.js'
import { ProfileScreen } from '../../src/features/profile/ProfileScreen.js'
import { useOptimisticProgress } from '../../src/features/home/useOptimisticProgress.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useContent } from '../../src/lib/content.js'

export default function ProfileRoute() {
  const { preferences } = usePreferences()
  const { data, shown, status } = useOptimisticProgress()
  // Renamed: `useProgress` already owns `status` on this screen, and two different
  // meanings behind one name is how the wrong one gets read.
  const { index, memory, status: contentStatus, reload, isOffline } = useContent()
  const week = useWeekActivity()
  const shop = useShop()
  const achievements = useAchievements()

  /**
   * The trophy shelf: earned badges, most recent first.
   *
   * `unlockedAt` is the sort key rather than catalogue order, because "recent" is the
   * heading's own promise and the catalogue's order is editorial. A row with a tier but
   * no timestamp — which is what awarding an achievement retroactively writes — sorts
   * last rather than being dropped: it IS earned, it just cannot say when.
   */
  const badges = useMemo(
    () =>
      achievements
        .filter((row) => row.progress.tier !== null)
        .sort((a, b) => (b.progress.unlockedAt ?? 0) - (a.progress.unlockedAt ?? 0))
        .map((row) => ({ id: row.def.id, tier: row.progress.tier as Tier })),
    [achievements],
  )

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
        // XP, coins and the streak come from `shown` — the server's figures plus any
        // lesson still in the queue. This screen took the empty branch for anyone who had
        // only ever played offline, so it told a user who had just finished a lesson that
        // there was nothing to show. `factsMastered` stays server-only: a mastery count is
        // not something one queued lesson can be predicted to move, and guessing at it
        // would be inventing a number.
        stats={
          shown === null
            ? null
            : {
                xpTotal: shown.xpTotal,
                // The prediction, not the spendable balance. This screen is a RECORD —
                // there is nothing to buy on it — and "85 XP earned, 0 coins" for a user
                // who just finished a lesson is the same "it didn't count" the whole
                // optimistic layer exists to stop. The Shop and the freeze button use
                // `coins`, which stays the server's, so nothing here can offer a purchase
                // the server would refuse.
                coins: shown.coinsIncludingPending,
                streak: shown.streak,
                // Never below the streak beside it. `longestStreak` is server-only —
                // a record is not something one queued lesson can be predicted to set —
                // but leaving it raw put "Day streak 1" next to "Best streak 0" on the
                // rendered screen, which is not a lag, it is an impossibility. Taking the
                // larger of the two is derived rather than invented: a current run of N
                // is proof the best run is at least N.
                longestStreak: Math.max(data?.longestStreak ?? 0, shown.streak),
                factsMastered: data?.factsMastered ?? 0,
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
        badges={badges}
        onOpenAchievements={() => router.push('/achievements')}
        // The gear. Settings stopped being a tab when Shop took the fifth slot, and
        // this is where it went — see `app/settings.tsx`.
        onOpenSettings={() => router.push('/settings')}
        // No `onRename` yet: there is no display name to change. `profile:anonymous`
        // is what this screen shows and an account is what would give it a real one, so
        // the pencil stays absent rather than opening a field that writes nowhere.
        onStartLesson={() => router.push('/lesson')}
      />
    </ContentGate>
  )
}
