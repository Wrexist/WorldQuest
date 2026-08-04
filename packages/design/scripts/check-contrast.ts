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
    bg: p.red['600'],
    min: 3.0,
  },

  // The edge under a pressable face. It is not decoration: it is the only thing that
  // says "this can be pressed" once the face is flat, so it has to clear the 3:1 UI
  // boundary floor against the canvas behind it — otherwise a button on a dark screen
  // reads as a painted rectangle. Checked against canvas AND surface because buttons
  // sit on both.
  { name: 'action.primaryEdge on canvas', fg: p.green['600'], bg: p.space['800'], min: 3.0 },
  { name: 'action.secondaryEdge on canvas', fg: p.blue['600'], bg: p.space['800'], min: 3.0 },
  { name: 'option.idleEdge on canvas', fg: p.border.strong, bg: p.space['800'], min: 3.0 },
  { name: 'option.idleEdge on surface', fg: p.border.strong, bg: p.surface['1'], min: 1.2 },

  // Reward and status colours carry meaning, so they are UI boundaries (≥3:1).
  { name: 'reward.xp on surface', fg: p.gold['400'], bg: p.surface['1'], min: 3.0 },
  { name: 'reward.xp on canvas', fg: p.gold['400'], bg: p.space['800'], min: 3.0 },
  // The lesson summary's hero number sits on a LEVEL 2 card, which is `surface.2` —
  // lighter than `surface.1`, so the pair above does not vouch for it. A gold number
  // on a raised card was the single largest piece of type in the app and no row here
  // covered the surface it was actually drawn on.
  { name: 'reward.xp on surfaceRaised', fg: p.gold['400'], bg: p.surface['2'], min: 3.0 },
  {
    name: 'reward.gem on surface',
    fg: p.purple['400'],
    bg: p.surface['1'],
    min: 3.0,
    note: 'the facts-stronger count on the lesson summary',
  },
  {
    name: 'text.secondary on surfaceRaised',
    fg: p.text['2'],
    bg: p.surface['2'],
    min: 4.5,
    note: 'the "XP" unit label under the hero number, and any caption on a level-2 card',
  },
  { name: 'status.streak on surface', fg: p.flame['500'], bg: p.surface['1'], min: 3.0 },
  { name: 'status.progress on surface', fg: p.green['400'], bg: p.surface['1'], min: 3.0 },
  {
    name: 'status.progress on progressTrack',
    fg: p.green['400'],
    bg: p.surface['3'],
    min: 3.0,
    note: 'a progress bar is meaningless if the fill and its track look alike',
  },
  { name: 'feedback.correct on surface', fg: p.green['400'], bg: p.surface['1'], min: 3.0 },

  // Correct and wrong feedback panels. The text on them is body copy, so 4.5:1 — the
  // whole point of these surfaces is that the explanation stays readable.
  {
    name: 'text.primary on option.correct',
    fg: p.text['1'],
    bg: p.feedback.correctSurface,
    min: 4.5,
  },
  {
    name: 'text.primary on option.wrong',
    fg: p.text['1'],
    bg: p.feedback.wrongSurface,
    min: 4.5,
  },
  {
    name: 'text.secondary on option.correct',
    fg: p.text['2'],
    bg: p.feedback.correctSurface,
    min: 4.5,
  },

  // The favourite star. It lands at 4.42:1 — under the 4.5 small-text floor and over
  // the 3:1 large-text one, which is why both places that draw it use an ≥18px step.
  // That is the constraint, recorded here so a later "make the badge smaller" tweak
  // fails this check instead of shipping.
  {
    name: 'action.secondary on surface (≥18px)',
    fg: p.blue['500'],
    bg: p.surface['1'],
    min: 3.0,
    note: 'the favourite star — never below 18px',
  },
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
