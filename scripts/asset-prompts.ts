/**
 * Emit every asset prompt from `docs/design/asset-prompts.md`, fully assembled.
 *
 * ## Why this exists
 *
 * The doc's own first instruction is that the Style Block must be **byte-identical**
 * on every generation — it is the only thing keeping a hundred separately generated
 * assets looking like one product. Thirty-one P0 assets, pasted by hand, is thirty-one
 * chances to drop a line from it, and the failure is invisible: each image looks fine
 * on its own and the set does not hang together.
 *
 * So the assembly is a script. It reads the doc — the doc stays the source of truth,
 * nothing is duplicated here — and prints prompts ready to paste into whatever tool is
 * generating: ChatGPT, Midjourney, Firefly, Higgsfield.
 *
 * ## What it does NOT do
 *
 * It does not generate anything, and it deliberately cannot. Every row under
 * "⛔ Never generate these" is excluded by the doc rather than by this script, because
 * a flag or a coastline must come from a licensed source; `pnpm build:flags` and
 * `pnpm build:maps` are those paths.
 *
 * ```bash
 * pnpm assets:prompts                 # list every asset, one line each
 * pnpm assets:prompts --wave P0       # just the launch blockers
 * pnpm assets:prompts --id atlas/welcome.png   # one full prompt, ready to paste
 * pnpm assets:prompts --wave P0 --out .assets  # one .txt per asset
 * ```
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = join(ROOT, 'docs', 'design', 'asset-prompts.md')

type Prompt = {
  readonly wave: string
  readonly section: string
  /** The file path the doc asks for, which is also how you name the download. */
  readonly id: string
  readonly body: string
  /** Byte offset in the doc, so the two parse shapes interleave in reading order. */
  readonly at: number
}

const src = readFileSync(DOC, 'utf8')

/** Fenced code blocks, in document order, with the offset they start at. */
function fences(text: string): { at: number; content: string }[] {
  const out: { at: number; content: string }[] = []
  for (const m of text.matchAll(/```\n([\s\S]*?)```/g)) {
    out.push({ at: m.index!, content: m[1]!.trimEnd() })
  }
  return out
}

const all = fences(src)

/**
 * The two blocks every prompt is built from.
 *
 * Located by content rather than by position: they are the first fence starting
 * `STYLE:` and the first starting `NEGATIVE:`. A heading rename must not silently
 * produce prompts with no house style attached, so both are asserted.
 */
const STYLE = all.find((f) => f.content.startsWith('STYLE:'))?.content
const NEGATIVE = all.find((f) => f.content.startsWith('NEGATIVE:'))?.content

if (STYLE === undefined || NEGATIVE === undefined) {
  console.error(
    'asset-prompts: could not find the STYLE or NEGATIVE block in the doc.\n' +
      'Both are matched by their opening word, not their heading. If they moved or were\n' +
      'reworded, fix this script rather than emitting prompts without the house style —\n' +
      'a set generated without it is a set that has to be generated again.',
  )
  process.exit(1)
}

/** Which `# P0 …` / `# P1 …` wave an offset falls in. */
const waveAt = (offset: number): string => {
  let wave = 'unfiled'
  for (const m of src.matchAll(/^# (P[0-9][\w-]*)/gm)) {
    if (m.index! > offset) break
    wave = m[1]!
  }
  return wave
}

/** Which `## 3. Atlas …` section an offset falls in. */
const sectionAt = (offset: number): string => {
  let section = '—'
  for (const m of src.matchAll(/^## (.+)$/gm)) {
    if (m.index! > offset) break
    section = m[1]!.trim()
  }
  return section
}

const assemble = (body: string): string =>
  `${STYLE}\n\n${body.trim()}\n\n${NEGATIVE}`

const prompts: Prompt[] = []

/**
 * Shape 1 — a fenced template containing `[STYLE BLOCK]`.
 *
 * Substitutions come from the first table AFTER it whose header names the same
 * `{PLACEHOLDER}`s the template uses. One prompt per row; templates with no
 * placeholders are a single prompt.
 */
for (const fence of all) {
  if (!fence.content.includes('[STYLE BLOCK]')) continue

  const placeholders = [...new Set([...fence.content.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]!))]
  // The template's own body: everything between the two markers.
  const body = fence.content
    .replace(/\[STYLE BLOCK\]\n*/, '')
    .replace(/\n*\[NEGATIVE BLOCK\][^\n]*/, '')
    .trim()

  // Stop at the next `## ` heading. Without this, §11's tier-frame template (whose
  // METAL/GLOW values are written as prose, not a table) reached forward and expanded
  // itself against §12's level-insignia table — eight medals named after ranks.
  const rest = src.slice(fence.at + fence.content.length)
  const nextSection = rest.search(/\n## /)
  const after = nextSection === -1 ? rest : rest.slice(0, nextSection)
  const table = /\n(\|[^\n]*\|\n\|[-| :]+\|\n(?:\|[^\n]*\|\n)+)/.exec(after)

  if (placeholders.length === 0 || table === null) {
    // A one-off: the nearest `path/name.png` above it — but only within its OWN
    // section. Unscoped, every template whose values are a prose list rather than a
    // table (§12, §15, §16, §17) walked back to §10 and came out named
    // `rewards/xp-orb.png`, seven times.
    const sectionStart = [...src.slice(0, fence.at).matchAll(/^## /gm)].at(-1)?.index ?? 0
    const before = src.slice(sectionStart, fence.at)
    const path = [...before.matchAll(/`([\w./[\]-]+\.(?:png|svg))`/g)].at(-1)?.[1]
    prompts.push({
      wave: waveAt(fence.at),
      section: sectionAt(fence.at),
      // Placeholders left in mean the doc supplies its values as prose; say so rather
      // than pretending this is one finished prompt.
      id:
        path ??
        (placeholders.length > 0
          ? `${sectionAt(fence.at)} — template, fill {${placeholders.join('} {')}}`
          : sectionAt(fence.at)),
      body: assemble(body),
      at: fence.at,
    })
    continue
  }

  const rows = table[1]!.trim().split('\n')
  const header = rows[0]!.split('|').map((c) => c.trim()).filter(Boolean)
  // Only expand when the table actually supplies this template's placeholders.
  const supplies = placeholders.filter((p) =>
    header.some((h) => h.replace(/[`{}]/g, '').toUpperCase() === p),
  )
  if (supplies.length === 0) {
    prompts.push({
      wave: waveAt(fence.at),
      section: sectionAt(fence.at),
      id: sectionAt(fence.at),
      body: assemble(body),
      at: fence.at,
    })
    continue
  }

  for (const row of rows.slice(2)) {
    const cells = row.split('|').map((c) => c.trim())
    // Leading empty cell from the opening pipe.
    const values = cells.slice(1, -1)
    let filled = body
    let label = values[0] ?? ''
    header.forEach((h, i) => {
      const key = h.replace(/[`{}]/g, '').toUpperCase()
      if (placeholders.includes(key)) {
        filled = filled.replaceAll(`{${key}}`, (values[i] ?? '').replace(/^`|`$/g, ''))
      }
    })
    // A file path in the first cell is the id; otherwise the row's label.
    const asPath = /`([\w./-]+\.(?:png|svg))`/.exec(label)
    prompts.push({
      wave: waveAt(fence.at),
      section: sectionAt(fence.at),
      id: asPath?.[1] ?? `${sectionAt(fence.at)} — ${label.replace(/[`*]/g, '')}`,
      body: assemble(filled),
      at: fence.at,
    })
  }
}

/**
 * Shape 2 — a table whose second column IS the prompt body (`| File | Prompt body |`).
 *
 * Atlas's poses, the states and the rewards are written this way because each is one
 * sentence and a fence apiece would be six screens of scrolling.
 */
for (const m of src.matchAll(
  /\|\s*File\s*\|(?:[^|\n]*\|)?\s*Prompt body[^|]*\|\n\|[-| :]+\|\n((?:\|[^\n]*\|\n)+)/g,
)) {
  // The body is always the LAST cell; §7's table carries a Spec column in between.
  for (const row of m[1]!.trim().split('\n')) {
    const cells = row.split('|').map((c) => c.trim())
    const file = /`([\w./-]+)`/.exec(cells[1] ?? '')?.[1]
    const body = (cells.at(-2) ?? '').replace(/^`|`$/g, '')
    if (file === undefined || body === '') continue
    prompts.push({
      wave: waveAt(m.index!),
      section: sectionAt(m.index!),
      id: file,
      body: assemble(body),
      at: m.index!,
    })
  }
}

prompts.sort((a, b) => a.at - b.at)

// ---------------------------------------------------------------- CLI

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}

const wave = flag('wave')
const only = flag('id')
const out = flag('out')

let selected = prompts
if (wave !== undefined) selected = selected.filter((p) => p.wave.toLowerCase() === wave.toLowerCase())
if (only !== undefined) selected = selected.filter((p) => p.id.includes(only))

if (selected.length === 0) {
  console.error(`asset-prompts: nothing matched. ${prompts.length} prompt(s) in the doc.`)
  process.exit(1)
}

/**
 * What must already exist before a given asset can be generated.
 *
 * The doc says this in prose — "generate the character sheet first, then use it as a
 * reference image for every pose below; that is how you get one character instead of
 * six" — and a folder of `.txt` files loses it. That ordering is the whole difference
 * between one Atlas and seven cousins, and it cannot be recovered afterwards: a pose
 * generated without the sheet is a different robot. So it ships beside the prompts
 * rather than in somebody's head.
 */
const NEEDS_REFERENCE: readonly { readonly match: RegExp; readonly reference: string }[] = [
  { match: /^atlas\/(?!character-sheet)/, reference: 'atlas/character-sheet.png' },
  { match: /^onboarding\//, reference: 'atlas/character-sheet.png' },
  // The icon and the splash deliberately do NOT reference the mark. §2a is its own
  // drawing, and the splash prompt's whole instruction is that its centre 40 % stays
  // EMPTY — the lockup is composited by the app, and its negative block bans a central
  // subject outright. Attaching the mark there would fight the prompt.
  //
  // The mark IS the source for §2b–§2d, but those are re-exports of one drawing rather
  // than prompts, so they never reach this list.
]

const slug = (id: string): string => id.replace(/[^\w.-]+/g, '-').replace(/\.(png|svg)$/, '')

if (out !== undefined) {
  const dir = join(ROOT, out)
  mkdirSync(dir, { recursive: true })

  for (const p of selected) writeFileSync(join(dir, `${slug(p.id)}.txt`), `${p.body}\n`)

  // Anything used as a reference goes first, so working top to bottom is safe.
  const isReference = (p: Prompt): boolean =>
    NEEDS_REFERENCE.some((r) => p.id.endsWith(r.reference))
  const ordered = [...selected].sort((a, b) => Number(isReference(b)) - Number(isReference(a)))

  const steps = ordered.map((p, i) => {
    const dep = NEEDS_REFERENCE.find((r) => r.match.test(p.id))
    const note =
      dep === undefined
        ? ''
        : `\n   ↳ **attach \`${dep.reference}\` as a reference image first**`
    return `${i + 1}. \`${slug(p.id)}.txt\` → save as \`${p.id}\`${note}`
  })

  writeFileSync(
    join(dir, '00-ORDER.md'),
    `# ${selected.length} prompts, in the order to generate them\n\n` +
      `Generated by \`pnpm assets:prompts\`. Do not edit this folder — edit\n` +
      `\`docs/design/asset-prompts.md\` and run the command again.\n\n` +
      `## Before you start\n\n` +
      `Anything marked **↳** needs an earlier image attached as a reference. That is what\n` +
      `produces one character instead of six, and it cannot be fixed later.\n\n` +
      `## For each one\n\n` +
      `1. Paste the whole \`.txt\`. It already contains the style block and the negative block —\n` +
      `   do not retype or paraphrase either, that is the point of this folder.\n` +
      `2. Generate 4, pick one, upscale.\n` +
      `3. Remove the background; check the alpha edge at 100 %.\n` +
      `4. **Look at it at 96 px.** Most generated art turns to mush at real size. This is the\n` +
      `   step everyone skips and the one that decides whether the asset was worth making.\n` +
      `5. Save to the path below. Export \`@1x\`/\`@2x\`/\`@3x\`, ≤ 120 KB per \`@3x\`.\n\n` +
      `## When the set is finished\n\n` +
      `**Desaturate it and look again.** If two members become indistinguishable, the shapes\n` +
      `are wrong — colour may never be the only difference between them. Then run\n` +
      `\`pnpm content:validate\`, which rejects an asset with no recorded licence.\n\n` +
      `---\n\n${steps.join('\n')}\n`,
  )

  console.log(
    `\n  wrote ${selected.length} prompt(s) to ${out}/\n` +
      `  start at ${out}/00-ORDER.md — the sequence matters\n`,
  )
  process.exit(0)
}

if (only !== undefined) {
  for (const p of selected) {
    console.log(`\n${'─'.repeat(72)}\n${p.wave} · ${p.section}\n${p.id}\n${'─'.repeat(72)}\n`)
    console.log(p.body)
  }
  console.log()
  process.exit(0)
}

console.log('\nAsset prompts\n')
let lastWave = ''
for (const p of selected) {
  if (p.wave !== lastWave) {
    console.log(`\n  ${p.wave}`)
    lastWave = p.wave
  }
  console.log(`    ${p.id}`)
}
console.log(
  `\n  ${selected.length} prompt(s). ` +
    `Use --id <path> for the full text, --out <dir> to write them all.\n` +
    `  Never generate anything under "⛔ Never generate these" — flags, geometry and\n` +
    `  icons come from pnpm build:flags / build:maps / build:icons.\n`,
)
