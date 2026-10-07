/**
 * "Lessons with sound?" — the one-time offer design-system §9 promised and nothing built.
 *
 * ## Why it exists
 *
 * Sound is off on first launch on purpose (`lib/sound.ts`): a game that starts beeping on
 * a bus or in a classroom makes an enemy in ten seconds. But §9 pairs that default with a
 * one-time prompt, and without the prompt the six sounds were effectively unreachable —
 * the Settings toggle is three screens deep, so almost nobody heard a chime, and the app
 * felt silent next to Duolingo (feel audit 2026-10-06, rank 1).
 *
 * ## Why Home, after the first lesson
 *
 * Asked after one finished lesson, on the screen a lesson ends on: the learner has just
 * done the thing sound would accompany, and the next lesson is one tap away. Never on
 * first launch, never inside a lesson. Saying yes plays the correct-answer chime at once,
 * so the answer is heard rather than taken on trust — and the silent switch still wins.
 *
 * ## Once, ever
 *
 * Either answer is recorded and the card never returns. Anyone who said "not now" can
 * still find it in Settings. Not shown alongside the reminder ask (the caller decides),
 * and not shown to anyone who already turned sound on themselves.
 */

import { useCallback, useEffect, useState } from 'react'
import { readJson, writeJson } from '../../lib/storage.js'
import { soundCorrect } from '../../lib/sound.js'
import { usePreferences } from '../settings/usePreferences.js'
import { lessonsEverCompleted } from '../profile/useWeekActivity.js'

const KEY = 'sound.ask.v1'

export type SoundAsk = { readonly onAccept: () => void; readonly onDismiss: () => void }

export function useSoundAsk(): SoundAsk | undefined {
  const { preferences, set } = usePreferences()
  const [visible, setVisible] = useState(false)

  // Decided once, in an effect, for the reason `useReminderAsk` gives: a render that reads
  // device storage is a render with a side effect, and the card must not appear under a
  // finger mid-session.
  useEffect(() => {
    setVisible(readJson<{ at: number }>(KEY) === null && lessonsEverCompleted() >= 1)
  }, [])

  const record = useCallback((): void => {
    writeJson(KEY, { at: Date.now() })
    setVisible(false)
  }, [])

  const onAccept = useCallback((): void => {
    set('sound', true)
    record()
    soundCorrect()
  }, [set, record])

  if (!visible || preferences.sound) return undefined
  return { onAccept, onDismiss: record }
}
