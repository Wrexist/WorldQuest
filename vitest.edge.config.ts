/**
 * Root suite for tests that live outside a package — the edge-function bundle guards,
 * which straddle supabase/ and packages/engines/, and the build scripts.
 *
 * `scripts/` was added when the design harness's ink measurement moved into its own
 * module. Everything in `scripts/` had been untested up to then, not by a decision but
 * because no suite's glob reached it — and the thing that finally needed a test was a
 * measurement that had been quietly agreeing with every screen it existed to catch.
 */
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['supabase/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
})
