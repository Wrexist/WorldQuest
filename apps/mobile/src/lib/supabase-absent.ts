/**
 * What `@supabase/supabase-js` resolves to in a D1 build (`metro.config.js`).
 *
 * A build with `EXPO_PUBLIC_BACKEND=d1` talks to the Cloudflare Worker and never to the
 * legacy backend: every Supabase call sits behind `isD1()`. Metro resolves imports
 * statically, though, so the SDK shipped anyway, and it was the largest dead weight in
 * the bundle (about 280 KB of JavaScript across auth, realtime, storage and postgrest)
 * at the moment the bundle crossed its budget. See the 2026-09-26 note in
 * `scripts/bundle-native.cjs`.
 *
 * Type checking still sees the real package; only the bundler sees this file. If a
 * legacy path ever runs in a D1 build it fails here, loudly and by name, instead of
 * quietly creating a client for a backend this build has no address for. `pnpm e2e:d1`
 * drives the D1 build end to end and fails on any uncaught error, which is what proves
 * no such path runs.
 */

export function createClient(): never {
  throw new Error('The legacy Supabase backend is not part of this build (EXPO_PUBLIC_BACKEND=d1).')
}
