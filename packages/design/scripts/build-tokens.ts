/**
 * tokens.json → src/tokens.ts
 *
 * Design values live in JSON so they can be diffed, themed, and eventually synced
 * from Figma variables. Components import the generated TypeScript, which is typed
 * and tree-shakeable. Never edit tokens.ts by hand — it is overwritten.
 *
 * Run: pnpm design:tokens
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8')) as Record<
  string,
  Json
>

/** Resolve {palette.blue.500} style references against the token tree. */
function resolve(value: Json, tree: Record<string, Json>, seen = 0): Json {
  if (seen > 10) throw new Error('Token reference cycle detected')

  if (typeof value === 'string') {
    const match = /^\{([^}]+)\}$/.exec(value)
    if (!match) return value
    const path = match[1]!.split('.')
    let node: Json = tree
    for (const segment of path) {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) {
        throw new Error(`Unresolvable token reference: ${value}`)
      }
      const next: Json | undefined = (node as Record<string, Json>)[segment]
      if (next === undefined) throw new Error(`Unresolvable token reference: ${value}`)
      node = next
    }
    return resolve(node, tree, seen + 1)
  }

  if (Array.isArray(value)) return value.map((v) => resolve(v, tree, seen + 1))

  if (typeof value === 'object' && value !== null) {
    const out: Record<string, Json> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$comment')) continue
      out[k] = resolve(v, tree, seen + 1)
    }
    return out
  }

  return value
}

const resolved = resolve(tokens, tokens) as Record<string, Json>
delete resolved.version

/** Themes share immutable semantic objects when their resolved values agree.
 * This changes emitted construction code only: JSON remains the source of truth,
 * both theme roots remain distinct, and consumers retain their literal readonly types. */
function emitTheme(value: Json, counterpart: Json | undefined, path = 'colors', indent = 0): string {
  if (indent > 0 && value !== null && typeof value === 'object' && JSON.stringify(value) === JSON.stringify(counterpart)) return path
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value)
  const peer = counterpart !== null && typeof counterpart === 'object' && !Array.isArray(counterpart) ? counterpart : {}
  const pad = '  '.repeat(indent + 1)
  return '{\n' + Object.entries(value).map(([key, child]) =>
    `${pad}${JSON.stringify(key)}: ${emitTheme(child, peer[key], `${path}[${JSON.stringify(key)}]`, indent + 1)}`,
  ).join(',\n') + '\n' + '  '.repeat(indent) + '}'
}

const banner = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: packages/design/tokens.json
 * Regenerate: pnpm design:tokens
 *
 * Components import the SEMANTIC layer (\`colors.action.primary\`), never the raw
 * palette (\`palette.blue[500]\`). That indirection is what makes a high-contrast
 * theme, a light theme, and seasonal event theming possible without touching a
 * single component. Spec: docs/design/design-system.md
 */

`

const body = [
  `export const palette = ${JSON.stringify(resolved.palette, null, 2)} as const`,
  `export const colors = ${JSON.stringify(resolved.color, null, 2)} as const`,
  `export const darkColors = ${emitTheme(resolved.darkColor!, resolved.color)} as const`,
  `export const space = ${JSON.stringify(resolved.space, null, 2)} as const`,
  `export const radius = ${JSON.stringify(resolved.radius, null, 2)} as const`,
  `export const depth = ${JSON.stringify(resolved.depth, null, 2)} as const`,
  `export const elevation = ${JSON.stringify(resolved.elevation, null, 2)} as const`,
  `export const typography = ${JSON.stringify(resolved.typography, null, 2)} as const`,
  `export const motion = ${JSON.stringify(resolved.motion, null, 2)} as const`,
  `export const gradient = ${JSON.stringify(resolved.gradient, null, 2)} as const`,
  `export const layout = ${JSON.stringify(resolved.layout, null, 2)} as const`,
  `export const illustration = ${JSON.stringify(resolved.illustration, null, 2)} as const`,
  `export const icon = ${JSON.stringify(resolved.icon, null, 2)} as const`,
  `export const contrastFloors = ${JSON.stringify(resolved.contrastFloors, null, 2)} as const`,
  '',
  'export type Space = keyof typeof space',
  'export type Radius = keyof typeof radius',
  'export type Depth = keyof typeof depth',
  'export type TypeScale = keyof typeof typography.scale',
  'export type MotionToken = keyof typeof motion',
].join('\n\n')

writeFileSync(join(root, 'src', 'tokens.ts'), banner + body + '\n', 'utf8')

// Also emit CSS custom properties, so the design preview and any future web
// surface render from the exact same values the app uses.
const cssLines: string[] = [':root {']
const flatten = (obj: Json, prefix: string): void => {
  if (typeof obj !== 'object' || obj === null) return
  for (const [k, v] of Object.entries(obj as Record<string, Json>)) {
    const name = `${prefix}-${k}`
    if (typeof v === 'string' || typeof v === 'number') {
      cssLines.push(`  --wq${name}: ${v};`)
    } else if (!Array.isArray(v)) {
      flatten(v, name)
    }
  }
}
flatten(resolved.color!, '-color')
flatten(resolved.space!, '-space')
flatten(resolved.radius!, '-radius')
flatten(resolved.depth!, '-depth')
cssLines.push('}')
writeFileSync(join(root, 'src', 'tokens.css'), cssLines.join('\n') + '\n', 'utf8')

const count = cssLines.length - 2
console.log(`✓ tokens.ts written (${count} CSS variables also emitted)`)
