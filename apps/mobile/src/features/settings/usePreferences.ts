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

import { useCallback, useRef, useState } from 'react'
import { SUPPORTED_LOCALES, setLocale, type Locale } from '@worldquest/i18n'
import { isRecord, readJson, writeJson } from '../../lib/storage.js'
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
  /**
   * The hour of the daily reminder, 0–23 local, or null to use the learned suggestion.
   *
   * Null is a real value rather than a missing one: it means "you choose", and the app
   * then follows the median hour of recent sessions (`notifications.md` §6) so a user
   * whose routine moves does not have to come back here and move it by hand. Picking an
   * hour opts out of that permanently, which is the correct reading of picking one.
   */
  readonly reminderHour: number | null
  readonly sound: boolean
  readonly haptics: boolean
  /** Explicit override. The system setting still wins when this is false. */
  readonly reduceMotion: boolean
  readonly analytics: boolean
  readonly language: LanguageChoice
  /**
   * The chosen avatar, as its art name suffix — `avatar-07` — or null for initials.
   *
   * A name rather than an index: the twelve are a set that will grow, and an index
   * silently re-points at a different face the day one is inserted. Null is a real
   * choice, not a missing value; initials are the accessible default the component
   * was built around and stay available.
   */
  readonly avatar: string | null
  /**
   * The continent onboarding said to start in, or null for the whole world.
   *
   * A starting preference, not a filter the user is stuck behind — `onboarding:region.body`
   * promises the rest of the world is open straight away, and it is: this narrows what
   * the app OFFERS first, and every continent stays reachable from Explore.
   */
  readonly startRegion: string | null
  /** The self-assessed level from onboarding — a difficulty band for the first lessons. */
  readonly startLevel: 'new' | 'some' | 'confident'
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
  // Learn it rather than assert it — see the type. A default of 19 would be a guess
  // stated as a decision, and it is the fallback the engine already uses when there is
  // nothing to learn from.
  reminderHour: null,
  // Off, per design-system.md §9. A game that starts making noise on a bus, in a
  // classroom, or next to a sleeping baby has made an enemy in its first ten seconds.
  // This read `true` until sound actually existed, which cost nothing while nothing
  // played and would have been the wrong default the moment it did.
  sound: false,
  haptics: true,
  reduceMotion: false,
  analytics: true,
  language: 'system',
  // No face until the user picks one. Assigning one at random would be the app
  // deciding what somebody looks like.
  avatar: null,
  // Null and 'some' are the answers onboarding starts on, so an install that predates
  // those steps behaves exactly like a user who accepted the defaults.
  startRegion: null,
  startLevel: 'some',
}

/**
 * What a stored value has to look like before it may override a default.
 *
 * One entry per preference, and the exhaustiveness is the point: `Record<keyof
 * Preferences, ...>` means adding a preference without deciding what a valid one looks
 * like does not compile. A table rather than a `typeof value === typeof default` loop,
 * because three of these default to `null` and a `typeof` comparison would reject every
 * real value they can hold — `reminderHour: 19` against a null default is 'number' versus
 * 'object'.
 */
const VALID: Record<keyof Preferences, (value: unknown) => boolean> = {
  dailyGoalMinutes: (v) => DAILY_GOALS.includes(v as DailyGoal),
  reminder: (v) => typeof v === 'boolean',
  reminderHour: (v) => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23),
  sound: (v) => typeof v === 'boolean',
  haptics: (v) => typeof v === 'boolean',
  reduceMotion: (v) => typeof v === 'boolean',
  analytics: (v) => typeof v === 'boolean',
  language: (v) => typeof v === 'string',
  avatar: (v) => v === null || typeof v === 'string',
  startRegion: (v) => v === null || typeof v === 'string',
  startLevel: (v) => v === 'new' || v === 'some' || v === 'confident',
}

/**
 * The stored preferences, merged over the defaults ONE KEY AT A TIME.
 *
 * A plain spread was here with the right reason attached — "a preference added in a later
 * version is missing from every existing install, and `undefined` reaching a `<Switch
 * value>` is a crash on a screen the user is looking at" — and it covered only the
 * missing half. A spread takes whatever the stored object holds, so `{ sound: null }`
 * from a truncated write puts exactly that `null` on the Switch the comment was worried
 * about, and `{ dailyGoalMinutes: "10" }` makes the daily goal on Home `NaN` by way of
 * `lessonsPerDay`.
 *
 * A key that fails falls back to its default rather than dropping the file: preferences
 * are independent, and losing somebody's language because their avatar was malformed is a
 * worse trade than the one this is fixing.
 */
function load(): Preferences {
  const stored = readJson<Partial<Preferences>>(KEY, isRecord)
  if (stored === null) return DEFAULTS

  const merged: Record<string, unknown> = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as (keyof Preferences)[]) {
    const value = (stored as Record<string, unknown>)[key]
    if (value !== undefined && VALID[key](value)) merged[key] = value
  }
  return merged as Preferences
}

export type UsePreferences = {
  readonly preferences: Preferences
  readonly set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
}

export function usePreferences(): UsePreferences {
  const [preferences, setPreferences] = useState<Preferences>(load)

  /**
   * The latest preferences, readable synchronously between renders.
   *
   * `set` used to build each write from the `preferences` of the render that created
   * it. That is correct for a settings screen, where every write is a separate tap a
   * render apart — and wrong the moment two writes happen in one handler. Onboarding
   * stores three answers in its `finish`, and all three read the same stale snapshot:
   * the last one wins and the first two are lost, so the two new onboarding questions
   * changed no lesson at all.
   *
   * A ref rather than a functional `setPreferences` updater because the write to
   * device storage has to happen exactly once per call. An updater is allowed to run
   * twice, and under StrictMode it does.
   */
  const latest = useRef(preferences)

  const set = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]): void => {
      const next = { ...latest.current, [key]: value }
      latest.current = next
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
    // Stable for the life of the hook: everything it reads comes from the ref, so
    // there is nothing here for a dependency to track.
    [],
  )

  return { preferences, set }
}

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = ['system', ...SUPPORTED_LOCALES]
