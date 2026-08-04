/**
 * `/welcome-back` — hidden screen H2.
 *
 * Reached by the gate in the root layout, never by a tap. Deep-linkable anyway,
 * because the "we miss you" notification has to open something.
 */

import { useMemo } from 'react'
import { router } from 'expo-router'
import { worldProgress } from '@worldquest/engines'
import { WelcomeBackScreen } from '../src/features/welcome/WelcomeBackScreen.js'
import { useReturnVisit } from '../src/features/welcome/useReturnVisit.js'
import { useContent } from '../src/lib/content.js'

export default function WelcomeBackRoute() {
  const { daysAway, acknowledge } = useReturnVisit()
  const { index, memory } = useContent()

  const world = useMemo(
    () => (index === null ? null : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  const leave = (then: () => void): void => {
    // Acknowledge on the way out, whichever way out it is. Dismissing without
    // acknowledging would show this screen again on the next launch, which is the
    // app failing to notice the user came back.
    acknowledge()
    then()
  }

  return (
    <WelcomeBackScreen
      // The gate only routes here when this is a real return, but a deep link can
      // reach any route. Zero reads as "it's been a day", which is honest for someone
      // who arrived by tapping a notification the same afternoon.
      daysAway={daysAway ?? 0}
      factsLearned={world?.factsLearned ?? 0}
      countriesMet={world?.entitiesComplete ?? 0}
      dueCount={world?.factsDue ?? 0}
      onStart={() => leave(() => router.replace('/lesson'))}
      onDismiss={() => leave(() => router.replace('/'))}
    />
  )
}
