/**
 * Contrast gate.
 *
 * Runs in CI on every commit. Accessibility that is checked by hand is
 * accessibility that stops being checked the first week someone is busy — and
 * contrast is the one a11y property a machine can verify perfectly.
 *
 * WCAG 2.2: body text ≥ 4.5:1, large text (≥24px or ≥18.66px bold) ≥ 3:1.
 * Spec: docs/design/accessibility.md
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'))

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}

const p = tokens.palette

type Pair = { name: string; fg: string; bg: string; min: number; note?: string }

const PAIRS: Pair[] = [
  // Body text
  { name: 'text.primary on surface', fg: p.text['1'], bg: p.surface['1'], min: 4.5 },
  { name: 'text.primary on canvas', fg: p.text['1'], bg: p.space['800'], min: 4.5 },
  { name: 'text.secondary on surface', fg: p.text['2'], bg: p.surface['1'], min: 4.5 },
  { name: 'text.secondary on canvas', fg: p.text['2'], bg: p.space['800'], min: 4.5 },
  { name: 'text.primary on surfaceRaised', fg: p.text['1'], bg: p.surface['2'], min: 4.5 },

  // Large text only — documented and enforced, not left to memory.
  {
    name: 'text.tertiary on surface (≥18px)',
    fg: p.text['3'],
    bg: p.surface['1'],
    min: 3.0,
    note: 'tertiary is large-text only',
  },

  // Button labels are ≥18px bold, so the 3:1 large-text floor applies.
  {
    name: 'white on action.primary (≥18px bold)',
    fg: p.text['1'],
    bg: p.green['500'],
    min: 3.0,
    note: 'button labels only — never caption text on green',
  },
  {
    name: 'white on action.secondary (≥18px bold)',
    fg: p.text['1'],
    bg: p.blue['500'],
    min: 3.0,
  },
  {
    name: 'white on action.destructive (≥18px bold)',
    fg: p.text['1'],
    bg: p.red['700'],
    min: 3.0,
  },

  // Reward and status colours carry meaning, so they are UI boundaries (≥3:1).
  { name: 'reward.xp on surface', fg: p.gold['500'], bg: p.surface['1'], min: 3.0 },
  { name: 'status.streak on surface', fg: p.flame['500'], bg: p.surface['1'], min: 3.0 },
  { name: 'status.progress on surface', fg: p.green['400'], bg: p.surface['1'], min: 3.0 },
  { name: 'feedback.correct on surface', fg: p.green['500'], bg: p.surface['1'], min: 3.0 },
]

let failed = 0
console.log('Contrast check (WCAG 2.2 AA)\n')

for (const pair of PAIRS) {
  const ratio = contrast(pair.fg, pair.bg)
  const pass = ratio >= pair.min
  if (!pass) failed++
  const mark = pass ? '✓' : '✗'
  const note = pair.note ? `  — ${pair.note}` : ''
  console.log(
    `  ${mark} ${pair.name.padEnd(42)} ${ratio.toFixed(2)}:1 (min ${pair.min})${note}`,
  )
}

console.log()
if (failed > 0) {
  console.error(`✗ ${failed} contrast pair(s) below the floor`)
  process.exit(1)
}
console.log(`✓ all ${PAIRS.length} pairs pass`)
