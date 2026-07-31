import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/simulate.ts'],
      // The engines are pure, so their tests are cheap. This gate is real.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
