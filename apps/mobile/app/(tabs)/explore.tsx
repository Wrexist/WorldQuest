/**
 * Explore — the continents grid.
 *
 * Thin, like every route: it supplies the data and the navigation, and the screen
 * draws it. Progress comes from the content index and the user's memory, both of
 * which are local — this screen works offline with no special casing, which is the
 * point of keeping mastery on the device.
 */

import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { worldProgress } from '@worldquest/engines'
import { ExploreScreen } from '../../src/features/explore/ExploreScreen.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useContent } from '../../src/lib/content.js'
import { useProgress } from '../../src/features/home/useProgress.js'

export default function ExploreRoute() {
  const router = useRouter()
  const { index, memory, status, reload, isOffline } = useContent()
  // The server's balance for the bar at the top. Explore leads to the Shop through the
  // tab bar, so the number shown has to be one that can actually be spent.
  const { data } = useProgress()

  const world = useMemo(
    () => (index === null ? null : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  return (
    // `status` was destructured here and only ever read as `=== 'loading'`, so a
    // content load that failed rendered an empty grid with no explanation and no way
    // to retry. `scripts/five-states.ts` is what found it.
    <ContentGate status={status} onRetry={reload} isOffline={isOffline}>
      <ExploreScreen
        world={world}
        loading={status === 'loading'}
        onOpenCollection={(kind) => router.push(`/collection/${kind}`)}
        onSelectRegion={(region) => router.push(`/region/${region}`)}
        coins={data?.coins ?? 0}
        onOpenInbox={() => router.push('/streak')}
      />
    </ContentGate>
  )
}
