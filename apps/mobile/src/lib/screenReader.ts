/**
 * Is a screen reader running?
 *
 * ## Why this exists, and why it had to land with the flags
 *
 * The lesson composer has always been able to select screen-reader-safe templates —
 * `composeLesson({ screenReaderOnly: true })` swaps `tpl.flag-to-country.mc4`
 * ("Which country's flag is this?", a picture) for `tpl.flag-describe.mc4`, which
 * describes the flag in words. Same fact, same `user_facts` row, same scheduler.
 * `docs/design/accessibility.md` §8 is built on it.
 *
 * Nothing ever set the flag. It cost nothing while the app could not show a picture at
 * all — `PRESENTABLE` was `['text']`, so no image question ever reached anybody. The
 * moment flags shipped, that changed: without this hook, turning on image questions
 * would hand a VoiceOver user a prompt about a picture they cannot see, above four
 * country names, and take a heart when they guessed. Which is precisely the bug
 * `PRESENTABLE`'s comment describes — moved, not fixed.
 *
 * So the capability and its guard land together, and the comment on `PRESENTABLE` says
 * so.
 *
 * ## A hook, not a constant
 *
 * `isScreenReaderEnabled()` is async, and a user can turn VoiceOver on mid-lesson —
 * that is not a rare case, it is what somebody does the moment they hit a question
 * they cannot answer. Reading it once at module load gives a stale answer to exactly
 * the user who cares most. Same reasoning as `useReducedMotion`, and the same shape.
 */

import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (alive) setEnabled(value)
      })
      // Never throws. A renderer that cannot answer this question is not a reason to
      // fail a lesson — it means "assume no reader", which is the default already.
      .catch(() => undefined)

    // react-native-web does not implement this event and returns `undefined` rather
    // than a subscription. Calling `.remove()` on that is the crash `useReducedMotion`
    // documents, in a hook whose unmount path only runs when a screen goes away.
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (value: boolean) => setEnabled(value),
    ) as { remove?: () => void } | undefined

    return () => {
      alive = false
      subscription?.remove?.()
    }
  }, [])

  return enabled
}
