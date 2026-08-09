/**
 * Crash reporting — the transport, and the one property it must never undo.
 *
 * ## 2026-08-09 — `@sentry/react-native` removed
 *
 * The dependency cost **1.92 MiB** of Hermes bytecode (3.80 → 5.72 MiB when it landed —
 * see `scripts/bundle-native.cjs`), which is what pushed the bundle budget from 4.0 to
 * 6.0. `PROJECT.md` §5.5, `architecture.md` §5 and `testing-strategy.md` §6 all
 * documented **4 MB** as the real target the whole time; the 6.0 gate was the
 * contradiction, not the docs.
 *
 * Isac decided (2026-08-09, see `docs/plan/cowork-handoff.md` §6) to hold the 4 MiB
 * budget and drop Sentry rather than raise the documented number. Lazy-loading was
 * considered and rejected: Metro resolves every statically-analysable `require` at
 * build time regardless of where it sits, so a lazy `require('@sentry/react-native')`
 * would have shipped the same 1.92 MiB it does eagerly — it only defers *evaluating*
 * the SDK, not shipping its bytes. Only removing the dependency actually recovers the
 * budget. No Sentry account exists yet either (checked 2026-08-09), so nothing was lost
 * that had a DSN behind it.
 *
 * This is reversible, not a redesign: the crash-report shape, the sink seam and the
 * scrubber below are all independent of Sentry and stay in place. Re-adding real
 * transport later is `pnpm add @sentry/react-native` plus restoring an `initCrashReporting`
 * body — see git history on this file for the previous implementation — and revisiting
 * the budget with a real DSN and a real measurement in hand.
 *
 * ## What was here before that
 *
 * `ErrorBoundary` caught render crashes, fired an analytics event, and wrote to
 * `console.error` with a comment saying "reported to Sentry once it is connected".
 * Nothing was connected, so in production a crash reached a device log nobody reads
 * and stopped there. That is exactly where this leaves it again today — a console sink,
 * not a third party — until telemetry is deliberately re-added with an account behind it.
 *
 * ## The property this file exists to protect
 *
 * `docs/plan/device-pass.md` states it plainly: a reported crash must carry **no
 * message text**. A React error string routinely contains a prop value, and in this app
 * a prop value can be a country name a child typed into the collection search.
 * "Cannot read property 'x' of undefined" is harmless; `Invalid country: <whatever they
 * typed>` is a child's free text leaving the device to a third party.
 *
 * That property is enforced by the **type**, not by discipline. `CrashReport` has no
 * field that can hold free text — every field is either a fixed union or a constrained
 * identifier. A sink physically cannot forward a message it was never given. Getting
 * this wrong is a compile error, which is the only kind of guarantee worth having for
 * something nobody will remember to check. This holds regardless of which SDK, if any,
 * ends up behind `setCrashSink`.
 */

/** The only shape a crash can be reported in. Note what is absent: free text. */
export type CrashReport = {
  /**
   * Where it happened, as a closed set. Not a string, so it cannot become a
   * description of what went wrong with a user's data in it.
   */
  readonly domain: 'render' | 'lesson' | 'sync' | 'content' | 'startup'
  /**
   * `error.name` — "TypeError", "RangeError", a custom class name. Constructor names
   * are code identifiers written by us; they do not carry runtime values.
   */
  readonly name: string
  /** Fatal means the user saw the crash screen rather than a recoverable failure. */
  readonly isFatal: boolean
}

/**
 * Where reports go. Swapped in tests; would be pointed at a real transport again if one
 * is re-added.
 *
 * A sink never throws — reporting a crash must not cause one. Anything that escapes
 * is swallowed here rather than in each sink.
 */
export type CrashSink = (report: CrashReport) => void

const consoleSink: CrashSink = (report) => {
  // Deliberately not `console.error`: this runs after the caller has already logged
  // the real error with its stack. A second red block adds noise and no information.
  console.warn(`[crash] ${report.domain}/${report.name}${report.isFatal ? ' (fatal)' : ''}`)
}

let sink: CrashSink = consoleSink

export function setCrashSink(next: CrashSink): void {
  sink = next
}

/** Test seam — restores the default so one test cannot leak into the next. */
export function __resetCrashSinkForTests(): void {
  sink = consoleSink
}

export function reportCrash(report: CrashReport): void {
  try {
    sink(report)
  } catch {
    // A failure inside crash reporting must never become a second crash.
  }
}

/**
 * No third-party crash transport is wired up. Always returns `false`.
 *
 * Kept as a named call — rather than deleted from the root layout — so re-adding a real
 * transport later is a change to this one function's body, not a hunt through
 * `_layout.tsx` for where initialisation used to happen. See the file header for why it
 * was removed and what it would take to bring it back.
 */
export function initCrashReporting(_dsn?: string): boolean {
  return false
}

/**
 * Remove free text from anything a future SDK might capture by itself.
 *
 * Not called by anything today — there is no SDK to call it. Kept and tested because it
 * is the half of the privacy guarantee the type system cannot reach on its own, and the
 * property it protects (`docs/plan/device-pass.md`'s "no message text") must hold again
 * immediately if a transport is re-added, not be rediscovered.
 */
export function scrub<T extends object>(event: T): T {
  // `T extends object` rather than `Record<string, unknown>`: an SDK's `ErrorEvent` is
  // typically an interface with optional known keys, which is not assignable to an
  // index signature. Widening the constraint keeps this usable from a `beforeSend`-style
  // hook without a cast at the call site — and a cast there is exactly where a privacy
  // guard should not have one.
  const next = { ...event } as Record<string, unknown>
  delete next['message']
  delete next['breadcrumbs']
  delete next['user']
  delete next['request']
  delete next['contexts']
  delete next['extra']

  const exception = next['exception'] as { values?: Array<Record<string, unknown>> } | undefined
  if (exception?.values !== undefined) {
    next['exception'] = {
      ...exception,
      values: exception.values.map((v) => {
        const { value: _dropped, ...rest } = v
        // `type` is the class name and stays. `value` is the message and goes —
        // replaced with a constant so the event still reads sensibly in the UI.
        return { ...rest, value: 'redacted' }
      }),
    }
  }
  return next as T
}
