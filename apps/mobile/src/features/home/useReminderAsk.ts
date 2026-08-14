/**
 * "Want a nudge?" — whether to show it, and what happens when it is answered.
 *
 * ## Why Home, and why after three lessons
 *
 * `notifications.md` §1: never on first launch, after the third completed lesson, in
 * context. Home is where a lesson ends, so a card here is the first thing a user sees
 * after doing the thing the reminder would remind them to do — which is the whole
 * argument for asking then rather than at install, and is worth roughly double the
 * opt-in rate.
 *
 * ## Two asks, ever
 *
 * The timing rule lives in `shouldAskForReminder()` in the engine and is tested there.
 * This hook supplies the state and carries out the answer. Between them: a card that
 * appears at most twice in the lifetime of an install, ninety days apart, and never
 * again after that.
 *
 * ## Children are asked too, and that is deliberate
 *
 * A daily reminder is the one notification a child account keeps (§2 gives it one a day
 * and no evenings). The scheduler enforces the earlier ceiling; nothing about the ASK
 * needs to differ, and a child who cannot turn on their own reminder is a child whose
 * parent has to go looking for it in Settings.
 */

import { useCallback, useEffect, useState } from 'react'
import { shouldAskForReminder } from '@worldquest/engines'
import { readJson, writeJson } from '../../lib/storage.js'
import { hasPermission, requestPermission } from '../../lib/notifications.js'
import { lessonsEverCompleted } from '../profile/useWeekActivity.js'

const KEY = 'reminder.ask.v1'

/** What we remember about the asks we have already made. */
type AskLog = {
  /** When the card was last put on screen. */
  readonly at: number
  /** Whether that ask reached the OS dialogue, as opposed to being dismissed. */
  readonly reachedOs: boolean
}

export type ReminderAsk = { readonly onAccept: () => void; readonly onDismiss: () => void }

export function useReminderAsk(): ReminderAsk | undefined {
  /**
   * Decided ONCE, in an effect, and then only ever narrowed by an answer.
   *
   * In an effect rather than during render for two reasons. The permission is an async
   * question only the OS can answer, and the rest of the inputs reach device storage —
   * a render that reads storage is a render with a side effect in it, which is the bug
   * `peekJson` exists for and which StrictMode performs twice.
   *
   * It also means the card cannot appear under a finger mid-session. It resolves in the
   * frame after Home mounts, or it does not appear at all.
   */
  const [answered, setAnswered] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const granted = await hasPermission()
      const log = readJson<AskLog>(KEY)
      const show = shouldAskForReminder({
        lessonsCompleted: lessonsEverCompleted(),
        permissionAsked: log?.reachedOs ?? false,
        granted,
        lastAskedAt: log?.at ?? null,
        now: Date.now(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (!cancelled) setVisible(show)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const record = useCallback((reachedOs: boolean): void => {
    writeJson(KEY, { at: Date.now(), reachedOs } satisfies AskLog)
    setAnswered(true)
  }, [])

  const onAccept = useCallback((): void => {
    void (async () => {
      // Already granted — nothing to ask, and the reminder is scheduled by `syncReminder`
      // on the next Settings visit or preference change either way.
      const already = await hasPermission()
      if (!already) await requestPermission()
      // `reachedOs` is what spends the one retry. A user who saw the system dialogue has
      // given us their answer; a user who never got that far has not.
      record(true)
    })()
  }, [record])

  // Dismissing is not refusing. It records the ask so the card does not reappear on the
  // next Home mount, but leaves `reachedOs` false so the ninety-day retry is untouched.
  const onDismiss = useCallback((): void => record(false), [record])

  if (!visible || answered) return undefined
  return { onAccept, onDismiss }
}
