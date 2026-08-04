/**
 * On-device preferences.
 *
 * Client state, not server state — these belong in device storage and nowhere near
 * TanStack Query. They are also the settings a user changes when something is already
 * wrong for them, so they are read synchronously and applied on the next render
 * rather than after a round trip.
 *
 * `language: 'system'` is stored as its own value rather than resolved to `en` or
 * `sv` at write time. A user who picked "match my device" and then changes their
 * phone's language expects the app to follow; storing the resolved value would freeze
 * it at whatever the phone said the day they tapped it.
 */

import { useCallback, useState } from 'react'
import { SUPPORTED_LOCALES, setLocale, type Locale } from '@worldquest/i18n'
import { readJson, writeJson } from '../../lib/storage.js'
import { deviceLocale } from '../../lib/locale.js'
import { track } from '../../lib/analytics.js'

const KEY = 'preferences.v1'

/** 5, 10 or 20 minutes — the goal drives how many lessons a day, not lesson length. */
export const DAILY_GOALS = [5, 10, 20] as const
export type DailyGoal = (typeof DAILY_GOALS)[number]

export type LanguageChoice = 'system' | Locale

export type Preferences = {
  readonly dailyGoalMinutes: DailyGoal
  readonly reminder: boolean
  readonly sound: boolean
  readonly haptics: boolean
  /** Explicit override. The system setting still wins when this is false. */
  readonly reduceMotion: boolean
  readonly analytics: boolean
  readonly language: LanguageChoice
}

/**
 * Ten minutes, reminders on, **sound OFF**, analytics ON for adults.
 *
 * Analytics defaults differently for children — the client never decides that. The
 * account's `is_child` flag makes `track()` a no-op server-side and in
 * `lib/analytics.ts`, so this toggle is about adult consent only.
 */
export const DEFAULTS: Preferences = {
  dailyGoalMinutes: 10,
  reminder: true,
  // Off, per design-system.md §9. A game that starts making noise on a bus, in a
  // classroom, or next to a sleeping baby has made an enemy in its first ten seconds.
  // This read `true` until sound actually existed, which cost nothing while nothing
  // played and would have been the wrong default the moment it did.
  sound: false,
  haptics: true,
  reduceMotion: false,
  analytics: true,
  language: 'system',
}

function load(): Preferences {
  // Spread over the defaults rather than trusting the stored shape: a preference
  // added in a later version is missing from every existing install, and `undefined`
  // reaching a `<Switch value>` is a crash on a screen the user is looking at.
  return { ...DEFAULTS, ...(readJson<Partial<Preferences>>(KEY) ?? {}) }
}

export type UsePreferences = {
  readonly preferences: Preferences
  readonly set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
}

export function usePreferences(): UsePreferences {
  const [preferences, setPreferences] = useState<Preferences>(load)

  const set = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]): void => {
      const next = { ...preferences, [key]: value }
      writeJson(KEY, next)
      setPreferences(next)

      // The setting and its new value, never anything about who changed it. A
      // preference is a design input in aggregate — "12 % of users turn motion down"
      // — and nobody's business individually.
      track('setting_changed', { setting: key, value: String(value) })

      // Language applies immediately, without a restart (localization.md §7).
      if (key === 'language') {
        const choice = value as LanguageChoice
        void setLocale(choice === 'system' ? deviceLocale() : choice)
      }
    },
    [preferences],
  )

  return { preferences, set }
}

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = ['system', ...SUPPORTED_LOCALES]
