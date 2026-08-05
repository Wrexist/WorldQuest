import { defineConfig } from 'vitest/config'

// Explicit so the root config (which scopes to supabase/) is not inherited.
//
// `passWithNoTests` is deliberately absent. It was set here, and it means a package
// whose tests are all deleted goes green — a suite that cannot fail is not a suite.
// Every package in this repo has tests; if one legitimately does not, that is a
// conversation, not a flag.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
