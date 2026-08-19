/**
 * Telling the server which day the user is actually in.
 *
 * ## The gap this closes
 *
 * `profiles.timezone` decides four things, all of them server-side: the streak day
 * (`applyActivity`), the XP soft cap window, `isFirstLessonOfDay`, and which rows
 * `expire_streaks()` breaks each hour. `time/index.ts` argues at length that counting
 * 86,400,000 ms is the classic streak bug and that a local day is 23 or 25 hours twice a
 * year; `submit-lesson` reads the column and falls back to UTC if it cannot parse it;
 * `guard_protected_profile_columns` validates any write against `pg_timezone_names`
 * precisely so the client CAN set it.
 *
 * Nothing ever set it. The column defaults to `'UTC'`, `ensureSession` calls
 * `signInAnonymously()` with no metadata, and no screen or hook has ever written a
 * profile row — so every user this product has created rolls over at UTC midnight.
 *
 * For a user in Auckland that ends their day at 11 a.m.: an evening lesson counts
 * towards tomorrow, the soft cap resets over lunch, and `expire_streaks()` can break a
 * run while they still consider the day young. All the machinery for getting this right
 * was built, tested and documented; the one line that supplies the input was missing.
 *
 * ## Why the client is allowed to decide this
 *
 * It is the only party that knows. The alternative — inferring a zone from an IP — is
 * both worse and a data-collection decision this product has not made. The exploit it
 * opens is named in `20260805130000_guard_profile_columns.sql`: moving the zone back and
 * forth resets the soft-cap window on demand. That is the accepted cost of local days,
 * the same one every app with a streak pays, and the guard already refuses a zone that
 * is not real so the worse failure — a zone `Intl` cannot parse, which made every later
 * submission 500 — cannot happen.
 *
 * ## Why it is fire-and-forget
 *
 * Nothing waits on it and nothing is told if it fails. A device that could not reach the
 * server keeps the zone it had, which is the same behaviour as before this existed, and
 * the next launch tries again. Blocking a cold start on a profile write would be putting
 * a round trip in front of the first frame for a column that matters at the day
 * boundary.
 */

import { currentUser, isConfigured, supabase } from './supabase.js'

/**
 * The device's IANA zone, or null when the platform will not name one.
 *
 * `resolvedOptions().timeZone` is allowed to return undefined or the empty string on an
 * engine with no zone database, and writing either is a row the guard trigger rejects.
 */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof zone === 'string' && zone.length > 0 ? zone : null
  } catch {
    return null
  }
}

/** Guards against a pointless write on every launch, which is most of them. */
let lastWritten: string | null = null

export async function syncTimeZone(): Promise<void> {
  if (!isConfigured()) return
  const zone = deviceTimeZone()
  if (zone === null || zone === lastWritten) return

  try {
    const { userId } = await currentUser()
    // Only when it differs. A profile read is cheaper than a write that fires the guard
    // trigger, and this runs on every cold start for a value that changes when somebody
    // gets on a plane.
    const { data } = await supabase().from('profiles').select('timezone').eq('id', userId).single()
    if (data?.timezone === zone) {
      lastWritten = zone
      return
    }
    const { error } = await supabase().from('profiles').update({ timezone: zone }).eq('id', userId)
    if (!error) lastWritten = zone
  } catch {
    // Swallowed. See the header: a device that could not reach the server keeps the zone
    // it had, which is exactly the behaviour that preceded this function.
  }
}

/** Test seam. Drops the memo so the next call writes again. */
export function resetTimeZoneMemo(): void {
  lastWritten = null
}
