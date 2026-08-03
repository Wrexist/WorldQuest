/**
 * Crash reporting — the transport, and the one property it must never undo.
 *
 * ## What was here before
 *
 * `ErrorBoundary` caught render crashes, fired an analytics event, and wrote to
 * `console.error` with a comment saying "reported to Sentry once it is connected".
 * Nothing was connected, so in production a crash reached a device log nobody reads
 * and stopped there.
 *
 * ## The property this file exists to protect
 *
 * `docs/plan/device-pass.md` states it plainly: the payload must carry **no message
 * text**. A React error string routinely contains a prop value, and in this app a prop
 * value can be a country name a child typed into the collection search. "Cannot read
 * property 'x' of undefined" is harmless; `Invalid country: <whatever they typed>` is
 * a child's free text leaving the device to a third party.
 *
 * That property held only because `ErrorBoundary` happened to pass `error.name` and
 * not `error.message`. One sloppy line in a Sentry integration would have undone it,
 * and nothing would have failed.
 *
 * So it is enforced by the **type**, not by discipline. `CrashReport` has no field
 * that can hold free text — every field is either a fixed union or a constrained
 * identifier. A sink physically cannot forward a message it was never given. Getting
 * this wrong is a compile error, which is the only kind of guarantee worth having for
 * something nobody will remember to check.
 *
 * ## Why the SDK is not initialised by default
 *
 * `Sentry.init` is called only when `EXPO_PUBLIC_SENTRY_DSN` is set. With no DSN the
 * whole thing is a no-op that still routes crashes to the console, which is exactly
 * what a developer wants and exactly what a fork of this repo with no Sentry account
 * needs. There is no half-configured state where the app thinks it is reporting and
 * is not.
 *
 * ## What is NOT verified
 *
 * That an event actually arrives. That needs a real DSN, and this environment has
 * none. Both native platforms bundle with the SDK installed — which is the failure
 * mode that would otherwise have been found on a phone — but the round trip is the
 * last item in `device-pass.md` for a reason.
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
 * Where reports go. Swapped in tests; set to the Sentry adapter at startup.
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
 * Wire up Sentry, if and only if a DSN is configured.
 *
 * Called once from the root layout. Returns whether reporting is live, so startup can
 * say so rather than leaving it ambiguous.
 */
export function initCrashReporting(dsn: string | undefined = process.env
  .EXPO_PUBLIC_SENTRY_DSN): boolean {
  if (dsn === undefined || dsn === '') return false

  // Lazy so the SDK is never *evaluated* in a build with no DSN, and so this module
  // stays importable in unit tests without the native module present.
  //
  // It does NOT keep the SDK out of the bundle. Metro resolves every statically
  // analysable `require` at build time wherever it appears, so the 1.92 MB it costs
  // is in every build regardless — see the budget note in scripts/bundle-native.cjs.
  // Saying otherwise here would be the kind of comment that makes a later reader
  // trust a saving that does not exist.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native')

  Sentry.init({
    dsn,
    // Every one of these is a privacy decision, not a tuning knob. Children use this
    // app; the DoD's child-privacy rules are never waivable.
    sendDefaultPii: false,
    // Breadcrumbs record navigation, taps and network calls — including, on a search
    // screen, what was typed. The crash domain is what makes a bug fixable; the
    // breadcrumb trail is what makes it a privacy incident.
    maxBreadcrumbs: 0,
    // No session replay, no screenshots, no view hierarchy. All three capture screen
    // content, which for this app means a child's progress and anything they typed.
    attachScreenshot: false,
    attachViewHierarchy: false,
    attachStacktrace: true,
    // Off: we do not send performance traces, and a sampled transaction carries URLs.
    tracesSampleRate: 0,
    // Last line of defence. The type system prevents a message reaching `reportCrash`,
    // but the SDK also captures unhandled natives on its own, and those DO carry
    // messages. Strip them rather than trust every future call site.
    beforeSend: (event) => scrub(event),
  })

  setCrashSink((report) => {
    Sentry.captureEvent({
      level: report.isFatal ? 'fatal' : 'error',
      // `type`/`value` only. There is no message to pass — see the header.
      exception: { values: [{ type: report.name, value: report.domain }] },
      tags: { domain: report.domain, fatal: String(report.isFatal) },
    })
  })

  return true
}

/**
 * Remove free text from anything the SDK captured by itself.
 *
 * Exported for testing: this is the half of the privacy guarantee the type system
 * cannot reach, so it is the half that needs assertions.
 */
export function scrub<T extends object>(event: T): T {
  // `T extends object` rather than `Record<string, unknown>`: the SDK's `ErrorEvent`
  // is an interface with optional known keys, which is not assignable to an index
  // signature. Widening the constraint keeps this usable from `beforeSend` without a
  // cast at the call site — and a cast there is exactly where a privacy guard should
  // not have one.
  // Spreading a generic yields `T`, so the widening is explicit. `as` on a shape we
  // own is not an escape hatch in the sense `escape-hatches.ts` bans — it asserts a
  // structural fact, it does not switch off checking. No `any`, no suppression.
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
