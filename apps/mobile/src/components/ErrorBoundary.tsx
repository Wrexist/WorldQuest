/**
 * H8 — the screen a render crash lands on.
 *
 * Without this, an uncaught error in any screen unmounts the whole tree: a red box in
 * development and a WHITE SCREEN in production, with no way out but force-quitting.
 * A user who has to force-quit an app once usually does not open it twice.
 *
 * A class component because React has no hook for this — `componentDidCatch` and
 * `getDerivedStateFromError` are the only way to catch a render error, and that has
 * not changed in any version.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { FailureState } from './FailureState.js'
import { track } from '../lib/analytics.js'
import { reportCrash } from '../lib/reporting.js'

type Props = { readonly children: ReactNode }
type State = { readonly error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The domain and the code, never the message: a React error string can carry a
    // prop value, and a prop value can carry a name a child typed. PII-free by
    // construction rather than by remembering to redact.
    track('error_occurred', { domain: 'render', code: error.name, is_fatal: true })

    // Same three fields to the crash reporter. `CrashReport` has no field that can
    // hold free text, so this call site cannot leak a message even by accident — see
    // lib/reporting.ts. With no DSN configured this is a console line; with one, it
    // is a Sentry event carrying the domain and the error class and nothing else.
    reportCrash({ domain: 'render', name: error.name, isFatal: true })

    // Logged unconditionally as well, and this one DOES include the message and the
    // component stack. That is deliberate and it is not a contradiction: this goes to
    // the local device log, which is how a developer debugs. Nothing here leaves the
    // phone. The rule is about what gets transmitted.
    console.error('[crash]', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children

    return (
      <FailureState
        titleKey="errors:crash.title"
        bodyKey="errors:crash.body"
        ctaKey="errors:crash.cta"
        // Remount rather than reload: the user's progress is on device and their
        // place in the app is usually recoverable. A full reload throws away a
        // lesson in progress for no reason.
        onPress={() => this.setState({ error: null })}
        detail={__DEV__ ? this.state.error.message : undefined}
      />
    )
  }
}
