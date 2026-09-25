/**
 * Home's streak card: the decision (`streakNotice`), plus the one thing it cannot hold —
 * which cards this learner has already dismissed.
 *
 * Takes the progress the route already has rather than subscribing again: Home reads
 * `useOptimisticProgress` once, and the card must agree with the streak tile beside it.
 *
 * Dismissals are stored per account, not per device: they are about THIS streak.
 */

import { useCallback, useState } from 'react'
import type { Progress } from '@worldquest/api'
import type { OptimisticProgress } from '@worldquest/engines'
import { peekJson, writeJson } from '../../lib/storage.js'
import { localDay } from '../../lib/day.js'
import { streakNotice, type StreakNotice } from './streakNotice.js'

const KEY = 'streak.notices.v1'

/**
 * How many dismissals are remembered. Each id names one freeze or one break, so an old
 * one can never match again; the list only has to outlive the card it hid.
 */
const REMEMBERED = 10

const isIdList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')

export type UseStreakNotice = {
  readonly notice: StreakNotice | null
  readonly dismiss: () => void
}

export function useStreakNotice(
  data: Progress | null,
  shown: OptimisticProgress | null,
): UseStreakNotice {
  // `peekJson`, because this runs during render and a render must not repair storage.
  // A corrupt list reads as empty, which shows a card once more at worst.
  const [dismissed, setDismissed] = useState<readonly string[]>(
    () => peekJson<string[]>(KEY, isIdList).value ?? [],
  )

  const notice =
    data === null
      ? null
      : streakNotice({
          streak: shown?.streak ?? data.streak,
          lastActiveDate: shown?.lastActiveDate ?? data.lastActiveDate,
          freezesHeld: data.freezesHeld,
          freezeUsedOn: data.freezeUsedOn,
          brokenOn: data.brokenOn,
          lastRepairAt: data.lastRepairAt,
          longestStreak: data.longestStreak,
          restoreTo: data.restoreTo,
          coins: data.coins,
          today: localDay(new Date()),
          now: Date.now(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          dismissed,
        })

  const id = notice?.id
  const dismiss = useCallback(() => {
    if (id === undefined) return
    const next = [...dismissed.filter((seen) => seen !== id), id].slice(-REMEMBERED)
    writeJson(KEY, next)
    setDismissed(next)
  }, [id, dismissed])

  return { notice, dismiss }
}
