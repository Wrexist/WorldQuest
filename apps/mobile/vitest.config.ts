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

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The one line that makes React Native components mountable in jsdom.
      'react-native': 'react-native-web',
    },
  },
  esbuild: { jsx: 'automatic' },
  define: {
    // Metro defines this; jsdom does not. Without it, anything guarded by __DEV__
    // throws a ReferenceError before the first assertion runs.
    __DEV__: 'true',
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
