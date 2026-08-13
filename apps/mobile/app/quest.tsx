/**
 * Today's quest, as a cover page — mockup screen 3.
 *
 * A route rather than a tab: it is the thing you pass THROUGH on the way into the day's
 * lesson, not a destination you return to. The Quests tab is the destination, and it
 * lists all five tasks; this says what today is worth and starts it.
 *
 * Thin, like every route. The quest is generated on the device from the content index
 * and the user's memory, so there is nothing to fetch and nothing to gate.
 */

import { router } from 'expo-router'
import { questFocus } from '@worldquest/engines'
import { QuestIntro } from '../src/features/quests/QuestIntro.js'
import { useDailyQuest } from '../src/features/quests/useDailyQuest.js'
import { useDayCountdown } from '../src/features/quests/useDayCountdown.js'
import { focusToParams } from '../src/features/lesson/focusParams.js'

export default function QuestRoute() {
  const { quest } = useDailyQuest()
  const untilReset = useDayCountdown()

  return (
    <QuestIntro
      quest={quest}
      resetsIn={untilReset}
      onClose={() => router.back()}
      // `replace`, not `push`: the cover page has done its job once the lesson starts,
      // and leaving it on the stack would put it between the summary and Home on the
      // way back out.
      onStart={() => {
        const focus = quest === null ? undefined : questFocus(quest)
        const query = focus === undefined ? '' : `?${focusToParams(focus, undefined)}`
        router.replace(`/lesson${query}`)
      }}
    />
  )
}
