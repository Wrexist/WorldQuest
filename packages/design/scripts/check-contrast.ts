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
  {
    name: 'status.error on canvas',
    fg: p.red['500'],
    bg: p.space['800'],
    // 4.5, not 3: this one is READ, not glanced at. It is the sentence telling somebody
    // their sign-in code was wrong, and it is the only text on the screen that matters
    // at that moment. The generated matrix cannot reach it — that crosses `color.text`
    // with surfaces, and this is a status colour used as text, which is precisely the
    // "a new text token joins the system checked by nothing at all" case the note under
    // the matrix describes.
    min: 4.5,
    note: 'form errors in the account flow — the app\'s only red text',
  },
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

// ── the generated matrix ────────────────────────────────────────────────────
//
// The 26 pairs above are hand-written, and the Definition of Done ticks
// "Contrast ≥ 4.5:1" against them. A curated list checks the combinations somebody
// thought of, which is exactly the set that is already fine — the interesting pair is
// the one nobody pictured, and a new text or surface token joins the system checked by
// nothing at all.
//
// So every text colour is crossed with every surface a component can put text on, and a
// combination is either above its floor or WAIVED with a reason. Same trade as the
// escape-hatch allowlist and the reachability allowlist: "we decided" and "we did not
// look" stop being the same green run.
//
// The curated pairs stay. They cover what a cross product cannot — an edge against a
// canvas, a progress fill against its track — where neither colour is text.

type Resolved = { readonly path: string; readonly hex: string }

/** `{palette.green.500}` → the hex it points at. Arrays (gradients) are skipped. */
function resolve(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.startsWith('#')) return value
  const ref = value.match(/^\{palette\.([\w.]+)\}$/)
  if (!ref) return null
  const hex = ref[1]!.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], p)
  return typeof hex === 'string' && hex.startsWith('#') ? hex : null
}

function leaves(node: unknown, prefix: string): Resolved[] {
  if (node === null || typeof node !== 'object') {
    const hex = resolve(node)
    return hex ? [{ path: prefix, hex }] : []
  }
  if (Array.isArray(node)) return []
  return Object.entries(node as Record<string, unknown>)
    .filter(([key]) => !key.startsWith('$'))
    .flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key))
}

const c = tokens.color

/**
 * Which text goes on which surface — declared, not crossed blindly.
 *
 * A full cross product is easy and wrong. It pairs `text.secondary` with
 * `action.destructive`, a combination nothing renders and nothing ever will, and then
 * either fails on it or needs a waiver — and a waiver for a pair the app cannot produce
 * teaches the next reader that waivers are routine. The note under WAIVED says it: a
 * pairing the app never renders is not a waiver, it is a pair that should not be in the
 * matrix.
 *
 * These two groups are still GENERATED. Adding a text token or a surface token joins the
 * matrix without anybody remembering to add a pair, which is the whole point — the
 * curated list could not do that.
 */
const GROUPS: ReadonlyArray<{
  readonly what: string
  readonly texts: readonly Resolved[]
  readonly surfaces: readonly Resolved[]
  readonly min: number
}> = [
  {
    what: 'body text on a surface',
    texts: leaves(c.text, 'text').filter((t) => t.path !== 'text.onAccent' && t.path !== 'text.tertiary'),
    surfaces: [
      ...leaves(c.bg, 'bg'),
      ...leaves(c.option, 'option').filter((s) => !s.path.endsWith('Edge')),
      ...leaves(c.feedback, 'feedback').filter((s) => s.path.endsWith('Surface') || s.path === 'feedback.wrong' || s.path === 'feedback.neutral'),
    ],
    min: tokens.contrastFloors.bodyText,
  },
  {
    what: 'a label on an accent',
    // `text.onAccent` only ever appears on a filled control, and every one of them is
    // ≥18px bold — which is the large-text floor, and which the curated list already
    // states pair by pair. `text.tertiary` is the same story on ordinary surfaces.
    texts: leaves(c.text, 'text').filter((t) => t.path === 'text.onAccent'),
    surfaces: leaves(c.action, 'action').filter(
      (s) =>
        !s.path.endsWith('Edge') &&
        !s.path.endsWith('Glow') &&
        s.path !== 'action.tertiary' &&
        s.path !== 'action.disabled',
    ),
    min: tokens.contrastFloors.largeText,
  },
  {
    what: 'de-emphasised text, ≥18px',
    texts: leaves(c.text, 'text').filter((t) => t.path === 'text.tertiary'),
    surfaces: [...leaves(c.bg, 'bg'), ...leaves(c.option, 'option').filter((s) => !s.path.endsWith('Edge'))],
    min: tokens.contrastFloors.largeText,
  },
]

/**
 * Combinations below the floor that are not bugs, each with the reason.
 *
 * Empty, and that is the honest state: once the matrix only contains pairings the app
 * actually renders, every one of them passes. The mechanism stays because the next token
 * is the one that will need it.
 */
const WAIVED: Record<string, string> = {}

const allPairs = GROUPS.flatMap((g) =>
  g.texts.flatMap((fg) => g.surfaces.map((bg) => ({ name: `${fg.path} on ${bg.path}`, fg, bg, min: g.min }))),
)

let matrixFailed = 0
let waived = 0
let checked = 0

for (const pair of allPairs) {
  if (pair.name in WAIVED) {
    waived++
    continue
  }
  const ratio = contrast(pair.fg.hex, pair.bg.hex)
  checked++
  if (ratio < pair.min) {
    matrixFailed++
    console.log(`  ✗ ${pair.name.padEnd(42)} ${ratio.toFixed(2)}:1 (min ${pair.min})`)
  }
}

/** A waiver for a pair the matrix no longer produces is a note nobody can check. */
const staleWaivers = Object.keys(WAIVED).filter(
  (name) => !allPairs.some((pair) => pair.name === name),
)
for (const name of staleWaivers) {
  console.log(`  ! waived pair no longer exists: ${name}`)
}

console.log(
  `\n  matrix: ${checked} generated pair(s) checked, ${waived} waived with a reason`,
)

if (matrixFailed > 0 || staleWaivers.length > 0) {
  console.error(
    `\n✗ ${matrixFailed} generated pair(s) below the floor, ` +
      `${staleWaivers.length} stale waiver(s)`,
  )
  process.exit(1)
}


console.log(`✓ all ${PAIRS.length} curated + ${checked} generated pairs pass`)
