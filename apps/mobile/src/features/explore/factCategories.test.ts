import { describe, expect, it } from 'vitest'
import { FACT_CATEGORIES, shelveFacts } from './factCategories.js'

describe('shelving a country’s facts', () => {
  it('puts each attribute on one shelf, in category order, and never hides an unknown one', () => {
    const facts = ['club', 'capital', 'landmark', 'flag', 'athlete', 'brand-new-attribute'].map((attribute) => ({ attribute }))
    const shelves = shelveFacts(facts)
    expect(shelves.map((s) => s.category.id)).toEqual(['basics', 'sport', 'places', 'other'])
    expect(shelves[0]!.facts.map((f) => f.attribute)).toEqual(['capital', 'flag'])
    expect(shelves[1]!.attributes).toEqual(['athlete', 'club'])
  })

  it('never shelves one attribute twice', () => {
    const all = FACT_CATEGORIES.flatMap((c) => c.attributes)
    expect(new Set(all).size).toBe(all.length)
  })
})
