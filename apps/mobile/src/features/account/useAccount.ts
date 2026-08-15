/**
 * The account flow's state machine and its two network calls.
 *
 * Kept out of `AccountScreen` for the reason every screen in this app is: a component
 * that reaches Supabase cannot be mounted by a component test or the screenshot
 * renderer, and a screen nobody can mount is a screen nobody reviews.
 *
 * ## Errors are mapped here, not shown raw
 *
 * Supabase returns messages written for developers — "Email address is invalid",
 * "Token has expired or is invalid", "AuthApiError". Showing those to a user is how an
 * app reads as unfinished, and one of them ("User already registered") means something
 * the user can actually act on, which a raw string does not tell them. So each is mapped
 * to a sentence that names the fix, and anything unrecognised falls back to the generic
 * one rather than leaking the original.
 */

import { useCallback, useState } from 'react'
import {
  confirmEmail,
  confirmSignIn,
  linkEmail,
  requestSignIn,
} from '@worldquest/api'
import { supabase } from '../../lib/supabase.js'
import { useT } from '../../lib/i18n.js'
import type { AccountMode, AccountStage } from './AccountScreen.js'

export type UseAccount = {
  readonly stage: AccountStage
  readonly loading: boolean
  readonly error: string | undefined
  readonly email: string
  readonly setEmail: (value: string) => void
  readonly code: string
  readonly setCode: (value: string) => void
  readonly submitEmail: () => void
  readonly submitCode: () => void
  readonly changeEmail: () => void
}

export function useAccount(mode: AccountMode): UseAccount {
  const t = useT()
  const [stage, setStage] = useState<AccountStage>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  /**
   * Supabase's message → ours.
   *
   * Matched on substrings rather than on an error code, because supabase-js does not
   * give a stable one for these. That is fragile, and the fallback is what makes it
   * safe: an unrecognised message becomes the generic sentence, never the original.
   */
  const explain = useCallback(
    (cause: unknown): string => {
      const raw = cause instanceof Error ? cause.message.toLowerCase() : ''
      if (raw.includes('already been registered') || raw.includes('already registered')) {
        return t('account:error.taken')
      }
      if (raw.includes('signups not allowed') || raw.includes('user not found')) {
        // What `shouldCreateUser: false` returns for an address with no account. The
        // wording is unrecognisable as that, which is the whole reason for this map.
        return t('account:error.noAccount')
      }
      if (raw.includes('token') || raw.includes('otp') || raw.includes('expired')) {
        return t('account:error.badCode')
      }
      return t('account:error.generic')
    },
    [t],
  )

  const run = useCallback(
    (work: () => Promise<void>, onDone: () => void): void => {
      setLoading(true)
      setError(undefined)
      void work()
        .then(() => {
          onDone()
          setLoading(false)
        })
        .catch((cause: unknown) => {
          setError(explain(cause))
          setLoading(false)
        })
    },
    [explain],
  )

  const submitEmail = useCallback((): void => {
    const address = email.trim()
    if (address.length === 0) return
    run(
      () =>
        mode === 'link'
          ? linkEmail(supabase(), address)
          : requestSignIn(supabase(), address),
      () => setStage('code'),
    )
  }, [email, mode, run])

  const submitCode = useCallback((): void => {
    const address = email.trim()
    run(
      async () => {
        if (mode === 'link') {
          await confirmEmail(supabase(), address, code)
        } else {
          await confirmSignIn(supabase(), address, code)
        }
      },
      () => setStage('done'),
    )
  }, [code, email, mode, run])

  // Back to the address. The code is cleared with it — a six-digit code that was sent
  // to a different address is not a code the user can still use, and leaving it in the
  // field invites one more failed attempt.
  const changeEmail = useCallback((): void => {
    setCode('')
    setError(undefined)
    setStage('email')
  }, [])

  return {
    stage,
    loading,
    error,
    email,
    setEmail,
    code,
    setCode,
    submitEmail,
    submitCode,
    changeEmail,
  }
}
