import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { D1AuthError, type createD1AuthClient, type D1Account, type D1Challenge, type D1Session } from '@worldquest/api/d1-auth'
import { captureStorage } from '../../lib/storage.js'

export type D1AccountClient = ReturnType<typeof createD1AuthClient>
type IdentityResult = D1Session | { deleted: true }
/** The host quarantines learning work before identity changes. Never inject the legacy adapter. */
export type D1AccountHost = {
  changeIdentity: (operation: () => Promise<IdentityResult>, deleting?: boolean) => Promise<IdentityResult>
  recoverSession: () => Promise<D1AccountClient>
  finishDeletion: () => Promise<void>
  resumeIdentity: () => Promise<void>
  deletionPending: () => boolean
}
export type D1AccountStage = 'loading' | 'empty' | 'account' | 'audience' | 'protected' | 'email' | 'code' | 'recovery' | 'delete' | 'cleanup' | 'activation' | 'done' | 'error'
export type D1AccountIntent = 'link' | 'login' | 'delete'
export type D1AccountState = {
  stage: D1AccountStage; busy: boolean; account: D1Account | null; challenge: D1Challenge | null
  intent: D1AccountIntent; email: string; code: string; birthYear: string; error: string | null; deleted: boolean
}
const initial: D1AccountState = { stage: 'loading', busy: false, account: null, challenge: null,
  intent: 'link', email: '', code: '', birthYear: '', error: null, deleted: false }

/*
 * The flow lives here, outside any one mounted screen.
 *
 * Every identity change remounts the whole tree: `appD1Host` moves the storage scope to a
 * fresh guest while the change runs and back to the owner after it, and the provider tree
 * is keyed by that scope. With the state inside the screen, the screen that started a
 * link, sign-in or deletion was gone before it finished and its replacement began again
 * at `loading`. Nobody saw "Your email is linked" or "Welcome back", a refused code's
 * message went to a screen that was no longer there, and on a new phone the Continue
 * that opens the app was never offered (`pnpm e2e:d1`, the second phone).
 *
 * One account flow is on screen at a time, so one store is enough. A screen mounted while
 * an operation runs, or after one has finished and not yet been acknowledged, shows that
 * flow; any other mount starts a fresh one.
 */
let flow: D1AccountState = initial
let inFlight = false
let flowClient: D1AccountClient | null = null
/**
 * Whose storage scope a finished flow belongs to. A "Welcome back" left on screen by a
 * swipe-back is shown again only to that same account: adopted by anyone, it carried one
 * person's sign-in to the next person who opened the screen on that device.
 */
let flowOwner: string | null | undefined
/** The birth year the audience step sent, for a phone finishing onboarding by signing in. */
let sentBirthYear: number | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => flow
function patch(next: Partial<D1AccountState>): void {
  flow = { ...flow, ...next }
  for (const listener of listeners) listener()
}

/** A fresh flow, as on a cold start. For tests, which share this module. */
export function resetD1AccountFlow(): void {
  flow = initial; inFlight = false; flowClient = null; sentBirthYear = undefined; flowOwner = undefined
}

/** What this device knows about the person holding it, from onboarding's age gate. */
export type DeviceAge = { readonly birthYear?: number | undefined; readonly isChild?: boolean | undefined }

/**
 * The account as this screen may show it. A device whose age gate said "child" is
 * treated as protected whatever the server's band says, so no email flow opens on it
 * even while the band is still unknown (S03).
 */
function shown(account: D1Account, age: DeviceAge): D1Account {
  return age.isChild === true && account.audience !== 'protected' ? { ...account, audience: 'protected' } : account
}

/** Where an email flow starts for this account: the age first only if nobody has asked. */
function emailStage(account: D1Account): D1AccountStage {
  return account.audience === 'unknown' ? 'audience' : account.audience === 'protected' ? 'protected' : 'email'
}

/** Straight to signing in: the birth year first if the band is unknown, else the email. */
function signingIn(account: D1Account): void {
  patch({ account, challenge: null, intent: 'login', email: '', code: '', stage: emailStage(account) })
}

/**
 * Account UI state only; credentials and pending challenges live in protected storage.
 *
 * `entry` is how the screen was opened. `'signIn'` is onboarding's "I already have an
 * account": on a phone with no session it goes straight to signing in rather than
 * offering to start an account, which is the opposite of what the person just said.
 */
export function useD1Account(client: D1AccountClient, host: D1AccountHost, locale: 'en' | 'sv', online: boolean,
  entry?: 'signIn' | 'link', options: {
    /** Onboarding's answer on this device: used instead of asking again, and to protect a child. */
    readonly age?: DeviceAge | undefined
    /** A sign-in succeeded; called inside it, while the new account's scope is current. */
    readonly onSignedIn?: ((birthYear: number | undefined) => void) | undefined
    /** The current storage scope's owner. A seam for tests; the app's is the real one. */
    readonly owner?: (() => string | null) | undefined
  } = {}) {
  const age = options.age ?? {}
  const owner = options.owner ?? (() => captureStorage().userId)
  // Decided once, on this screen's first render: carry on a flow in progress or finished
  // (the remount an identity change causes), or start a fresh one. The reset is written
  // here rather than in an effect so a fresh screen never paints the last visit's state.
  const adopted = useRef<boolean | null>(null)
  if (adopted.current === null) {
    adopted.current = inFlight || (flow.stage === 'done' && flowOwner === owner())
    if (!adopted.current) resetD1AccountFlow()
    flowClient ??= client
  }
  const state = useSyncExternalStore(subscribe, snapshot, snapshot)
  const auth = () => flowClient ?? client

  const run = useCallback(async (work: () => Promise<void>) => {
    if (inFlight) return
    inFlight = true
    patch({ busy: true, error: null })
    try { await work() }
    catch (error) {
      const code = error instanceof D1AuthError ? error.code : 'SERVICE_UNAVAILABLE'
      patch({ error: code,
        ...(code === 'SESSION_EXPIRED' || code === 'AUTH_REQUIRED' ? { stage: 'recovery' as const } : {}),
        ...(code === 'ACCOUNT_PROTECTED' ? { stage: 'protected' as const } : {}),
        ...(code === 'CREDENTIAL_CLEANUP_REQUIRED' ? { stage: 'cleanup' as const } : {}),
        ...(code === 'ACCOUNT_ACTIVATION_REQUIRED' ? { stage: 'activation' as const } : {}),
        ...(error instanceof D1AuthError && error.retryChallenge ? { stage: 'code' as const, challenge: error.retryChallenge } : {}) })
    } finally { inFlight = false; patch({ busy: false }) }
  }, [])
  const load = useCallback(() => run(async () => {
    patch({ stage: 'loading' })
    try {
      const current = flowClient ?? client
      const session = await current.restore()
      if (!session && entry === 'signIn' && !host.deletionPending()) {
        // A sign-in code is requested BY a device session, so one is still needed; it
        // is made quietly and holds nothing. The sign-in then replaces it.
        await current.startGuest()
        signingIn(shown(await current.account(), age))
        return
      }
      if (!session) { patch({ stage: host.deletionPending() ? 'cleanup' : 'empty', account: null, challenge: null }); return }
      // Restore the pending operation before offering another address or purpose.
      const challenge = await current.pending()
      if (challenge) {
        patch({ stage: 'code', challenge, intent: challenge.purpose, email: challenge.email, code: '' })
        return
      }
      const account = shown(await current.account(), age)
      // The app usually made a guest at launch, so "I already have an account" finds one:
      // a guest with no email is not an account anyone meant, and the screen goes on to
      // signing in rather than stopping at it (`pnpm e2e:d1`, the second phone).
      if (entry === 'signIn' && account.email === null) { signingIn(account); return }
      // "Create a profile" and "Link your email" mean that, not a menu with Delete on it:
      // straight to the address, the year first only if nobody has asked it.
      if (entry === 'link' && account.email === null) {
        const year = account.audience === 'unknown' ? age.birthYear : undefined
        patch({ account, challenge: null, intent: 'link', email: '', code: '', ...(year === undefined ? { stage: emailStage(account) } : {}) })
        if (year !== undefined) {
          await current.recordAudience(year)
          sentBirthYear = year
          const now = shown(await current.account(), age)
          patch({ account: now, stage: now.audience === 'eligible' ? 'email' : 'protected' })
        }
        return
      }
      patch({ stage: 'account', account, challenge: null })
    } catch (error) { patch({ stage: 'error' }); throw error }
  }), [run, client, host, entry])
  const opened = useRef(false)
  useEffect(() => {
    if (!online || opened.current) return
    opened.current = true
    if (!adopted.current) void load()
  }, [load, online])

  const select = (intent: D1AccountIntent) => {
    if (inFlight) return
    const account = flow.account
    // Asked once: onboarding already took the year on this device, so it is sent rather
    // than asked again. Two answers to one question, the first of them kept, is how a
    // parent's year on a child's tablet became the child's (S02).
    const year = intent !== 'delete' && account?.audience === 'unknown' ? age.birthYear : undefined
    patch({ intent, error: null, code: '', email: intent === 'delete' ? account?.email ?? '' : '',
      ...(year !== undefined ? {} : { stage: intent === 'delete' ? 'delete' : account === null ? 'email' : emailStage(account) }) })
    if (year !== undefined) void sendYear(year)
  }
  const sendYear = (birthYear: number) => run(async () => {
    await auth().recordAudience(birthYear)
    sentBirthYear = birthYear
    const account = shown(await auth().account(), age)
    patch({ account, birthYear: '', stage: account.audience === 'eligible' ? 'email' : 'protected' })
  })
  const finish = (next: Partial<D1AccountState>) => {
    flowOwner = owner()
    patch({ ...next, stage: 'done' })
  }
  const request = () => run(async () => {
    const challenge = await auth().requestEmail(flow.email, flow.intent, locale)
    patch({ stage: 'code', challenge, code: '' })
  })
  const finishDeletion = async () => {
    try { await host.finishDeletion() }
    catch { throw new D1AuthError('CREDENTIAL_CLEANUP_REQUIRED') }
  }
  return { state, load, select,
    edit: (field: 'email' | 'code' | 'birthYear', value: string) => {
      if (!inFlight) patch({ [field]: value, error: null })
    },
    start: () => run(async () => { await auth().startGuest(); patch({ account: await auth().account(), stage: 'account' }) }),
    recordedBirthYear: () => sentBirthYear,
    /** The person has seen the result: the next time the screen opens, it starts afresh. */
    acknowledge: () => { if (!inFlight) resetD1AccountFlow() },
    recordAudience: () => sendYear(Number(flow.birthYear)),
    request,
    resend: () => run(async () => {
      const challenge = await auth().resendEmail()
      patch({ challenge, code: '' })
    }),
    verify: () => run(async () => {
      const code = flow.code
      if (!/^\d{8}$/.test(code)) { patch({ error: 'INVALID_CODE' }); return }
      const result = await host.changeIdentity(() => auth().verifyEmail(code), flow.intent === 'delete')
      if ('deleted' in result) await finishDeletion()
      // Onboarding is finished by the sign-in itself, here, while the account it belongs
      // to is the current scope, and not by a later Continue a different person may press.
      else if (flow.intent === 'login') options.onSignedIn?.(sentBirthYear)
      finish({ code: '', challenge: null, deleted: 'deleted' in result })
    }),
    confirmDelete: () => run(async () => {
      const email = flow.account?.email ?? (flow.challenge?.purpose === 'delete' ? flow.challenge.email : null)
      if (email) {
        const challenge = await auth().requestEmail(email, 'delete', locale)
        patch({ stage: 'code', challenge, code: '' })
      } else {
        await host.changeIdentity(() => auth().deleteGuest(), true)
        await finishDeletion()
        finish({ deleted: true })
      }
    }),
    retryCleanup: () => run(async () => {
      await auth().signOut()
      await finishDeletion()
      finish({ deleted: true })
    }),
    retryActivation: () => run(async () => {
      await host.resumeIdentity()
      // Reopened; but was the operation itself done? Activation also follows a refused
      // code whose reopen failed, and calling that "linked" was a false success. Only the
      // account the server now names can say.
      const account = shown(await auth().account(), age)
      const address = flow.challenge?.email ?? flow.email
      const happened = (flow.intent === 'link' || flow.intent === 'login') && account.email !== null
        && account.email === address
      if (!happened) { patch({ stage: 'account', account, challenge: null, code: '' }); return }
      if (flow.intent === 'login') options.onSignedIn?.(sentBirthYear)
      finish({ challenge: null, code: '' })
    }),
    recover: () => run(async () => {
      // This explicit choice detaches old work; the host must never erase or adopt it.
      flowClient = await host.recoverSession()
      const account = shown(await flowClient.account(), age)
      patch({ ...initial, stage: emailStage(account), intent: 'login', account })
    }),
    changeEmail: () => { if (!inFlight) patch({ stage: flow.intent === 'delete' ? 'delete' : 'email', code: '', error: null }) },
  }
}
