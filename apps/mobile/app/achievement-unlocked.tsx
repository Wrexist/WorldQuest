/**
 * `/achievement-unlocked` — one full-screen card per newly unlocked tier.
 *
 * Reached from the after-lesson chain (`afterLesson.ts`), which carries the unlocks in
 * `?unlocks=`. Every entry is re-read against the shipped catalogue before a card is
 * drawn (`unlockParams.ts`), so a hand-typed link can show a real badge but never
 * invent one; with nothing valid left it steps straight on, like the streak beat does
 * with a streak of zero.
 *
 * Three cards at most, the rest counted on the last one (`MAX_UNLOCK_CARDS`). The cards
 * are local state rather than three navigations: one route, one back stack entry, and
 * Continue on the last card is the only way out — to whatever the chain still holds.
 *
 * The queue is cleared of exactly these unlocks when the cards mount — on read, not on
 * dismiss (`acknowledgeUnlocks`).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { AchievementUnlocked } from '../src/features/achievements/AchievementUnlocked.js'
import { acknowledgeUnlocks } from '../src/features/achievements/pending.js'
import { parseUnlocks, unlockCards } from '../src/features/achievements/unlockParams.js'
import { nextAfterLesson } from '../src/features/lesson/afterLesson.js'
import { hapticCelebrate } from '../src/lib/haptics.js'
import { soundUnlock } from '../src/lib/sound.js'

export default function AchievementUnlockedRoute() {
  const { then, countries, unlocks } = useLocalSearchParams<{
    then?: string
    countries?: string
    unlocks?: string
  }>()
  const shown = useMemo(() => parseUnlocks(unlocks), [unlocks])
  const { cards, more } = unlockCards(shown)
  // The rest of the chain. The unlocks end here, so they are not passed on.
  const next = nextAfterLesson({ then, countries })
  const [index, setIndex] = useState(0)
  const card = cards[index]
  const leaving = useRef(false)

  useEffect(() => {
    acknowledgeUnlocks(shown)
  }, [shown])

  // One fanfare per card, and a straight step onward when there is nothing true to show.
  useEffect(() => {
    if (card === undefined) {
      router.replace(next)
      return
    }
    hapticCelebrate()
    soundUnlock()
  }, [card, next])

  if (card === undefined) return null
  const last = index === cards.length - 1

  return (
    <AchievementUnlocked
      // Keyed per unlock, so each card mounts fresh and its medal springs in again.
      key={`${card.achievementId}:${card.tier}`}
      unlock={card}
      more={last ? more : 0}
      onContinue={() => {
        if (!last) {
          setIndex((at) => at + 1)
          return
        }
        // One exit: a second tap during the transition must not navigate twice.
        if (leaving.current) return
        leaving.current = true
        // `replace`: back from the next screen must not return to a dismissed card.
        router.replace(next)
      }}
    />
  )
}
