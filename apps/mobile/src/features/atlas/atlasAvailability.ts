/** Live relief atlas on supported platforms, with a still-image fallback on GPU failure.
 * Render-on-demand only; map cards use pre-rendered relief to avoid extra GL contexts.
 * EXPO_PUBLIC_ATLAS_GLOBE=0 remains an explicit emergency build-time off switch.
 * Native simulator validation is recorded separately from physical-device performance.
 */

import { Platform } from 'react-native'
import { useFeatureFlag } from '../../lib/featureFlags.js'

/** Platforms with the required GL implementation. */
const SUPPORTED_PLATFORMS: ReadonlySet<string> = new Set(['web', 'ios', 'android'])

export function atlasForcedOn(): boolean {
  return process.env.EXPO_PUBLIC_ATLAS_GLOBE === '1'
}

export function atlasEnabled(flag: boolean, platform: string = Platform.OS, dev: boolean = __DEV__): boolean {
  if (process.env.EXPO_PUBLIC_ATLAS_GLOBE === '0') return false
  return atlasForcedOn() || dev || flag || SUPPORTED_PLATFORMS.has(platform)
}

export function useAtlasEnabled(): boolean {
  return atlasEnabled(useFeatureFlag('atlas_globe'))
}
