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
import { useContent } from '../../src/lib/content.js'

export default function ExploreRoute() {
  const router = useRouter()
  const { index, memory, status } = useContent()

  const world = useMemo(
    () => (index === null ? null : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  return (
    <ExploreScreen
      world={world}
      loading={status === 'loading'}
      onOpenCollection={(kind) => router.push(`/collection/${kind}`)}
      onSelectRegion={(region) => router.push(`/region/${region}`)}
    />
  )
}
