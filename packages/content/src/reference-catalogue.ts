import { isQuizzable, type Fact } from '@worldquest/engines'

/** Read-only country facts. Question composition continues to use the original packs. */
export type ReferenceFact = Pick<Fact, 'id' | 'entity' | 'attribute' | 'value' | 'difficulty' | 'volatility' | 'quizzable' | 'source'>
type Row = [string, string, number, string, string | null, number, Fact['volatility'], boolean, number]
export type ReferenceCatalogue = {
  version: 1
  attributes: string[]
  sources: NonNullable<Fact['source']>[]
  facts: Row[]
}

/** Compact repeated labels/citations; retain every fact's opaque ID and authored values. */
export function encodeReferenceCatalogue(facts: readonly Fact[]): ReferenceCatalogue {
  const attributes: string[] = [], sources: NonNullable<Fact['source']>[] = []
  const sourceIds = new Map<string, number>()
  const rows = facts.map((fact): Row => {
    let attribute = attributes.indexOf(fact.attribute)
    if (attribute < 0) attribute = attributes.push(fact.attribute) - 1
    let source = -1
    if (fact.source) {
      const key = JSON.stringify(fact.source)
      source = sourceIds.get(key) ?? sources.length
      if (!sourceIds.has(key)) { sourceIds.set(key, source); sources.push(fact.source) }
    }
    const en = fact.value.names?.en ?? '', sv = fact.value.names?.sv ?? en
    const quizzable = isQuizzable(fact)
    return [fact.id, fact.entity, attribute, en, sv === en ? null : sv, fact.difficulty, fact.volatility, quizzable, source]
  })
  return { version: 1, attributes, sources, facts: rows }
}

/** A bundled asset, never a server-supplied answer key. Reject corrupt/incompatible assets. */
export function decodeReferenceCatalogue(raw: string): readonly ReferenceFact[] {
  const data = JSON.parse(raw) as ReferenceCatalogue
  if (data.version !== 1 || !Array.isArray(data.attributes) || !Array.isArray(data.sources) || !Array.isArray(data.facts)) {
    throw new Error('Unsupported reference catalogue')
  }
  const ids = new Set<string>()
  return data.facts.map((row) => {
    const [id, entity, attribute, en, sv, difficulty, volatility, quizzable, source] = row
    if (row.length !== 9 || typeof id !== 'string' || ids.has(id) || typeof entity !== 'string'
      || typeof data.attributes[attribute] !== 'string' || typeof en !== 'string' || (sv !== null && typeof sv !== 'string')
      || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 || !['stable', 'slow', 'fast'].includes(volatility)
      || typeof quizzable !== 'boolean' || !Number.isInteger(source) || source < -1 || source >= data.sources.length) {
      throw new Error('Invalid reference fact')
    }
    ids.add(id)
    return { id, entity, attribute: data.attributes[attribute]!, value: { names: { en, sv: sv ?? en } },
      difficulty, volatility, quizzable, ...(source < 0 ? {} : { source: data.sources[source]! }) }
  })
}
