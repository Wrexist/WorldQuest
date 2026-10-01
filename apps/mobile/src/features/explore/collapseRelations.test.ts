import { describe, expect, it } from 'vitest'
import { collapseRelations, type RelationFact } from './collapseRelations.js'

const fact = (over: Partial<RelationFact> & Pick<RelationFact, 'id' | 'attribute' | 'value'>): RelationFact => ({
  mastery: 'unseen', due: false, quizzable: true, ...over,
})

describe('collapseRelations', () => {
  it('leaves ordinary facts exactly as they were, minus the bookkeeping field', () => {
    const out = collapseRelations([fact({ id: 'geo.DE.capital', attribute: 'capital', value: 'Berlin', mastery: 'mastered' })])
    expect(out).toEqual([{ id: 'geo.DE.capital', attribute: 'capital', value: 'Berlin', mastery: 'mastered', due: false }])
    expect('quizzable' in out[0]!).toBe(false)
  })

  it('folds every neighbour into one row, sorted, with the weakest mastery', () => {
    const out = collapseRelations([
      fact({ id: 'geo.DE.borders-pl', attribute: 'borders', value: 'Poland', mastery: 'mastered' }),
      fact({ id: 'geo.DE.borders-at', attribute: 'borders', value: 'Austria', mastery: 'familiar' }),
      fact({ id: 'geo.DE.borders-fr', attribute: 'borders', value: 'France', mastery: 'burnished', due: true }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ attribute: 'borders', value: 'Austria, France, Poland', mastery: 'familiar', due: true })
  })

  it('does not state a border the pipeline refused to ask about', () => {
    const out = collapseRelations([
      fact({ id: 'geo.ES.borders-fr', attribute: 'borders', value: 'France' }),
      fact({ id: 'geo.ES.borders-ma', attribute: 'borders', value: 'Morocco', quizzable: false }),
    ])
    expect(out[0]!.value).toBe('France')
  })

  it('shows no row at all for a country whose every border is withdrawn', () => {
    expect(collapseRelations([fact({ id: 'geo.X.borders-y', attribute: 'borders', value: 'Y', quizzable: false })])).toEqual([])
  })
})
