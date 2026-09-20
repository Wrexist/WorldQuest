import { useCallback, useEffect, useRef, useState } from 'react'
import { D1AuthError, type createD1AuthClient, type D1Account, type D1Challenge, type D1Session } from '@worldquest/api/d1-auth'

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

/** Account UI state only; credentials and pending challenges live in protected storage. */
export function useD1Account(client: D1AccountClient, host: D1AccountHost, locale: 'en' | 'sv', online: boolean) {
  const currentClient = useRef(client)
  const mounted = useRef(false), locked = useRef(false)
  const opened = useRef(false)
  const [state, setState] = useState<D1AccountState>(initial)
  const patch = useCallback((next: Partial<D1AccountState>) => {
    if (mounted.current) setState(previous => ({ ...previous, ...next }))
  }, [])
  const run = useCallback(async (work: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    patch({ busy: true, error: null })
    try { await work() }
    catch (error) {
      const code = error instanceof D1AuthError ? error.code : 'SERVICE_UNAVAILABLE'
      // An ended session is the recovery screen's own subject: its copy already
      // explains that the session ended and what happens to local progress.
      // Falling through to the error banner printed "That didn't work. Check your
      // connection and try again." under that explanation, blaming the network for
      // the one outcome this screen exists to describe. Found on device at
      // 4383e3e. Every other failure, including a failed recovery, still shows it.
      const ended = code === 'SESSION_EXPIRED' || code === 'AUTH_REQUIRED'
      patch({ error: ended ? null : code,
        ...(ended ? { stage: 'recovery' as const } : {}),
        ...(code === 'ACCOUNT_PROTECTED' ? { stage: 'protected' as const } : {}),
        ...(code === 'CREDENTIAL_CLEANUP_REQUIRED' ? { stage: 'cleanup' as const } : {}),
        ...(code === 'ACCOUNT_ACTIVATION_REQUIRED' ? { stage: 'activation' as const } : {}),
        ...(error instanceof D1AuthError && error.retryChallenge ? { stage: 'code' as const, challenge: error.retryChallenge } : {}) })
    } finally { locked.current = false; patch({ busy: false }) }
  }, [patch])
  const load = useCallback(() => run(async () => {
    patch({ stage: 'loading' })
    try {
      const auth = currentClient.current
      const session = await auth.restore()
      if (!session) { patch({ stage: host.deletionPending() ? 'cleanup' : 'empty', account: null, challenge: null }); return }
      // Restore the pending operation before offering another address or purpose.
      const challenge = await auth.pending()
      if (challenge) {
        patch({ stage: 'code', challenge, intent: challenge.purpose, email: challenge.email, code: '' })
        return
      }
      const account = await auth.account()
      patch({ stage: 'account', account, challenge: null })
    } catch (error) { patch({ stage: 'error' }); throw error }
  }), [patch, run, host])
  useEffect(() => {
    mounted.current = true
    if (online && !opened.current) { opened.current = true; void load() }
    return () => { mounted.current = false }
  }, [load, online])

  const select = (intent: D1AccountIntent) => {
    if (locked.current) return
    const account = state.account
    patch({ intent, error: null, code: '', email: intent === 'delete' ? account?.email ?? '' : '',
      stage: intent === 'delete' ? 'delete' : account?.audience === 'unknown' ? 'audience'
        : account?.audience === 'protected' ? 'protected' : 'email' })
  }
  const request = () => run(async () => {
    const challenge = await currentClient.current.requestEmail(state.email, state.intent, locale)
    patch({ stage: 'code', challenge, code: '' })
  })
  const finishDeletion = async () => {
    try { await host.finishDeletion() }
    catch { throw new D1AuthError('CREDENTIAL_CLEANUP_REQUIRED') }
  }
  return { state, load, select,
    edit: (field: 'email' | 'code' | 'birthYear', value: string) => {
      if (!locked.current) patch({ [field]: value, error: null })
    },
    start: () => run(async () => { await currentClient.current.startGuest(); patch({ account: await currentClient.current.account(), stage: 'account' }) }),
    recordAudience: () => run(async () => {
      await currentClient.current.recordAudience(Number(state.birthYear))
      const account = await currentClient.current.account()
      patch({ account, birthYear: '', stage: account.audience === 'eligible' ? 'email' : 'protected' })
    }),
    request,
    resend: () => run(async () => {
      const challenge = await currentClient.current.resendEmail()
      patch({ challenge, code: '' })
    }),
    verify: () => run(async () => {
      if (!/^\d{8}$/.test(state.code)) { patch({ error: 'INVALID_CODE' }); return }
      const result = await host.changeIdentity(() => currentClient.current.verifyEmail(state.code), state.intent === 'delete')
      if ('deleted' in result) await finishDeletion()
      patch({ stage: 'done', code: '', challenge: null, deleted: 'deleted' in result })
    }),
    confirmDelete: () => run(async () => {
      const email = state.account?.email ?? (state.challenge?.purpose === 'delete' ? state.challenge.email : null)
      if (email) {
        const challenge = await currentClient.current.requestEmail(email, 'delete', locale)
        patch({ stage: 'code', challenge, code: '' })
      } else {
        await host.changeIdentity(() => currentClient.current.deleteGuest(), true)
        await finishDeletion()
        patch({ stage: 'done', deleted: true })
      }
    }),
    retryCleanup: () => run(async () => {
      await currentClient.current.signOut()
      await finishDeletion()
      patch({ stage: 'done', deleted: true })
    }),
    retryActivation: () => run(async () => { await host.resumeIdentity(); patch({ stage: 'done', challenge: null, code: '' }) }),
    recover: () => run(async () => {
      // This explicit choice detaches old work; the host must never erase or adopt it.
      currentClient.current = await host.recoverSession()
      const account = await currentClient.current.account()
      patch({ ...initial, stage: account.audience === 'eligible' ? 'email' : 'audience', intent: 'login', account })
    }),
    changeEmail: () => { if (!locked.current) patch({ stage: state.intent === 'delete' ? 'delete' : 'email', code: '', error: null }) },
  }
}
