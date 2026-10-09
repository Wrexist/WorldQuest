/**
 * `expo-blur`, for component tests.
 *
 * The package's build ships JSX inside `.js`, which Vite refuses to parse, so Vitest
 * aliases the module here (vitest.config.ts). A plain View that keeps the two props a
 * test reads — how strong, and which tint — on `dataSet`. Never bundled: Metro resolves
 * the real module for every app and web build.
 */

import { View, type ViewProps } from 'react-native'

export function BlurView({ intensity = 50, tint = 'default', ...props }: ViewProps & { intensity?: number; tint?: string }) {
  return <View {...props} dataSet={{ intensity: String(intensity), tint }} />
}
