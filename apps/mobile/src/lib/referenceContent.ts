import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildIndex, type ContentIndex } from '@worldquest/engines'
import { decodeReferenceCatalogue, type ReferenceFact } from '../../../../packages/content/src/reference-catalogue.js'
import catalogueAsset from '../../assets/content/reference-catalogue.bin'
import { bundledText } from './bundledText.js'
import { useContent } from './content.js'
import { currentLocale, useT } from './i18n.js'

let cached: readonly ReferenceFact[] | null = null
let pending: Promise<readonly ReferenceFact[]> | null = null
let referenceIndex: ContentIndex | null = null
function load() {
  return pending ??= bundledText(catalogueAsset).then(raw => (cached = decodeReferenceCatalogue(raw))).catch(error => {
    pending = null
    throw error
  })
}

/** Full offline reference/progress; issued lessons and their answer keys stay server-owned. */
export function useReferenceContent() {
  useT()
  const locale = currentLocale()
  const base = useContent()
  const [facts, setFacts] = useState(cached)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    void load().then(value => { if (current) setFacts(value) }, () => { if (current) setFailed(true) })
    return () => { current = false }
  }, [attempt])
  // No templates: this index is for reading/mastery only, never local question issuance.
  const index = useMemo<ContentIndex | null>(() => {
    if (!base.index || !facts) return null
    // Both catalogues are immutable assets of this binary. Reuse the same maps on
    // every route and memory update instead of rebuilding 6,745 facts while scrolling.
    return referenceIndex ??= buildIndex({ entities: [...base.index.index.entities.values()], facts, templates: [] })
  }, [base.index, facts])
  const reload = useCallback(() => {
    setFailed(false)
    setAttempt(value => value + 1)
    base.reload()
  }, [base.reload])
  // Route selectors read translated fact values inside memos keyed by this wrapper.
  // A locale change refreshes those selectors without rebuilding the immutable maps.
  const loaded = useMemo(() => index === null ? null : { index, locale }, [index, locale])
  return { ...base, index: loaded, reload,
    status: failed || base.status === 'error' ? 'error' as const : index === null ? 'loading' as const : 'ready' as const }
}
