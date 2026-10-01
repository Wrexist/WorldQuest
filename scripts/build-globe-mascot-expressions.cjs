/**
 * Lay Atlas's 32-expression library out as one labelled reference sheet.
 *
 * Input:  docs/design/assets/world-mascot-3d/expressions/NN-<name>.png
 *         (blender --background --python scripts/build-globe-mascot.py -- --expressions)
 * Output: docs/design/assets/world-mascot-3d/expressions.png
 *
 * A design reference, not app art: the app ships the ten animated moods
 * (atlasGlobe.generated.ts). An expression earns a place in the app when a screen
 * needs it, by joining FACE and the acting in build-globe-mascot.py.
 *
 * Run: node scripts/build-globe-mascot-expressions.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const DIR = path.join(ROOT, 'docs/design/assets/world-mascot-3d/expressions')
const OUT = path.join(ROOT, 'docs/design/assets/world-mascot-3d/expressions.png')
const CELL = 300, LABEL = 40, COLUMNS = 8
const BACKGROUND = '#e8eef8'

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => /^\d\d-.+\.png$/.test(f)).sort()
  if (files.length !== 32) throw new Error(`expected 32 expressions, found ${files.length}`)
  const rows = Math.ceil(files.length / COLUMNS)
  const tiles = await Promise.all(files.map(async (file, i) => {
    const [, number, name] = file.match(/^(\d\d)-(.+)\.png$/)
    const title = `${number} ${name.replace(/-/g, ' ')}`
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${LABEL}"><text x="50%" y="26" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#1c2b4a">${title}</text></svg>`)
    const art = await sharp(path.join(DIR, file)).resize(CELL, CELL).toBuffer()
    const left = (i % COLUMNS) * CELL, top = Math.floor(i / COLUMNS) * (CELL + LABEL)
    return [{ input: art, left, top }, { input: label, left, top: top + CELL }]
  }))
  await sharp({ create: { width: CELL * COLUMNS, height: (CELL + LABEL) * rows, channels: 3, background: BACKGROUND } })
    .composite(tiles.flat())
    .png()
    .toFile(OUT)
  console.log(`✓ ${files.length} expressions → ${path.relative(ROOT, OUT)}`)
}

main().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1) })
