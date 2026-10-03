import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colors, darkColors } from './tokens.js'

const source = (name: string) => readFileSync(join(import.meta.dirname, 'primitives', name), 'utf8')

describe('liquid clay material safety', () => {
  it('keeps every material available when the mounted app switches theme', () => {
    for (const tone of ['ice', 'navy', 'sky', 'gold', 'lime'] as const) {
      expect(Object.keys(darkColors.clay[tone])).toEqual(Object.keys(colors.clay[tone]))
      for (const theme of [colors, darkColors]) {
        for (const value of Object.values(theme.clay[tone])) expect(value).toMatch(/^#[\da-f]{6}([\da-f]{2})?$/i)
      }
    }
  })

  it('never intercepts touch input or announces decorative reflections', () => {
    const clay = source('ClaySurface.tsx')
    expect(clay).toContain('pointerEvents="none"')
    expect(clay).toContain('aria-hidden')
    expect(clay).toContain('importantForAccessibility="no-hide-descendants"')
    expect(clay).toContain('StyleSheet.absoluteFill')
  })

  it('bounds only decoration while cards and long action labels can grow', () => {
    const card = source('Card.tsx')
    expect(card).not.toMatch(/overflow:\s*['"]hidden['"]/)
    expect(source('Button.tsx')).not.toMatch(/numberOfLines=/)
  })
})
