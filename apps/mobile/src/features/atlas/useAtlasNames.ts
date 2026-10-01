/**
 * Localised names for the atlas, from the content pack — the one place names live.
 *
 * The atlas registry holds geometry and coordinates keyed by stable IDs and no names at
 * all, so a renamed country or a corrected capital spelling changes in the pack and
 * nowhere else.
 */

import { useCallback, useMemo } from 'react'
import type { ContentIndex } from '@worldquest/engines'
import { currentLocale } from '../../lib/i18n.js'

export type AtlasNames = {
  readonly countryName: (countryId: string) => string | undefined
  readonly factValueName: (factId: string) => string | undefined
}

export function atlasNames(index: ContentIndex | null | undefined, locale: string): AtlasNames {
  return {
    countryName: (id) => {
      const names = index?.entities.get(id)?.names
      return names?.[locale] ?? names?.['en']
    },
    factValueName: (factId) => {
      const names = index?.facts.get(factId)?.value.names
      return names?.[locale] ?? names?.['en']
    },
  }
}

export function useAtlasNames(index: ContentIndex | null | undefined): AtlasNames {
  const locale = currentLocale()
  const names = useMemo(() => atlasNames(index, locale), [index, locale])
  const countryName = useCallback((id: string) => names.countryName(id), [names])
  const factValueName = useCallback((id: string) => names.factValueName(id), [names])
  return { countryName, factValueName }
}
