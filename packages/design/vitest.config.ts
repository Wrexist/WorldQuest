import { defineConfig } from 'vitest/config'

// Explicit so the root config (which scopes to supabase/) is not inherited.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'], passWithNoTests: true },
})
