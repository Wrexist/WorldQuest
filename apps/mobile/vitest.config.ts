/**
 * Component tests for the app's screens.
 *
 * ## What this can and cannot tell us
 *
 * React Native components are rendered through `react-native-web` in jsdom — the same
 * trick the screenshot harness uses. That covers everything structural: the five
 * states, that every string went through `t()`, that controls carry a role and a
 * label, that a disabled thing is actually disabled.
 *
 * It does NOT cover anything genuinely native: gesture handling, haptics, the real
 * font metrics, `Animated` on the UI thread, or platform-specific layout. Those need
 * a device or a simulator, and pretending otherwise is how a suite grows to a thousand
 * green tests over code nobody has run on a phone. Maestro (Track E2) covers that
 * half.
 *
 * ## Why vitest rather than jest
 *
 * Every other package here runs vitest. A second runner means a second config, a
 * second set of mocks, and a second place to look when something fails — for the sake
 * of a preset we do not need, because the aliasing below is the whole preset.
 */

import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The one line that makes React Native components mountable in jsdom.
      'react-native': 'react-native-web',
    },
  },
  esbuild: { jsx: 'automatic' },
  // Metro treats .wav as an asset and hands `require` a numeric handle; Vite has to be
  // told, or it tries to parse the RIFF header as JavaScript.
  assetsInclude: ['**/*.wav'],
  define: {
    // Metro defines this; jsdom does not. Without it, anything guarded by __DEV__
    // throws a ReferenceError before the first assertion runs.
    __DEV__: 'true',
  },
  test: {
    /**
     * A floor, not a target.
     *
     * `packages/engines` has carried a 90% gate since it was written; the app had none,
     * so the one package where a screen can quietly stop being rendered by anything was
     * the one nobody measured. 60/80/60 is just under today's 61.5/87.7/63.0 — close
     * enough to catch a screen landing untested, loose enough not to fail on a
     * refactor that moves ten lines.
     *
     * Deliberately lower than the engines'. These tests mount react-native-web in jsdom
     * and genuinely cannot reach the native paths — gestures, real font metrics,
     * `Animated` on the UI thread — so a number chasing 90 here would be bought with
     * tests that assert a mock was called.
     */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // EXTENDS the defaults rather than replacing them. A bare `exclude` array drops
      // Vitest's own list — config files, dist, node_modules, type-only declarations —
      // so those get counted as uncovered source and the thresholds below end up
      // measuring something nobody wrote.
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/lib/*.generated.ts',
      ],
      thresholds: { lines: 60, functions: 60, branches: 80, statements: 60 },
    },
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
