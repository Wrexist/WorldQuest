/**
 * `/create-profile` — "Create a profile", after a guest's first finished lessons.
 *
 * Reached from the after-lesson chain (`afterLesson.ts`) when `shouldOfferProfile` says
 * so: an adult guest, known to be one, online, after one of their first two lessons, at
 * most twice per device. This route counts the showing, and re-checks the two rules a
 * hand-typed link could otherwise walk past — it steps straight on for a child, whatever
 * the URL says, and for anyone the server says is already linked.
 *
 * "Create a profile" REPLACES this screen with the account flow's link path, ending the
 * chain there: somebody who chose to make a profile has told us what they want to do
 * next, and a paywall behind it would be the app changing the subject. Back from the
 * account screen lands on Home. "Not now" continues the chain.
 */

import { useEffect, useRef } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { CreateProfile } from '../src/features/account/CreateProfile.js'
import { recordProfileAskShown } from '../src/features/account/profileAsk.js'
import { useAccountStatus } from '../src/features/account/useAccountStatus.js'
import { useOnboarding } from '../src/features/onboarding/useOnboarding.js'
import { nextAfterLesson } from '../src/features/lesson/afterLesson.js'
import { useOnline } from '../src/lib/connectivity.js'

export default function CreateProfileRoute() {
  const params = useLocalSearchParams<{ then?: string; countries?: string; unlocks?: string }>()
  const next = nextAfterLesson(params)
  // On device and synchronous, like every child decision in this app: an under-13 must
  // never see a request for an email address, not even for one frame. Unknown is not
  // an adult either — the same reading analytics gives it.
  const { state } = useOnboarding()
  const adult = state.isChild === false
  const account = useAccountStatus({ enabled: adult })
  const online = useOnline()
  const allowed = adult && !account.linked
  const counted = useRef(false)
  const leaving = useRef(false)

  useEffect(() => {
    if (!allowed) {
      router.replace(next)
      return
    }
    // Counted once per showing, when it is actually on screen — the cap is two asks a
    // person saw, not two plans that happened to include one.
    if (counted.current) return
    counted.current = true
    recordProfileAskShown()
  }, [allowed, next])

  if (!allowed) return null

  const go = (href: string): void => {
    if (leaving.current) return
    leaving.current = true
    router.replace(href)
  }

  return (
    <CreateProfile
      offline={!online}
      onCreate={() => go('/account?mode=link')}
      onLater={() => go(next)}
    />
  )
}
