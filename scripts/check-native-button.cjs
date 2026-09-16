/** Native country-page paint check. Supplements full-resolution visual review and accessibility assertions. */
const { readFileSync } = require('node:fs')
const { PNG } = require('pngjs')

function inspect(file) {
  const png = PNG.sync.read(readFileSync(file))
  const { width, height, data } = png
  const groups = []
  let group = null
  for (let y = Math.floor(height * 0.7); y < height; y++) {
    let green = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 1] > 100 && data[i + 1] > data[i] * 1.5 && data[i + 2] < 90) green++
    }
    if (green > width * 0.5) {
      if (!group) { group = { top: y, bottom: y }; groups.push(group) }
      group.bottom = y
    } else group = null
  }
  const button = groups.filter(g => g.bottom - g.top > height * 0.025).at(-1)
  if (!button) throw new Error('Native country capture has no broad green practice button')
  let whitePixels = 0
  for (let y = button.top + 3; y < button.bottom - 3; y++) {
    for (let x = Math.floor(width * 0.1); x < width * 0.9; x++) {
      const i = (y * width + x) * 4
      if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) whitePixels++
    }
  }
  if (whitePixels < 64) throw new Error('Native practice button has no painted light label')
  return { width, height, button, whitePixels }
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/check-native-button.cjs <country.png>')
  console.log(JSON.stringify(inspect(process.argv[2])))
}
module.exports = { inspect }
