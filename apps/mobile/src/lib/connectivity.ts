/**
 * Whether we can actually reach anything.
 *
 * ## Why this exists as its own file
 *
 * `useContent()` returned `isOffline: false`, hardcoded. Home has had an offline
 * banner since the first week and it could never appear — the copy was written, the
 * component was tested, and the condition was a literal. Priya on the metro and Emma's
 * tablet with no SIM are the two personas this product is built around, and neither
 * had ever seen the reassurance written for them.
 *
 * ## Reachable, not "connected"
 *
 * `isInternetReachable` rather than `isConnected`. A device on a café's captive portal
 * is connected to wifi and can reach nothing, and telling that user "you're online"
 * while every request fails is worse than saying nothing. NetInfo resolves it by
 * probing, which is the only way to know.
 *
 * `null` — NetInfo has not finished its first probe — is treated as ONLINE. The banner
 * is reassurance, not an alarm, and flashing "you're offline" for 400 ms on every cold
 * start of a perfectly good connection would train users to ignore it.
 *
 * ## What offline does NOT mean here
 *
 * It does not mean the app stops. Content ships in the binary and the mutation queue
 * replays on reconnect (architecture.md §3), so a lesson works exactly as well in a
 * tunnel. Offline changes what we *say*, and blocks only the handful of actions that
 * genuinely cannot be done without a server.
 */

import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { backendUrl } from './supabase.js'
import { track } from './analytics.js'

let online = true
const listeners = new Set<() => void>()

/** The single writer. Every source of truth below funnels through here. */
function set(next: boolean): void {
  if (next === online) return
  online = next
  // Only the transition INTO offline. The registry has no matching "came back"
  // event, and a pair would be twice the volume for a number that is one
  // subtraction away.
  if (!next) track('offline_mode_entered', {})
  for (const listener of listeners) listener()
}

/**
 * Whether the reachability probe is worth running at all.
 *
 * ## Why the default probe is wrong here
 *
 * NetInfo decides `isInternetReachable` by fetching a URL, and its default on native
 * is `https://clients3.google.com/generate_204`. That is a third-party request, fired
 * from a child's device on every connectivity change, to a company we have no
 * relationship with. Rule 7 of this repo is that nothing on a child account talks to a
 * third party, and a connectivity ping does not get an exemption for being small.
 *
 * It also answers the wrong question. Google being up says nothing about whether OUR
 * server is, and "can we sync?" is the only thing any caller here wants to know.
 *
 * So the probe points at our own backend — and does not run when there is no backend
 * to point it at, because "can we reach the server" has no answer when there is no
 * server, and inventing one strands the user.
 */
const probing = (): boolean => backendUrl() !== ''

NetInfo.configure({
  reachabilityUrl: `${backendUrl()}/auth/v1/health`,
  reachabilityShouldRun: probing,
  // Any 2xx means we got through. The default only accepts 200, and a health endpoint
  // answering 204 is not a network failure.
  reachabilityTest: async (response) => response.status >= 200 && response.status < 300,
})

/**
 * Subscribed once at module load rather than per hook.
 *
 * Every screen that shows connectivity would otherwise open its own NetInfo
 * subscription, and on native each one drives its own reachability probe.
 */
NetInfo.addEventListener((state) => {
  // When the probe is switched off, NetInfo pins `isInternetReachable` to `false`
  // rather than leaving it `null` — see `_setExpectsConnection`. So it has to be
  // ignored outright, not fallen back from: `isInternetReachable ?? isConnected`
  // reads that pinned `false` as a real answer and reports a permanent outage on a
  // device with four bars. This cost two E2E runs, one in each direction.
  //
  // `?? true` because unknown is not offline. NetInfo's first probe takes a moment,
  // and flashing "you're offline" on every cold start of a good connection is how a
  // banner becomes something users learn to ignore.
  set(
    probing()
      ? (state.isInternetReachable ?? state.isConnected ?? true)
      : (state.isConnected ?? true),
  )
})

/**
 * The browser's own events, where they exist.
 *
 * NetInfo's web module reports the DROP and then nothing — it reads
 * `navigator.connection`, which does not fire on every transition, so a user who
 * reconnects stays offline until the app restarts. Instrumenting the real bundle
 * showed exactly one event on going offline and none at all on coming back.
 *
 * `online`/`offline` are a standard web API and fire reliably. On native there is no
 * `window.addEventListener`, so the optional call makes this web-only by construction
 * rather than by a platform branch.
 */
const browser = globalThis as {
  addEventListener?: (type: string, handler: () => void) => void
}
browser.addEventListener?.('online', () => set(true))
browser.addEventListener?.('offline', () => set(false))

export const isOnline = (): boolean => online

/** Fires on every transition, in both directions. Returns an unsubscribe. */
export function onConnectivityChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOnline(): boolean {
  const [value, setValue] = useState(isOnline)
  useEffect(() => onConnectivityChange(() => setValue(isOnline())), [])
  return value
}

/** Test seam. Drives the module state without a radio. */
export function __setOnlineForTests(next: boolean): void {
  set(next)
}
