/**
 * store-notifications — where the subscription row actually gets written.
 *
 * Everything else in the monetisation surface reads. `useEntitlement` reads a cache,
 * `useSubscriptionSync` reads the row, the paywall reads the entitlement. Until this
 * endpoint existed nothing wrote, so every user was free — which is the correct answer
 * for a product with no billing, and a bug the moment there is one.
 *
 * ## It mounts five pieces, and does almost nothing itself
 *
 * | Piece | Where | What it decides |
 * |---|---|---|
 * | `apple-jws` | `_shared/` | is this signature real |
 * | `store-verification` | `_shared/` | is it about us, recent, from the pinned root |
 * | `apple-notification` | `_shared/` | what does the payload say |
 * | `entitlements/store` | `packages/engines` | what does that mean for access |
 * | `store-notifications` | `_shared/` | in what order, and what to tell the store |
 *
 * All five are unit-tested without a store, a credential, or a network. What is left
 * here is wiring: environment variables, four database queries, and a `Response`. That
 * split is the whole design — a webhook is the least testable place in a codebase, so
 * the parts that can be wrong in an expensive way live outside it.
 *
 * ## Configuration, not constants
 *
 * `APPLE_ROOT_FINGERPRINT` is a fact about Apple's certificate authority. This repo's
 * rule is to mark a fact we cannot source rather than invent one, and a wrong pin here
 * fails in the worst direction available: it either rejects every real notification, or
 * accepts a chain it should not. So it is read from the environment and the function
 * refuses to serve without it. Same for `APPLE_BUNDLE_ID` — the check that separates
 * "Apple sent this" from "Apple sent this about us" is worthless with a guessed value.
 *
 * ## Google is not wired up, and refuses rather than trusting
 *
 * Google Play's Real-Time Developer Notifications are not signed the way Apple's are.
 * Authenticity comes from the Pub/Sub push subscription: a Google-signed OIDC token in
 * the `Authorization` header, verified against Google's rotating JWKS with an `aud` that
 * is this endpoint's own URL. That is a different mechanism, a network fetch, and a
 * service-account identity that only exists once the Play Console is configured.
 *
 * The dangerous thing to do while waiting is to accept the payload — Pub/Sub delivers
 * plain JSON, so a handler that parses it "for now" is an open endpoint that grants
 * subscriptions to anyone who can POST. So the Google branch returns 401 and applies
 * nothing. The engine already knows what Google's notification types mean, tested; only
 * the proof that Google sent it is missing.
 *
 * Spec: docs/systems/monetization.md · docs/adr/0006-server-authoritative-progress.md
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  applyStoreNotification,
  type StoreNotification,
} from '../../../packages/engines/src/entitlements/store.ts'
import {
  NO_SUBSCRIPTION,
  type Subscription,
} from '../../../packages/engines/src/entitlements/index.ts'
import { verifyAppleNotification } from '../_shared/apple-verify.ts'
import type { ParsedNotification } from '../_shared/apple-notification.ts'
import {
  handleStoreNotification,
  type NotificationDeps,
} from '../_shared/store-notifications.ts'

/**
 * The compile-time proof that the parser and the engine agree.
 *
 * `apple-notification.ts` cannot import `StoreNotification` — Deno does not resolve a
 * pnpm workspace, which is why the shared modules declare their own shapes. This
 * assignment is what stops the two drifting: add a required field to the engine's type
 * and this line stops compiling, here, rather than at 3am in a webhook.
 */
const asStoreNotification = (n: ParsedNotification): StoreNotification => n

/** Apple retries for three days. Wide enough to survive that, and finite. */
const MAX_NOTIFICATION_AGE_MS = 3 * 86_400_000

/**
 * Shape-check before the token reaches a query.
 *
 * `.eq('id', …)` on a uuid column with a non-uuid string is a Postgres cast error, which
 * would surface as a 500 and three days of Apple retrying a notification that will never
 * work. A malformed token is "no account", not "our fault".
 */
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

type Config = {
  readonly rootFingerprint: string
  readonly bundleId: string
  readonly environment: 'sandbox' | 'production'
}

/**
 * Read the configuration, or refuse to run.
 *
 * A missing pin must not degrade into "skip that check". Every value here exists to
 * reject something, and a verifier missing one of them is a verifier that says yes more
 * often than it should.
 */
function readConfig(): Config | null {
  const rootFingerprint = Deno.env.get('APPLE_ROOT_FINGERPRINT')
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID')
  const environment = Deno.env.get('STORE_ENVIRONMENT') ?? 'production'

  if (!rootFingerprint || !bundleId) return null
  if (environment !== 'sandbox' && environment !== 'production') return null

  return { rootFingerprint, bundleId, environment }
}

function makeDeps(
  admin: SupabaseClient,
  config: Config,
): NotificationDeps<Subscription, StoreNotification> {
  return {
    verify: async (raw) => {
      const result = verifyAppleNotification(raw, {
        rootFingerprint: config.rootFingerprint,
        bundleId: config.bundleId,
        environment: config.environment,
        now: Date.now(),
        maxAgeMs: MAX_NOTIFICATION_AGE_MS,
      })

      if (!result.ok) {
        // The reason goes to our logs and never into the response: "wrong bundleId"
        // versus "chain does not terminate at the pinned root" is a free tutorial in
        // what to fix. No payload, no ids — a rejected notification is somebody else's
        // data and we have no reason to keep it.
        console.warn(`store-notifications: rejected — ${result.reason}`)
        return null
      }

      return {
        notificationId: result.value.notificationId,
        storeRef: result.value.storeRef,
        platform: 'ios',
        notification: asStoreNotification(result.value.notification),
        payload: result.payload,
        accountRef: result.value.accountToken,
      }
    },

    seen: async (notificationId) => {
      const { data, error } = await admin
        .from('subscription_events')
        .select('id')
        .eq('notification_id', notificationId)
        .maybeSingle()
      // Throwing rather than returning false: "we could not tell" must become a 500 and
      // a retry, because acknowledging an unexamined notification loses it for ever.
      if (error) throw error
      return data !== null
    },

    findUser: async (event) => {
      const { data, error } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('platform', event.platform)
        .eq('store_ref', event.storeRef)
        .maybeSingle()
      if (error) throw error
      if (data !== null) return data.user_id

      // A first purchase. Nothing has ever linked this store subscription to an account,
      // so `store_ref` cannot match — the client attached the user's id to the purchase
      // as Apple's `appAccountToken`, and that is the only thread back.
      //
      // Checked against `profiles` rather than trusted: the token is client-supplied,
      // and writing an entitlement keyed on an unvalidated string would let a purchase
      // name any row it liked. The worst it can do having passed this check is grant
      // Premium to a real account somebody else paid for, which is a gift.
      if (!isUuid(event.accountRef)) return null
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id')
        .eq('id', event.accountRef)
        .maybeSingle()
      if (profileError) throw profileError
      return profile?.id ?? null
    },

    load: async (userId) => {
      const { data, error } = await admin
        .from('subscriptions')
        .select('status, tier, expires_at, will_renew, has_used_trial, notified_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      // No row yet is not an error: `handle_new_user` does not create one, because most
      // users never subscribe. "Never subscribed" is exactly NO_SUBSCRIPTION.
      if (data === null) return NO_SUBSCRIPTION

      return {
        status: data.status,
        tier: data.tier,
        expiresAt: data.expires_at === null ? null : Date.parse(data.expires_at),
        willRenew: data.will_renew,
        hasUsedTrial: data.has_used_trial,
        notifiedAt: data.notified_at === null ? null : Date.parse(data.notified_at),
      }
    },

    record: async (userId, event, next) => {
      // One RPC, one transaction. Two supabase-js calls would be two, and the failure
      // between them writes the event, skips the subscription, and returns 200 — after
      // which the unique index makes every redelivery a no-op and the paying customer
      // stays free, silently.
      const { error } = await admin.rpc('record_subscription_event', {
        p_user_id: userId,
        p_notification_id: event.notificationId,
        p_platform: event.platform,
        p_kind: event.notification.kind,
        p_payload: event.payload,
        p_subscription:
          next === null
            ? null
            : { ...next, environment: event.notification.environment },
        p_store_ref: event.storeRef,
      })
      if (error) throw error
    },

    apply: (current, notification) =>
      applyStoreNotification(current, notification, config.environment),
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false }, 405)

  const config = readConfig()
  if (config === null) {
    console.error(
      'store-notifications: APPLE_ROOT_FINGERPRINT and APPLE_BUNDLE_ID are required. ' +
        'Refusing to verify with a missing pin — a verifier short one check says yes ' +
        'more often than it should.',
    )
    return json({ ok: false }, 500)
  }

  const body = (await req.json().catch(() => null)) as { signedPayload?: unknown } | null

  // Apple posts `{ signedPayload: "<compact JWS>" }` and nothing else. Anything that is
  // not that shape is either Google — which is not wired up — or not a store.
  if (body === null || typeof body.signedPayload !== 'string') {
    console.warn('store-notifications: not an App Store Server Notification v2')
    return json({ ok: false }, 401)
  }

  const admin: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const result = await handleStoreNotification(body.signedPayload, makeDeps(admin, config))

  // The reason is ours. The store gets a status code and `{ ok }`, which is all it acts on.
  if (result.status !== 200) console.warn(`store-notifications: ${result.reason}`)
  return json(result.body, result.status)
})
