/**
 * Which backend this build talks to — decided once, at bundle time.
 *
 * `EXPO_PUBLIC_BACKEND=d1` with `EXPO_PUBLIC_D1_URL` selects the Cloudflare Worker
 * (ADR 0013). Otherwise the legacy Supabase pair, when both of its variables are set.
 * Otherwise none: the app runs lessons locally and says it cannot sync, which is the
 * honest state of a fresh checkout.
 *
 * Every read is a literal `process.env.EXPO_PUBLIC_*` member access on purpose: that
 * is the only shape Expo inlines into the bundle. A computed key reads `undefined` in
 * a release build and would quietly select "none".
 */

export type BackendConfig =
  | { readonly kind: 'd1'; readonly url: string }
  | { readonly kind: 'supabase'; readonly url: string; readonly publishableKey: string }
  | { readonly kind: 'none'; readonly url: '' }

export function backendConfig(): BackendConfig {
  const d1 = process.env.EXPO_PUBLIC_D1_URL ?? ''
  if (process.env.EXPO_PUBLIC_BACKEND === 'd1' && d1 !== '') return { kind: 'd1', url: d1.replace(/\/$/, '') }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  if (url !== '' && publishableKey !== '') return { kind: 'supabase', url, publishableKey }
  return { kind: 'none', url: '' }
}

/**
 * True when that backend is the Cloudflare Worker.
 *
 * The one fork most callers never need: the account repository answers the same port
 * either way. Lessons are the exception — the Worker grades only lessons it issued, so
 * they travel through the ticketed D1 queue rather than the legacy sync queue.
 */
export const isD1 = (): boolean => backendConfig().kind === 'd1'
