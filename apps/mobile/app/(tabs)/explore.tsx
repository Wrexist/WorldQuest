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
import { entityProgress, worldProgress } from '@worldquest/engines'
import { ExploreScreen } from '../../src/features/explore/ExploreScreen.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { currentLocale } from '../../src/lib/i18n.js'
import { useContent } from '../../src/lib/content.js'
import { useOptimisticProgress } from '../../src/features/home/useOptimisticProgress.js'
import { useAtlasEnabled } from '../../src/features/atlas/atlasAvailability.js'
import { useAtlasNames } from '../../src/features/atlas/useAtlasNames.js'

export default function ExploreRoute() {
  const router = useRouter()
  const { index, memory, status, reload, isOffline } = useContent()
  // The bar at the top reports, so it shows what Home shows: the server's figures plus
  // any lesson it has not seen yet. Reading the server's alone put "1 day" on Home and
  // "no days yet" here after the same lesson. The Shop's wallet card is where coins are
  // offered, and it keeps the spendable balance (`OptimisticProgress.coins`). Zero before
  // anything has loaded, as on Home (`COLD_START`), so no tab's bar differs from another's.
  const { shown } = useOptimisticProgress()
  const atlasOn = useAtlasEnabled()
  const names = useAtlasNames(index?.index)

  const world = useMemo(
    () => (index === null ? null : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  const countries = useMemo(() => index === null ? [] : [...index.index.entities.values()].map(entity => ({
    id: entity.id,
    name: entity.names[currentLocale()] ?? entity.names.en ?? entity.id,
    region: entity.region ?? '',
    flagPath: entity.assets?.flag?.path,
    progress: entityProgress(index.index, entity.id, memory, Date.now()),
  })).sort((a, b) => a.name.localeCompare(b.name, currentLocale())), [index, memory])

  return (
    // `status` was destructured here and only ever read as `=== 'loading'`, so a
    // content load that failed rendered an empty grid with no explanation and no way
    // to retry. `scripts/five-states.ts` is what found it.
    <ContentGate status={status} onRetry={reload} isOffline={isOffline}>
      <ExploreScreen
        world={world}
        countries={countries}
        onSelectCountry={id => router.push(`/country/${id}`)}
        loading={status === 'loading'}
        onOpenCollection={(kind) => router.push(`/collection/${kind}`)}
        onSelectRegion={(region) => router.push(`/region/${region}`)}
        coins={shown?.coinsIncludingPending ?? 0}
        streak={shown?.streak ?? 0}
        onOpenStreak={() => router.push('/streak')}
        atlas={atlasOn ? { names } : undefined}
      />
    </ContentGate>
  )
}
