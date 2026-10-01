/**
 * Whether the 3D atlas may be shown on this build, and why.
 *
 * Rollout rule (ADR 0017): a platform gets the globe by default only once it has been
 * verified on real hardware. Until then it is reachable in development builds, by the
 * `atlas_globe` remote flag, or by `EXPO_PUBLIC_ATLAS_GLOBE=1` at bundle time (what the
 * screenshot and e2e harnesses use) — and everyone else keeps the flat locator map,
 * which uses the same scene policy, so nothing is disclosed differently either way.
 *
 * Web is verified in Chromium by `pnpm design:shots`; iOS and Android are NOT yet
 * verified on a device, so they stay behind the flag.
 */

import { Platform } from 'react-native'
import { useFeatureFlag } from '../../lib/featureFlags.js'

/** Platforms whose GPU path has device evidence in docs/design/world-atlas/evidence.md. */
const VERIFIED_PLATFORMS: ReadonlySet<string> = new Set(['web'])

export function atlasForcedOn(): boolean {
  return process.env.EXPO_PUBLIC_ATLAS_GLOBE === '1'
}

export function atlasEnabled(flag: boolean, platform: string = Platform.OS, dev: boolean = __DEV__): boolean {
  return atlasForcedOn() || dev || flag || VERIFIED_PLATFORMS.has(platform)
}

export function useAtlasEnabled(): boolean {
  return atlasEnabled(useFeatureFlag('atlas_globe'))
}
