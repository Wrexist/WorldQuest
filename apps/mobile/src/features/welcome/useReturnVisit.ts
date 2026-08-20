/**
 * Whether this launch is a RETURN — a week or more since the last lesson.
 *
 * Read from the local activity log rather than from the server, for the same reason
 * the weekly chart is: it is already correct at launch, works on a plane, and needs no
 * round trip before the app can decide what to show. A welcome-back screen that
 * appears two seconds after Home has already rendered is worse than none.
 *
 * ## Shown once per return, not once per launch
 *
 * The acknowledgement stores the day it was shown. A user who returns, dismisses, and
 * opens the app again an hour later has already been welcomed — greeting them twice is
 * the app failing to notice they came back, which is precisely what the screen is
 * about. It arms again only after they go quiet for another full window.
 */

import { useCallback, useMemo, useState } from 'react'
import { isNumberRecord, readJson, writeJson } from '../../lib/storage.js'

/** A week. Short enough to catch a lapse, long enough that a busy weekend is not one. */
export const AWAY_DAYS = 7

const ACTIVITY_KEY = 'activity.byDay.v1'
const ACK_KEY = 'welcomeBack.v1'

type Ack = { readonly shownOn: string }

const isoDay = (at: Date): string => at.toISOString().slice(0, 10)

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export type ReturnVisit = {
  /** Null when this is not a return — a first launch, or an active user. */
  readonly daysAway: number | null
  readonly acknowledge: () => void
}

/**
 * `shownOn` is fed to `Date.parse`, and `undefined` parses to NaN.
 *
 * NaN compares false against everything, so a malformed ack read as "not yet
 * acknowledged" — and the welcome-back screen would greet the same return on every
 * launch, which is the app failing to notice they came back.
 */
const isAck = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && typeof (value as Ack).shownOn === 'string'

export function useReturnVisit(today: Date = new Date()): ReturnVisit {
  const [ack, setAck] = useState<Ack | null>(() => readJson<Ack>(ACK_KEY, isAck))

  const daysAway = useMemo(() => {
    const log = readJson<Record<string, number>>(ACTIVITY_KEY, isNumberRecord) ?? {}
    const days = Object.keys(log).filter((day) => (log[day] ?? 0) > 0).sort()
    const last = days[days.length - 1]

    // Never a return for someone who has never been here. A first-time user gets
    // onboarding, and welcoming them "back" would be the app's first lie.
    if (last === undefined) return null

    const gap = daysBetween(last, isoDay(today))
    if (gap < AWAY_DAYS) return null

    // Already welcomed for this return. Greeting them twice is the app failing to
    // notice they came back — the exact opposite of the point.
    if (ack !== null && daysBetween(ack.shownOn, isoDay(today)) < AWAY_DAYS) return null

    return gap
  }, [ack, today])

  const acknowledge = useCallback(() => {
    const next: Ack = { shownOn: isoDay(today) }
    writeJson(ACK_KEY, next)
    setAck(next)
  }, [today])

  return { daysAway, acknowledge }
}
