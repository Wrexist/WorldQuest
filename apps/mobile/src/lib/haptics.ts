/**
 * Haptics.
 *
 * ## Why this file appeared late
 *
 * `apps/mobile/CLAUDE.md` has specified this since the first week — "Wrong answers get
 * a gentle settle and `impactMedium`" — and there was no `expo-haptics` anywhere in
 * the repo. Nothing fired, ever. It took walking the Definition of Done to notice,
 * because a missing vibration is invisible to every test, every screenshot and every
 * code review: the screen looks exactly right.
 *
 * ## What each one means, and why wrong is not an error buzz
 *
 * `Notification.Error` is the obvious call for a wrong answer and it is the wrong one.
 * It is two sharp knocks — the pattern iOS uses for "your payment failed" — and this
 * app does not punish. A wrong answer gets `impactMedium`: one soft bump that says
 * *something happened*, matching the gentle settle the motion spec asks for. No shake,
 * no red flash, no buzzer.
 *
 * ## Respecting the setting, and the silence around it
 *
 * Settings has had a haptics toggle since the first week, writing a preference that
 * nothing read. It reads it now.
 *
 * There is deliberately no way to make haptics louder, longer or more frequent. A
 * ten-year-old with the phone under a desk does not need the app to be more insistent.
 *
 * ## Never throws
 *
 * Haptics are unavailable on web, on a simulator, on a device with the Taptic Engine
 * disabled, and on plenty of Android hardware. Every call is fire-and-forget with the
 * rejection swallowed: a lesson must never fail because a phone could not buzz.
 */

import * as Haptics from 'expo-haptics'
import { readJson } from './storage.js'

/** The same key `usePreferences` writes. Read directly so any module can fire. */
const PREFERENCES_KEY = 'preferences.v1'

const enabled = (): boolean => readJson<{ haptics?: boolean }>(PREFERENCES_KEY)?.haptics !== false

const fire = (run: () => Promise<void>): void => {
  if (!enabled()) return
  // Swallowed on purpose — see the header. A missing Taptic Engine is not an error
  // worth surfacing to a user mid-lesson.
  void run().catch(() => {})
}

/** A correct answer. Light, because it happens most often and should not intrude. */
export const hapticCorrect = (): void =>
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))

/**
 * A wrong answer.
 *
 * `impactMedium`, NOT `Notification.Error`. See the header: the error pattern is the
 * one iOS uses for a failed payment, and we do not punish a child for not knowing
 * something yet.
 */
export const hapticWrong = (): void =>
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))

/** Finishing a lesson, unlocking an achievement, completing a quest. */
export const hapticCelebrate = (): void =>
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))

/** A plain selection — a filter chip, a picker, a tab. */
export const hapticSelect = (): void => fire(() => Haptics.selectionAsync())
