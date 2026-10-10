/**
 * The atlas's regions, and the key that names each one. Shared by Explore's chips and the
 * map drill, so a region is called the same thing wherever it appears.
 */

import type { TranslationKey } from '../../lib/i18n.js'

export const ATLAS_REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'] as const
export type AtlasRegion = (typeof ATLAS_REGIONS)[number]

export const REGION_KEY: Record<AtlasRegion, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
}

export const isAtlasRegion = (code: string): code is AtlasRegion => (ATLAS_REGIONS as readonly string[]).includes(code)
