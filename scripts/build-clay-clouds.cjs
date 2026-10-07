// Compress the approved transparent illustration without repainting or flattening it.
//
// Also bakes the dark-theme copy. Fading the white clouds on navy left grey smoke under
// Atlas on every tab; a night cloud has to be blue, so the dark copy keeps the source's
// own light and shade but remaps it onto the dark theme's raised surface colour.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'docs/design/assets/clay-clouds/source.png')
const output = path.join(root, 'apps/mobile/assets/art/clay-clouds/backdrop.webp')
const darkOutput = path.join(root, 'apps/mobile/assets/art/clay-clouds/backdrop-dark.webp')
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'packages/design/tokens.json'), 'utf8'))
const night = tokens.darkColor.bg.surfacePressed
// Shadowed puffs sit just above the surface colour, lit tops a little above that.
const SHADE = 0.7
const LIGHT = 0.5

async function dark() {
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const tint = [1, 3, 5].map(i => parseInt(night.slice(i, i + 2), 16))
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(tint[c] * (SHADE + LIGHT * lum)))
  }
  await sharp(data, { raw: info }).webp({ quality: 90, alphaQuality: 100 }).toFile(darkOutput)
}

;(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  await sharp(source).resize({ width: 1536, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(output)
  await dark()
  for (const file of [output, darkOutput]) {
    const { width, height, hasAlpha } = await sharp(file).metadata()
    if (!hasAlpha) throw Error('Cloud backdrop must retain transparency')
    console.log(JSON.stringify({ output: path.relative(root, file), width, height, hasAlpha, bytes: fs.statSync(file).size }))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
