import { defineConfig } from 'vitest/config'

// Explicit so the root config (which scopes to supabase/) is not inherited.
//
// These tests are not unit tests: every case boots a real workerd instance,
// applies the real migrations to real SQLite and drives the bundled Worker over
// HTTP. A single lesson submission costs several D1 statements, so the heaviest
// case takes seconds, not milliseconds — and on a loaded Windows CI runner it
// crossed the 5s default while passing on the Linux runner and on the PR build
// of the same commit. Vitest reports a slow test as a timeout, which reads like
// a product failure. Raise the ceiling rather than retry: a retry would also
// hide a genuinely broken case, and the timeout exists to catch hangs, not to
// police how long real D1 work takes.
//
// `passWithNoTests` is deliberately absent, as in every other package here: a
// suite whose tests were all deleted must not go green.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
