/**
 * The land Atlas wears: Natural Earth 1:110m land (public domain, via world-atlas),
 * painted into an equirectangular mask for scripts/build-globe-mascot.py.
 *
 * Why real geography and not noise: the mascot IS the Earth, and the brief asks for it to
 * be recognisable. docs/design/asset-prompts.md forbids inventing a coastline, and names
 * Natural Earth as where continent shapes come from — so they come from there, at the
 * coarsest published scale, which is exactly the "simplified, no tiny detail" look.
 * Land only: no country borders, so the character makes no political claim.
 *
 * Output: docs/design/assets/world-mascot-3d/land.png and land-soft.png (4096 × 2048, white land on black)
 * Run:    node scripts/build-globe-mascot-land.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { feature } = require('topojson-client')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs/design/assets/world-mascot-3d/land.png')
const W = 4096, H = 2048

const topology = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'))
const land = feature(topology, topology.objects.land)
const x = (lon) => ((lon + 180) / 360) * W
const y = (lat) => ((90 - lat) / 180) * H

// Rings that cross the antimeridian are split where they jump, so no polygon streaks
// across the whole map.
const paths = []
for (const f of land.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const poly of polys) {
    for (const ring of poly) {
      let d = ''
      let prev = null
      for (const [lon, lat] of ring) {
        const cmd = prev === null || Math.abs(lon - prev) > 180 ? 'M' : 'L'
        d += `${cmd}${x(lon).toFixed(1)},${y(lat).toFixed(1)}`
        prev = lon
      }
      paths.push(d + 'Z')
    }
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/><path fill="white" fill-rule="evenodd" d="${paths.join('')}"/></svg>`

// Two versions: a crisp mask for colour, and a soft one whose falloff becomes the gentle
// rounded bank the continents rise on (the displacement reads it).
const base = sharp(Buffer.from(svg)).grayscale()
Promise.all([
  base.clone().blur(1.2).png().toFile(OUT),
  base.clone().blur(14).png().toFile(OUT.replace('land.png', 'land-soft.png')),
]).then(() => {
  console.log(`✓ land masks ${W}×${H} from Natural Earth 1:110m → ${path.relative(ROOT, OUT)} (+ land-soft.png)`)
})
