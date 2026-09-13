import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Bound CPU contention for the exhaustive content and 10,000-sequence tests.
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/simulate.ts'],
      // The engines are pure, so their tests are cheap. This gate is real.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
