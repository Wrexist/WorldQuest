/**
 * Lay Atlas's expression library (32) or pose library out as one labelled reference sheet.
 *
 * Input:  docs/design/assets/world-mascot-3d/<library>/NN-<name>.png
 *         (blender --background --python scripts/build-globe-mascot.py -- --expressions | --poses)
 * Output: docs/design/assets/world-mascot-3d/<library>.png
 *
 * A design reference, not app art: the app ships the ten animated moods
 * (atlasGlobe.generated.ts). An expression earns a place in the app when a screen
 * needs it, by joining FACE and the acting in build-globe-mascot.py.
 *
 * Run: node scripts/build-globe-mascot-expressions.cjs [expressions|poses]
 */
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const LIBRARY = process.argv[2] ?? 'expressions'
const DIR = path.join(ROOT, 'docs/design/assets/world-mascot-3d', LIBRARY)
const OUT = path.join(ROOT, 'docs/design/assets/world-mascot-3d', `${LIBRARY}.png`)
/** The brief fixes the expression count; poses grow as the rig can hold more. */
const EXPECTED = { expressions: 32 }
const CELL = 300, LABEL = 40, COLUMNS = 8
const BACKGROUND = '#e8eef8'

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => /^\d\d-.+\.png$/.test(f)).sort()
  const expected = EXPECTED[LIBRARY]
  if (files.length === 0 || (expected && files.length !== expected)) throw new Error(`${LIBRARY}: expected ${expected ?? 'some'} images, found ${files.length}`)
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
  console.log(`✓ ${files.length} ${LIBRARY} → ${path.relative(ROOT, OUT)}`)
}

main().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1) })
