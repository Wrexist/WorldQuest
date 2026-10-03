import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { colors, darkColors } from './tokens.js'

const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tokens.json'), 'utf8')) as Record<string, unknown>

/** Independent value oracle: it knows JSON aliases, never emitted-code sharing. */
function resolved(value: unknown, steps = 0): unknown {
  if (steps > 20) throw new Error('Token reference cycle')
  if (typeof value === 'string') {
    const alias = /^\{([^}]+)\}$/.exec(value)
    if (!alias) return value
    let target: unknown = raw
    for (const key of alias[1]!.split('.')) {
      if (target === null || typeof target !== 'object' || Array.isArray(target)) throw new Error(`Invalid alias ${value}`)
      target = (target as Record<string, unknown>)[key]
    }
    if (target === undefined) throw new Error(`Missing alias ${value}`)
    return resolved(target, steps + 1)
  }
  if (Array.isArray(value)) return value.map(child => resolved(child, steps + 1))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('$comment'))
      .map(([key, child]) => [key, resolved(child, steps + 1)]))
  }
  return value
}

type DeepReadonly<T> = T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T

describe('generated theme equivalence', () => {
  it('preserves the complete serialized light and dark semantic palettes', () => {
    expect(JSON.stringify(colors)).toBe(JSON.stringify(resolved(raw.color)))
    expect(JSON.stringify(darkColors)).toBe(JSON.stringify(resolved(raw.darkColor)))
  })

  it('shares equal immutable children while keeping theme cache roots distinct', () => {
    expect(darkColors).not.toBe(colors)
    expect(darkColors.league).toBe(colors.league)
    expect(darkColors.clay.gold).toBe(colors.clay.gold)
    expectTypeOf<typeof colors>().toEqualTypeOf<DeepReadonly<typeof colors>>()
    expectTypeOf<typeof darkColors>().toEqualTypeOf<DeepReadonly<typeof darkColors>>()
  })
})
