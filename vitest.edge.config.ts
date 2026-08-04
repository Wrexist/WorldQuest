/**
 * Root suite for tests that live outside a package — currently the edge-function
 * bundle guards, which straddle supabase/ and packages/engines/.
 */
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['supabase/**/*.test.ts'], environment: 'node' },
})
