// Compress the approved transparent illustration without repainting or flattening it.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'docs/design/assets/clay-clouds/source.png')
const output = path.join(root, 'apps/mobile/assets/art/clay-clouds/backdrop.webp')
;(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  await sharp(source).resize({ width: 1536, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toFile(output)
  const { width, height, hasAlpha } = await sharp(output).metadata()
  if (!hasAlpha) throw Error('Cloud backdrop must retain transparency')
  console.log(JSON.stringify({ output: path.relative(root, output), width, height, hasAlpha, bytes: fs.statSync(output).size }))
})().catch(error => { console.error(error); process.exitCode = 1 })
